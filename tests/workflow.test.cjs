const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const { mkdtemp, readFile, readdir, rm, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const { cnpjValido, dataEntradaValida } = require("../dist/domain/validation.js");
const { ValidadorCNPJ } = require("../dist/domain/validators.js");
const {
    Credencial,
    Equipamento,
    EstadoFisico,
    JournalTransacao,
    PapelUsuario,
    StatusRastreamento,
    TipoEquipamento,
} = require("../dist/domain/types.js");
const { CriptografiaArquivo } = require("../dist/infrastructure/crypto.js");
const { RepositorioArquivo } = require("../dist/infrastructure/repository.js");
const {
    ServicoAutenticacao,
    ServicoEquipamento,
    ServicoLote,
    ServicoOrganizacao,
    ServicoRelatorio,
} = require("../dist/services/services.js");

// Testes das regras de negócio, proteção dos arquivos e journal, usando pastas temporárias
const pastasTemporarias = [];

after(async () => {
    await Promise.all(
        pastasTemporarias.map((pasta) => rm(pasta, { recursive: true, force: true })),
    );
});

// Confere as regras de formato do CNPJ e o limite de data para entrada do lote
test("valida CNPJ e impede lote com data fora dos últimos 90 dias", () => {
    assert.equal(cnpjValido("11.222.333/0001-81"), true);
    assert.equal(cnpjValido("11.222.333/0001-80"), false);
    const hoje = new Date(2026, 8, 28);
    const recente = new Date(hoje);
    recente.setDate(recente.getDate() - 90);
    const antigo = new Date(hoje);
    antigo.setDate(antigo.getDate() - 91);
    const futuro = new Date(hoje);
    futuro.setDate(futuro.getDate() + 1);
    assert.equal(dataEntradaValida(recente, hoje), true);
    assert.equal(dataEntradaValida(antigo, hoje), false);
    assert.equal(dataEntradaValida(futuro, hoje), false);
});

// Confirma que a leitura falha quando o conteúdo cifrado não corresponde à etiqueta
test("detecta quando um arquivo cifrado foi alterado", () => {
    const criptografia = new CriptografiaArquivo();
    const chave = criptografia.gerarChave();
    const partes = criptografia.cifrar("conteúdo protegido", chave).split(":");
    partes[1] = `${partes[1][0] === "0" ? "1" : "0"}${partes[1].slice(1)}`;
    assert.throws(() => criptografia.decifrar(partes.join(":"), chave));
});

// Simula uma falha de gravação e confirma que a intenção ficou registrada antes
test("registra a transação no journal antes de uma gravação que falha", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "greencode-falha-gravacao-"));
    pastasTemporarias.push(pasta);
    const criptografia = new CriptografiaArquivo();
    const chave = criptografia.gerarChave();
    const repositorio = new RepositorioArquivo(pasta, criptografia, chave);
    const gravarOriginal = repositorio.gravarColecao.bind(repositorio);
    repositorio.gravarColecao = async (colecao, dados) => {
        if (colecao === "itens") throw new Error("falha simulada ao salvar os dados");
        return gravarOriginal(colecao, dados);
    };

    await assert.rejects(
        () => repositorio.salvarEntidade("itens", "ITEM001", { nome: "Teste" }),
        /falha simulada/,
    );
    repositorio.gravarColecao = gravarOriginal;
    assert.equal(await repositorio.carregarEntidade("itens", "ITEM001"), null);
    const registrosJournal = JSON.parse(
        criptografia.decifrar(await readFile(join(pasta, "journal.enc"), "utf8"), chave),
    );
    assert.ok(
        registrosJournal.some(
            (item) => item.entidade === "itens:ITEM001" && item.operacao === "CRIAR",
        ),
    );
});

// Percorre o fluxo principal do negócio e verifica que uma mudança pode ser revertida
test("percorre cadastro, lote, triagem, rastreabilidade, journal e reversão", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "greencode-jornada-"));
    pastasTemporarias.push(pasta);
    const criptografia = new CriptografiaArquivo();
    const chave = criptografia.gerarChave();
    const repositorio = new RepositorioArquivo(pasta, criptografia, chave);
    repositorio.definirUsuarioResponsavel("admin-teste");

    const autenticacao = new ServicoAutenticacao();
    const admin = autenticacao.criarCredencial(
        "admin",
        "senhaSegura99",
        PapelUsuario.ADMINISTRADOR,
    );
    await repositorio.salvarEntidade("credenciais", admin.usuario, admin);
    assert.equal(autenticacao.autenticar("admin", "senhaSegura99"), true);
    assert.equal(autenticacao.autenticar("admin", "senhaErrada"), false);

    const organizacoes = new ServicoOrganizacao(repositorio, new ValidadorCNPJ());
    const lotes = new ServicoLote(repositorio);
    const equipamentos = new ServicoEquipamento(repositorio);
    const relatorios = new ServicoRelatorio(organizacoes, lotes, equipamentos);
    await organizacoes.cadastrarOrganizacao({
        id: "BR001",
        razaoSocial: "Empresa teste",
        cnpj: "11.222.333/0001-81",
        inscricaoEstadual: "ISENTO",
        enderecoCompleto: "Rua de teste",
        telefone: "11999999999",
        email: "teste@example.com",
        contrato: {
            dataVencimento: "2027-12-31",
            valorMensal: 2500,
            clausulas: ["Coleta"],
            renovacaoAutomatica: false,
        },
    });
    await assert.rejects(
        () =>
            organizacoes.cadastrarOrganizacao({
                razaoSocial: "Duplicada",
                cnpj: "11.222.333/0001-81",
                inscricaoEstadual: "ISENTO",
                enderecoCompleto: "Rua",
                telefone: "1",
                email: "duplicada@example.com",
            }),
        /Ja existe organizacao/,
    );

    await relatorios.configurarParametrosGlobais(10, 20);
    assert.deepEqual(await relatorios.consultarParametrosGlobais(), {
        aliquotaImposto: 10,
        coeficienteDepreciacao: 20,
    });
    assert.match(
        await relatorios.gerarRelatorioFinanceiro({
            inicio: new Date(0),
            fim: new Date("2030-01-01"),
        }),
        /Soma dos valores mensais: R\$ 2500\.00/,
    );
    await assert.rejects(() => relatorios.configurarParametrosGlobais(101, 20), /entre 0 e 100%/);
    await assert.rejects(
        () => relatorios.configurarParametrosGlobais(10, -1),
        /igual ou maior que zero/,
    );

    const lote = await lotes.criarLote({
        id: "LT001",
        organizacaoId: "BR001",
        notaFiscal: "123456",
        transportadora: "TransRapida",
        dataEntrada: new Date(),
        observacoes: "",
    });
    const equipamento = new Equipamento(
        "EQ001",
        "NOTEBOOK-00000001",
        TipoEquipamento.NOTEBOOK,
        "Marca",
        "Modelo",
        2022,
        EstadoFisico.BOM_ESTADO,
        2.5,
        lote.id,
        0,
        StatusRastreamento.AGUARDANDO_TRIAGEM,
    );
    await lotes.adicionarEquipamentoLote(lote.id, equipamento);
    await assert.rejects(
        () => equipamentos.atualizarStatus("EQ001", StatusRastreamento.EM_DESMONTAGEM, ""),
        /depois da triagem completa/,
    );

    await lotes.processarTriagem(lote.id);
    await equipamentos.atualizarStatus(
        "EQ001",
        StatusRastreamento.EM_DESMONTAGEM,
        "Triagem concluída",
    );
    await assert.rejects(
        () => equipamentos.atualizarEstadoFisico("EQ001", EstadoFisico.DANIFICADO_GRAVE, ""),
        /justificativa/,
    );
    await equipamentos.atualizarEstadoFisico(
        "EQ001",
        EstadoFisico.DANIFICADO_GRAVE,
        "Dano identificado na desmontagem",
    );

    const rastreado = await equipamentos.rastrearEquipamento("EQ001");
    assert.equal(rastreado.statusRastreamento, StatusRastreamento.EM_DESMONTAGEM);
    assert.ok(rastreado.historicoMovimentacao.length >= 2);
    assert.match(
        await relatorios.gerarRelatorioPorOrganizacao("BR001", {
            inicio: new Date(0),
            fim: new Date("2030-01-01"),
        }),
        /1 lote/,
    );

    const arquivoJournal = await readFile(join(pasta, "journal.enc"), "utf8");
    assert.equal(arquivoJournal.includes("CRIAR"), false, "o journal deve estar cifrado no disco");
    const journal = JSON.parse(criptografia.decifrar(arquivoJournal, chave));
    assert.ok(journal.some((transacao) => transacao.entidade === "lotes:LT001"));
    assert.ok(journal.every((transacao) => transacao.usuarioResponsavel === "admin-teste"));
    const ultimaAlteracao = journal
        .filter((transacao) => transacao.entidade === "equipamentos:EQ001")
        .at(-1);
    assert.equal(await repositorio.reverterTransacao(ultimaAlteracao.id), true);
    const restaurado = await equipamentos.rastrearEquipamento("EQ001");
    assert.equal(restaurado.estadoFisico, EstadoFisico.BOM_ESTADO);
    assert.ok((await repositorio.carregarHistoricoCLI()).length === 0);
});

// Confere o prazo de retenção e a criação de arquivos de journal arquivados
test("remove journals com mais de 180 dias e rotaciona o arquivo ao passar de 10 MB", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "greencode-rotacao-"));
    pastasTemporarias.push(pasta);
    const criptografia = new CriptografiaArquivo();
    const chave = criptografia.gerarChave();
    const repositorio = new RepositorioArquivo(pasta, criptografia, chave);
    const registroAntigo = new JournalTransacao(
        "antiga",
        new Date("2020-01-01T00:00:00Z"),
        "CRIAR",
        "lotes:ANTIGO",
        null,
        {},
        "admin",
    );
    await writeFile(
        join(pasta, "journal-antigo.enc"),
        criptografia.cifrar(JSON.stringify([registroAntigo]), chave),
        "utf8",
    );

    await repositorio.salvarEntidade("itens", "pequeno", { nome: "primeiro" });
    assert.equal(
        (await readdir(pasta)).some((nome) => nome === "journal-antigo.enc"),
        false,
    );
    await repositorio.salvarEntidade("itens", "grande", { texto: "x".repeat(10 * 1024 * 1024) });

    const journalDepoisDoGrande = JSON.parse(
        criptografia.decifrar(await readFile(join(pasta, "journal.enc"), "utf8"), chave),
    );
    assert.equal(
        journalDepoisDoGrande.length,
        0,
        "uma transação acima do limite deve ser arquivada imediatamente",
    );
    const arquivosAposGrande = await readdir(pasta);
    const journalsAposGrande = await Promise.all(
        arquivosAposGrande
            .filter((nome) => /^journal-.*\.enc$/.test(nome))
            .map(async (nome) =>
                JSON.parse(criptografia.decifrar(await readFile(join(pasta, nome), "utf8"), chave)),
            ),
    );
    assert.ok(
        journalsAposGrande.some((registros) =>
            registros.some((item) => item.entidade === "itens:grande"),
        ),
    );

    await repositorio.salvarEntidade("itens", "final", { nome: "último" });

    const arquivos = await readdir(pasta);
    assert.ok(arquivos.some((nome) => /^journal-.*\.enc$/.test(nome)));
    const journalAtivo = JSON.parse(
        criptografia.decifrar(await readFile(join(pasta, "journal.enc"), "utf8"), chave),
    );
    assert.equal(journalAtivo.length, 1);
    assert.equal(journalAtivo[0].dadosDepois.nome, "último");
});
//01101001
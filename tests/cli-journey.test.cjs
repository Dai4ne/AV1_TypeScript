const assert = require("node:assert/strict");
const { test } = require("node:test");
const { spawn } = require("node:child_process");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");

test("jornada CLI: primeiro administrador, papéis, lote e rastreabilidade", async () => {
  const pasta = await mkdtemp(join(tmpdir(), "greencode-cli-"));
  const entrada = spawn(process.execPath, [resolve(__dirname, "../dist/index.js")], { cwd: pasta, stdio: ["pipe", "pipe", "pipe"] });
  let saida = "";
  let pendente = "";
  let falha;

  entrada.stdout.on("data", parte => { saida += parte.toString(); pendente += parte.toString(); });
  entrada.stderr.on("data", parte => { saida += parte.toString(); pendente += parte.toString(); });
  entrada.on("error", erro => { falha = erro; });

  async function esperar(texto, tempoLimite = 10000) {
    const inicio = Date.now();
    while (!pendente.includes(texto)) {
      if (falha) throw falha;
      if (entrada.exitCode !== null) throw new Error(`CLI encerrou antes de mostrar '${texto}'. Saída: ${saida}`);
      if (Date.now() - inicio > tempoLimite) throw new Error(`Tempo esgotado esperando '${texto}'. Saída: ${saida}`);
      await new Promise(resolver => setTimeout(resolver, 20));
    }
    const posicao = pendente.indexOf(texto);
    const trecho = pendente.slice(0, posicao + texto.length);
    pendente = pendente.slice(posicao + texto.length);
    return trecho;
  }

  async function enviar(linha, retornoEsperado) {
    entrada.stdin.write(`${linha}\n`);
    await esperar(retornoEsperado);
    await esperar("greencode> ");
  }

  async function login(usuario, senha) {
    entrada.stdin.write(`login ${usuario}\n`);
    await esperar("Senha:");
    entrada.stdin.write(`${senha}\n`);
    await esperar(`login realizado como`);
    await esperar("greencode> ");
  }

  async function criarUsuario(usuario, papel) {
    entrada.stdin.write(`usuario criar --usuario ${usuario} --papel ${papel}\n`);
    await esperar("Senha inicial:");
    entrada.stdin.write("SenhaTeste123\n");
    await esperar("Repita a senha:");
    entrada.stdin.write("SenhaTeste123\n");
    await esperar(`usuário ${usuario} criado`);
    await esperar("greencode> ");
  }

  try {
    await esperar("Pressione Enter para gerar a chave mestra");
    entrada.stdin.write("\n");
    await esperar("Nova senha:");
    entrada.stdin.write("SenhaTeste123\n");
    await esperar("Repita a senha:");
    entrada.stdin.write("SenhaTeste123\n");
    await esperar("Administrador inicial criado.");
    await esperar("greencode> ");

    await login("admin", "SenhaTeste123");
    await criarUsuario("cadastro", "OPERADOR_CADASTRO");
    await criarUsuario("estoque", "GESTOR_ALMOXARIFADO");
    await criarUsuario("auditoria", "AUDITOR");
    await enviar("logout", "sessão encerrada");

    await login("cadastro", "SenhaTeste123");
    await enviar("organizacao criar --id BR001 --razao \"Empresa Teste\" --cnpj 11.222.333/0001-81 --ie ISENTO --endereco \"Rua de Teste 1\" --telefone 11999999999 --email teste@exemplo.com --vencimento 2027-12-31 --valor 2500 --clausula \"Coleta anual\"", "organização cadastrada");
    await enviar("lote criar --org BR001 --nf 123456 --transp TransRapida", "não tem permissão");
    await enviar("logout", "sessão encerrada");

    await login("estoque", "SenhaTeste123");
    await enviar("lote criar --id LT001 --org BR001 --nf 123456 --transp TransRapida", "lote criado com identificador LT001");
    await enviar("equipamento criar --id EQ001 --lote LT001 --tipo NOTEBOOK --marca Teste --modelo M1 --ano 2022 --estado BOM_ESTADO --peso 2.5", "equipamento cadastrado");
    await enviar("equipamento status EQ001 EM_DESMONTAGEM", "depois da triagem completa");
    await enviar("lote triagem LT001", "triagem do lote concluída");
    await enviar("equipamento status EQ001 EM_DESMONTAGEM", "status de rastreamento atualizado");
    await enviar("equipamento status EQ001 PECAS_REAPROVEITADAS", "status de rastreamento atualizado");
    await enviar("historico EQ001", "responsável estoque");
    await enviar("logout", "sessão encerrada");

    await login("auditoria", "SenhaTeste123");
    await enviar("relatorio status PECAS_REAPROVEITADAS", "1 equipamento(s)");
    await enviar("equipamento status EQ001 EM_TRIAGEM", "não tem permissão");
    entrada.stdin.write("sair\n");
    await new Promise((resolver, rejeitar) => {
      const timer = setTimeout(() => rejeitar(new Error(`CLI não encerrou. Saída: ${saida}`)), 5000);
      entrada.once("exit", (codigo) => { clearTimeout(timer); codigo === 0 ? resolver() : rejeitar(new Error(`CLI terminou com código ${codigo}. Saída: ${saida}`)); });
    });

    const configuracao = JSON.parse(await readFile(join(pasta, "data", "configuracao-mestre.json"), "utf8"));
    const credenciais = await readFile(join(pasta, "data", "credenciais.enc"), "utf8");
    const journal = await readFile(join(pasta, "data", "journal.enc"), "utf8");
    assert.ok(configuracao.chaveMestra);
    assert.equal(credenciais.includes("SenhaTeste123"), false);
    assert.equal(journal.includes("CRIAR"), false);
    assert.match(saida, /Comandos disponíveis: relatorio, historico/);
  } finally {
    if (entrada.exitCode === null) {
      entrada.kill();
      await new Promise(resolver => entrada.once("exit", resolver));
    }
    await rm(pasta, { recursive: true, force: true });
  }
});

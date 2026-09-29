import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import {
    ServicoAutenticacao,
    ServicoEquipamento,
    ServicoLote,
    ServicoOrganizacao,
    ServicoRelatorio,
} from "./services/services";
import {
    Equipamento,
    EstadoFisico,
    PapelUsuario,
    Sessao,
    StatusRastreamento,
    TipoEquipamento,
} from "./domain/types";
import { solicitarSenha } from "./infrastructure/provisionamento";

/*interface de terminal do greencode: recebe comandos, confere permissões
e encaminha cada operação ao serviço responsável*/
export class CLIInterface {
    sessaoAtual: Sessao | null = null;
    constructor(
        public autenticacao: ServicoAutenticacao,
        public organizacao: ServicoOrganizacao,
        public lote: ServicoLote,
        public equipamento: ServicoEquipamento,
        public relatorio: ServicoRelatorio,
    ) {}

    async iniciarLoop(): Promise<void> {
        let continuar = true;
        let historico = (await this.organizacao.repositorio.carregarHistoricoCLI()).reverse();
        console.log("greencode - digite ajuda para ver os comandos disponíveis.");
        while (continuar) {
            const terminal = createInterface({
                input: stdin,
                output: stdout,
                history: historico,
                historySize: 100,
                completer: (linha) => this.completar(linha),
            });
            let proximoHistorico = historico;
            terminal.on("history", (linhas) => {
                proximoHistorico = linhas.filter((linha) => !/^login\s/i.test(linha));
            });
            let entrada: string;
            try {
                entrada = await terminal.question("greencode> ");
            } catch {
                terminal.close();
                break;
            }
            terminal.close();
            historico = proximoHistorico;
            await this.organizacao.repositorio.salvarHistoricoCLI(historico.slice().reverse());
            continuar = await this.processarComando(entrada);
        }
    }

    async processarComando(entrada: string): Promise<boolean> {
        const partes = separarPalavras(entrada);
        const [grupo, acao, ...argumentos] = partes;
        if (!grupo) return true;
        if (grupo === "sair") return false;
        if (grupo === "ajuda") {
            this.exibirAjuda();
            return true;
        }
        if (grupo === "login") {
            await this.fazerLogin(acao, argumentos);
            return true;
        }
        if (grupo === "logout") {
            this.fazerLogout();
            return true;
        }

        if (!this.sessaoAtual?.isValida()) {
            this.fazerLogout();
            console.log(
                "AVISO: sua sessão expirou ou não foi iniciada. Faça login para continuar.",
            );
            return true;
        }
        this.sessaoAtual.renovar();
        const papel = this.sessaoAtual.papel;
        if (!this.temPermissao(papel, grupo, acao)) {
            console.log("ERRO: seu papel não tem permissão para esse comando.");
            return true;
        }

        try {
            await this.executarComando(grupo, acao, argumentos);
        } catch (erro) {
            console.log(
                `ERRO: ${erro instanceof Error ? erro.message : "não foi possível concluir a operação."}`,
            );
        }
        return true;
    }

    exibirMenuPorPapel(papel: PapelUsuario): void {
        const opcoes: Record<PapelUsuario, string[]> = {
            [PapelUsuario.ADMINISTRADOR]: [
                "usuario",
                "parametros",
                "organizacao",
                "lote",
                "equipamento",
                "relatorio",
                "historico",
            ],
            [PapelUsuario.OPERADOR_CADASTRO]: ["organizacao", "relatorio"],
            [PapelUsuario.GESTOR_ALMOXARIFADO]: ["lote", "equipamento", "relatorio", "historico"],
            [PapelUsuario.AUDITOR]: ["relatorio", "historico"],
        };
        console.log(`Comandos disponíveis: ${opcoes[papel].join(", ")}`);
    }

    private completar(linha: string): [string[], string] {
        const opcoes = [
            "login",
            "logout",
            "ajuda",
            "sair",
            "usuario criar",
            "usuario listar",
            "usuario papel",
            "usuario desativar",
            "organizacao criar",
            "organizacao listar",
            "organizacao renovar-contrato",
            "organizacao desativar",
            "lote criar",
            "lote listar",
            "lote triagem",
            "equipamento criar",
            "equipamento rastrear",
            "equipamento estado",
            "equipamento status",
            "parametros consultar",
            "parametros configurar",
            "relatorio organizacao",
            "relatorio status",
            "relatorio financeiro",
            "historico",
        ];
        const trecho = linha.trimStart();
        return [opcoes.filter((opcao) => opcao.startsWith(trecho)), linha];
    }

    private async fazerLogin(usuario: string | undefined, argumentos: string[]): Promise<void> {
        if (!usuario || argumentos.length > 0) {
            console.log("USO: login <usuario>. A senha será solicitada sem aparecer na tela.");
            return;
        }
        try {
            const senha = await solicitarSenha("Senha: ");
            this.sessaoAtual = this.autenticacao.login(usuario, senha);
            this.definirResponsavel(usuario);
            console.log(`OK: login realizado como ${this.sessaoAtual.papel}.`);
            this.exibirMenuPorPapel(this.sessaoAtual.papel);
        } catch (erro) {
            console.log(`ERRO: ${erro instanceof Error ? erro.message : "falha no login."}`);
        }
    }

    private fazerLogout(): void {
        if (this.sessaoAtual) this.autenticacao.logout(this.sessaoAtual.token);
        this.sessaoAtual = null;
        this.definirResponsavel("sistema");
        console.log("OK: sessão encerrada.");
    }

    private definirResponsavel(usuario: string): void {
        this.organizacao.repositorio.definirUsuarioResponsavel(usuario);
        this.lote.repositorio.definirUsuarioResponsavel(usuario);
        this.equipamento.repositorio.definirUsuarioResponsavel(usuario);
    }

    private temPermissao(papel: PapelUsuario, grupo = "", acao = ""): boolean {
        if (papel === PapelUsuario.ADMINISTRADOR) return true;
        if (papel === PapelUsuario.AUDITOR) {
            return (
                grupo === "relatorio" ||
                grupo === "historico" ||
                (grupo === "equipamento" && acao === "rastrear")
            );
        }
        if (papel === PapelUsuario.OPERADOR_CADASTRO)
            return grupo === "organizacao" || grupo === "relatorio";
        if (papel === PapelUsuario.GESTOR_ALMOXARIFADO)
            return (
                grupo === "lote" ||
                grupo === "equipamento" ||
                grupo === "relatorio" ||
                grupo === "historico"
            );
        return false;
    }

    private exibirAjuda(): void {
        console.log("login <usuario> | logout | ajuda | sair");
        console.log(
            "usuario criar --usuario nome --papel PAPEL | usuario listar | usuario papel <usuario> <PAPEL> | usuario desativar <usuario>",
        );
        if (this.sessaoAtual?.isValida()) this.exibirMenuPorPapel(this.sessaoAtual.papel);
        console.log(
            "Exemplo do enunciado: lote criar --org BR001 --nf 123456 --transp TransRapida",
        );
        console.log(
            "Use aspas para valores com espaços. As opções detalhadas aparecem após informar um comando inválido.",
        );
    }

    private async executarComando(
        grupo: string,
        acao: string | undefined,
        argumentos: string[],
    ): Promise<void> {
        if (grupo === "organizacao") return this.executarOrganizacao(acao, argumentos);
        if (grupo === "lote") return this.executarLote(acao, argumentos);
        if (grupo === "equipamento") return this.executarEquipamento(acao, argumentos);
        if (grupo === "relatorio") return this.executarRelatorio(acao, argumentos);
        if (grupo === "parametros") return this.executarParametros(acao, argumentos);
        if (grupo === "usuario") return this.executarUsuario(acao, argumentos);
        if (grupo === "historico") return this.exibirHistoricoEquipamento(acao, argumentos);
        console.log("AVISO: comando não reconhecido. Digite ajuda.");
    }

    private async executarOrganizacao(
        acao: string | undefined,
        argumentos: string[],
    ): Promise<void> {
        if (acao === "criar") {
            const opcoes = lerOpcoes(argumentos);
            const organizacao = await this.organizacao.cadastrarOrganizacao({
                id: opcoes.id,
                razaoSocial: exigir(opcoes, "razao"),
                cnpj: exigir(opcoes, "cnpj"),
                inscricaoEstadual: exigir(opcoes, "ie"),
                enderecoCompleto: exigir(opcoes, "endereco"),
                telefone: exigir(opcoes, "telefone"),
                email: exigir(opcoes, "email"),
                contrato: {
                    dataVencimento: exigir(opcoes, "vencimento"),
                    valorMensal: exigir(opcoes, "valor"),
                    clausulas: opcoes.clausula ? [opcoes.clausula] : [],
                    renovacaoAutomatica: opcoes.renovacao === "sim",
                },
            });
            console.log(`OK: organização cadastrada com identificador ${organizacao.id}.`);
            return;
        }
        if (acao === "listar") {
            const organizacoes = await this.organizacao.listarOrganizacoesAtivas();
            if (!organizacoes.length) console.log("Nenhuma organização ativa cadastrada.");
            for (const item of organizacoes)
                console.log(`${item.id} | ${item.razaoSocial} | CNPJ ${item.cnpj}`);
            return;
        }
        if (acao === "desativar") {
            const id = argumentos[0];
            if (!id) throw new Error("Uso: organizacao desativar <id>.");
            await this.organizacao.desativarOrganizacao(id);
            console.log("OK: organização desativada.");
            return;
        }
        if (acao === "renovar-contrato") {
            const id = argumentos[0];
            if (!id)
                throw new Error("Uso: organizacao renovar-contrato <id> --vencimento AAAA-MM-DD.");
            const opcoes = lerOpcoes(argumentos.slice(1));
            await this.organizacao.renovarContrato(id, lerData(exigir(opcoes, "vencimento")));
            console.log("OK: contrato renovado.");
            return;
        }
        throw new Error("Use organizacao criar, listar, desativar ou renovar-contrato.");
    }

    private async executarUsuario(acao: string | undefined, argumentos: string[]): Promise<void> {
        if (acao === "criar") {
            const opcoes = lerOpcoes(argumentos);
            const usuario = exigir(opcoes, "usuario");
            const papel = enumValor(PapelUsuario, exigir(opcoes, "papel"), "papel de usuário");
            if (this.autenticacao.credenciais.some((credencial) => credencial.usuario === usuario))
                throw new Error("Esse usuário já existe.");
            const senha = await solicitarSenha("Senha inicial: ");
            const confirmacao = await solicitarSenha("Repita a senha: ");
            validarNovaSenha(senha, confirmacao);
            const credencial = this.autenticacao.criarCredencial(usuario, senha, papel);
            await this.organizacao.repositorio.salvarEntidade("credenciais", usuario, credencial);
            console.log(`OK: usuário ${usuario} criado com papel ${papel}.`);
            return;
        }
        if (acao === "listar") {
            for (const credencial of this.autenticacao.credenciais)
                console.log(`${credencial.usuario} | ${credencial.papel}`);
            return;
        }
        if (acao === "papel") {
            const usuario = argumentos[0];
            const nomePapel = argumentos[1];
            if (!usuario || !nomePapel) throw new Error("Uso: usuario papel <usuario> <PAPEL>.");
            const credencial = this.autenticacao.credenciais.find(
                (item) => item.usuario === usuario,
            );
            if (!credencial) throw new Error("Usuário não encontrado.");
            credencial.papel = enumValor(PapelUsuario, nomePapel, "papel de usuário");
            await this.organizacao.repositorio.salvarEntidade("credenciais", usuario, credencial);
            this.autenticacao.sessoesAtivas = this.autenticacao.sessoesAtivas.filter(
                (sessao) => sessao.usuario !== usuario,
            );
            if (usuario === this.sessaoAtual?.usuario) this.fazerLogout();
            console.log("OK: papel atualizado.");
            return;
        }
        if (acao === "desativar") {
            const usuario = argumentos[0];
            if (!usuario) throw new Error("Uso: usuario desativar <usuario>.");
            const credencial = this.autenticacao.credenciais.find(
                (item) => item.usuario === usuario,
            );
            if (!credencial) throw new Error("Usuário não encontrado.");
            await this.organizacao.repositorio.excluirEntidade("credenciais", usuario);
            this.autenticacao.credenciais = this.autenticacao.credenciais.filter(
                (item) => item.usuario !== usuario,
            );
            this.autenticacao.sessoesAtivas = this.autenticacao.sessoesAtivas.filter(
                (sessao) => sessao.usuario !== usuario,
            );
            if (usuario === this.sessaoAtual?.usuario) this.fazerLogout();
            console.log(`OK: usuário ${usuario} desativado.`);
            return;
        }
        throw new Error("Use usuario criar, listar, papel ou desativar.");
    }

    private async executarLote(acao: string | undefined, argumentos: string[]): Promise<void> {
        if (acao === "criar") {
            const opcoes = lerOpcoes(argumentos);
            const lote = await this.lote.criarLote({
                id: opcoes.id,
                organizacaoId: exigir(opcoes, "org"),
                notaFiscal: exigir(opcoes, "nf"),
                transportadora: exigir(opcoes, "transp"),
                dataEntrada: opcoes.data ? lerData(opcoes.data) : new Date(),
                observacoes: opcoes.obs ?? "",
            });
            console.log(`OK: lote criado com identificador ${lote.id}.`);
            return;
        }
        if (acao === "listar") {
            const lotes = await this.lote.consultarLotePorPeriodo(
                new Date(0),
                new Date(8640000000000000),
            );
            if (!lotes.length) console.log("Nenhum lote cadastrado.");
            for (const item of lotes)
                console.log(
                    `${item.id} | organização ${item.organizacaoId} | ${item.statusProcessamento} | ${item.equipamentos.length} equipamento(s)`,
                );
            return;
        }
        if (acao === "triagem") {
            const id = argumentos[0];
            if (!id) throw new Error("Uso: lote triagem <id>.");
            await this.lote.processarTriagem(id);
            console.log("OK: triagem do lote concluída.");
            return;
        }
        throw new Error("Use lote criar, listar ou triagem.");
    }

    private async executarEquipamento(
        acao: string | undefined,
        argumentos: string[],
    ): Promise<void> {
        if (acao === "criar") {
            const opcoes = lerOpcoes(argumentos);
            const tipo = enumValor(TipoEquipamento, exigir(opcoes, "tipo"), "tipo de equipamento");
            const estado = enumValor(EstadoFisico, exigir(opcoes, "estado"), "estado físico");
            const ano = Number(exigir(opcoes, "ano"));
            const peso = Number(exigir(opcoes, "peso"));
            if (!Number.isInteger(ano))
                throw new Error("Ano de fabricação precisa ser um número inteiro.");
            if (!Number.isFinite(peso) || peso <= 0)
                throw new Error("Peso precisa ser maior que zero.");
            const loteId = exigir(opcoes, "lote");
            const existentes = await this.equipamento.repositorio.listarEntidades("equipamentos");
            const item = new Equipamento(
                opcoes.id ?? crypto.randomUUID(),
                this.equipamento.gerarCodigoBarras(tipo, existentes.length + 1),
                tipo,
                exigir(opcoes, "marca"),
                exigir(opcoes, "modelo"),
                ano,
                estado,
                peso,
                loteId,
                0,
                StatusRastreamento.AGUARDANDO_TRIAGEM,
            );
            await this.lote.adicionarEquipamentoLote(loteId, item);
            console.log(
                `OK: equipamento cadastrado com identificador ${item.id}. Código de barras: ${item.codigoBarrasInterno}.`,
            );
            return;
        }
        if (acao === "rastrear") {
            const id = argumentos[0];
            if (!id) throw new Error("Uso: equipamento rastrear <id>.");
            await this.exibirHistoricoEquipamento(id, []);
            return;
        }
        if (acao === "estado") {
            const id = argumentos[0];
            const estado = argumentos[1];
            if (!id || !estado)
                throw new Error("Uso: equipamento estado <id> <ESTADO> [--justificativa texto].");
            const opcoes = lerOpcoes(argumentos.slice(2));
            await this.equipamento.atualizarEstadoFisico(
                id,
                enumValor(EstadoFisico, estado, "estado físico"),
                opcoes.justificativa ?? "",
            );
            console.log("OK: estado físico atualizado.");
            return;
        }
        if (acao === "status") {
            const id = argumentos[0];
            const status = argumentos[1];
            if (!id || !status)
                throw new Error("Uso: equipamento status <id> <STATUS_RASTREAMENTO>.");
            const opcoes = lerOpcoes(argumentos.slice(2));
            await this.equipamento.atualizarStatus(
                id,
                enumValor(StatusRastreamento, status, "status de rastreamento"),
                opcoes.justificativa ?? "",
            );
            console.log("OK: status de rastreamento atualizado.");
            return;
        }
        throw new Error("Use equipamento criar, rastrear, estado ou status.");
    }

    private async executarRelatorio(acao: string | undefined, argumentos: string[]): Promise<void> {
        if (acao === "status") {
            const status = argumentos[0];
            if (!status) throw new Error("Uso: relatorio status <STATUS_RASTREAMENTO>.");
            console.log(
                await this.relatorio.gerarRelatorioPorStatus(
                    enumValor(StatusRastreamento, status, "status de rastreamento"),
                ),
            );
            return;
        }
        const opcoes = lerOpcoes(argumentos);
        const periodo = {
            inicio: opcoes.inicio ? lerData(opcoes.inicio) : new Date(0),
            fim: opcoes.fim ? lerData(opcoes.fim) : new Date(),
        };
        if (periodo.inicio > periodo.fim)
            throw new Error("A data inicial precisa ser anterior à data final.");
        if (acao === "organizacao") {
            console.log(
                await this.relatorio.gerarRelatorioPorOrganizacao(exigir(opcoes, "org"), periodo),
            );
            return;
        }
        if (acao === "financeiro") {
            console.log(await this.relatorio.gerarRelatorioFinanceiro(periodo));
            return;
        }
        throw new Error("Use relatorio organizacao, status ou financeiro.");
    }

    private async executarParametros(
        acao: string | undefined,
        argumentos: string[],
    ): Promise<void> {
        if (acao === "consultar") {
            const parametros = await this.relatorio.consultarParametrosGlobais();
            if (!parametros) {
                console.log(
                    "Parâmetros globais ainda não configurados. Use parametros configurar --imposto <0-100> --depreciacao <coeficiente>.",
                );
                return;
            }
            console.log(
                `Alíquota de imposto: ${parametros.aliquotaImposto}%. Coeficiente de depreciação: ${parametros.coeficienteDepreciacao}.`,
            );
            return;
        }
        if (acao === "configurar") {
            const opcoes = lerOpcoes(argumentos);
            const aliquota = lerNumero(exigir(opcoes, "imposto"), "alíquota de imposto");
            const depreciacao = lerNumero(
                exigir(opcoes, "depreciacao"),
                "coeficiente de depreciação",
            );
            await this.relatorio.configurarParametrosGlobais(aliquota, depreciacao);
            console.log("OK: parâmetros globais configurados.");
            return;
        }
        throw new Error(
            "Use parametros consultar ou parametros configurar --imposto <0-100> --depreciacao <coeficiente>.",
        );
    }

    private async exibirHistoricoEquipamento(
        id: string | undefined,
        _argumentos: string[],
    ): Promise<void> {
        if (!id) throw new Error("Uso: historico <id-do-equipamento>.");
        const item = await this.equipamento.rastrearEquipamento(id);
        if (!item) throw new Error("Equipamento não encontrado.");
        console.log(
            `${item.codigoBarrasInterno} | ${item.tipo} | ${item.marca} ${item.modelo} | ${item.estadoFisico} | ${item.statusRastreamento}`,
        );
        if (!item.historicoMovimentacao.length) {
            console.log("Sem movimentações registradas.");
            return;
        }
        for (const movimento of item.historicoMovimentacao)
            console.log(
                `${movimento.dataHora.toISOString()} | ${movimento.origem} -> ${movimento.destino} | responsável ${movimento.responsavel} | ${movimento.observacao}`,
            );
    }
}

function separarPalavras(texto: string): string[] {
    // Mantém valores entre aspas juntos, por exemplo nomes de organização com espaços
    return [...texto.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(
        (parte) => parte[1] ?? parte[2] ?? parte[3],
    );
}
//01101110

function lerOpcoes(argumentos: string[]): Record<string, string> {
    // Transforma pares como --org BR001 em um objeto fácil de consultar
    const opcoes: Record<string, string> = {};
    for (let indice = 0; indice < argumentos.length; indice += 1) {
        const atual = argumentos[indice];
        if (!atual.startsWith("--"))
            throw new Error(`Argumento inesperado: ${atual}. Use opções como --org BR001.`);
        const [nome, valorIgual] = atual.slice(2).split("=", 2);
        if (valorIgual !== undefined) {
            opcoes[nome] = valorIgual;
            continue;
        }
        const proximo = argumentos[indice + 1];
        if (!proximo || proximo.startsWith("--")) {
            opcoes[nome] = "sim";
            continue;
        }
        opcoes[nome] = proximo;
        indice += 1;
    }
    return opcoes;
}

function exigir(opcoes: Record<string, string>, nome: string): string {
    const valor = opcoes[nome]?.trim();
    if (!valor) throw new Error(`Falta informar --${nome}.`);
    return valor;
}

function lerNumero(texto: string, nome: string): number {
    const valor = Number(texto.replace(",", "."));
    if (!Number.isFinite(valor)) throw new Error(`Informe um número válido para ${nome}.`);
    return valor;
}

function lerData(texto: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto))
        throw new Error("Informe a data no formato AAAA-MM-DD.");
    const data = new Date(`${texto}T00:00:00`);
    if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== texto)
        throw new Error("Data inválida.");
    return data;
}

function enumValor<T extends Record<string, string>>(
    opcoes: T,
    texto: string,
    nome: string,
): T[keyof T] {
    const valor = texto.toUpperCase();
    const encontrado = Object.values(opcoes).find((opcao) => opcao === valor);
    if (!encontrado)
        throw new Error(`${nome} inválido. Valores aceitos: ${Object.values(opcoes).join(", ")}.`);
    return encontrado as T[keyof T];
}

function validarNovaSenha(senha: string, confirmacao: string): void {
    if (!senha) throw new Error("A senha não pode ficar vazia.");
    if (senha !== confirmacao) throw new Error("As senhas não conferem.");
}

import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import { ServicoAutenticacao, ServicoEquipamento, ServicoLote, ServicoOrganizacao, ServicoRelatorio } from "./services/services";
import { PapelUsuario, Sessao } from "./domain/types";

/** Fachada de linha de comando: recebe os servicos que aparecem no UML. */
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
    const terminal = createInterface({ input: stdin, output: stdout, completer: (linha) => {
      const comandos = ["login", "logout", "organizacao", "lote", "equipamento", "relatorio", "ajuda", "sair"];
      const atual = linha.split(/\s+/).pop() ?? "";
      return [comandos.filter(c => c.startsWith(atual)), linha];
    } });
    console.log("greencode - digite ajuda para ver comandos.");
    try { while (true) { const entrada = await terminal.question("greencode> "); if (!(await this.processarComando(entrada))) break; } }
    finally { terminal.close(); }
  }
  async processarComando(entrada: string): Promise<boolean> {
    const [acao, ...args] = entrada.trim().split(/\s+/);
    if (!acao) return true;
    if (acao === "sair") return false;
    if (acao === "ajuda") { console.log("login <usuario> <senha> | logout | organizacao | lote | equipamento | relatorio | sair"); return true; }
    if (acao === "login") {
      if (args.length < 2) { console.log("ERRO: informe usuario e senha."); return true; }
      try { this.sessaoAtual = this.autenticacao.login(args[0], args[1]); console.log("OK: login realizado."); }
      catch (erro) { console.log(`ERRO: ${(erro as Error).message}`); }
      return true;
    }
    if (acao === "logout") { if (this.sessaoAtual) this.autenticacao.logout(this.sessaoAtual.token); this.sessaoAtual = null; console.log("OK: sessao encerrada."); return true; }
    if (!this.sessaoAtual?.isValida()) { console.log("AVISO: faca login para continuar."); return true; }
    this.exibirMenuPorPapel(this.sessaoAtual.papel);
    console.log(`Comando '${acao}' sera atendido pelo servico correspondente na proxima etapa.`);
    return true;
  }
  exibirMenuPorPapel(papel: PapelUsuario): void {
    const opcoes: Record<PapelUsuario, string[]> = {
      [PapelUsuario.ADMINISTRADOR]: ["organizacao", "lote", "equipamento", "relatorio", "usuarios"],
      [PapelUsuario.OPERADOR_CADASTRO]: ["organizacao", "lote", "relatorio"],
      [PapelUsuario.GESTOR_ALMOXARIFADO]: ["lote", "equipamento", "relatorio"],
      [PapelUsuario.AUDITOR]: ["relatorio", "historico"],
    };
    console.log(`Opcoes: ${opcoes[papel].join(", ")}`);
  }
}

import { createHash, randomBytes } from "crypto";
import { Equipamento, EstadoFisico, Lote, Organizacao, PapelUsuario, Sessao, StatusLote, StatusRastreamento, TipoEquipamento, Autenticavel, Credencial } from "../domain/types";
import { RepositorioArquivo } from "../infrastructure/repository";
import { ValidadorCNPJ } from "../domain/validators";

export class ServicoAutenticacao implements Autenticavel {
  constructor(public credenciais: Credencial[] = [], public sessoesAtivas: Sessao[] = []) {}
  autenticar(usuario: string, senha: string): boolean { return this.credenciais.some(c => c.usuario === usuario && c.verificarSenha(senha)); }
  renovarToken(): string { return randomBytes(32).toString("hex"); }
  login(usuario: string, senha: string): Sessao {
    const credencial = this.credenciais.find(c => c.usuario === usuario && c.verificarSenha(senha));
    if (!credencial) throw new Error("Usuario ou senha incorretos.");
    credencial.atualizarUltimoAcesso();
    const agora = new Date();
    const sessao = new Sessao(this.renovarToken(), usuario, credencial.papel, agora, new Date(agora.getTime() + 30 * 60 * 1000));
    this.sessoesAtivas.push(sessao);
    return sessao;
  }
  logout(token: string): void { this.sessoesAtivas = this.sessoesAtivas.filter(s => s.token !== token); }
  validarToken(token: string): boolean { return this.sessoesAtivas.some(s => s.token === token && s.isValida()); }
  alterarSenha(usuario: string, senhaAntiga: string, senhaNova: string): boolean {
    const credencial = this.credenciais.find(c => c.usuario === usuario);
    if (!credencial || !credencial.verificarSenha(senhaAntiga)) return false;
    credencial.salt = randomBytes(16).toString("hex");
    credencial.hashSenha = createHash("sha256").update(senhaNova + credencial.salt).digest("hex");
    return true;
  }
  criarCredencial(usuario: string, senha: string, papel: PapelUsuario): Credencial {
    const salt = randomBytes(16).toString("hex");
    const hash = createHash("sha256").update(senha + salt).digest("hex");
    const credencial = new Credencial(usuario, hash, salt, new Date(), papel);
    this.credenciais.push(credencial);
    return credencial;
  }
}

export class ServicoOrganizacao {
  constructor(public repositorio: RepositorioArquivo, public validadorCNPJ: ValidadorCNPJ) {}
  async cadastrarOrganizacao(dados: any): Promise<Organizacao> {
    if (!this.validadorCNPJ.validar(dados.cnpj)) throw new Error(this.validadorCNPJ.obterMensagemErro());
    if ((await this.listarOrganizacoesAtivas()).some(o => o.cnpj.replace(/\D/g, "") === String(dados.cnpj).replace(/\D/g, ""))) throw new Error("Ja existe organizacao com esse CNPJ.");
    const org = new Organizacao(crypto.randomUUID(), dados.razaoSocial, dados.cnpj, dados.inscricaoEstadual, dados.enderecoCompleto, dados.telefone, dados.email, new Date(), true);
    await this.repositorio.salvarEntidade("organizacoes", org.id, org);
    return org;
  }
  async buscarOrganizacao(id: string): Promise<Organizacao | null> { return (await this.listarOrganizacoesAtivas()).find(o => o.id === id) ?? null; }
  async listarOrganizacoesAtivas(): Promise<Organizacao[]> { return (await this.repositorio.listarEntidades<Organizacao>("organizacoes")).filter(o => o.ativo); }
  async renovarContrato(organizacaoId: string, novoVencimento: Date): Promise<void> { const org = await this.buscarOrganizacao(organizacaoId); if (!org?.contratoVigente) throw new Error("Organizacao sem contrato vigente."); org.contratoVigente.renovar(novoVencimento); await this.repositorio.salvarEntidade("organizacoes", org.id, org); }
}

export class ServicoLote {
  constructor(public repositorio: RepositorioArquivo) {}
  async criarLote(dados: any): Promise<Lote> {
    const entrada = new Date(dados.dataEntrada);
    const dias = (Date.now() - entrada.getTime()) / 86400000;
    if (Number.isNaN(entrada.getTime()) || dias < 0 || dias > 90) throw new Error("Data de entrada deve estar entre hoje e 90 dias atras.");
    const lote = new Lote(crypto.randomUUID(), entrada, dados.organizacaoId, dados.notaFiscal, dados.transportadora, [], StatusLote.RECEBIDO, dados.observacoes ?? "");
    await this.repositorio.salvarEntidade("lotes", lote.id, lote);
    return lote;
  }
  async adicionarEquipamentoLote(loteId: string, equipamento: Equipamento): Promise<void> { const lote = await this.buscar(loteId); if (!lote) throw new Error("Lote nao encontrado."); lote.adicionarEquipamento(equipamento); await this.repositorio.salvarEntidade("lotes", lote.id, lote); }
  async processarTriagem(loteId: string): Promise<void> { const lote = await this.buscar(loteId); if (!lote) throw new Error("Lote nao encontrado."); lote.statusProcessamento = StatusLote.TRIAGEM_CONCLUIDA; for (const e of lote.equipamentos) e.statusRastreamento = StatusRastreamento.AGUARDANDO_DESMONTAGEM; await this.repositorio.salvarEntidade("lotes", lote.id, lote); }
  async consultarLotePorPeriodo(dataInicio: Date, dataFim: Date): Promise<Lote[]> { return (await this.repositorio.listarEntidades<Lote>("lotes")).filter(l => l.dataEntrada >= dataInicio && l.dataEntrada <= dataFim); }
  private async buscar(id: string): Promise<Lote | null> { const lotes = await this.consultarLotePorPeriodo(new Date(0), new Date(8640000000000000)); return lotes.find(l => l.id === id) ?? null; }
}

export class ServicoEquipamento {
  constructor(public repositorio: RepositorioArquivo) {}
  async rastrearEquipamento(id: string): Promise<Equipamento | null> { const itens = await this.repositorio.listarEntidades<Equipamento>("equipamentos"); return itens.find(e => e.id === id) ?? null; }
  async atualizarEstadoFisico(id: string, novoEstado: EstadoFisico, justificativa: string): Promise<void> {
    const e = await this.rastrearEquipamento(id); if (!e) throw new Error("Equipamento nao encontrado.");
    const niveis = Object.values(EstadoFisico); const piora = niveis.indexOf(novoEstado) - niveis.indexOf(e.estadoFisico);
    if (piora >= 2 && !justificativa.trim()) throw new Error("Informe justificativa ao piorar duas ou mais categorias.");
    e.estadoFisico = novoEstado; await this.repositorio.salvarEntidade("equipamentos", e.id, e);
  }
  gerarCodigoBarras(tipo: TipoEquipamento, sequencia: number): string { return `${tipo}-${String(sequencia).padStart(8, "0")}`; }
}

export class ServicoRelatorio {
  constructor(private organizacoes: ServicoOrganizacao, private lotes: ServicoLote, private equipamentos: ServicoEquipamento) {}
  async gerarRelatorioPorOrganizacao(organizacaoId: string, periodo: { inicio: Date; fim: Date }): Promise<string> {
    const org = await this.organizacoes.buscarOrganizacao(organizacaoId); if (!org) throw new Error("Organizacao nao encontrada.");
    const lotes = await this.lotes.consultarLotePorPeriodo(periodo.inicio, periodo.fim).then(ls => ls.filter(l => l.organizacaoId === organizacaoId));
    return `${org.razaoSocial}: ${lotes.length} lote(s) no periodo.`;
  }
  async gerarRelatorioPorStatus(status: StatusRastreamento): Promise<string> { const todos = await this.equipamentos.repositorio.listarEntidades<Equipamento>("equipamentos"); return `${todos.filter(e => e.statusRastreamento === status).length} equipamento(s) com status ${status}.`; }
  async gerarRelatorioFinanceiro(_periodo: { inicio: Date; fim: Date }): Promise<string> { return "Relatorio financeiro: totais serao calculados a partir dos contratos e lotes cadastrados."; }
}

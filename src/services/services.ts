import { createHash, randomBytes } from "crypto";
import { Contrato, Equipamento, EstadoFisico, Lote, Movimentacao, Organizacao, PapelUsuario, Sessao, StatusLote, StatusRastreamento, TipoEquipamento, Autenticavel, Credencial } from "../domain/types";
import { RepositorioArquivo } from "../infrastructure/repository";
import { ValidadorCNPJ } from "../domain/validators";
import { dataEntradaValida } from "../domain/validation";

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
    const organizacoesCadastradas = (await this.repositorio.listarEntidades<Organizacao>("organizacoes")).map(restaurarOrganizacao);
    if (organizacoesCadastradas.some(o => o.cnpj.replace(/\D/g, "") === String(dados.cnpj).replace(/\D/g, ""))) throw new Error("Ja existe organizacao com esse CNPJ.");
    const org = new Organizacao(dados.id ?? crypto.randomUUID(), dados.razaoSocial, dados.cnpj, dados.inscricaoEstadual, dados.enderecoCompleto, dados.telefone, dados.email, new Date(), true);
    if (dados.contrato) {
      org.contratoVigente = new Contrato(crypto.randomUUID(), org.id, new Date(), new Date(dados.contrato.dataVencimento), dados.contrato.clausulas, Number(dados.contrato.valorMensal), Boolean(dados.contrato.renovacaoAutomatica));
      if (!Number.isFinite(org.contratoVigente.valorMensal) || org.contratoVigente.valorMensal < 0 || Number.isNaN(org.contratoVigente.dataVencimento.getTime())) throw new Error("Dados do contrato invalidos.");
    }
    await this.repositorio.salvarEntidade("organizacoes", org.id, org);
    return org;
  }
  async buscarOrganizacao(id: string): Promise<Organizacao | null> { const org = await this.repositorio.carregarEntidade<Organizacao>("organizacoes", id); return org ? restaurarOrganizacao(org) : null; }
  async listarOrganizacoesAtivas(): Promise<Organizacao[]> { return (await this.repositorio.listarEntidades<Organizacao>("organizacoes")).map(restaurarOrganizacao).filter(o => o.ativo); }
  async desativarOrganizacao(id: string): Promise<void> { const org = await this.buscarOrganizacao(id); if (!org) throw new Error("Organizacao nao encontrada."); org.desativar(); await this.repositorio.salvarEntidade("organizacoes", org.id, org); }
  async renovarContrato(organizacaoId: string, novoVencimento: Date): Promise<void> { const org = await this.buscarOrganizacao(organizacaoId); if (!org?.contratoVigente) throw new Error("Organizacao sem contrato vigente."); org.contratoVigente.renovar(novoVencimento); await this.repositorio.salvarEntidade("organizacoes", org.id, org); }
}

export class ServicoLote {
  constructor(public repositorio: RepositorioArquivo) {}
  async criarLote(dados: any): Promise<Lote> {
    const organizacao = await this.repositorio.carregarEntidade<Organizacao>("organizacoes", dados.organizacaoId);
    if (!organizacao || !organizacao.ativo) throw new Error("Organizacao nao encontrada ou desativada.");
    const entrada = new Date(dados.dataEntrada);
    if (!dataEntradaValida(entrada)) throw new Error("Data de entrada deve estar entre hoje e 90 dias atras.");
    if (!dados.notaFiscal?.trim() || !dados.transportadora?.trim()) throw new Error("Nota fiscal e transportadora sao obrigatorias.");
    const lote = new Lote(dados.id ?? crypto.randomUUID(), entrada, dados.organizacaoId, dados.notaFiscal, dados.transportadora, [], StatusLote.RECEBIDO, dados.observacoes ?? "");
    await this.repositorio.salvarEntidade("lotes", lote.id, lote);
    return lote;
  }
  async adicionarEquipamentoLote(loteId: string, equipamento: Equipamento): Promise<void> {
    const lote = await this.buscar(loteId); if (!lote) throw new Error("Lote nao encontrado.");
    if ([StatusLote.TRIAGEM_CONCLUIDA, StatusLote.ENCAMINHADO, StatusLote.FINALIZADO].includes(lote.statusProcessamento)) throw new Error("Nao e possivel incluir equipamento depois da triagem.");
    lote.adicionarEquipamento(equipamento);
    await this.repositorio.salvarEntidade("equipamentos", equipamento.id, equipamento);
    await this.repositorio.salvarEntidade("lotes", lote.id, lote);
  }
  async processarTriagem(loteId: string): Promise<void> {
    const lote = await this.buscar(loteId); if (!lote) throw new Error("Lote nao encontrado.");
    if (lote.statusProcessamento === StatusLote.TRIAGEM_CONCLUIDA) throw new Error("A triagem deste lote ja foi concluida.");
    lote.statusProcessamento = StatusLote.TRIAGEM_CONCLUIDA;
    for (const equipamento of lote.equipamentos) {
      equipamento.atualizarStatus(StatusRastreamento.AGUARDANDO_DESMONTAGEM, "Triagem concluida.", this.repositorio.usuarioResponsavel);
      await this.repositorio.salvarEntidade("equipamentos", equipamento.id, equipamento);
    }
    await this.repositorio.salvarEntidade("lotes", lote.id, lote);
  }
  async consultarLotePorPeriodo(dataInicio: Date, dataFim: Date): Promise<Lote[]> {
    return (await this.repositorio.listarEntidades<Lote>("lotes")).map(restaurarLote).filter(l => l.dataEntrada >= dataInicio && l.dataEntrada <= dataFim);
  }
  private async buscar(id: string): Promise<Lote | null> { const lote = await this.repositorio.carregarEntidade<Lote>("lotes", id); return lote ? restaurarLote(lote) : null; }
}

export class ServicoEquipamento {
  constructor(public repositorio: RepositorioArquivo) {}
  async rastrearEquipamento(id: string): Promise<Equipamento | null> { const item = await this.repositorio.carregarEntidade<Equipamento>("equipamentos", id); return item ? restaurarEquipamento(item) : null; }
  async atualizarEstadoFisico(id: string, novoEstado: EstadoFisico, justificativa: string): Promise<void> {
    const e = await this.rastrearEquipamento(id); if (!e) throw new Error("Equipamento nao encontrado.");
    const niveis = Object.values(EstadoFisico); const piora = niveis.indexOf(novoEstado) - niveis.indexOf(e.estadoFisico);
    if (piora >= 2 && !justificativa.trim()) throw new Error("Informe justificativa ao piorar duas ou mais categorias.");
    e.estadoFisico = novoEstado; await this.repositorio.salvarEntidade("equipamentos", e.id, e);
  }
  async atualizarStatus(id: string, novoStatus: StatusRastreamento, justificativa: string): Promise<void> {
    const equipamento = await this.rastrearEquipamento(id);
    if (!equipamento) throw new Error("Equipamento nao encontrado.");
    if (novoStatus === StatusRastreamento.EM_DESMONTAGEM) {
      const lote = await this.repositorio.carregarEntidade<Lote>("lotes", equipamento.loteId);
      if (!lote || lote.statusProcessamento !== StatusLote.TRIAGEM_CONCLUIDA) throw new Error("O equipamento so pode ir para desmontagem depois da triagem completa do lote.");
    }
    equipamento.atualizarStatus(novoStatus, justificativa, this.repositorio.usuarioResponsavel);
    await this.repositorio.salvarEntidade("equipamentos", equipamento.id, equipamento);
  }
  gerarCodigoBarras(tipo: TipoEquipamento, sequencia: number): string { return `${tipo}-${String(sequencia).padStart(8, "0")}`; }
}

export class ServicoRelatorio {
  constructor(private organizacoes: ServicoOrganizacao, private lotes: ServicoLote, private equipamentos: ServicoEquipamento) {}

  async consultarParametrosGlobais(): Promise<{ aliquotaImposto: number; coeficienteDepreciacao: number } | null> {
    return this.organizacoes.repositorio.carregarEntidade("configuracoes", "globais");
  }

  async configurarParametrosGlobais(aliquotaImposto: number, coeficienteDepreciacao: number): Promise<void> {
    if (!Number.isFinite(aliquotaImposto) || aliquotaImposto < 0 || aliquotaImposto > 100) {
      throw new Error("A alíquota de imposto deve estar entre 0 e 100%.");
    }
    if (!Number.isFinite(coeficienteDepreciacao) || coeficienteDepreciacao < 0) {
      throw new Error("O coeficiente de depreciação deve ser um número igual ou maior que zero.");
    }
    await this.organizacoes.repositorio.salvarEntidade("configuracoes", "globais", { aliquotaImposto, coeficienteDepreciacao });
  }

  async gerarRelatorioPorOrganizacao(organizacaoId: string, periodo: { inicio: Date; fim: Date }): Promise<string> {
    const org = await this.organizacoes.buscarOrganizacao(organizacaoId); if (!org) throw new Error("Organizacao nao encontrada.");
    const lotes = await this.lotes.consultarLotePorPeriodo(periodo.inicio, periodo.fim).then(ls => ls.filter(l => l.organizacaoId === organizacaoId));
    return `${org.razaoSocial}: ${lotes.length} lote(s) no periodo.`;
  }
  async gerarRelatorioPorStatus(status: StatusRastreamento): Promise<string> { const todos = await this.equipamentos.repositorio.listarEntidades<Equipamento>("equipamentos"); return `${todos.filter(e => e.statusRastreamento === status).length} equipamento(s) com status ${status}.`; }
  async gerarRelatorioFinanceiro(periodo: { inicio: Date; fim: Date }): Promise<string> {
    const organizacoes = await this.organizacoes.listarOrganizacoesAtivas();
    const contratos = organizacoes.map(o => o.contratoVigente).filter((c): c is Contrato => Boolean(c && c.dataAssinatura <= periodo.fim && c.dataVencimento >= periodo.inicio));
    const valorMensal = contratos.reduce((soma, contrato) => soma + contrato.valorMensal, 0);
    const parametros = await this.consultarParametrosGlobais();
    if (!parametros) {
      return `Contratos ativos no periodo: ${contratos.length}. Soma dos valores mensais: R$ ${valorMensal.toFixed(2)}. Parâmetros globais ainda não configurados.`;
    }
    const impostoMensal = valorMensal * parametros.aliquotaImposto / 100;
    return `Contratos ativos no periodo: ${contratos.length}. Soma dos valores mensais: R$ ${valorMensal.toFixed(2)}. Imposto estimado (${parametros.aliquotaImposto}%): R$ ${impostoMensal.toFixed(2)}. Coeficiente de depreciação configurado: ${parametros.coeficienteDepreciacao}.`;
  }
}

/** JSON guarda datas como texto e nao guarda os metodos das classes. Estas funcoes reconstroem os objetos ao ler os arquivos. */
function restaurarOrganizacao(registro: Organizacao): Organizacao {
  const organizacao = new Organizacao(registro.id, registro.razaoSocial, registro.cnpj, registro.inscricaoEstadual, registro.enderecoCompleto, registro.telefone, registro.email, new Date(registro.dataCadastro), registro.ativo);
  if (registro.contratoVigente) {
    const contrato = registro.contratoVigente;
    organizacao.contratoVigente = new Contrato(contrato.id, contrato.organizacaoId, new Date(contrato.dataAssinatura), new Date(contrato.dataVencimento), [...contrato.clausulas], contrato.valorMensal, contrato.renovacaoAutomatica);
  }
  return organizacao;
}

function restaurarLote(registro: Lote): Lote {
  return new Lote(registro.id, new Date(registro.dataEntrada), registro.organizacaoId, registro.notaFiscal, registro.transportadora, (registro.equipamentos ?? []).map(restaurarEquipamento), registro.statusProcessamento, registro.observacoes);
}

function restaurarEquipamento(registro: Equipamento): Equipamento {
  const movimentacoes = (registro.historicoMovimentacao ?? []).map(item => new Movimentacao(item.id, item.equipamentoId, new Date(item.dataHora), item.origem, item.destino, item.responsavel, item.observacao));
  return new Equipamento(registro.id, registro.codigoBarrasInterno, registro.tipo, registro.marca, registro.modelo, registro.anoFabricacao, registro.estadoFisico, registro.pesoQuilogramas, registro.loteId, registro.posicaoNoLote, registro.statusRastreamento, movimentacoes);
}

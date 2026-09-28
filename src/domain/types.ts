import { createHash } from "crypto";
import type { RepositorioArquivo } from "../infrastructure/repository";

/* Enumeracoes e classes do modelo, de acordo com os elementos do UML. */
export enum PapelUsuario { ADMINISTRADOR = "ADMINISTRADOR", OPERADOR_CADASTRO = "OPERADOR_CADASTRO", GESTOR_ALMOXARIFADO = "GESTOR_ALMOXARIFADO", AUDITOR = "AUDITOR" }

export enum StatusLote { RECEBIDO = "RECEBIDO", EM_TRIAGEM = "EM_TRIAGEM", TRIAGEM_CONCLUIDA = "TRIAGEM_CONCLUIDA", ENCAMINHADO = "ENCAMINHADO", FINALIZADO = "FINALIZADO" }

export enum TipoEquipamento { COMPUTADOR_MESA = "COMPUTADOR_MESA", NOTEBOOK = "NOTEBOOK", MONITOR = "MONITOR", IMPRESSORA = "IMPRESSORA", SERVIDOR = "SERVIDOR", ROTEADOR = "ROTEADOR", CABO_ESTRUTURADO = "CABO_ESTRUTURADO", FONTE_ALIMENTACAO = "FONTE_ALIMENTACAO" }

export enum EstadoFisico { NOVO = "NOVO", BOM_ESTADO = "BOM_ESTADO", USADO_LEVE = "USADO_LEVE", USADO_MODERADO = "USADO_MODERADO", DANIFICADO_LEVE = "DANIFICADO_LEVE", DANIFICADO_GRAVE = "DANIFICADO_GRAVE", INSERVIVEL = "INSERVIVEL" }

export enum StatusRastreamento { AGUARDANDO_TRIAGEM = "AGUARDANDO_TRIAGEM", EM_TRIAGEM = "EM_TRIAGEM", AGUARDANDO_DESMONTAGEM = "AGUARDANDO_DESMONTAGEM", EM_DESMONTAGEM = "EM_DESMONTAGEM", PECAS_REAPROVEITADAS = "PECAS_REAPROVEITADAS", MATERIAL_RECICLAVEL = "MATERIAL_RECICLAVEL", DESCARTE_SEGURO = "DESCARTE_SEGURO", BAIXA_DEFINITIVA = "BAIXA_DEFINITIVA" }

export interface Autenticavel { autenticar(usuario: string, senha: string): boolean; renovarToken(): string; }

export class Credencial {
  constructor(public usuario: string, public hashSenha: string, public salt: string, public ultimoAcesso: Date, public papel: PapelUsuario) {}
  verificarSenha(senhaPlana: string): boolean { return createHash("sha256").update(senhaPlana + this.salt).digest("hex") === this.hashSenha; }
  atualizarUltimoAcesso(): void { this.ultimoAcesso = new Date(); }
}
export class Sessao {
  constructor(public token: string, public usuario: string, public papel: PapelUsuario, public criacao: Date, public expiracao: Date) {}
  isValida(agora = new Date()): boolean { return agora < this.expiracao; }
  renovar(): void { this.expiracao = new Date(Date.now() + 30 * 60 * 1000); }
}
export class Contrato {
  constructor(public id: string, public organizacaoId: string, public dataAssinatura: Date, public dataVencimento: Date, public clausulas: string[], public valorMensal: number, public renovacaoAutomatica: boolean) {}
  estaVigente(hoje = new Date()): boolean { return hoje >= this.dataAssinatura && hoje <= this.dataVencimento; }
  renovar(novoVencimento: Date): void { this.dataVencimento = novoVencimento; }
}
export class Organizacao {
  contratoVigente: Contrato | null = null;
  constructor(public id: string, public razaoSocial: string, public cnpj: string, public inscricaoEstadual: string, public enderecoCompleto: string, public telefone: string, public email: string, public dataCadastro: Date, public ativo: boolean) {}
  alterarEndereco(novoEndereco: string): void { this.enderecoCompleto = novoEndereco; }
  desativar(): void { this.ativo = false; }
}
export class Movimentacao {
  constructor(public id: string, public equipamentoId: string, public dataHora: Date, public origem: string, public destino: string, public responsavel: string, public observacao: string) {}
}
export class Equipamento {
  constructor(public id: string, public codigoBarrasInterno: string, public tipo: TipoEquipamento, public marca: string, public modelo: string, public anoFabricacao: number, public estadoFisico: EstadoFisico, public pesoQuilogramas: number, public loteId: string, public posicaoNoLote: number, public statusRastreamento: StatusRastreamento, public historicoMovimentacao: Movimentacao[] = []) {}
  atualizarStatus(novoStatus: StatusRastreamento, justificativa: string, responsavel = "sistema"): void {
    const origem = this.statusRastreamento;
    this.statusRastreamento = novoStatus;
    this.historicoMovimentacao.push(new Movimentacao(crypto.randomUUID(), this.id, new Date(), origem, novoStatus, responsavel, justificativa));
  }
  registrarMovimentacao(destino: string, responsavel: string): void { this.historicoMovimentacao.push(new Movimentacao(crypto.randomUUID(), this.id, new Date(), this.statusRastreamento, destino, responsavel, "")); }
  calcularDepreciacao(): number { return Math.max(0, new Date().getFullYear() - this.anoFabricacao); }
}
export class Lote {
  constructor(public id: string, public dataEntrada: Date, public organizacaoId: string, public notaFiscal: string, public transportadora: string, public equipamentos: Equipamento[], public statusProcessamento: StatusLote, public observacoes: string) {}
  adicionarEquipamento(equip: Equipamento): void { equip.posicaoNoLote = this.equipamentos.length + 1; this.equipamentos.push(equip); }
  removerEquipamento(equipId: string): boolean { const antes = this.equipamentos.length; this.equipamentos = this.equipamentos.filter(e => e.id !== equipId); return this.equipamentos.length < antes; }
  calculaPesoTotal(): number { return this.equipamentos.reduce((soma, item) => soma + item.pesoQuilogramas, 0); }
  gerarRelatorioTriagem(): string { return `Lote ${this.id}: ${this.equipamentos.length} equipamento(s), ${this.calculaPesoTotal()} kg.`; }
}
export class JournalTransacao {
  constructor(public id: string, public timestamp: Date, public operacao: string, public entidade: string, public dadosAntes: unknown, public dadosDepois: unknown, public usuarioResponsavel: string) {}
  registrar(): void { Object.freeze(this); }
  async reverter(repositorio: RepositorioArquivo): Promise<boolean> { return repositorio.reverterTransacao(this.id); }
}
export abstract class Validador {
  abstract validar(objeto: unknown): boolean;
  obterMensagemErro(): string { return "Dados invalidos."; }
}

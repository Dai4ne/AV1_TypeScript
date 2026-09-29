import { createHash } from "crypto";
import type { RepositorioArquivo } from "../infrastructure/repository";

// estados e classes do diagrama UML.

/** Papéis usados para decidir quais comandos cada pessoa pode executar */
export enum PapelUsuario { 
  ADMINISTRADOR = "ADMINISTRADOR",
  OPERADOR_CADASTRO = "OPERADOR_CADASTRO",
  GESTOR_ALMOXARIFADO = "GESTOR_ALMOXARIFADO",
  AUDITOR = "AUDITOR" }

/** Etapas pelas quais um lote pode passar dentro do almoxarifado */
export enum StatusLote { RECEBIDO = "RECEBIDO", 
  EM_TRIAGEM = "EM_TRIAGEM", 
  TRIAGEM_CONCLUIDA = "TRIAGEM_CONCLUIDA", 
  ENCAMINHADO = "ENCAMINHADO", 
  FINALIZADO = "FINALIZADO" }

/** Tipos de equipamento aceitos no cadastro, conforme o UML */
export enum TipoEquipamento {
  COMPUTADOR_MESA = "COMPUTADOR_MESA",
  NOTEBOOK = "NOTEBOOK",
  MONITOR = "MONITOR",
  IMPRESSORA = "IMPRESSORA",
  SERVIDOR = "SERVIDOR",
  ROTEADOR = "ROTEADOR",
  CABO_ESTRUTURADO = "CABO_ESTRUTURADO",
  FONTE_ALIMENTACAO = "FONTE_ALIMENTACAO" }

/** Condições físicas possíveis para um equipament */
export enum EstadoFisico {
  NOVO = "NOVO",
  BOM_ESTADO = "BOM_ESTADO",
  USADO_LEVE = "USADO_LEVE",
  USADO_MODERADO = "USADO_MODERADO",
  DANIFICADO_LEVE = "DANIFICADO_LEVE",
  DANIFICADO_GRAVE = "DANIFICADO_GRAVE",
  INSERVIVEL = "INSERVIVEL" }

/** Situações usadas para acompanhar o caminho do equipamento */
export enum StatusRastreamento {
  AGUARDANDO_TRIAGEM = "AGUARDANDO_TRIAGEM",
  EM_TRIAGEM = "EM_TRIAGEM",
  AGUARDANDO_DESMONTAGEM = "AGUARDANDO_DESMONTAGEM",
  EM_DESMONTAGEM = "EM_DESMONTAGEM",
  PECAS_REAPROVEITADAS = "PECAS_REAPROVEITADAS",
  MATERIAL_RECICLAVEL = "MATERIAL_RECICLAVEL",
  DESCARTE_SEGURO = "DESCARTE_SEGURO",
  BAIXA_DEFINITIVA = "BAIXA_DEFINITIVA" }

/** Operações mínimas que um serviço de autenticação precisa oferecer */
export interface Autenticavel {
  autenticar(usuario: string, senha: string): boolean; renovarToken(): string; }

/** Dados de acesso, a senha é comparada com um hash e um salt nunca em texto puro */
export class Credencial {
  constructor(public usuario: string,
    public hashSenha: string,
    public salt: string,
    public ultimoAcesso: Date,
    public papel: PapelUsuario) {}
  verificarSenha(senhaPlana: string): boolean { 
    return createHash("sha256").update(senhaPlana + this.salt).digest("hex") === this.hashSenha; 
  }
  atualizarUltimoAcesso(): void { this.ultimoAcesso = new Date(); }
}
// Representa um usuário conectado e o horário em que sua sessão expira
export class Sessao {
  constructor(
    public token: string, 
    public usuario: string, 
    public papel: PapelUsuario, 
    public criacao: Date, 
    public expiracao: Date) {}
  isValida(agora = new Date()): boolean { return agora < this.expiracao; }
  renovar(): void { this.expiracao = new Date(Date.now() + 30 * 60 * 1000); }
}

// Contrato associado a uma organização, com valor e período de vigência
export class Contrato {
  constructor(
    public id: string, 
    public organizacaoId: string, 
    public dataAssinatura: Date, 
    public dataVencimento: Date, 
    public clausulas: string[], 
    public valorMensal: number, 
    public renovacaoAutomatica: boolean) {}
  estaVigente(hoje = new Date()): boolean { return hoje >= this.dataAssinatura && hoje <= this.dataVencimento; }
  renovar(novoVencimento: Date): void { this.dataVencimento = novoVencimento; }
}

//Organização cadastrada e, quando houver, seu contrato vigente
export class Organizacao {
  contratoVigente: Contrato | null = null;
  constructor(
    public id: string, 
    public razaoSocial: string, 
    public cnpj: string, 
    public inscricaoEstadual: string, 
    public enderecoCompleto: string, 
    public telefone: string, 
    public email: string, 
    public dataCadastro: Date, 
    public ativo: boolean) {}
  alterarEndereco(novoEndereco: string): void { this.enderecoCompleto = novoEndereco; }
  desativar(): void { this.ativo = false; }
} //01100001
//Um registro do caminho percorrido por um equipamento
export class Movimentacao {
  constructor(
    public id: string, 
    public equipamentoId: string, 
    public dataHora: Date, 
    public origem: string, 
    public destino: string, 
    public responsavel: string, 
    public observacao: string) {}
}
/** Dados e histórico de um item eletrônico acompanhado pelo sistema. */
export class Equipamento {
  constructor(
    public id: string, 
    public codigoBarrasInterno: string, 
    public tipo: TipoEquipamento, 
    public marca: string, 
    public modelo: string, 
    public anoFabricacao: number, 
    public estadoFisico: EstadoFisico, 
    public pesoQuilogramas: number, 
    public loteId: string, 
    public posicaoNoLote: number, 
    public statusRastreamento: StatusRastreamento, 
    public historicoMovimentacao: Movimentacao[] = []) {}

  atualizarStatus(
    novoStatus: StatusRastreamento, 
    justificativa: string, 
    responsavel = "sistema"): void {
    const origem = this.statusRastreamento;
    this.statusRastreamento = novoStatus;
    this.historicoMovimentacao.push(new Movimentacao(crypto.randomUUID(), this.id, new Date(), origem, novoStatus, responsavel, justificativa))
  }
  registrarMovimentacao(destino: string, responsavel: string): void { 
    this.historicoMovimentacao.push(new Movimentacao(crypto.randomUUID(), 
    this.id, new Date(), 
    this.statusRastreamento, destino, responsavel, "")); }
  calcularDepreciacao(): number { return Math.max(0, new Date().getFullYear() - this.anoFabricacao); }
}
//Recebimento de equipamentos ligado a uma organização e nota fiscal
export class Lote {
  constructor(
    public id: string, 
    public dataEntrada: Date, 
    public organizacaoId: string, 
    public notaFiscal: string, 
    public transportadora: string, 
    public equipamentos: Equipamento[], 
    public statusProcessamento: StatusLote, 
    public observacoes: string) {}
  
  adicionarEquipamento(equip: Equipamento): void { 
    equip.posicaoNoLote = this.equipamentos.length + 1; this.equipamentos.push(equip); }
  removerEquipamento(equipId: string): boolean { 
    const antes = this.equipamentos.length; this.equipamentos = this.equipamentos.filter(e => e.id !== equipId); return this.equipamentos.length < antes; }
  calculaPesoTotal(): number { 
    return this.equipamentos.reduce((soma, item) => soma + item.pesoQuilogramas, 0); }
  gerarRelatorioTriagem(): string { 
    return `Lote ${this.id}: ${this.equipamentos.length} equipamento(s), ${this.calculaPesoTotal()} kg.`; }
}
// Registra o que mudou para permitir consulta e reversão de uma operação
export class JournalTransacao {
  constructor(
    public id: string, 
    public timestamp: Date, 
    public operacao: string, 
    public entidade: string, 
    public dadosAntes: unknown, 
    public dadosDepois: unknown, 
    public usuarioResponsavel: string) {}

  registrar(): void { Object.freeze(this); }
  async reverter(repositorio: RepositorioArquivo): Promise<boolean> { return repositorio.reverterTransacao(this.id); }
}
//Classe-base para validadores específicos, como CNPJ e data de entrada
export abstract class Validador {
  abstract validar(objeto: unknown): boolean;
  obterMensagemErro(): string { return "Dados invalidos."; }
}

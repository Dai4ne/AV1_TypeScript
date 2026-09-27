import { Validador } from "./types";
import { cnpjValido, dataEntradaValida } from "./validation";

export class ValidadorCNPJ extends Validador {
  validar(cnpj: unknown): boolean { return typeof cnpj === "string" && cnpjValido(cnpj); }
  obterMensagemErro(): string { return "CNPJ invalido ou com digitos verificadores incorretos."; }
}

export class ValidadorDataEntrada extends Validador {
  validar(data: unknown): boolean { return data instanceof Date && dataEntradaValida(data); }
  obterMensagemErro(): string { return "A data do lote deve estar entre hoje e os ultimos 90 dias."; }
}

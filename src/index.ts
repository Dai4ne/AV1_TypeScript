import { cnpjValido, dataEntradaValida } from "./domain/validation";

// Ponto de entrada temporário: será substituído pelo fluxo interativo da CLI.
console.log("greencode: base do sistema carregada.");
console.log(`Validação de CNPJ pronta: ${cnpjValido("11.222.333/0001-81") ? "válido" : "inválido"}.`);
console.log(`Validação de data pronta: ${dataEntradaValida(new Date()) ? "válida" : "inválida"}.`);

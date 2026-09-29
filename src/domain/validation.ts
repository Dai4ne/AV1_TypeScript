import { EstadoFisico } from "./types";

// regras simples do domínio que podem ser usadas pela CLI e pelos serviços

//Remove pontos, barra e hífen antes dos cálculos do CNPJ
//01000100
export function apenasDigitos(valor: string): string {
    return valor.replace(/\D/g, "");
}

/* Confere o formato e os dois dígitos verificadores do CNPJ */
export function cnpjValido(valor: string): boolean {
    const cnpj = apenasDigitos(valor);
    if (cnpj.length !== 14 || /^([0-9])\1+$/.test(cnpj)) return false;

    const calcularDigito = (base: string, pesos: number[]): number => {
        const soma = [...base].reduce((total, digito, indice) => {
            return total + Number(digito) * pesos[indice];
        }, 0);
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    };

    const primeiro = calcularDigito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const segundo = calcularDigito(
        cnpj.slice(0, 12) + primeiro,
        [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    );
    return cnpj.endsWith(`${primeiro}${segundo}`);
}

// A entrada do lote deve estar entre hoje e os 90 dias anteriores
export function dataEntradaValida(data: Date, hoje = new Date()): boolean {
    if (Number.isNaN(data.getTime())) return false;
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const entrada = new Date(data.getFullYear(), data.getMonth(), data.getDate());
    const noventaDiasAntes = new Date(inicioHoje);
    noventaDiasAntes.setDate(noventaDiasAntes.getDate() - 90);
    return entrada >= noventaDiasAntes && entrada <= inicioHoje;
}

const nivelEstado: Record<EstadoFisico, number> = {
    [EstadoFisico.NOVO]: 0,
    [EstadoFisico.BOM_ESTADO]: 1,
    [EstadoFisico.USADO_LEVE]: 2,
    [EstadoFisico.USADO_MODERADO]: 3,
    [EstadoFisico.DANIFICADO_LEVE]: 4,
    [EstadoFisico.DANIFICADO_GRAVE]: 5,
    [EstadoFisico.INSERVIVEL]: 6,
};

/* Piora de duas ou mais categorias precisa de uma justificativa */
export function justificativaObrigatoria(
    estadoAnterior: EstadoFisico,
    novoEstado: EstadoFisico,
): boolean {
    return nivelEstado[novoEstado] - nivelEstado[estadoAnterior] >= 2;
}

export function podeIrParaDesmontagem(triagemConcluida: boolean): boolean {
    // Só permite a etapa seguinte quando a triagem já terminou
    return triagemConcluida;
}

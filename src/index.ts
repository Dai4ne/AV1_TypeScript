import { join } from "path";
import { CLIInterface } from "./cli";
import { ValidadorCNPJ } from "./domain/validators";
import { CriptografiaArquivo } from "./infrastructure/crypto";
import { prepararPersistencia } from "./infrastructure/provisionamento";
import { RepositorioArquivo } from "./infrastructure/repository";
import {
    ServicoEquipamento,
    ServicoLote,
    ServicoOrganizacao,
    ServicoRelatorio,
} from "./services/services";

/*Ponto de entrada: prepara dados, cria os serviços e inicia a CLI*/
async function iniciarAplicacao(): Promise<void> {
    const diretorioDados = join(process.cwd(), "data");
    const { repositorio, autenticacao } = await prepararPersistencia(diretorioDados);
    const organizacao = new ServicoOrganizacao(repositorio, new ValidadorCNPJ());
    const lote = new ServicoLote(repositorio);
    const equipamento = new ServicoEquipamento(repositorio);
    const relatorio = new ServicoRelatorio(organizacao, lote, equipamento);
    const cli = new CLIInterface(autenticacao, organizacao, lote, equipamento, relatorio);
    await cli.iniciarLoop();
}

iniciarAplicacao().catch((erro: unknown) => {
    console.error(`ERRO FATAL: ${erro instanceof Error ? erro.message : "falha inesperada"}`);
    process.exitCode = 1;
});

import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { CriptografiaArquivo } from "./crypto";
import { JournalTransacao } from "../domain/types";

const TAMANHO_MAXIMO_JOURNAL = 10 * 1024 * 1024;
const RETENCAO_JOURNAL_DIAS = 180;

/*Lê e grava as coleções locais cifradas. Antes de salvar uma mudança, registra a transação no journal; 
para gravar, usa arquivo temporário e renomeação */
export class RepositorioArquivo {
    private usuarioResponsavelAtual = "sistema";
    constructor(
        public diretorioBase: string,
        public criptografia: CriptografiaArquivo,
        private chave: string,
    ) {}
    definirUsuarioResponsavel(usuario: string): void {
        this.usuarioResponsavelAtual = usuario || "sistema";
    }
    get usuarioResponsavel(): string {
        return this.usuarioResponsavelAtual;
    }
    private caminho(nomeArquivo: string): string {
        return join(this.diretorioBase, `${nomeArquivo}.enc`);
    }
    async salvarEntidade(nomeArquivo: string, registro: unknown, entidade: unknown): Promise<void> {
        await mkdir(this.diretorioBase, { recursive: true });
        const atual = await this.lerColecao(nomeArquivo);
        const anterior = atual.find((item) => item?.registro === registro)?.entidade ?? null;
        const transacao = new JournalTransacao(
            crypto.randomUUID(),
            new Date(),
            anterior === null ? "CRIAR" : "ATUALIZAR",
            nomeArquivo,
            anterior,
            entidade,
            this.usuarioResponsavelAtual,
        );
        transacao.entidade = `${nomeArquivo}:${String(registro)}`;
        transacao.registrar();
        // O journal vem primeiro para manter o registro caso a gravação seguinte falhe
        await this.registrarTransacao(transacao);
        const semRegistroAntigo = atual.filter((item) => item?.registro !== registro);
        semRegistroAntigo.push({ registro, entidade });
        await this.gravarColecao(nomeArquivo, semRegistroAntigo);
    }
    async carregarEntidade<T>(nomeArquivo: string, id: string): Promise<T | null> {
        const dados = await this.lerColecao(nomeArquivo);
        return (dados.find((item) => item?.registro === id)?.entidade ?? null) as T | null;
    }
    async listarEntidades<T>(nomeArquivo: string): Promise<T[]> {
        return (await this.lerColecao(nomeArquivo)).map((item) => item.entidade) as T[];
    }
    async carregarHistoricoCLI(): Promise<string[]> {
        try {
            const arquivo = await readFile(join(this.diretorioBase, "historico-cli.enc"), "utf8");
            const historico = JSON.parse(this.criptografia.decifrar(arquivo, this.chave));
            return Array.isArray(historico)
                ? historico
                      .filter((linha): linha is string => typeof linha === "string")
                      .slice(-100)
                : [];
        } catch (erro) {
            if ((erro as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw erro;
        }
    }
    async salvarHistoricoCLI(historico: string[]): Promise<void> {
        const temporario = join(this.diretorioBase, "historico-cli.enc.tmp");
        const destino = join(this.diretorioBase, "historico-cli.enc");
        const cifrado = this.criptografia.cifrar(JSON.stringify(historico.slice(-100)), this.chave);
        await writeFile(temporario, cifrado, "utf8");
        await rename(temporario, destino);
    }
    async excluirEntidade(nomeArquivo: string, id: string): Promise<void> {
        const atuais = await this.lerColecao(nomeArquivo);
        const removido = atuais.find((item) => item?.registro === id || item?.entidade?.id === id);
        if (!removido) return;
        const transacao = new JournalTransacao(
            crypto.randomUUID(),
            new Date(),
            "EXCLUIR",
            `${nomeArquivo}:${id}`,
            removido.entidade,
            null,
            this.usuarioResponsavelAtual,
        );
        transacao.registrar();
        await this.registrarTransacao(transacao);
        await this.gravarColecao(
            nomeArquivo,
            atuais.filter((item) => item !== removido),
        );
    }
    private async lerColecao(nomeArquivo: string): Promise<any[]> {
        try {
            const arquivo = await readFile(this.caminho(nomeArquivo), "utf8");
            return JSON.parse(this.criptografia.decifrar(arquivo, this.chave));
        } catch (erro) {
            if ((erro as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw erro;
        }
    }
    async removerTemporario(nomeArquivo: string): Promise<void> {
        await rm(`${this.caminho(nomeArquivo)}.tmp`, { force: true });
    }

    async reverterTransacao(id: string): Promise<boolean> {
        // Só reverte a última operação daquela entidade, evitando sobrescrever mudanças novas.
        const historico = await this.listarJournalCompleto();
        const original = historico.find((item) => item.id === id);
        if (!original || original.operacao.startsWith("REVERTER:")) return false;
        if (historico.some((item) => item.operacao === `REVERTER:${id}`)) return false;

        const chaveEntidade = original.entidade;
        const separador = chaveEntidade.indexOf(":");
        if (separador < 1) return false;
        const nomeArquivo = chaveEntidade.slice(0, separador);
        const registro = chaveEntidade.slice(separador + 1);
        const relacionadas = historico.filter((item) => item.entidade === chaveEntidade);
        const maisNova = relacionadas[relacionadas.length - 1];
        if (maisNova?.id !== original.id) return false;

        const dadosAtuais = await this.carregarEntidade<unknown>(nomeArquivo, registro);
        const reversao = new JournalTransacao(
            crypto.randomUUID(),
            new Date(),
            `REVERTER:${id}`,
            chaveEntidade,
            dadosAtuais,
            original.dadosAntes,
            this.usuarioResponsavelAtual,
        );
        reversao.registrar();
        await this.registrarTransacao(reversao);

        const colecaoAtual = await this.lerColecao(nomeArquivo);
        const semRegistro = colecaoAtual.filter((item) => item?.registro !== registro);
        if (original.dadosAntes !== null)
            semRegistro.push({ registro, entidade: original.dadosAntes });
        await this.gravarColecao(nomeArquivo, semRegistro);
        return true;
    }

    private async registrarTransacao(transacao: JournalTransacao): Promise<void> {
        // Remove registros vencidos e arquiva o journal ativo quando ultrapassa 10 MB
        await this.limparJournalAntigo();
        const arquivoAtivo = this.caminho("journal");
        const registrosAtuais = await this.lerColecao("journal");
        const novosRegistros = [...registrosAtuais, transacao];
        const cifrado = this.criptografia.cifrar(JSON.stringify(novosRegistros), this.chave);

        if (Buffer.byteLength(cifrado, "utf8") > TAMANHO_MAXIMO_JOURNAL) {
            if (registrosAtuais.length > 0) {
                const arquivoRotacionado = await this.proximoArquivoRotacionado();
                await rename(arquivoAtivo, arquivoRotacionado);
            }
            await this.gravarColecao("journal", [transacao]);

            // Uma transacao isolada tambem pode passar de 10 MB; arquiva-a imediatamente
            const transacaoSozinha = this.criptografia.cifrar(
                JSON.stringify([transacao]),
                this.chave,
            );
            if (Buffer.byteLength(transacaoSozinha, "utf8") > TAMANHO_MAXIMO_JOURNAL) {
                const arquivoRotacionado = await this.proximoArquivoRotacionado();
                await rename(arquivoAtivo, arquivoRotacionado);
                await this.gravarColecao("journal", []);
            }
            return;
        }
        await this.gravarColecao("journal", novosRegistros);
    }

    private async limparJournalAntigo(): Promise<void> {
        const limite = Date.now() - RETENCAO_JOURNAL_DIAS * 24 * 60 * 60 * 1000;
        const nomes = await readdir(this.diretorioBase);
        for (const nome of nomes.filter((item) => /^journal-.*\.enc$/.test(item))) {
            const caminho = join(this.diretorioBase, nome);
            const texto = await readFile(caminho, "utf8");
            const registros = JSON.parse(
                this.criptografia.decifrar(texto, this.chave),
            ) as JournalTransacao[];
            const maisRecente = registros.reduce(
                (maior, item) => Math.max(maior, new Date(item.timestamp).getTime()),
                0,
            );
            if (maisRecente < limite) await unlink(caminho);
        }

        const ativos = await this.lerColecao("journal");
        const recentes = ativos.filter((item) => new Date(item.timestamp).getTime() >= limite);
        if (recentes.length !== ativos.length) await this.gravarColecao("journal", recentes);
    }

    private async listarJournalCompleto(): Promise<JournalTransacao[]> {
        const nomes = (await readdir(this.diretorioBase))
            .filter((nome) => /^journal-.*\.enc$/.test(nome))
            .sort();
        const arquivos = [
            ...nomes.map((nome) => join(this.diretorioBase, nome)),
            this.caminho("journal"),
        ];
        const historico: JournalTransacao[] = [];
        for (const arquivo of arquivos) {
            try {
                const cifrado = await readFile(arquivo, "utf8");
                const registros = JSON.parse(
                    this.criptografia.decifrar(cifrado, this.chave),
                ) as JournalTransacao[];
                historico.push(...registros);
            } catch (erro) {
                if ((erro as NodeJS.ErrnoException).code !== "ENOENT") throw erro;
            }
        }
        return historico;
    }

    private async proximoArquivoRotacionado(): Promise<string> {
        const instante = new Date().toISOString().replace(/[:.]/g, "-");
        let sequencia = 0;
        while (true) {
            const sufixo = sequencia === 0 ? "" : `-${sequencia}`;
            const destino = join(this.diretorioBase, `journal-${instante}${sufixo}.enc`);
            try {
                await stat(destino);
                sequencia += 1;
            } catch (erro) {
                if ((erro as NodeJS.ErrnoException).code === "ENOENT") return destino;
                throw erro;
            }
        }
    } //01100101

    private async gravarColecao(nomeArquivo: string, dados: unknown[]): Promise<void> {
        // A troca pelo arquivo temporário evita deixar uma coleção pela metade.
        await mkdir(this.diretorioBase, { recursive: true });
        const temporario = `${this.caminho(nomeArquivo)}.tmp`;
        const textoCifrado = this.criptografia.cifrar(JSON.stringify(dados), this.chave);
        await writeFile(temporario, textoCifrado, "utf8");
        await rename(temporario, this.caminho(nomeArquivo));
    }
}

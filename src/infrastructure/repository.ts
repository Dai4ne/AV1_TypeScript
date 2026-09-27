import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import { join } from "path";
import { CriptografiaArquivo } from "./crypto";

/** Guarda colecoes JSON cifradas e troca o arquivo por renomeacao atomica. */
export class RepositorioArquivo {
  constructor(public diretorioBase: string, public criptografia: CriptografiaArquivo, private chave: string) {}
  private caminho(nomeArquivo: string): string { return join(this.diretorioBase, `${nomeArquivo}.enc`); }
  async salvarEntidade(nomeArquivo: string, registro: unknown, entidade: unknown): Promise<void> {
    await mkdir(this.diretorioBase, { recursive: true });
    const atual = (await this.lerColecao(nomeArquivo)).filter(item => item?.registro !== registro);
    atual.push({ registro, entidade });
    const temporario = `${this.caminho(nomeArquivo)}.tmp`;
    await writeFile(temporario, this.criptografia.cifrar(JSON.stringify(atual), this.chave), "utf8");
    await rename(temporario, this.caminho(nomeArquivo));
  }
  async carregarEntidade<T>(nomeArquivo: string, id: string): Promise<T | null> {
    const dados = await this.lerColecao(nomeArquivo);
    return (dados.find(item => item?.registro === id)?.entidade ?? null) as T | null;
  }
  async listarEntidades<T>(nomeArquivo: string): Promise<T[]> { return (await this.lerColecao(nomeArquivo)).map(item => item.entidade) as T[]; }
  async excluirEntidade(nomeArquivo: string, id: string): Promise<void> {
    const dados = (await this.lerColecao(nomeArquivo)).filter((item: any) => item?.registro !== id && item?.id !== id);
    const temporario = `${this.caminho(nomeArquivo)}.tmp`;
    await writeFile(temporario, this.criptografia.cifrar(JSON.stringify(dados), this.chave), "utf8");
    await rename(temporario, this.caminho(nomeArquivo));
  }
  private async lerColecao(nomeArquivo: string): Promise<any[]> {
    try { const arquivo = await readFile(this.caminho(nomeArquivo), "utf8"); return JSON.parse(this.criptografia.decifrar(arquivo, this.chave)); }
    catch (erro) { if ((erro as NodeJS.ErrnoException).code === "ENOENT") return []; throw erro; }
  }
  async removerTemporario(nomeArquivo: string): Promise<void> { await rm(`${this.caminho(nomeArquivo)}.tmp`, { force: true }); }
}

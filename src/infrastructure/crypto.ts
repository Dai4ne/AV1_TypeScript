import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/** Criptografia de arquivos usando AES-256-GCM (confidencialidade e deteccao de alteracoes). */
export class CriptografiaArquivo {
  gerarChave(): string { return randomBytes(32).toString("hex"); }
  cifrar(dados: string, chave: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(chave, "hex"), iv);
    const conteudo = Buffer.concat([cipher.update(dados, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), conteudo].map(parte => parte.toString("hex")).join(":");
  }
  decifrar(dadosCifrados: string, chave: string): string {
    const [ivHex, tagHex, conteudoHex] = dadosCifrados.split(":");
    if (!ivHex || !tagHex || conteudoHex === undefined) throw new Error("Arquivo cifrado invalido.");
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(chave, "hex"), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(conteudoHex, "hex")), decipher.final()]).toString("utf8");
  }
}

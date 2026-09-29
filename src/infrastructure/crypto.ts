import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

//Protege o conteúdo dos arquivos e permite detectar alterações indevidas
export class CriptografiaArquivo {
    // Cria uma chave aleatória de 32 bytes para o algoritmo AES-256
    gerarChave(): string {
        return randomBytes(32).toString("hex");
    }

    /* Retorna IV, etiqueta de integridade e conteúdo cifrado em uma única string */
    cifrar(dados: string, chave: string): string {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", Buffer.from(chave, "hex"), iv);
        const conteudo = Buffer.concat([cipher.update(dados, "utf8"), cipher.final()]);
        return [iv, cipher.getAuthTag(), conteudo].map((parte) => parte.toString("hex")).join(":");
    }

    /* Abre o conteúdo e falha se a etiqueta indicar que ele foi alterado */
    decifrar(dadosCifrados: string, chave: string): string {
        const [ivHex, tagHex, conteudoHex] = dadosCifrados.split(":");
        if (!ivHex || !tagHex || conteudoHex === undefined)
            throw new Error("Arquivo cifrado invalido.");
        const decipher = createDecipheriv(
            "aes-256-gcm",
            Buffer.from(chave, "hex"),
            Buffer.from(ivHex, "hex"),
        );
        decipher.setAuthTag(Buffer.from(tagHex, "hex"));
        return Buffer.concat([
            decipher.update(Buffer.from(conteudoHex, "hex")),
            decipher.final(),
        ]).toString("utf8");
    }
}

import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";
import { Credencial, PapelUsuario } from "../domain/types";
import { ServicoAutenticacao } from "../services/services";
import { CriptografiaArquivo } from "./crypto";
import { RepositorioArquivo } from "./repository";

interface ConfiguracaoMestre {
  chaveMestra: string;
  administradorInicial: { usuario: string; papel: PapelUsuario };
}

/** Abre a configuracao mestre ou faz o cadastro inicial do administrador. */
export async function prepararPersistencia(diretorioBase: string): Promise<{
  repositorio: RepositorioArquivo;
  autenticacao: ServicoAutenticacao;
}> {
  await mkdir(diretorioBase, { recursive: true });
  const caminhoMestre = join(diretorioBase, "configuracao-mestre.json");
  const criptografia = new CriptografiaArquivo();
  const configuracao = await carregarConfiguracao(caminhoMestre, criptografia);
  const repositorio = new RepositorioArquivo(diretorioBase, criptografia, configuracao.chaveMestra);
  let credenciais = (await repositorio.listarEntidades<Credencial>("credenciais")).map(registro =>
    new Credencial(registro.usuario, registro.hashSenha, registro.salt, new Date(registro.ultimoAcesso), registro.papel),
  );

  if (!credenciais.some(c => c.usuario === configuracao.administradorInicial.usuario)) {
    console.log("Provisionamento inicial: crie a senha do administrador.");
    const senha = await solicitarSenha("Nova senha: ");
    const confirmacao = await solicitarSenha("Repita a senha: ");
    if (!senha) throw new Error("A senha não pode ficar vazia.");
    if (senha !== confirmacao) throw new Error("As senhas nao conferem. Execute o programa novamente para tentar outra vez.");
    const autenticacao = new ServicoAutenticacao();
    const credencial = autenticacao.criarCredencial(configuracao.administradorInicial.usuario, senha, configuracao.administradorInicial.papel);
    await repositorio.salvarEntidade("credenciais", credencial.usuario, credencial);
    credenciais = [credencial];
    console.log("Administrador inicial criado.");
  }

  return { repositorio, autenticacao: new ServicoAutenticacao(credenciais) };
}

async function carregarConfiguracao(caminho: string, criptografia: CriptografiaArquivo): Promise<ConfiguracaoMestre> {
  try {
    const texto = await readFile(caminho, "utf8");
    const configuracao = JSON.parse(texto) as ConfiguracaoMestre;
    if (!/^[0-9a-f]{64}$/i.test(configuracao.chaveMestra) || !configuracao.administradorInicial?.usuario) {
      throw new Error("Configuracao mestre invalida. Verifique o arquivo de configuracao.");
    }
    return configuracao;
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code !== "ENOENT") throw erro;
  }

  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    console.log("Primeira execucao: o usuario administrador sera 'admin'.");
    await terminal.question("Pressione Enter para gerar a chave mestra e continuar.");
  } finally { terminal.close(); }

  const novaConfiguracao: ConfiguracaoMestre = {
    chaveMestra: criptografia.gerarChave(),
    administradorInicial: { usuario: "admin", papel: PapelUsuario.ADMINISTRADOR },
  };
  const temporario = `${caminho}.tmp`;
  await writeFile(temporario, JSON.stringify(novaConfiguracao, null, 2), "utf8");
  await rename(temporario, caminho);
  return novaConfiguracao;
}

/** Le a senha sem mostra-la na tela quando o programa roda em um terminal real. */
export function solicitarSenha(pergunta: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    const terminal = createInterface({ input: stdin, output: stdout });
    return terminal.question(`${pergunta}(a digitacao podera ficar visivel neste terminal): `)
      .finally(() => terminal.close());
  }

  return new Promise((resolve, reject) => {
    let senha = "";
    const restaurarTerminal = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", receberTecla);
      stdout.write("\n");
    };
    const receberTecla = (entrada: Buffer): void => {
      const tecla = entrada.toString("utf8");
      if (tecla === "\u0003") { restaurarTerminal(); reject(new Error("Operacao cancelada.")); return; }
      if (tecla === "\r" || tecla === "\n") { restaurarTerminal(); resolve(senha); return; }
      if (tecla === "\u007f" || tecla === "\b") {
        senha = Array.from(senha).slice(0, -1).join("");
        stdout.write("\b \b");
        return;
      }
      if (!tecla.startsWith("\u001b")) { senha += tecla; stdout.write("*"); }
    };
    stdout.write(pergunta);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", receberTecla);
  });
}

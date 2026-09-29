# greencode

Aplicação de linha de comando para registrar e acompanhar resíduos eletrônicos.

## Iniciar

É necessário ter Node.js 20 ou superior. Na pasta do projeto, execute:

```bash
npm install
npm run dev
```

Na primeira execução, pressione Enter para criar a chave mestra e defina a senha do administrador inicial, chamado `admin`. Depois, use `login admin`. A senha será solicitada sem aparecer na tela.

Para encerrar o greencode, digite `sair`.

## Ajuda e uso

Digite `ajuda` no prompt `greencode>` para ver os comandos básicos. Depois do login, o sistema mostra as opções disponíveis para o papel do usuário. Pressione Tab para completar nomes de comandos; use as setas para consultar o histórico recente.

Os argumentos entre `< >` são obrigatórios. Argumentos entre `[ ]` são opcionais. Use aspas quando um valor tiver espaços, como `--razao "Empresa Exemplo"`.

## Comandos

### Acesso

```text
ajuda
login <usuario>
logout
sair
```

O login solicita a senha em seguida; ela não aparece enquanto é digitada.

### Usuários — administrador

```text
usuario criar --usuario <nome> --papel <PAPEL>
usuario listar
usuario papel <usuario> <PAPEL>
usuario desativar <usuario>
```

Papéis aceitos: `ADMINISTRADOR`, `OPERADOR_CADASTRO`, `GESTOR_ALMOXARIFADO` e `AUDITOR`. Ao criar usuário, o sistema solicita a senha inicial e a confirmação.

### Organizações e contratos — operador de cadastro

```text
organizacao criar --id <id> --razao "<razão social>" --cnpj <CNPJ> --ie <inscrição> --endereco "<endereço>" --telefone <telefone> --email <email> --vencimento <AAAA-MM-DD> --valor <valor mensal> [--clausula "<texto>"] [--renovacao sim]
organizacao listar
organizacao desativar <id>
organizacao renovar-contrato <id> --vencimento <AAAA-MM-DD>
```

Exemplo:

```text
organizacao criar --id BR001 --razao "Empresa Exemplo" --cnpj 11.222.333/0001-81 --ie ISENTO --endereco "Rua A, 10" --telefone 11999999999 --email contato@exemplo.com --vencimento 2027-12-31 --valor 2500 --clausula "Coleta anual"
```

### Lotes — gestor de almoxarifado

```text
lote criar --org <id-organização> --nf <nota fiscal> --transp <transportadora> [--id <id>] [--data <AAAA-MM-DD>] [--obs "<observação>"]
lote listar
lote triagem <id-lote>
```

Se `--id` e `--data` forem omitidos, o sistema gera o identificador e usa a data atual.

### Equipamentos — gestor de almoxarifado

```text
equipamento criar --lote <id-lote> --tipo <TIPO> --marca <marca> --modelo <modelo> --ano <ano> --estado <ESTADO> --peso <peso> [--id <id>]
equipamento rastrear <id-equipamento>
equipamento estado <id-equipamento> <ESTADO> [--justificativa "<motivo>"]
equipamento status <id-equipamento> <STATUS_RASTREAMENTO> [--justificativa "<motivo>"]
historico <id-equipamento>
```

Tipos aceitos: `COMPUTADOR_MESA`, `NOTEBOOK`, `MONITOR`, `IMPRESSORA`, `SERVIDOR`, `ROTEADOR`, `CABO_ESTRUTURADO` e `FONTE_ALIMENTACAO`.

Estados físicos aceitos: `NOVO`, `BOM_ESTADO`, `USADO_LEVE`, `USADO_MODERADO`, `DANIFICADO_LEVE`, `DANIFICADO_GRAVE` e `INSERVIVEL`.

Status de rastreamento aceitos: `AGUARDANDO_TRIAGEM`, `EM_TRIAGEM`, `AGUARDANDO_DESMONTAGEM`, `EM_DESMONTAGEM`, `PECAS_REAPROVEITADAS`, `MATERIAL_RECICLAVEL`, `DESCARTE_SEGURO` e `BAIXA_DEFINITIVA`.

O lote precisa passar pela triagem antes de um equipamento ir para `EM_DESMONTAGEM`. Se o estado físico piorar duas ou mais categorias, informe `--justificativa`.

### Parâmetros — administrador

```text
parametros configurar --imposto <0 a 100> --depreciacao <coeficiente>
parametros consultar
```

O sistema guarda e apresenta os valores. O PDF não define fórmulas para calcular imposto ou depreciação, então esses cálculos não são aplicados.

### Relatórios — conforme o papel

```text
relatorio organizacao --org <id-organização> [--inicio <AAAA-MM-DD>] [--fim <AAAA-MM-DD>]
relatorio status <STATUS_RASTREAMENTO>
relatorio financeiro [--inicio <AAAA-MM-DD>] [--fim <AAAA-MM-DD>]
```

O relatório financeiro apresenta os valores mensais dos contratos no período. `historico <id-equipamento>` e `equipamento rastrear <id-equipamento>` consultam as movimentações registradas.

## Permissões por papel

- **Administrador:** gerencia usuários e parâmetros e pode acessar os demais comandos.
- **Operador de cadastro:** cadastra, consulta e administra organizações e contratos; consulta relatórios.
- **Gestor de almoxarifado:** administra lotes e equipamentos; consulta relatórios e históricos.
- **Auditor:** consulta relatórios e históricos, sem alterar os dados.

## Testes automatizados

```bash
npm test
```

O comando compila o TypeScript e executa os testes automatizados da jornada, das permissões e das principais regras de negócio.

## Comandos do projeto

- `npm run dev`: inicia a aplicação usando os arquivos TypeScript.
- `npm run build`: compila os arquivos TypeScript para a pasta `dist`.
- `npm start`: inicia a versão compilada que está em `dist`.
- `npm test`: compila e executa os testes automatizados.

## Dados e segurança

Os dados ficam na pasta `data` e são cifrados. Não compartilhe essa pasta: ela contém a configuração necessária para acessar os arquivos protegidos. As senhas não são armazenadas em texto puro.

Mais detalhes sobre proteção e cenários de falha estão em [SEGURANCA.md](SEGURANCA.md). O modelo de classes está em [UML.md](UML.md).

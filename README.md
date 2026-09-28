# greencode

Sistema de linha de comando para rastrear resíduos eletrônicos.

## Como começar

Requer Node.js 20 ou superior. Depois de instalar as dependências com `npm install`, use:

```bash
npm run dev
```

Na primeira execução, pressione Enter para gerar a chave mestra e defina a senha do administrador `admin`. Depois, entre com `login admin`; a senha será solicitada sem aparecer na tela.

Os dados ficam na pasta `data`. Ela contém a configuração mestre com a chave necessária para abrir os arquivos cifrados; mantenha essa pasta protegida e faça cópias de segurança sem compartilhá-las.

Para executar a jornada automatizada descrita na atividade, use `npm test`. O teste constrói o projeto, provisiona o primeiro administrador em uma pasta temporária e percorre os papéis, o cadastro, o lote, a triagem e a rastreabilidade.

## Comandos principais

```text
usuario criar --usuario estoque --papel GESTOR_ALMOXARIFADO
organizacao criar --id BR001 --razao "Empresa Exemplo" --cnpj 11.222.333/0001-81 --ie ISENTO --endereco "Rua A" --telefone 11999999999 --email contato@exemplo.com --vencimento 2027-12-31 --valor 2500
lote criar --org BR001 --nf 123456 --transp TransRapida
equipamento criar --lote <id-do-lote> --tipo NOTEBOOK --marca Marca --modelo Modelo --ano 2022 --estado BOM_ESTADO --peso 2.5
lote triagem <id-do-lote>
equipamento status <id-do-equipamento> EM_DESMONTAGEM
historico <id-do-equipamento>
```

O administrador gerencia contas; o operador de cadastro gerencia organizações e contratos; o gestor de almoxarifado gerencia lotes e equipamentos; o auditor consulta relatórios e rastreabilidade. O histórico de comandos também é salvo cifrado.

## Organização do código

- `src/domain`: entidades, enums e validadores do negócio.
- `src/infrastructure`: criptografia, repositório de arquivos e provisionamento.
- `src/services`: autenticação e serviços de negócio.
- `src/cli.ts`: leitura de comandos, menus e permissões.
- `tests`: testes automatizados da jornada e validações.
- `data`: dados locais da aplicação (não enviar ao Git).

## Etapas do projeto

1. Modelo UML, regras iniciais e estrutura TypeScript.
2. Persistência cifrada, journal, provisionamento e autenticação inicial.
3. Comandos principais, permissões, histórico e testes de jornada.
4. Completar parâmetros globais de imposto/depreciação e a documentação final de segurança e falhas.

Os arquivos de dados são locais e contêm informações protegidas. Não os compartilhe nem os envie ao controle de versão.

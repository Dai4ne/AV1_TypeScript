# Correspondencia com o diagrama UML

O modelo segue os nomes e as responsabilidades apresentados no diagrama.

| UML | Implementacao |
| --- | --- |
| `Autenticavel` | Interface implementada por `ServicoAutenticacao` |
| `Credencial`, `Sessao`, `PapelUsuario` | `src/domain/types.ts` |
| `Organizacao`, `Contrato`, `Lote`, `Equipamento`, `Movimentacao` | `src/domain/types.ts` |
| `TipoEquipamento`, `EstadoFisico`, `StatusLote`, `StatusRastreamento` | `src/domain/types.ts` |
| `Validador`, `ValidadorCNPJ`, `ValidadorDataEntrada` | `src/domain/types.ts` e `src/domain/validators.ts` |
| `ServicoAutenticacao`, `ServicoOrganizacao`, `ServicoLote`, `ServicoEquipamento`, `ServicoRelatorio` | `src/services/services.ts` |
| `RepositorioArquivo`, `CriptografiaArquivo` | `src/infrastructure/` |
| `JournalTransacao` | `src/domain/types.ts` |
| `CLIInterface` | `src/cli.ts` |

## Relações modeladas

- `ServicoAutenticacao` gerencia credenciais e sessões.
- `Organizacao` aponta para no máximo um contrato vigente.
- `Lote` contém uma lista de equipamentos e cada equipamento referencia seu lote.
- `Equipamento` guarda uma lista de movimentações.
- Os serviços recebem o repositório que usam; validadores específicos herdam de `Validador`.
- A CLI recebe os serviços por injeção no construtor e apresenta opções conforme o papel da sessão.

## Em andamento

O provisionamento inicial, o armazenamento cifrado, o registro e a reversão de transações, a retenção/rotação do journal e os comandos principais estão implementados. A CLI aplica permissões por papel, renova a sessão após cada comando autorizado e guarda o histórico cifrado. Ainda falta concluir a configuração de parâmetros globais citada no enunciado, expandir os relatórios e documentar cenários adicionais de falha. O script `npm test` cobre a jornada inicial e as principais regras de negócio.

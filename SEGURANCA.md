# Segurança e cenários de falha

Este documento descreve o que o greencode implementa e o que foi verificado pelos testes automatizados. Ele não afirma que cenários ainda não simulados já foram testados.

## Proteção dos dados

- Os arquivos de credenciais, organizações, lotes, equipamentos, movimentações, parâmetros e journal são gravados cifrados com AES-256-GCM. O modo GCM também permite detectar quando o conteúdo cifrado foi alterado.
- A chave de 256 bits é gerada aleatoriamente no primeiro uso. Ela fica em `data/configuracao-mestre.json` para que o sistema possa abrir os demais arquivos. Esse arquivo contém também o nome e o papel do primeiro administrador; portanto, a pasta `data` inteira precisa ser protegida e não deve ser compartilhada.
- Cada gravação usa um arquivo temporário e depois o renomeia para o nome definitivo. O journal recebe a transação antes da gravação do novo estado. Assim, se a atualização não for concluída, o registro da operação anterior permanece para consulta e possível recuperação manual.
- As senhas não são guardadas em texto puro. O sistema combina cada senha com um salt aleatório e guarda o resultado de SHA-256 no arquivo cifrado de credenciais. O salt é diferente para cada credencial.
- A sessão expira após 30 minutos sem comando autorizado. Cada comando autorizado renova esse prazo.
- O journal mantém no mínimo 180 dias de registros e cria arquivos rotacionados quando o ativo passa de 10 MB.

## Cenários cobertos pelos testes

O comando `npm test` compila o TypeScript e executa a jornada automatizada. Os testes verificam:

| Situação | Resposta esperada e verificada |
| --- | --- |
| Senha correta ou incorreta | O login aceita a senha correta e rejeita a incorreta. |
| CNPJ duplicado ou com dígito inválido | O cadastro rejeita o CNPJ inválido e não permite duplicidade. |
| Data do lote há 90 dias, há 91 dias ou no futuro | O limite de 90 dias é aceito; data mais antiga ou futura é rejeitada. |
| Enviar equipamento para desmontagem antes da triagem | A operação é recusada com mensagem explicando que a triagem precisa ser concluída. |
| Piorar o estado físico em duas ou mais categorias sem justificativa | A operação é recusada; com justificativa, é aceita. |
| Auditor tentar alterar dados | A CLI informa falta de permissão e não executa a alteração. |
| Configuração de imposto/depreciação | O administrador salva e consulta os valores; o auditor não pode alterá-los; o relatório calcula a estimativa conforme a alíquota configurada. |
| Journal antigo ou acima de 10 MB | Registros com mais de 180 dias são removidos e o journal ativo é rotacionado ao exceder o limite. |
| Arquivos de credenciais e journal | O conteúdo salvo não revela a senha nem o texto legível das transações. |

## Cenários não simulados

Os testes não desligam o processo no meio de uma gravação, não alteram manualmente os arquivos cifrados para simular corrupção e não executam a jornada em uma instalação Ubuntu. A gravação temporária seguida de renomeação reduz o risco de arquivo parcialmente escrito, e o AES-GCM rejeita conteúdo adulterado ao decifrar, mas esses casos ainda precisam de testes próprios. O teste automatizado foi executado neste ambiente Windows; compatibilidade com Ubuntu deve ser confirmada executando `npm install` e `npm test` nesse sistema.

## Limites da atividade

O enunciado pede um coeficiente global de depreciação, mas não fornece uma fórmula nem o valor de aquisição dos equipamentos. O sistema guarda e apresenta o coeficiente, sem inventar um valor de depreciação em dinheiro. A alíquota aparece como estimativa sobre a soma mensal dos contratos ativos no período consultado; isso é uma regra operacional simples, não uma apuração fiscal.

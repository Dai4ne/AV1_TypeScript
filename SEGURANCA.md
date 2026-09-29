# Segurança e cenários de falha
##### Como o Greencode protege e guarda os dados?
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
| Configuração de imposto/depreciação | O administrador salva e consulta os valores; o auditor não pode alterá-los. O relatório apresenta a soma dos valores mensais dos contratos, sem aplicar alíquota ou depreciação, pois o enunciado não define fórmulas para esses cálculos. |
| Journal antigo ou acima de 10 MB | Registros com mais de 180 dias são removidos e o journal ativo é rotacionado ao exceder o limite. |
| Conteúdo cifrado com etiqueta de integridade alterada | A decifragem falha, em vez de entregar dados adulterados. |
| Falha simulada ao gravar uma entidade após registrar a transação | A entidade não é salva, e a entrada anterior permanece no journal para análise. |
| Arquivos de credenciais e journal | O conteúdo salvo não revela a senha nem o texto legível das transações. |

## Cenários não simulados

Os testes não desligam o processo no meio de uma gravação nem alteram um arquivo persistido no disco para simular corrupção. O teste de integridade altera uma etiqueta cifrada em memória e confirma que a decifragem falha. A gravação temporária seguida de renomeação reduz o risco de arquivo parcialmente escrito, mas uma queda real de energia ainda não foi simulada. A jornada automatizada foi executada no Windows e, conforme informado durante a atividade, também passou no Ubuntu 24.04.

## Limites da atividade

O enunciado pede configurar alíquota de imposto e coeficiente de depreciação, mas não fornece fórmulas para aplicá-los. O sistema guarda e apresenta os parâmetros, sem inventar cálculos tributários ou de depreciação.

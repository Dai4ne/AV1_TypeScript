# greencode

Sistema de linha de comando para rastrear resíduos eletrônicos.

## Como começar

Requer Node.js 20 ou superior. Depois de instalar as dependências com `npm install`, use:

```bash
npm run dev
```

Na primeira execução, o sistema deve iniciar o provisionamento do administrador.

## Organização do código

- `src/domain`: conceitos do negócio (organização, lote e equipamento).
- `src/security`: senha, chave e operações de criptografia.
- `src/persistence`: arquivos, gravação atômica e journal.
- `src/cli`: leitura de comandos e menus.
- `data`: dados locais da aplicação (não enviar ao Git).

## Etapas do projeto

1. Definir os tipos do domínio e as regras de validação.
2. Construir persistência criptografada e journal.
3. Implementar autenticação, sessão e permissões.
4. Adicionar comandos de cadastro, estoque e consulta.
5. Documentar e demonstrar os fluxos exigidos no enunciado.

Os arquivos de dados são locais e contêm informações protegidas. Não os compartilhe nem os envie ao controle de versão.

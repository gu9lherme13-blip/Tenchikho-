# TENCHIKO QG — raiz sem pasta extra

Todos os arquivos e diretórios ficam diretamente na raiz do repositório. Não existe pasta `src/` nem uma pasta de projeto aninhada.

## Render
- Root Directory: deixar vazio
- Build Command: `npm install`
- Start Command: `npm start`

## Variáveis de ambiente
Configure no painel do Render `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` (opcional), `OPENAI_API_KEY`, `OPENAI_MODEL`, `LEADER_ROLE_ID` e `SUBLEADER_ROLE_ID`. Não publique tokens no GitHub.

O servidor web pode iniciar sem `DISCORD_TOKEN`, mas o bot Discord só conecta quando o token estiver configurado. As páginas em `public/pages/` são estruturas iniciais; recursos dinâmicos precisam de integração com Discord e persistência de dados.

## Comandos
- `npm start`: inicia o QG web e, se configurado, o bot
- `npm run deploy:commands`: registra os comandos slash do bot
- `npm run check`: verifica sintaxe dos principais arquivos

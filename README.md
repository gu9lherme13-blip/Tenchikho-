# TENCHIKO QG — arquivos na raiz

O projeto foi organizado sem pastas internas: todos os arquivos ficam na raiz do repositório.

## Render
- Root Directory: deixe vazio.
- Build Command: `npm install`
- Start Command: `npm start`

## Variáveis de ambiente
Configure no Render apenas as chaves necessárias: `DISCORD_TOKEN`, `CLIENT_ID`, opcional `GUILD_ID`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `LEADER_ROLE_ID`, `SUBLEADER_ROLE_ID`. Nunca publique tokens no GitHub.

## Teste
Execute `npm run check` para verificar a sintaxe dos arquivos JavaScript.

As páginas HTML são uma estrutura inicial; dados reais do Discord e integrações precisam de configuração adicional.

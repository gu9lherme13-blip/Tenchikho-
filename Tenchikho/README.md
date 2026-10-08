# TENCHIKO Bloodline — Core inicial

O TENCHIKO é um bot Discord independente. O arquivo do site QG NVB está preservado à parte em `../QG-NVB/QG-NVB-SITE-ORIGINAL.zip`; não é carregado nem alterado por este bot.

## O que esta versão faz
- Comandos `/ajuda`, `/ping`, `/botinfo` e `/trabalho`.
- `/trabalho` só aceita membros com os IDs de cargo configurados para Líder ou Sub-Líder.
- Roteador de tarefas para agentes: Programador, Designer, Moderador, Editor de vídeo, Música, Roblox, Jogos, Pesquisa, Escritor, Analista, Professor e Assistente geral.
- Registra início, conclusão, falhas e tentativas sem permissão nos logs do processo.
- Respostas de IA via OpenAI API.

**Limite desta primeira versão:** os agentes analisam o pedido e devolvem respostas/instruções. Ainda não executam mudanças em servidores, repositórios, sites, arquivos remotos ou serviços externos.

## Configuração local
1. Instale Node.js 20 ou superior.
2. Execute `npm install`.
3. Copie `.env.example` para `.env` e preencha `DISCORD_TOKEN`, `CLIENT_ID`, `OPENAI_API_KEY` e, opcionalmente, `GUILD_ID`.
4. Execute `npm run deploy:commands` para publicar os comandos.
5. Execute `npm start` para iniciar o bot.

Nunca envie tokens ou chaves no chat nem inclua `.env` no ZIP/repositório.

## Render
Crie um **Background Worker** no Render apontando para a pasta `TENCHIKO` do repositório:
- Build Command: `npm install`
- Start Command: `npm start`

Cadastre no painel do Render as variáveis de `.env.example`. O `render.yaml` também documenta a configuração inicial. O Render não precisa hospedar um site para este bot funcionar.

## Publicação de comandos
O comando de registro é separado do processo principal. Rode `npm run deploy:commands` uma vez depois de configurar as variáveis. Se `GUILD_ID` estiver preenchido, os comandos são registrados apenas nesse servidor; sem ele, são globais.

# Tenchikho — Central de Chamadas

Este ZIP é um **módulo independente**, criado porque o projeto original não estava disponível para edição. Ele não substitui nem modifica o bot/site existente.

## O que faz
- Painel web para abrir e encerrar chamadas.
- Seleção do canal de texto do Discord.
- Aviso automático no canal escolhido.
- Qualquer mensagem enviada por membro enquanto a chamada estiver aberta confirma presença.
- Registra somente nome de exibição e ID interno do Discord para evitar duplicidade.
- Encerramento automático pelo prazo ou manual pela staff.
- Histórico persistido em `DATA_DIR/chamadas.json`.

## Requisitos e permissões
- Node.js 20+
- Bot Discord com permissões `ViewChannel`, `SendMessages`, `ReadMessageHistory`.
- Ative **Message Content Intent** no Discord Developer Portal e habilite `GatewayIntentBits.MessageContent`.
- O bot precisa estar no servidor e ter acesso aos canais.

## Instalação
1. Extraia o ZIP.
2. Execute `npm install`.
3. Copie `.env.example` para `.env`.
4. Preencha `DISCORD_TOKEN` e defina uma `PANEL_API_KEY` forte.
5. Execute `npm start`.
6. Acesse `http://localhost:3000`.

## Segurança — importante
Este módulo usa `x-panel-key` como proteção provisória. Antes de publicar o painel na internet, integre a rota `/api` à autenticação OAuth2 já existente no Tenchikho e valide no servidor se o usuário tem cargo/permissão de staff. **Não exponha a chave no HTML público nem distribua a chave aos membros.** Para uso real, sirva o painel atrás da sessão autenticada do site.

## Integração ao Tenchikho existente
O módulo foi entregue separado para não sobrescrever arquivos do projeto original. Para integrar, incorpore as rotas e o listener `messageCreate` ao Express/discord.js já existentes, reutilizando a instância atual do bot e o mecanismo de autenticação do site. Não execute uma segunda instância do bot com o mesmo token.

## Observações
- O conteúdo das mensagens dos membros não é salvo.
- A lista de presenças guarda nome e ID do usuário para impedir nomes duplicados.
- O JSON é salvo localmente; em hospedagem com disco efêmero, configure armazenamento persistente.
- Ajuste o visual e a autenticação para combinar com o painel atual antes de publicar.
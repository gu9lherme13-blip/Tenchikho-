# Tenchiko (projeto novo)

Bot Discord.js v14 + painel web (Express). Login com Discord, lista só os servidores em que você é administrador, e configura as funções de cada servidor.

## Funções
- **Boas-vindas**: funciona. Quando alguém entra no servidor, o bot envia a mensagem no canal escolhido. Use `{membro}` para mencionar a pessoa.
- **Avisos**: funciona. Envia um aviso pelo painel no canal escolhido. Precisa estar ativa.
- **Ticket**: funciona com vários painéis/tickets salvos separadamente, edição, exclusão e persistência em `config.json`.
- **Chamada, Gerenciamento de Canais, Moderação**: aparecem no painel como "sem comportamento ainda". Não podem ser ativadas.

## Configurar no Discord (Developer Portal)
1. **Bot**: copie o Token para `DISCORD_TOKEN`. Ligue a intent **Server Members** (obrigatória para Boas-vindas).
2. **General Information**: copie o Application ID para `CLIENT_ID`.
3. **OAuth2**: copie o Client Secret para `DISCORD_CLIENT_SECRET`. Em *Redirects*, adicione `PUBLIC_URL/auth/callback`.
4. **Convite**: convide o bot pelo botão "Convidar bot" do painel, ou pelo OAuth2 URL Generator com os escopos `bot` e as permissões Ver canais, Enviar mensagens e Gerenciar canais (se for usar essa função).

## Render
- Runtime: Node. Build: `npm install --omit=dev`. Start: `npm start`. Health check: `/health`.
- Variáveis: `DISCORD_TOKEN`, `CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `PUBLIC_URL`, `DATA_DIR`.
- Para manter as configurações e os tickets entre deploys, adicione um disco persistente (plano pago) e use `DATA_DIR=/var/data` com o mount path `/var/data`.
- Mantenha só **uma instância**. Dois bots com o mesmo token não podem rodar juntos, então desligue o serviço antigo antes de subir este.

## Teste local
`npm install` → criar `.env` a partir de `.env.example` → `npm start` → abrir `http://localhost:3000`.

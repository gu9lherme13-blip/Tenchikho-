# TENCHIKO NVB — BOT (sem site)

Projeto só do **bot de comandos**. O site agora é outro projeto (`QG-NVB-SITE`, aplicativo QG).

## Comandos
- IA: `/ia` `/imagem` `/analisar` `/traduzir` `/resumir` e resposta ao mencionar o bot.
- Membros: `/ajuda` `/perfil` `/nivel` `/conquistas` `/recompensas` `/cargos` `/conquista-add` `/recompensa` `/dar-cargo` `/remover-cargo`.
- Diversão: `/multiverso` `/interacao` `/ship` `/interacao-animal` `/personagem` `/personagem-anime` `/animequiz` `/destino-anime` `/transformacao-anime` `/poder-anime` `/batalha-anime` `/duelo-anime`.
- Atividades: `/resenha` e `/jogatina` (`criar` e `ranking`).
- O comando `/recrutamento` foi para o aplicativo QG: este bot o apaga do servidor ao iniciar.

## Render (Web Service)
- Build Command: `npm install` • Start Command: `npm start` • Node 20. (O serviço abre uma porta mínima só para o Render manter o bot ligado.)
- Variáveis de ambiente:
  - `DISCORD_TOKEN` e `CLIENT_ID`: do aplicativo **Tenchiko**.
  - `GUILD_ID`: ID do servidor principal.
  - `OPENAI_API_KEY`: para os comandos de IA (precisa de crédito). Opcionais: `OPENAI_CHAT_MODEL`, `AI_DAILY_LIMIT`.
  - `DATA_DIR`: `/var/data`, com um **Disco Persistente** montado em `/var/data`.
- Portal do Discord (aplicativo Tenchiko): ligue **Server Members**, **Presence** e **Message Content Intent**.

## Observações
- O bloco antigo de música foi retirado (não tinha comandos ligados e exigia pacotes pesados). O sistema de música novo será um módulo à parte.
- Os dados (`.json`) são só deste projeto e não são compartilhados com o site.

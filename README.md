# QG NVB — SITE SEPARADO

Este pacote contém o **site/QG da Nytheris Vampyre Bloodline**, separado do bot Tenchiko e sem registro de slash commands.

## Render
- Tipo: Web Service
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Porta: `10000`

## Environment Variables
O site usa o Discord para carregar informações do servidor e, por isso, continua precisando de:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `QG_PUBLIC_URL` (opcional; coloque o endereço final do serviço no Render)

**Este serviço não registra slash commands.** O objetivo dele é servir o QG/site e as APIs necessárias ao site.

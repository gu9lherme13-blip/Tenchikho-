# Publicar o Tenchiko Bloodline no Render

## 0. Antes de tudo
- **Não envie `.env` nem segredos para o GitHub.** Use o repositório **privado**.
- Este pacote **não inclui** os arquivos de dados (`pontos.json`, `xp.json` ...). Eles são criados em branco no primeiro uso.
  Se você já tem dados em produção, **não os sobrescreva**: faça uma cópia deles (Render Shell ou download do disco) antes de qualquer deploy.
- **Não rode a migração por servidor** (`tools/migrate-to-guilds.js`) em produção: ela é da próxima etapa e exige o seu backup e aprovação.

## 1. GitHub
1. Extraia o ZIP. Crie (ou use) o repositório privado e envie os arquivos para a raiz (`package.json` na raiz).
2. Confirme que **não** subiram `.env`, `node_modules` ou pastas `_backups/`, `_quarantine/`.

## 2. Discord Developer Portal (https://discord.com/developers/applications)
1. **Bot**: copie o *Token* (vai em `DISCORD_TOKEN`). Ligue as 3 *Privileged Gateway Intents*: **Presence**, **Server Members** e **Message Content**
   (o bot usa as três; sem isso o login falha com "disallowed intents").
2. **General Information**: copie o *Application ID* (`CLIENT_ID`).
3. **OAuth2**: copie o *Client Secret* (`DISCORD_CLIENT_SECRET`) e adicione em *Redirects*:
   `https://SEU-SERVICO.onrender.com/auth/callback` (igual ao endereço do serviço, sem barra no fim).
4. Convide o bot ao servidor (o próprio painel gera o convite) e copie o ID do servidor (`GUILD_ID`; modo desenvolvedor do Discord).

## 3. Render
**Opção A — serviço manual (recomendado se você já tem um):** *New > Web Service* → conecte o repositório.
- Runtime **Node** · Build Command `npm install --omit=dev` · Start Command `npm start` · Health Check Path `/health`
- **Disks > Add Disk**: Mount Path `/var/data` (exige plano pago; no plano gratuito os dados somem a cada deploy e o serviço hiberna, derrubando o bot).
- **Environment** (valores nunca vão para o repositório):
  `NODE_VERSION=20`, `DATA_DIR=/var/data`, `DISCORD_TOKEN`, `CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `GUILD_ID`,
  e opcionalmente `OPENAI_API_KEY`, `PUBLIC_URL`, `CALLS_CHANNEL_ID` e os `ROLE_*` (veja `.env.example`).
- Mantenha **1 instância** (os dados ficam em arquivos no disco e o bot não pode rodar duplicado).

**Opção B — Blueprint:** *New > Blueprint* usa o `render.yaml` (cria um serviço novo com disco; o Render pede os segredos na criação).

## 4. Conferência depois do deploy
- Logs: devem aparecer `🤖 Tenchiko (bot + painel) na porta ...`, `🦇 Sistemas carregados (resenha/jogatina).` e o bot online no Discord.
- `https://SEU-SERVICO.onrender.com/health` → `{"ok":true,"online":true}`.
- Abra o painel, entre com o Discord e escolha o servidor. `https://SEU-SERVICO.onrender.com/pontos.json` deve dar **404**.
- Se a variável antiga `QG_PUBLIC_URL` existir no serviço, **troque por `PUBLIC_URL`** e confira que aponta para o Tenchiko (nunca para o QG NVB).

## 5. Problemas comuns
- *DISCORD_TOKEN e CLIENT_ID são obrigatórios*: variáveis não cadastradas.
- *Used disallowed intents*: ligue as 3 intents do passo 2.
- *redirect_uri inválido* no login: o Redirect do passo 2.3 não bate com o endereço do serviço.
- Dados sumindo a cada deploy: faltou o disco ou o `DATA_DIR=/var/data`.
- Arquivo `*.json` corrompido: o bot o copia para `_quarantine/` (no disco) e, sem `.bak` válido, trava as gravações desse arquivo e avisa no log. Nada é sobrescrito.

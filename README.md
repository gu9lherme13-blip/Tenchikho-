# TENCHIKO BLOODLINE — BOT + PAINEL (site)

Um projeto só: o **bot de comandos** e o **site do painel** (estilo painel de controle, com o tema da NVB).

## O site (painel)
- **Início:** convite do bot e entrada com Discord.
- **Painel de controle:** servidor ativo (seletor), saudação, números, acesso rápido e funções.
- **Servidores:** os servidores que você gerencia, com "Convidar bot" onde o bot não está.
- **Funções** (cada uma com botão Configurar):
  - **Auto Cargos:** menus de cargos publicados num canal (seleção única ou múltipla, emojis, editar e apagar).
  - **Boas-vindas:** mensagem para quem entra, com variáveis `{usuario}` `{nome}` `{servidor}` `{membros}` e botão de teste.
  - **Tickets:** painel com botão "Abrir ticket"; cada ticket é um canal privado do membro e da equipe, com botão de fechar.
  - **Tenchiko.IA, Games e Comandos:** páginas que explicam os comandos do bot.
  - **Diagnóstico:** confere permissões do bot, cargos, painéis, boas-vindas e tickets e diz o que ajustar.
- Só entra no painel de um servidor quem tem **Gerenciar servidor** (ou é dono/administrador) nele, conferido ao vivo a cada ação.
- Cargos acima do bot, de integração ou com permissões de administração (Administrador, Gerenciar servidor/cargos/canais, Banir, Expulsar etc.) **não entram** em painéis de cargos.

## Comandos do bot
- IA: `/ia` `/imagem` `/analisar` `/traduzir` `/resumir` e resposta ao mencionar o bot.
- Membros: `/ajuda` `/perfil` `/nivel` `/conquistas` `/recompensas` `/cargos` `/conquista-add` `/recompensa` `/dar-cargo` `/remover-cargo`.
- Diversão: `/multiverso` `/interacao` `/ship` `/interacao-animal` `/personagem` `/personagem-anime` `/animequiz` `/destino-anime` `/transformacao-anime` `/poder-anime` `/batalha-anime` `/duelo-anime`.
- Atividades: `/resenha` e `/jogatina` (`criar` e `ranking`).
- O comando `/recrutamento` não pertence ao Tenchiko: o bot o apaga do servidor (deste aplicativo) ao iniciar. O Tenchiko é independente do QG NVB.

## Render (Web Service)
- Build Command: `npm install` • Start Command: `npm start` • Node 20.
- Variáveis de ambiente:
  - `DISCORD_TOKEN`, `CLIENT_ID` e `GUILD_ID`: do aplicativo Tenchiko e do servidor principal.
  - `DISCORD_CLIENT_SECRET`: Client Secret do aplicativo (Portal do Discord → OAuth2). Sem ele, o login com Discord fica desativado.
  - `OPENAI_API_KEY`: para os comandos de IA (precisa de crédito). Opcionais: `OPENAI_CHAT_MODEL`, `AI_DAILY_LIMIT`.
  - `DATA_DIR`: `/var/data`, junto com um **Disco Persistente** montado em `/var/data`. Sem isso, os dados (painéis, boas-vindas, tickets etc.) somem a cada reinício.
  - `PUBLIC_URL` (opcional): endereço público do site (usado no retorno do login). Se faltar, o Render informa o endereço sozinho. `QG_PUBLIC_URL` ainda é lida como nome antigo, mas está obsoleta: troque por `PUBLIC_URL`.

## Login com Discord — passo a passo
1. Portal do Discord → seu aplicativo → **OAuth2** → gere e copie o **Client Secret** → `DISCORD_CLIENT_SECRET` no Render (nunca no GitHub).
2. Ainda em OAuth2, em **Redirects**, adicione exatamente `https://SEU-SERVICO.onrender.com/auth/callback` e salve.
3. Aba **Bot → Privileged Gateway Intents**: ligue **Server Members**, **Presence** e **Message Content**.
4. Convide o bot (botão "Convidar bot" do site) com as permissões: Ver canais, Enviar mensagens, Inserir links, Ler histórico, **Gerenciar cargos** (Auto Cargos) e **Gerenciar canais** (Tickets).
5. O cargo do bot deve ficar **acima** dos cargos que os painéis vão dar.

## Observações
- O bloco antigo de música foi retirado (não tinha comandos ligados). O sistema de música novo será um módulo à parte.
- Os dados são arquivos `.json` deste projeto. Use o **Diagnóstico** do painel para achar problemas de permissão.

## Testes e dados (B2)
- `npm test` roda a suíte automática (Node 20+, sem dependências extras): camada de armazenamento, dados por servidor, migração e boot com stubs.
  Esses testes **não** usam o Discord real nem dados de produção.
- Arquivos `.json` são gravados de forma atômica, com `.bak` da última versão válida. Arquivo corrompido vai para `_quarantine/`
  (o original nunca é sobrescrito em silêncio). Detalhes e plano de migração: `docs/B2-mapeamento-dados.md`.

## Publicação
Veja `docs/DEPLOY-RENDER.md` (passo a passo), `render.yaml` (Blueprint opcional) e `.env.example` (variáveis).

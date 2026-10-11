# TENCHIKO NVB — BOT + PAINEL (site)

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
- O comando `/recrutamento` foi retirado: este bot o apaga do servidor ao iniciar.

## Render (Web Service)
- Build Command: `npm install` • Start Command: `npm start` • Node 20.
- Variáveis de ambiente:
  - `DISCORD_TOKEN`, `CLIENT_ID` e `GUILD_ID`: do aplicativo Tenchiko e do servidor principal.
  - `DISCORD_CLIENT_SECRET`: Client Secret do aplicativo (Portal do Discord → OAuth2). Sem ele, o login com Discord fica desativado.
  - `OPENAI_API_KEY`: para os comandos de IA (precisa de crédito). Opcionais: `OPENAI_CHAT_MODEL`, `AI_DAILY_LIMIT`.
  - `DATA_DIR`: `/var/data`, junto com um **Disco Persistente** montado em `/var/data`. Sem isso, os dados (painéis, boas-vindas, tickets etc.) somem a cada reinício.
  - `QG_PUBLIC_URL` (opcional): endereço público do site. Se faltar, o Render informa o endereço sozinho.

## Login com Discord — passo a passo
1. Portal do Discord → seu aplicativo → **OAuth2** → gere e copie o **Client Secret** → `DISCORD_CLIENT_SECRET` no Render (nunca no GitHub).
2. Ainda em OAuth2, em **Redirects**, adicione exatamente `https://SEU-SERVICO.onrender.com/auth/callback` e salve.
3. Aba **Bot → Privileged Gateway Intents**: ligue **Server Members**, **Presence** e **Message Content**.
4. Convide o bot (botão "Convidar bot" do site) com as permissões: Ver canais, Enviar mensagens, Inserir links, Ler histórico, **Gerenciar cargos** (Auto Cargos) e **Gerenciar canais** (Tickets).
5. O cargo do bot deve ficar **acima** dos cargos que os painéis vão dar.

## Observações
- O bloco antigo de música foi retirado (não tinha comandos ligados). O sistema de música novo será um módulo à parte.
- Os dados são arquivos `.json` deste projeto. Use o **Diagnóstico** do painel para achar problemas de permissão.

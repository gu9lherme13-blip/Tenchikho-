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

O serviço serve o QG/site e as APIs do site. Os slash commands registrados são os da IA (`ia.js`) os do lote 1 (`comandos.js`) e os do lote 2 (`entretenimento.js`), criados com `create` (nunca apagam outros comandos).


## Correção pontual de dependências (Render)

Esta revisão altera somente o `package.json` e este README.

- Removido o override `discord-api-types: 0.37.100`. Ele forçava uma versão única e antiga para todos os pacotes, inclusive `discord-voip` (dependência do `discord-player`), que precisa de `discord-api-types/voice/v8`. Agora o npm resolve a versão que cada pacote declara.
- Mantidos Node 20.x e o override `youtubei.js`.
- Após enviar os arquivos, use **Clear build cache & deploy** no Render para não reutilizar `node_modules` antigo.
- `discord-api-types` declarado como dependência direta (`^0.38.0`), pois o `discord-player` o carrega diretamente (`discord-api-types/v10`) e ele precisa existir na raiz do `node_modules`.

## IA (ia.js)
Comandos: `/ia`, `/imagem`, `/imagem-editar`, `/analisar`, `/traduzir`, `/resumir` (staff), `/avatar-estilo`, `/moderar-texto` (staff), `/ia-status` (staff). O bot também responde quando é mencionado.

Variáveis no Render (todas opcionais, exceto a chave):
- `OPENAI_API_KEY` (obrigatória; já usada pelas imagens)
- `OPENAI_CHAT_MODEL` (padrão `gpt-4o-mini`), `OPENAI_VISION_MODEL`, `OPENAI_MODERATION_MODEL`
- `AI_DAILY_LIMIT` (20), `AI_IMAGE_DAILY_LIMIT` (5), `AI_COOLDOWN_SECONDS` (8), `AI_IMAGE_COOLDOWN_SECONDS` (60)
- `AI_REGISTER_COMMANDS=0` para não registrar os comandos ao iniciar

## Comandos NVB — lote 1 (comandos.js)
`/ajuda` `/nvb` `/perfil` `/nivel` `/ranking` `/pontos` `/pontos-add` `/pontos-remove` `/historico` `/conquistas` `/conquista-add` `/recompensa` `/recompensas` `/cargos` `/dar-cargo` `/remover-cargo`.
Permissões usam os cargos NVB já definidos no `index.js` (grupos `pontosAdd`, `pontosRemove`, `conquista`, `recompensa`, `moderacao`, `admin`). `NVB_REGISTER_COMMANDS=0` desliga o registro automático.

## Entretenimento NVB — lote 2 (entretenimento.js)
`/multiverso` (universo → personagem → ação → alvo), `/interacao` (78 ações), `/ship`, `/interacao-animal` (categoria → animal), `/personagem`, `/personagem-anime`, `/animequiz`, `/destino-anime`, `/transformacao-anime`, `/poder-anime`, `/batalha-anime`, `/duelo-anime`. E em `ia.js`: `/avatar-cena`.
Fotos e textos de animais e personagens vêm da Wikipédia em português no momento do comando (precisa de internet; se a página não existir, o bot avisa).

## Sistemas NVB — lote 3 (sistemas.js)
- `/resenha` e `/jogatina`: `criar` (formulário + quem organizou + limite de vagas), `historico`, `ver`, `ranking`, `organizador`, `cancelar`. A publicação tem os botões Participar, Cancelar presença, Ver participantes, Encerrar e Cancelar. Ao encerrar, a staff marca quem esteve presente; só presenças confirmadas em atividades concluídas entram no ranking e no `/nvb`.
- `/recrutamento`: `registrar` (formulário + quem recrutou), `avaliar`, `historico`, `ver`, `ranking`, `recrutador`. Usa o mesmo `recrutamentos.json` do formulário do site; ao aprovar, gera o `codigoEntrada` para o login do site.
- Também: `/roblox-vincular` (necessário para `/avatar-estilo` e `/avatar-cena`) e `/config-cargo` (liga um cargo da hierarquia NVB a um cargo do servidor, caso o nome seja diferente).
- `/interacao` agora usa GIFs de anime (nekos.best), contador e botão de retribuir.

## Persistência dos dados (importante)
Os dados ficam em arquivos `.json`. No Render, o disco é apagado a cada deploy/reinício. Para não perder histórico, pontos, resenhas, jogatinas e recrutamentos:
1. No Render: serviço → **Disks** → **Add Disk** (plano pago), ponto de montagem `/var/data`.
2. Em **Environment**, crie `DATA_DIR` = `/var/data`.
Sem isso, os dados voltam ao zero quando o serviço reinicia.

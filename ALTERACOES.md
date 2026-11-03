# Alterações desta versão

## Painel de funções
- `index.html`: painel com as 15 funções pedidas. Cada uma mostra 🟢 ATIVO ou 🔴 DESLIGADO, botões CONFIGURAR, ATIVAR e DESLIGAR.
- O status é o estado real: ATIVO só quando a função está ligada no servidor **e** o bot está nele. Funções sem código neste pacote ficam DESLIGADO, com o motivo exibido.
- CONFIGURAR abre as opções da própria função. Hoje só a Chamada tem configurações (canal padrão, duração padrão, mensagem padrão).

## Backend
- `funcoes.js` (novo): registro das funções, validação de configuração e armazenamento por servidor em `DATA_DIR/config/<guildId>.json` (gravação atômica; arquivo corrompido não é sobrescrito).
- `index.js`:
  - `GET /api/guilds/:id/functions`: lista com status real.
  - `POST /api/guilds/:id/functions/:chave/ativar` e `/desligar`: exige staff do servidor. Ao desligar a Chamada, as chamadas abertas daquele servidor são encerradas.
  - `PUT /api/guilds/:id/functions/:chave/config`: salva a configuração validada.
  - `POST /api/calls` recusa abrir chamada quando a Central está desligada.
  - A presença por mensagem só é registrada quando a Central está ligada no servidor.
  - Se a mensagem da chamada ficar em branco, usa a mensagem padrão configurada.

## Textos e identidade
- Morcego removido do cabeçalho superior da prévia (`previa-tenchiko-celular-e-computador.html`) e do cabeçalho da página de jogos (`jogos-tenchiko.html`). O nome TENCHIKHO e as cores foram mantidos.

## Testes
- `funcoes.test.js` (novo): 13 testes de status, persistência, isolamento entre servidores, validação e arquivo corrompido.
- `central-utils.test.js`: 6 testes, todos passando.
- Não executados neste ambiente: rotas HTTP (precisam de Express instalado) e integração com o Discord (precisa de token real).

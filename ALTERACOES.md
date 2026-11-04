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

## Gerenciamento de canais (função real)
- Função "Gerenciamento de Canais" agora é implementada: CONFIGURAR define a categoria padrão para novos canais; ATIVAR/DESLIGAR seguem a regra do painel.
- Quando ligada, a seção "Gerenciamento de canais" do painel permite criar, renomear e apagar canais de texto do servidor. Cada ação é feita pelo bot no Discord e registrada no log de auditoria com o nome de quem executou.
- Rotas novas: GET/POST `/api/guilds/:id/manage/channels`, PATCH/DELETE `/api/guilds/:id/manage/channels/:canalId`. Todas exigem staff do servidor, função ligada e a permissão Gerenciar canais do bot.
- Não é possível apagar um canal com chamada aberta; ao apagar o canal padrão da Central de Chamadas, a configuração é limpa.
- Morcego removido do cabeçalho da prévia (logo SVG e regras CSS correspondentes, em ambos os blocos).
- Testes: 23/23 em funcoes.test.js + central-utils.test.js. As ações no Discord não foram testadas com um servidor real.

## Configurações das funções (todas as 15)
- Todas as funções do painel têm botão CONFIGURAR com campos próprios (canal, mensagens, horários, limites etc.), salvos por servidor em disco.
- Chamada e Gerenciamento de Canais continuam com o comportamento real já existente.
- Funções ainda sem comportamento no bot (13) guardam a configuração, mas não podem ser ativadas; o painel mostra esse aviso dentro da tela de configuração.
- Central de Avisos mostra uma prévia do aviso enquanto você edita.
- Mensagens de saída, boas-vindas e aniversário aceitam {membro}, que vira o nome do membro quando o evento for implementado.
- Validação no servidor: IDs de canal/cargo, limites numéricos, nome de usuário do Roblox e, em doações, mínimo ≤ máximo ≤ limite diário.
- Testes: 27/27 em funcoes.test.js + central-utils.test.js.

## Novo painel (index.html)
- Painel reescrito com visual próprio: cabeçalho com ☰, TENCHIKHO e avatar (sem morcego), menu inferior (Início, Funções, Servidores, Menu).
- Seções: Servidor (seleção, nome e convite do bot), Acesso rápido, Resumo (funções ativas, total e status do bot), Funções, Nova chamada, Chamadas abertas, Histórico, Gerenciamento de canais e Conta (sair).
- Nenhum texto "Em breve". Funções sem código continuam sem poder ser ativadas, com o motivo na tela.
- A lógica de servidores, funções, configuração, chamadas e canais é a mesma de antes (script não alterado).
- Rota GET /api/invite recolocada para o botão Convidar bot.
- Testes: 27/27.
- Paleta ajustada para azul (sem roxo): cor de destaque e botão ATIVAR em tons de azul.

## Central de Avisos (função "avisos")
- Publica avisos no canal escolhido, com título, descrição opcional e conteúdo. O texto segue o mesmo formato da prévia do painel.
- Editar um aviso atualiza a mensagem já publicada no Discord. Apagar remove a mensagem do canal e o registro. Se a mensagem já não existir no Discord, o registro é removido mesmo assim.
- Histórico por servidor em avisos.json, com gravação atômica e proteção contra arquivo corrompido.
- Limites: título 100, descrição 300, conteúdo 1500 caracteres. Menções são desativadas no envio.
- A função só pode ser usada com a Central ligada na seção Funções e com o bot com permissão no canal.
- Rotas: GET/POST /api/guilds/:id/avisos e PATCH/DELETE /api/guilds/:id/avisos/:avisoId.
- Testes: 33/33 (inclui avisos.test.js).

## Tema do painel (index.html)
- Tema escuro com azul (paleta do guia de marca), cartões arredondados com brilho sutil.
- Cabeçalho com ☰, nome centralizado e avatar. Sem morcego.
- Hero com nome do servidor, status do bot, convite e troca de servidor.
- Resumo com anel de progresso (porcentagem de funções ativas) e métricas reais.
- Ações rápidas: Chamada, Avisos, Canais, Histórico.
- Menu inferior com botão central (+) para nova chamada.
- Scripts e IDs de funções, chamadas, canais e avisos mantidos.

## Tema v2 (index.html)
- Fundo preto com brilho azul sutil no topo.
- Títulos em Playfair Display e textos em Lato, com as cores do guia de marca (#0B1D3A, #152A4D, #2C4F8E, #6D8DC1, #A7B7D6, #D7E1F1).
- Banner do servidor em degradê azul com brilho, ações rápidas em quadrados azuis, anel de progresso e menu com botão central.
- Apenas CSS: scripts e IDs não foram alterados.

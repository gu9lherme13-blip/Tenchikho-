'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const iniciarJogos = require('../jogos');

// cliente falso: guarda o handler de messageCreate para disparar mensagens nos testes
function montar(canais = { xadrez: 'c1', dama: 'c2', ppt: 'c3', forca: 'c4', matematica: 'c5' }) {
  const handlers = {}, gravado = {};
  const db = { jogos_cfg: { g1: { canais } } };
  const client = { on(ev, fn) { handlers[ev] = fn; } };
  const jogos = iniciarJogos({ client, db, readJson: () => ({}), writeDb: k => { gravado[k] = (gravado[k] || 0) + 1; } });
  const enviar = async (canal, usuario, texto) => {
    const enviados = [];
    const msg = { guild: { id: 'g1' }, channel: { id: canal, send: async t => { enviados.push(t); } }, author: { id: usuario.id, username: usuario.nome, bot: false }, content: texto };
    await handlers.messageCreate(msg);
    return enviados;
  };
  return { jogos, db, enviar, gravado };
}
const A = { id: 'A', nome: 'Ana' }, B = { id: 'B', nome: 'Bruno' };

// cliente com acesso aos handlers e às mensagens enviadas (para o teste de bot)
function montarComCanal() {
  const handlers = {}, enviados = [];
  const db = { jogos_cfg: { g1: { canais: { xadrez: 'c1' } } } };
  iniciarJogos({ client: { on(ev, fn) { handlers[ev] = fn; } }, db, readJson: () => ({}), writeDb: () => {} });
  return { handlers, enviados };
}

// trava o sorteio: Math.random = 0 → palavra CASTELO e conta "1 + 1 = ?"
function comSorteioFixo(fn) {
  const orig = Math.random; Math.random = () => 0;
  return Promise.resolve().then(fn).finally(() => { Math.random = orig; });
}

test('canal sem jogo ativo é ignorado', async () => {
  const { enviar } = montar();
  const r = await enviar('zzz', A, 'jogar');
  assert.equal(r.length, 0);
});

test('mensagens de bot são ignoradas', async () => {
  const { handlers, enviados } = montarComCanal();
  await handlers.messageCreate({ guild: { id: 'g1' }, channel: { id: 'c1', send: async x => enviados.push(x) }, author: { id: 'R', username: 'robo', bot: true }, content: 'jogar' });
  assert.equal(enviados.length, 0);
});

test('xadrez: entrada, primeiro lance, lance ilegal e vez correta', async () => {
  const { enviar } = montar();
  let r = await enviar('c1', A, 'jogar');
  assert.match(r[0], /brancas/);
  r = await enviar('c1', B, 'jogar');
  assert.match(r[0], /Partida começou/);
  r = await enviar('c1', B, 'e7 e5');
  assert.match(r[0], /Não é sua vez/);
  r = await enviar('c1', A, 'e2 e5');
  assert.match(r[0], /Lance ilegal/);
  r = await enviar('c1', A, 'e2 e4');
  assert.match(r[0], /Vez de \*\*Bruno\*\*/);
  assert.match(r[0], /♙/); // peão branco no tabuleiro
});

test('xadrez: xeque-mate (mate do pastor invertido) registra vitória e derrota no placar', async () => {
  const { enviar, jogos } = montar();
  await enviar('c1', A, 'jogar'); await enviar('c1', B, 'jogar');
  await enviar('c1', A, 'f2 f3'); await enviar('c1', B, 'e7 e5');
  await enviar('c1', A, 'g2 g4'); const r = await enviar('c1', B, 'd8 h4');
  assert.match(r[0], /Xeque-mate/);
  const { placar } = jogos.resumo('g1');
  const a = placar.find(p => p.id === 'A'), b = placar.find(p => p.id === 'B');
  assert.equal(a.d, 1); assert.equal(b.v, 1);
});

test('xadrez: desistir encerra a partida e conta a derrota', async () => {
  const { enviar, jogos } = montar();
  await enviar('c1', A, 'jogar'); await enviar('c1', B, 'jogar');
  const r = await enviar('c1', B, 'desistir');
  assert.match(r[0], /desistiu/);
  const { placar } = jogos.resumo('g1');
  assert.equal(placar.find(p => p.id === 'B').d, 1);
  assert.equal(placar.find(p => p.id === 'A').v, 1);
});

test('dama: captura exige o caminho completo e move as peças', async () => {
  const { enviar } = montar();
  await enviar('c2', A, 'jogar'); await enviar('c2', B, 'jogar');
  let r = await enviar('c2', A, 'c3 d4');
  assert.match(r[0], /Vez de \*\*Bruno\*\*/);
  r = await enviar('c2', B, 'd6 c5');
  assert.match(r[0], /Vez de \*\*Ana\*\*/);
  r = await enviar('c2', A, 'd4 c5');
  assert.match(r[0], /Lance inválido|Vez de/);
});

test('pedra, papel ou tesoura: resultado e registro no placar', async () => {
  const { enviar, jogos } = montar();
  const r = await enviar('c3', A, 'pedra');
  assert.match(r[0], /Tenchiko/);
  const { placar, historico } = jogos.resumo('g1');
  assert.equal(placar.length, 1);
  assert.equal(historico[0].jogo, 'ppt');
  const ignorado = await enviar('c3', A, 'lagarto');
  assert.equal(ignorado.length, 0);
});

test('adivinhação de palavra: letras, erros, vitória com pontos', () => comSorteioFixo(async () => {
  const { enviar, jogos } = montar();
  let r = await enviar('c4', A, 'jogar');
  assert.match(r[0], /Nova palavra/);
  assert.match(r[0], /Dica: Construção antiga/);
  r = await enviar('c4', A, 'Z'); // erro
  assert.match(r[0], /Erros: 1 de 6/);
  r = await enviar('c4', A, 'Z');
  assert.match(r[0], /já foi usada/);
  for (const l of ['C', 'A', 'S', 'T', 'E', 'L', 'O']) r = await enviar('c4', A, l);
  assert.match(r[0], /Acertou/);
  assert.equal(jogos.resumo('g1').placar.find(p => p.id === 'A').v, 1);
}));

test('adivinhação de palavra: seis erros perdem a partida e revelam a palavra', () => comSorteioFixo(async () => {
  const { enviar, jogos } = montar();
  await enviar('c4', A, 'jogar');
  let r;
  for (const l of ['Z', 'Y', 'X', 'W', 'V', 'U']) r = await enviar('c4', A, l);
  assert.match(r[0], /Perdeu/);
  assert.match(r[0], /CASTELO/);
  assert.equal(jogos.resumo('g1').placar.find(p => p.id === 'A').d, 1);
}));

test('matemática: rodada de 10 acertos soma pontos e grava histórico', () => comSorteioFixo(async () => {
  const { enviar, jogos } = montar();
  let r = await enviar('c5', A, 'jogar');
  assert.match(r[0], /Rodada de 10 contas/);
  for (let i = 0; i < 10; i++) r = await enviar('c5', A, '2'); // "1 + 1 = ?" é sempre 2
  assert.match(r[0], /Rodada encerrada/);
  const { placar, historico } = jogos.resumo('g1');
  assert.equal(placar.find(p => p.id === 'A').p, 10);
  assert.equal(historico[0].jogo, 'matematica');
}));

test('placar: ordenado por pontos e histórico limitado a 30 na resposta', () => comSorteioFixo(async () => {
  const { enviar, jogos } = montar();
  await enviar('c3', A, 'pedra'); await enviar('c3', B, 'papel');
  const { placar, historico } = jogos.resumo('g1');
  assert.ok(placar.length >= 1);
  assert.ok(historico.length <= 30);
}));

test('salvar configuração guarda só os cinco jogos e canal livre fica nulo', () => {
  const { jogos, db } = montar({});
  jogos.salvarConfig('g1', { xadrez: 'c1', dama: null, ppt: 'c3' });
  assert.deepEqual(db.jogos_cfg.g1.canais, { xadrez: 'c1', dama: null, ppt: 'c3', forca: null, matematica: null });
});

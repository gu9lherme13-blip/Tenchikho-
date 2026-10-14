'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createStore } = require('../storage');
const { createGuildData } = require('../guilddata');
const { silent, tmp, rm, G1, G2, U1 } = require('./helpers');

test('dados de um servidor não aparecem em outro e persistem após reinício', async t => {
  const dir = tmp('gd1'); t.after(() => rm(dir));
  let gd = createGuildData(createStore({ dir, logger: silent }));
  gd.load(G1, 'pontos')[U1] = 100;
  gd.load(G2, 'pontos')[U1] = 7;
  await gd.save(G1, 'pontos'); await gd.save(G2, 'pontos');
  gd = createGuildData(createStore({ dir, logger: silent }));            // "reinício"
  assert.equal(gd.load(G1, 'pontos')[U1], 100);
  assert.equal(gd.load(G2, 'pontos')[U1], 7);
  assert.deepEqual(gd.guildIds(), [G1, G2]);
  assert.deepEqual(gd.load('999999999999999999', 'pontos'), {});         // servidor novo começa vazio
});

test('padrões por tipo e IDs/arquivos inválidos são recusados', async t => {
  const dir = tmp('gd2'); t.after(() => rm(dir));
  const gd = createGuildData(createStore({ dir, logger: silent }));
  assert.deepEqual(gd.load(G1, 'tickets'), { cfg: {}, abertos: {} });
  assert.deepEqual(gd.load(G1, 'logs'), []);
  for (const id of ['../x', 'abc', '', '123', `${G1}/../${G2}`, null, undefined]) assert.throws(() => gd.load(id, 'pontos'), /inválido/);
  assert.throws(() => gd.load(G1, 'segredos'), /desconhecido/);
  assert.throws(() => gd.loadGlobal('pontos'), /desconhecido/);
  assert.ok(!fs.existsSync(path.join(dir, 'x')));
});

test('arquivo de servidor corrompido é tratado pela camada segura (quarentena + trava)', async t => {
  const dir = tmp('gd3'); t.after(() => rm(dir));
  fs.mkdirSync(path.join(dir, 'guilds', G1), { recursive: true });
  fs.writeFileSync(path.join(dir, 'guilds', G1, 'xp.json'), '{quebrado');
  const store = createStore({ dir, logger: silent });
  const gd = createGuildData(store);
  assert.deepEqual(gd.load(G1, 'xp'), {});
  await assert.rejects(gd.save(G1, 'xp'), e => e.code === 'LOCKED');
  assert.equal(fs.readFileSync(path.join(dir, 'guilds', G1, 'xp.json'), 'utf8'), '{quebrado');
});

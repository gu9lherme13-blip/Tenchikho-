'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const migration = require('../migration');
const { tmp, rm, faultyFs, ioError, writeFixture, snapshotFlat, sha, G1, G2, U1, U2 } = require('./helpers');

const fx = t => { const dir = tmp('mig'); writeFixture(dir); t.after(() => rm(dir)); return dir; };
const j = (dir, rel) => JSON.parse(fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf8'));
const layoutAusente = dir => ['guilds', 'global', '_legacy', '_meta'].every(d => !fs.existsSync(path.join(dir, d)));

test('plan: só lê, valida, conta e não escreve nada', t => {
  const dir = fx(t); const antes = fs.readdirSync(dir).sort();
  const r = migration.plan(dir, { legacyGuildId: G1 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.guilds, [G1, G2]);
  assert.deepEqual(r.unmapped, ['extra.json']);
  const pontos = r.perSource.find(s => s.arquivo === 'pontos.json');
  assert.equal(pontos.itens, 2); assert.deepEqual(pontos.destinos, [`guilds/${G1}/pontos.json`]);
  assert.deepEqual(fs.readdirSync(dir).sort(), antes);
});

test('plan exige o servidor principal quando há dados sem servidor identificável', t => {
  const dir = fx(t);
  const r = migration.plan(dir, {});
  assert.equal(r.ok, false);
  const e = r.errors.find(x => x.code === 'LEGACY_GUILD_REQUIRED');
  assert.ok(e.files.includes('pontos') && e.files.includes('logs') && e.files.includes('presencaHistorico'));
  assert.equal(migration.plan(dir, { legacyGuildId: 'abc' }).ok, false);
});

test('plan recusa JSON inválido ou com formato errado e lista todos os problemas', t => {
  const dir = fx(t);
  fs.writeFileSync(path.join(dir, 'xp.json'), '{quebrado');
  fs.writeFileSync(path.join(dir, 'logs.json'), '{"deveria":"ser lista"}');
  const r = migration.plan(dir, { legacyGuildId: G1 });
  assert.equal(r.ok, false); assert.equal(r.stage, 'validate');
  assert.deepEqual(r.errors.map(e => e.code).sort(), ['BAD_SHAPE', 'INVALID_JSON']);
});

test('apply: layout correto, nenhum dado perdido/duplicado e arquivos antigos byte a byte intactos', async t => {
  const dir = fx(t); const antes = snapshotFlat(dir);
  const r = await migration.apply(dir, { legacyGuildId: G1 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(snapshotFlat(dir), antes);                                       // originais intactos
  // servidor principal recebe os dados que não tinham servidor
  assert.deepEqual(j(dir, `guilds/${G1}/pontos.json`), { [U1]: 50, [U2]: 10 });
  assert.equal(j(dir, `guilds/${G1}/logs.json`).length, 3);
  assert.deepEqual(j(dir, `guilds/${G1}/config.json`).roleIds, { ADM: '999999999999999999' });
  assert.equal(fs.existsSync(path.join(dir, 'guilds', G2, 'pontos.json')), false);  // G2 não herda pontos de G1
  // dados que já tinham servidor vão para o servidor certo
  assert.deepEqual(j(dir, `guilds/${G2}/boasvindas.json`), { ativo: false });
  assert.deepEqual(Object.keys(j(dir, `guilds/${G1}/tickets.json`).abertos), ['c1']);
  assert.deepEqual(Object.keys(j(dir, `guilds/${G2}/tickets.json`).abertos), ['c2']);
  assert.deepEqual(j(dir, `guilds/${G2}/tickets.json`).cfg, {});
  assert.deepEqual(Object.keys(j(dir, `guilds/${G2}/autorole_panels.json`)), ['p2']);
  assert.equal(j(dir, `guilds/${G1}/chamadas.json`).id, 'call-1');
  // global e legado
  assert.equal(j(dir, 'global/roblox.json')[U1].username, 'JogadorTeste');
  assert.deepEqual(j(dir, '_legacy/recrutamentos.json'), [{ id: 'R1' }]);
  assert.deepEqual(j(dir, '_legacy/codes.json'), { X: 1 });
  assert.equal(fs.existsSync(path.join(dir, '_legacy', 'avisos.json')), false);     // vazio: nada a preservar
  // registros sem servidor válido: nada é descartado
  assert.deepEqual(j(dir, '_legacy/chamadas.rejeitados.json'), { abc: { id: 'sem-servidor' } });
  assert.deepEqual(j(dir, '_legacy/tickets_abertos.rejeitados.json'), { c3: { userId: U1 } });
  // histórico de presença: um registro inferido pelo callId, outro vai ao principal
  assert.equal(j(dir, `guilds/${G1}/presencaHistorico.json`).length, 2);
  // marcador por último + backup com SHA-256 conferido
  const meta = j(dir, '_meta/schema.json'); assert.equal(meta.schemaVersion, 2); assert.equal(meta.legacyGuildId, G1);
  const man = j(dir, `${meta.backup}/MANIFEST.json`);
  for (const f of man.files) assert.equal(sha(path.join(dir, meta.backup, f.file)), f.sha256);
  assert.ok(man.files.some(f => f.file === 'extra.json'));                           // até o arquivo não mapeado foi copiado
  assert.equal(migration.verify(dir).ok, true);
  assert.equal(fs.readdirSync(dir).some(f => f.startsWith('_staging-')), false);
});

test('contagem de itens: origem == soma dos destinos para todos os arquivos', async t => {
  const dir = fx(t);
  const ins = migration.inspectSources(dir);
  const p = migration.buildPlan(ins.sources, { legacyGuildId: G1 });
  assert.deepEqual(migration.checkCounts(ins.sources, p.items), []);
  const total = Object.values(ins.sources).reduce((a, s) => a + s.count, 0);
  assert.equal(p.items.reduce((a, i) => a + i.units, 0), total);
});

test('apply duas vezes: a segunda é recusada e nada muda', async t => {
  const dir = fx(t);
  assert.equal((await migration.apply(dir, { legacyGuildId: G1 })).ok, true);
  const estado = fs.readdirSync(dir).sort();
  const r2 = await migration.apply(dir, { legacyGuildId: G1 });
  assert.equal(r2.ok, false); assert.equal(r2.errors[0].code, 'ALREADY_MIGRATED');
  assert.deepEqual(fs.readdirSync(dir).sort(), estado);
});

test('origem toda vazia (como no ZIP) NÃO é tratada como produção: apply é recusado', async t => {
  const dir = tmp('vazio'); t.after(() => rm(dir));
  for (const n of ['pontos', 'xp', 'logs', 'roblox', 'config']) fs.writeFileSync(path.join(dir, `${n}.json`), n === 'logs' ? '[]' : '{}');
  const r = await migration.apply(dir, {});
  assert.equal(r.ok, false); assert.equal(r.errors[0].code, 'EMPTY_SOURCES');
  assert.ok(layoutAusente(dir));
  assert.equal((await migration.apply(dir, { allowEmpty: true })).ok, true);          // só com pedido explícito
});

test('falha no meio do commit: tudo é desfeito, originais intactos e uma nova tentativa funciona', async t => {
  const dir = fx(t); const antes = snapshotFlat(dir);
  let falhar = true;
  const f = faultyFs({ sync: { renameSync: (a, real) => { if (falhar && String(a[1]).endsWith(`${path.sep}global`)) throw ioError('EIO', 'falha simulada'); return real(...a); } } });
  const r = await migration.apply(dir, { legacyGuildId: G1, fs: f });
  assert.equal(r.ok, false); assert.equal(r.stage, 'commit'); assert.equal(r.errors[0].code, 'COMMIT_FAILED');
  assert.ok(layoutAusente(dir));                                                        // nenhuma pasta nova ficou na raiz, nem o marcador
  assert.deepEqual(snapshotFlat(dir), antes);
  falhar = false;
  const r2 = await migration.apply(dir, { legacyGuildId: G1, fs: f });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.equal(migration.verify(dir).ok, true);
});

test('falha ao gravar no staging: nada vai para o lugar definitivo e o staging é limpo', async t => {
  const dir = fx(t); const antes = snapshotFlat(dir);
  const f = faultyFs({ promises: { open: (a, real) => { if (String(a[0]).includes('_staging-') && String(a[0]).endsWith('.tmp')) throw ioError('ENOSPC'); return real(...a); } } });
  const r = await migration.apply(dir, { legacyGuildId: G1, fs: f });
  assert.equal(r.ok, false); assert.equal(r.stage, 'staging');
  assert.ok(layoutAusente(dir)); assert.deepEqual(snapshotFlat(dir), antes);
  assert.equal(fs.readdirSync(dir).some(x => x.startsWith('_staging-')), false);
});

test('falha no backup: a migração nem começa', async t => {
  const dir = fx(t);
  const f = faultyFs({ sync: { copyFileSync: () => { throw ioError('ENOSPC'); } } });
  const r = await migration.apply(dir, { legacyGuildId: G1, fs: f });
  assert.equal(r.ok, false); assert.equal(r.stage, 'backup'); assert.ok(layoutAusente(dir));
});

test('rollback: move o formato novo para o lado (sem apagar) e os arquivos antigos seguem valendo', async t => {
  const dir = fx(t); const antes = snapshotFlat(dir);
  await migration.apply(dir, { legacyGuildId: G1 });
  const r = migration.rollback(dir);
  assert.equal(r.ok, true); assert.ok(layoutAusente(dir));
  assert.ok(fs.existsSync(path.join(r.movidoPara, 'guilds', G1, 'pontos.json')));        // preservado, não apagado
  assert.deepEqual(snapshotFlat(dir), antes);
  assert.ok(r.arquivosAntigos.every(x => x.state === 'igual ao backup'));
  assert.equal(migration.rollback(dir).ok, false);                                       // já desfeito
  assert.equal((await migration.apply(dir, { legacyGuildId: G1 })).ok, true);            // pode migrar de novo
});

test('rollback --restore-flat: devolve os arquivos antigos ao estado do backup, guardando o atual', async t => {
  const dir = fx(t); const original = fs.readFileSync(path.join(dir, 'pontos.json'), 'utf8');
  await migration.apply(dir, { legacyGuildId: G1 });
  fs.writeFileSync(path.join(dir, 'pontos.json'), '{"alterado":1}');                      // algo mexeu depois
  fs.unlinkSync(path.join(dir, 'xp.json'));
  const r = migration.rollback(dir, { restoreFlat: true });
  assert.equal(r.ok, true); assert.deepEqual(r.restaurados.sort(), ['pontos.json', 'xp.json']);
  assert.equal(fs.readFileSync(path.join(dir, 'pontos.json'), 'utf8'), original);
  assert.equal(fs.readFileSync(path.join(r.movidoPara, 'flat-antes-da-restauracao', 'pontos.json'), 'utf8'), '{"alterado":1}');
});

test('verify detecta divergência entre o formato novo e os arquivos antigos', async t => {
  const dir = fx(t);
  await migration.apply(dir, { legacyGuildId: G1 });
  fs.writeFileSync(path.join(dir, 'pontos.json'), JSON.stringify({ [U1]: 9999 }));
  const v = migration.verify(dir);
  assert.equal(v.ok, false); assert.ok(v.diffs.some(d => d.dest === `guilds/${G1}/pontos.json`));
});

test('CLI: plan funciona; apply exige a confirmação do backup externo', t => {
  const dir = fx(t); const cli = path.join(__dirname, '..', 'tools', 'migrate-to-guilds.js');
  const p = spawnSync(process.execPath, [cli, 'plan', '--dir', dir, '--legacy-guild', G1], { encoding: 'utf8' });
  assert.equal(p.status, 0); assert.equal(JSON.parse(p.stdout).ok, true);
  const a = spawnSync(process.execPath, [cli, 'apply', '--dir', dir, '--legacy-guild', G1], { encoding: 'utf8' });
  assert.equal(a.status, 2); assert.ok(layoutAusente(dir));
  assert.match(a.stderr, /confirm-offline-backup/);
});

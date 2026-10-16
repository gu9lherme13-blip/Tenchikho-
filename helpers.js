'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const silent = { log() {}, warn() {}, error() {} };
const tmp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), `tk-${prefix}-`));
const rm = dir => fs.rmSync(dir, { recursive: true, force: true });
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const exists = p => fs.existsSync(p);

// fs com falhas injetáveis: hooks.promises.<fn>(args, real) e hooks.sync.<fn>(args, real)
function faultyFs(hooks = {}) {
  const f = { ...fs, promises: { ...fs.promises } };
  for (const [name, h] of Object.entries(hooks.promises || {})) { const real = fs.promises[name].bind(fs.promises); f.promises[name] = (...a) => h(a, real); }
  for (const [name, h] of Object.entries(hooks.sync || {})) { const real = fs[name].bind(fs); f[name] = (...a) => h(a, real); }
  return f;
}
const ioError = (code, msg) => Object.assign(new Error(msg || code), { code });

const G1 = '111111111111111111', G2 = '222222222222222222', U1 = '333333333333333333', U2 = '444444444444444444';
function writeFixture(dir) {
  const w = (n, v) => fs.writeFileSync(path.join(dir, `${n}.json`), JSON.stringify(v, null, 2));
  w('pontos', { [U1]: 50, [U2]: 10 }); w('xp', { [U1]: 120, [U2]: 10 });
  w('conquistas', { [U1]: [{ nome: 'Veterano', por: U2, at: '2026-01-01T00:00:00Z' }, 'Legado'] });
  w('recompensas', [{ userId: U1, nome: 'Cargo VIP', pontos: 5, por: U2, at: '2026-01-02T00:00:00Z' }]);
  w('historico', { [U1]: [{ action: 'aviso', details: 'teste', at: '2026-01-03T00:00:00Z' }] });
  w('logs', [1, 2, 3].map(i => ({ type: 'pontos', userId: U1, details: { amount: i }, at: `2026-01-0${i}T00:00:00Z` })));
  w('config', { roleIds: { ADM: '999999999999999999' }, recrutChannelId: '123456789012345678' });
  w('roblox', { [U1]: { username: 'JogadorTeste', id: 1 } });
  w('chamadas', { [G1]: { id: 'call-1', status: 'aberta', titulo: 'T' }, abc: { id: 'sem-servidor' } });
  w('presencaHistorico', [{ userId: U1, callId: 'call-1' }, { userId: U2, callId: 'call-antiga' }]);
  w('boasvindas', { [G1]: { ativo: true, canalId: '5' }, [G2]: { ativo: false } });
  w('tickets_cfg', { [G1]: { ativo: true, titulo: 'Suporte' } });
  w('tickets_abertos', { c1: { guildId: G1, userId: U1 }, c2: { guildId: G2, userId: U2 }, c3: { userId: U1 } });
  w('autorole_panels', { p1: { id: 'p1', guildId: G1, cargos: [] }, p2: { id: 'p2', guildId: G2, cargos: [] } });
  w('resenhas', [{ id: 'RS1' }, { id: 'RS2' }]); w('jogatinas', []);
  w('interacoes', { [U1]: { abraco: 3 } });
  w('avisos', {}); w('codes', { X: 1 }); w('recrutamentos', [{ id: 'R1' }]);
  fs.writeFileSync(path.join(dir, 'extra.json'), '{"nao":"mapeado"}');
}
const snapshotFlat = dir => Object.fromEntries(fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => [f, sha(path.join(dir, f))]));

module.exports = { silent, tmp, rm, sha, exists, faultyFs, ioError, writeFixture, snapshotFlat, G1, G2, U1, U2 };

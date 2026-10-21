'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createStore, StorageError } = require('../storage');
const { silent, tmp, rm, faultyFs, ioError } = require('./helpers');

const mk = (dir, extra = {}) => createStore({ dir, logger: silent, ...extra });
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const leftovers = dir => fs.readdirSync(dir).filter(f => /\.tmp$/.test(f));
const quarantined = dir => { try { return fs.readdirSync(path.join(dir, '_quarantine')); } catch (_) { return []; } };

test('grava de forma atômica, sem sobras e com JSON válido', async t => {
  const dir = tmp('a'); t.after(() => rm(dir));
  const s = mk(dir);
  await s.save('pontos.json', { a: 1 });
  assert.deepEqual(read(dir, 'pontos.json'), { a: 1 });
  assert.deepEqual(leftovers(dir), []);
});

test('guarda o .bak com a última versão válida antes de substituir', async t => {
  const dir = tmp('b'); t.after(() => rm(dir));
  const s = mk(dir);
  await s.save('x.json', { v: 1 }); await s.save('x.json', { v: 2 }); await s.save('x.json', { v: 3 });
  assert.deepEqual(read(dir, 'x.json'), { v: 3 });
  assert.deepEqual(read(dir, 'x.json.bak'), { v: 2 });
});

test('falha no rename: alvo intacto, tmp removido, erro explícito e recuperação depois', async t => {
  const dir = tmp('c'); t.after(() => rm(dir));
  let fail = false;
  const s = mk(dir, { fs: faultyFs({ promises: { rename: (a, real) => { if (fail && a[1].endsWith('x.json')) throw ioError('EIO', 'disco com defeito'); return real(...a); } } }) });
  await s.save('x.json', { v: 1 });
  fail = true;
  await assert.rejects(s.save('x.json', { v: 2 }), e => e instanceof StorageError && e.code === 'WRITE_FAILED');
  assert.deepEqual(read(dir, 'x.json'), { v: 1 });
  assert.deepEqual(leftovers(dir), []);
  assert.match(s.status()[0].lastError, /WRITE_FAILED/);
  fail = false;
  await s.save('x.json', { v: 3 });
  assert.deepEqual(read(dir, 'x.json'), { v: 3 });
  assert.equal(s.status()[0].lastError, null);
});

test('disco cheio (ENOSPC) ao criar o temporário: nada é criado e o erro é explícito', async t => {
  const dir = tmp('d'); t.after(() => rm(dir));
  const s = mk(dir, { fs: faultyFs({ promises: { open: (a, real) => { if (String(a[0]).endsWith('.tmp')) throw ioError('ENOSPC'); return real(...a); } } }) });
  await assert.rejects(s.save('novo.json', { a: 1 }), e => e.code === 'WRITE_FAILED');
  assert.equal(fs.existsSync(path.join(dir, 'novo.json')), false);
  assert.deepEqual(leftovers(dir), []);
});

test('falha ao criar o .bak: a gravação é recusada e o arquivo atual não muda', async t => {
  const dir = tmp('e'); t.after(() => rm(dir));
  let fail = false;
  const s = mk(dir, { fs: faultyFs({ promises: { open: (a, real) => { if (fail && /\.bak\.\d+\.\d+\.tmp$/.test(String(a[0]))) throw ioError('ENOSPC'); return real(...a); } } }) });
  await s.save('x.json', { v: 1 });
  fail = true;
  await assert.rejects(s.save('x.json', { v: 2 }), e => e.code === 'BACKUP_FAILED');
  assert.deepEqual(read(dir, 'x.json'), { v: 1 });
});

test('corrompido COM .bak: recupera, preserva o original na quarentena e só então substitui', async t => {
  const dir = tmp('f'); t.after(() => rm(dir));
  const s0 = mk(dir);
  await s0.save('x.json', { v: 1 }); await s0.save('x.json', { v: 2 });           // x.json={v:2}  x.json.bak={v:1}
  const lixo = '{"v": 2, "quebrado": ';
  fs.writeFileSync(path.join(dir, 'x.json'), lixo);                                // corrupção (JSON cortado)
  const s = mk(dir);
  let ev; s.events.on('corrupt', e => { ev = e; });
  const val = s.readSync('x.json', {}, { expect: 'object' });
  assert.deepEqual(val, { v: 1 });                                                 // veio do .bak
  assert.equal(ev.recovered, true);
  const q = quarantined(dir); assert.equal(q.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, '_quarantine', q[0]), 'utf8'), lixo); // byte a byte
  assert.equal(fs.readFileSync(path.join(dir, 'x.json'), 'utf8'), lixo);            // original ainda no lugar até a próxima gravação
  await s.save('x.json', { v: 9 });
  assert.deepEqual(read(dir, 'x.json'), { v: 9 });
  assert.deepEqual(read(dir, 'x.json.bak'), { v: 1 });                              // .bak bom NÃO foi trocado pelo lixo
  assert.equal(fs.readFileSync(path.join(dir, '_quarantine', q[0]), 'utf8'), lixo); // quarentena preservada
});

test('corrompido SEM .bak: trava, devolve o padrão, recusa gravar e preserva o original', async t => {
  const dir = tmp('g'); t.after(() => rm(dir));
  const lixo = '<<<não é json>>>';
  fs.writeFileSync(path.join(dir, 'pontos.json'), lixo);
  const s = mk(dir);
  const val = s.readSync('pontos.json', { padrao: true }, { expect: 'object' });
  assert.deepEqual(val, { padrao: true });
  assert.equal(s.status()[0].locked, true);
  await assert.rejects(s.save('pontos.json', { novo: 1 }), e => e.code === 'LOCKED');
  assert.equal(fs.readFileSync(path.join(dir, 'pontos.json'), 'utf8'), lixo);       // NADA sobrescrito
  const q = quarantined(dir); assert.equal(q.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, '_quarantine', q[0]), 'utf8'), lixo);
  // decisão explícita do operador libera a gravação; o original segue guardado
  const r = s.resolveLocked('pontos.json', 'accept-fallback'); assert.equal(r.changed, true);
  await s.save('pontos.json', { novo: 1 });
  assert.deepEqual(read(dir, 'pontos.json'), { novo: 1 });
  assert.equal(fs.readFileSync(path.join(dir, '_quarantine', q[0]), 'utf8'), lixo);
});

test('arquivo vazio (0 bytes) e formato errado também são tratados como corrompidos', async t => {
  const dir = tmp('h'); t.after(() => rm(dir));
  fs.writeFileSync(path.join(dir, 'vazio.json'), '');
  fs.writeFileSync(path.join(dir, 'lista.json'), '[1,2,3]');
  const s = mk(dir);
  assert.deepEqual(s.readSync('vazio.json', {}, { expect: 'object' }), {});
  assert.deepEqual(s.readSync('lista.json', {}, { expect: 'object' }), {});         // esperava objeto, veio array
  assert.equal(s.status().filter(x => x.locked).length, 2);
  assert.equal(quarantined(dir).length, 2);
  assert.equal(fs.readFileSync(path.join(dir, 'lista.json'), 'utf8'), '[1,2,3]');
});

test('arquivo ausente devolve o padrão sem travar; arquivo corrigido por fora destrava na releitura', async t => {
  const dir = tmp('i'); t.after(() => rm(dir));
  const s = mk(dir);
  assert.deepEqual(s.readSync('nao-existe.json', [], { expect: 'array' }), []);
  assert.equal(s.status()[0].locked, false);
  fs.writeFileSync(path.join(dir, 'k.json'), '{ruim');
  s.readSync('k.json', {}, { expect: 'object' });
  assert.equal(s.status().find(x => x.name === 'k.json').locked, true);
  fs.writeFileSync(path.join(dir, 'k.json'), '{"ok":1}');                            // operador corrige o arquivo
  assert.deepEqual(s.readSync('k.json', {}, { expect: 'object' }), { ok: 1 });
  assert.equal(s.status().find(x => x.name === 'k.json').locked, false);
});

test('erro de leitura (EACCES) trava o arquivo em vez de assumir "vazio"', async t => {
  const dir = tmp('j'); t.after(() => rm(dir));
  fs.writeFileSync(path.join(dir, 'p.json'), '{"a":1}');
  const s = mk(dir, { fs: faultyFs({ sync: { readFileSync: (a, real) => { if (String(a[0]).endsWith('p.json')) throw ioError('EACCES'); return real(...a); } } }) });
  assert.deepEqual(s.readSync('p.json', {}, { expect: 'object' }), {});
  await assert.rejects(s.save('p.json', { a: 2 }), e => e.code === 'LOCKED');
  assert.equal(fs.readFileSync(path.join(dir, 'p.json'), 'utf8'), '{"a":1}');
});

test('alvo corrompido DEPOIS da leitura (alteração externa): recusa gravar, preserva e não toca no .bak', async t => {
  const dir = tmp('k'); t.after(() => rm(dir));
  const s = mk(dir);
  await s.save('x.json', { v: 1 }); await s.save('x.json', { v: 2 });
  fs.writeFileSync(path.join(dir, 'x.json'), '{corrompido por fora');
  await assert.rejects(s.save('x.json', { v: 3 }), e => e.code === 'TARGET_CORRUPT');
  assert.equal(fs.readFileSync(path.join(dir, 'x.json'), 'utf8'), '{corrompido por fora');
  assert.deepEqual(read(dir, 'x.json.bak'), { v: 1 });
  assert.equal(quarantined(dir).length, 1);
});

test('concorrência: 100 gravações simultâneas do mesmo arquivo não se sobrepõem e vale a última', async t => {
  const dir = tmp('l'); t.after(() => rm(dir));
  const ativos = {}; let maxAtivos = 0;
  const s = mk(dir, { fs: faultyFs({ promises: { rename: async (a, real) => {
    const k = a[1]; ativos[k] = (ativos[k] || 0) + 1; maxAtivos = Math.max(maxAtivos, ativos[k]);
    await new Promise(r => setTimeout(r, 2));
    try { return await real(...a); } finally { ativos[k]--; }
  } } }) });
  const ps = []; for (let i = 1; i <= 100; i++) ps.push(s.save('c.json', { i }));
  // lê o arquivo enquanto as gravações acontecem: sempre JSON válido
  const leituras = setInterval(() => { try { JSON.parse(fs.readFileSync(path.join(dir, 'c.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; } }, 1);
  await Promise.all(ps); clearInterval(leituras);
  assert.deepEqual(read(dir, 'c.json'), { i: 100 });
  assert.equal(maxAtivos, 1);
  assert.deepEqual(leftovers(dir), []);
});

test('fila aglutina gravações pendentes (poucas escritas no disco)', async t => {
  const dir = tmp('m'); t.after(() => rm(dir));
  const s = mk(dir, { fs: faultyFs({ promises: { rename: async (a, real) => { await new Promise(r => setTimeout(r, 30)); return real(...a); } } }) });
  const ps = []; for (let i = 1; i <= 40; i++) ps.push(s.save('c.json', { i }));
  await Promise.all(ps);
  assert.deepEqual(read(dir, 'c.json'), { i: 40 });
  assert.ok(s.status()[0].writes <= 3, `esperava poucas escritas, houve ${s.status()[0].writes}`);
});

test('arquivos diferentes são gravados de forma independente e flush() espera tudo', async t => {
  const dir = tmp('n'); t.after(() => rm(dir));
  const s = mk(dir);
  for (let i = 0; i < 20; i++) { s.save(`guilds/${'1'.repeat(18)}/f${i}.json`, { i }).catch(() => {}); }
  const r = await s.flush();
  assert.deepEqual(r.errors, []);
  for (let i = 0; i < 20; i++) assert.deepEqual(read(dir, `guilds/${'1'.repeat(18)}/f${i}.json`), { i });
});

test('flush() informa erros de gravação', async t => {
  const dir = tmp('o'); t.after(() => rm(dir));
  const s = mk(dir, { fs: faultyFs({ promises: { rename: () => { throw ioError('EIO'); } } }) });
  s.save('x.json', { a: 1 }).catch(() => {});
  const r = await s.flush();
  assert.equal(r.errors.length, 1); assert.match(r.errors[0].error, /WRITE_FAILED/);
});

test('nomes perigosos são rejeitados (path traversal, caminho absoluto, extensão)', async t => {
  const dir = tmp('p'); t.after(() => rm(dir));
  const s = mk(dir);
  for (const n of ['../fora.json', '/etc/passwd.json', 'a/../../b.json', 'dados.txt', '', '.oculto.json', 'a//b.json', 'a\\b.json', 'x.json/..']) {
    await assert.rejects(s.save(n, {}), e => e.code === 'BAD_NAME', `deveria rejeitar ${JSON.stringify(n)}`);
    assert.throws(() => s.readSync(n, {}), e => e.code === 'BAD_NAME');
  }
});

test('valor não serializável é recusado sem tocar no arquivo', async t => {
  const dir = tmp('q'); t.after(() => rm(dir));
  const s = mk(dir);
  await s.save('x.json', { v: 1 });
  const ciclo = {}; ciclo.self = ciclo;
  await assert.rejects(s.save('x.json', ciclo), e => e.code === 'SERIALIZE');
  await assert.rejects(s.save('x.json', undefined), e => e.code === 'SERIALIZE');
  assert.deepEqual(read(dir, 'x.json'), { v: 1 });
});

test('sweepTemp remove restos de gravações interrompidas, mas não dados', async t => {
  const dir = tmp('r'); t.after(() => rm(dir));
  fs.writeFileSync(path.join(dir, 'x.json'), '{"a":1}');
  fs.writeFileSync(path.join(dir, 'x.json.4242.7.tmp'), 'parcial');
  fs.mkdirSync(path.join(dir, 'guilds', '1'.repeat(18)), { recursive: true });
  fs.writeFileSync(path.join(dir, 'guilds', '1'.repeat(18), 'p.json.4242.8.tmp'), 'parcial');
  const s = mk(dir, { sweep: false });
  const removidos = s.sweepTemp(0);
  assert.equal(removidos.length, 2);
  assert.deepEqual(read(dir, 'x.json'), { a: 1 });
});

test('queda real: SIGKILL no meio de gravações grandes nunca deixa o arquivo inválido', async t => {
  const dir = tmp('s'); t.after(() => rm(dir));
  for (let rodada = 0; rodada < 8; rodada++) {
    const child = spawn(process.execPath, [path.join(__dirname, '_child-writer.js'), dir], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', () => resolve()); });
    await new Promise(r => setTimeout(r, 10 + Math.floor(Math.random() * 90)));
    child.kill('SIGKILL');
    await new Promise(r => child.once('exit', r));
    const s = mk(dir, { sweepMinAgeMs: 0 });                       // reinício: varre temporários
    const v = s.readSync('estado.json', null, { expect: 'object' });
    assert.ok(v && Number.isInteger(v.n), `rodada ${rodada}: arquivo inválido`);
    assert.equal(v.check, v.n * 7); assert.equal(v.payload.length, 300000);
    assert.equal(s.status().find(x => x.name === 'estado.json').locked, false);
    assert.deepEqual(leftovers(dir), [], `rodada ${rodada}: sobrou temporário`);
  }
});

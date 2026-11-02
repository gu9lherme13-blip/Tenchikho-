'use strict';
// Teste de inicialização com stubs (sem Discord real, sem npm install). Cobre o uso da camada segura pelo index.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { tmp, rm } = require('./helpers');

function boot(dataDir) {
  const child = spawn(process.execPath, ['-r', path.join(__dirname, 'stubs', 'preload.js'), path.join(__dirname, 'boot-child.js')],
    { env: { ...process.env, DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
  const report = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('sem relatório de boot\n' + out + err)), 15000);
    const iv = setInterval(() => { const m = out.match(/^REPORT (.+)$/m); if (m) { clearInterval(iv); clearTimeout(t); resolve(JSON.parse(m[1])); } }, 50);
  });
  const exit = new Promise(r => child.once('exit', (code, sig) => r({ code, sig })));
  return { child, report, exit, out: () => out, err: () => err };
}

test('boot normal: todos os módulos carregam, comandos são registrados e /recrutamento é removido', async t => {
  const dir = tmp('boot1'); t.after(() => rm(dir));
  const b = boot(dir); t.after(() => b.child.kill('SIGKILL'));
  const r = await b.report;
  assert.deepEqual(r.falhas, []);
  assert.ok(r.criados.includes('resenha') && r.criados.includes('perfil') && !r.criados.includes('recrutamento'));
  assert.deepEqual(r.removidos, ['recrutamento']);
});

test('boot com pontos.json corrompido: original preservado, cópia na quarentena e o bot continua de pé', async t => {
  const dir = tmp('boot2'); t.after(() => rm(dir));
  fs.writeFileSync(path.join(dir, 'pontos.json'), '{"123": 50, quebrad');
  fs.writeFileSync(path.join(dir, 'xp.json'), '{"123": 7}');
  const b = boot(dir); t.after(() => b.child.kill('SIGKILL'));
  const r = await b.report;
  assert.deepEqual(r.falhas, []);
  assert.equal(fs.readFileSync(path.join(dir, 'pontos.json'), 'utf8'), '{"123": 50, quebrad');   // NÃO sobrescrito
  const q = fs.readdirSync(path.join(dir, '_quarantine'));
  assert.equal(q.length, 1); assert.match(q[0], /^pontos\.json\./);
  assert.equal(fs.readFileSync(path.join(dir, '_quarantine', q[0]), 'utf8'), '{"123": 50, quebrad');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'xp.json'), 'utf8')), { 123: 7 });  // arquivo saudável intacto
  assert.match(b.err(), /pontos\.json.*corrompido/);
});

test('SIGTERM (deploy do Render): grava a fila, encerra com código 0 em poucos segundos', async t => {
  const dir = tmp('boot3'); t.after(() => rm(dir));
  const b = boot(dir); t.after(() => b.child.kill('SIGKILL'));
  await b.report;
  const t0 = Date.now(); b.child.kill('SIGTERM');
  const { code } = await b.exit;
  assert.equal(code, 0); assert.ok(Date.now() - t0 < 5000);
  assert.match(b.out(), /gravando dados pendentes/);
});

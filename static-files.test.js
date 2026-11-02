'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { instalarArquivosPublicos, PUBLICOS } = require('../static-files');

const RAIZ = path.resolve(__dirname, '..');
function fakeApp() { const app = { mw: [], gets: [] }; app.use = f => app.mw.push(f); app.get = (p, h) => app.gets.push({ paths: [].concat(p), h }); return app; }
function requisitar(app, rawPath, method = 'GET') {
  const out = { status: null, file: null, opts: null, passou: false };
  const req = { method, path: rawPath };
  const res = { status(c) { out.status = c; return res; }, send() { return res; }, sendFile(f, o) { out.file = f; out.opts = o; return res; } };
  app.mw[0](req, res, () => { out.passou = true; });
  if (out.status !== null) return out;                                           // bloqueado pela trava
  const norm = rawPath.toLowerCase().replace(/\/+$/, '');                          // como o Express casa rotas (sem diferenciar caixa)
  const rota = app.gets.find(g => g.paths.includes(norm));
  if (rota) rota.h(req, res, () => { out.passou = true; }); else out.passou = true;
  return out;
}
const montar = () => { const a = fakeApp(); instalarArquivosPublicos(a, RAIZ); return a; };

test('só 3 arquivos são públicos e a lista é fechada', () => {
  assert.deepEqual(Object.keys(PUBLICOS).sort(), ['/index.html', '/nvb-painel.css', '/nvb-painel.js']);
  assert.equal(montar().gets.length, 1);
  assert.deepEqual(montar().gets[0].paths.sort(), Object.keys(PUBLICOS).sort());
});

test('arquivos internos dão 404, inclusive com o ponto codificado (%2E) e variações de caixa', () => {
  const app = montar();
  for (const p of ['/pontos.json', '/pontos%2Ejson', '/PONTOS%2eJSON', '/index%2Ejs', '/%2e%2e/index.js', '/%2E%2E%2Findex.js', '/x%2Fy.json',
    '/_quarantine/pontos.json.2026-10-12.1.corrupt', '/pontos.json.bak', '/.env', '/%2eenv', '/guilds/111111111111111111/pontos.json',
    '/storage.js', '/package.json', '/docs/B2-mapeamento-dados.md', '/tests/helpers.js', '/_backups/pre-migration-x/MANIFEST.json']) {
    const r = requisitar(app, p);
    assert.equal(r.status, 404, `deveria bloquear ${p}`); assert.equal(r.file, null);
  }
});

test('codificação inválida dá 400 e nada é servido', () => {
  assert.equal(requisitar(montar(), '/%E0%A4%A').status, 400);
});

test('os 3 arquivos públicos saem (com ou sem barra final e em qualquer caixa), sem dotfiles', () => {
  const app = montar();
  for (const [p, esperado] of [['/nvb-painel.js', 'nvb-painel.js'], ['/NVB-PAINEL.CSS', 'nvb-painel.css'], ['/index.html', 'index.html'], ['/index.html/', 'index.html']]) {
    const r = requisitar(app, p);
    assert.equal(r.file, path.join(RAIZ, esperado), p); assert.deepEqual(r.opts, { dotfiles: 'deny' });
  }
});

test('rotas de página e de API não são bloqueadas; POST não é afetado', () => {
  const app = montar();
  for (const p of ['/', '/auth/discord', '/dashboard', '/api/export.json', '/%61pi/relatorio.json']) { const r = requisitar(app, p); assert.equal(r.status, null, p); assert.equal(r.file, null); assert.equal(r.passou, true, p); }
  assert.equal(requisitar(app, '/x.json', 'POST').status, null);
});

test('o projeto não usa express.static em nenhum arquivo do bot', () => {
  for (const f of fs.readdirSync(RAIZ).filter(n => n.endsWith('.js'))) {
    const codigo = fs.readFileSync(path.join(RAIZ, f), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.ok(!/express\.static\s*\(/.test(codigo), `${f} usa express.static`);
  }
});

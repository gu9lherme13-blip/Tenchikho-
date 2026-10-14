'use strict';
// =========================================================
// 🔒 Tenchiko • arquivos públicos do site (lista FECHADA)
// Só os 3 arquivos abaixo saem pelo Express. Não usamos express.static: nenhum .json, .js do bot,
// .env, backup (.bak), quarentena ou pasta de dados pode ser servido, nem com o nome codificado (%2E).
// =========================================================
const path = require('path');

const PUBLICOS = Object.freeze({ '/nvb-painel.js': 'nvb-painel.js', '/nvb-painel.css': 'nvb-painel.css', '/index.html': 'index.html' });
const arquivoDe = p => PUBLICOS[String(p).toLowerCase().replace(/\/+$/, '')];

function instalarArquivosPublicos(app, raiz) {
  // 1) qualquer GET/HEAD que termine em extensão e não esteja na lista dá 404 (decodifica antes: %2E vira ".")
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let p;
    try { p = decodeURIComponent(req.path); } catch (_) { return res.status(400).send('Requisição inválida'); }
    if (p.startsWith('/api/')) return next();
    if (/\.[a-z0-9]+$/i.test(p) && !arquivoDe(p)) return res.status(404).send('Não encontrado');
    next();
  });
  // 2) lista fechada, comparação exata (sem montar caminho a partir do que o visitante enviou)
  app.get(Object.keys(PUBLICOS), (req, res, next) => {
    const arq = arquivoDe(req.path);
    if (!arq) return next();
    res.sendFile(path.join(raiz, arq), { dotfiles: 'deny' });
  });
}

module.exports = { instalarArquivosPublicos, PUBLICOS };

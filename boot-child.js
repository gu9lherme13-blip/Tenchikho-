'use strict';
// Sobe o index.js com stubs, dispara 'ready' e imprime um relatório. NÃO fala com o Discord de verdade.
const path = require('path');
const root = path.join(__dirname, '..');
process.env.DISCORD_TOKEN = 'x'; process.env.CLIENT_ID = '1'; process.env.GUILD_ID = '111111111111111111'; process.env.PORT = '0';
const errs = [], logs = [];
const real = { error: console.error, log: console.log, warn: console.warn };
console.error = (...a) => { errs.push(a.join(' ')); real.error(...a); };
console.warn = (...a) => { errs.push(a.join(' ')); real.warn(...a); };
console.log = (...a) => { logs.push(a.join(' ')); real.log(...a); };
const created = [], deleted = [];
const fakeCmds = new Map([['recrutamento', { name: 'recrutamento', delete: async () => { deleted.push('recrutamento'); } }]]);
const stub = require('discord.js'); const Base = stub.Client;
stub.Client = class extends Base { constructor(...a) { super(...a); stub.__client = this;
  this.guilds.cache.set('111111111111111111', { id: '111111111111111111', name: 'Teste', commands: { fetch: async () => fakeCmds, create: async c => { created.push(c.name); } } }); } };
require(path.join(root, 'index.js'));
stub.__client._ready = true; stub.__client.emit('ready');
setInterval(() => {}, 1000);                 // mantém vivo para o teste enviar SIGTERM
setTimeout(() => {
  real.log('REPORT ' + JSON.stringify({ falhas: errs.filter(e => /não carregou|ReferenceError|TypeError/.test(e)), erros: errs, criados: [...new Set(created)].sort(), removidos: deleted, logs: logs.length }));
}, 400);

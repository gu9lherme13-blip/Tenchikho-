'use strict';
// =========================================================
// 🏰 Tenchiko • dados por servidor (B2)
//
// Layout em disco (dentro de DATA_DIR):
//   _meta/schema.json                  versão do formato e origem da migração
//   global/<arquivo>.json              dados de USUÁRIO que valem em qualquer servidor (ex.: vínculo Roblox)
//   guilds/<guildId>/<arquivo>.json    dados de UM servidor (config, pontos, xp, tickets...)
//   _legacy/<arquivo>.json             dados antigos sem destino (preservados, nunca apagados)
//
// Esta camada ainda NÃO está ligada ao bot (B4 faz a troca). Serve de base para a migração e para os testes.
// =========================================================
const GUILD_ID_RE = /^\d{15,25}$/;

// formato esperado de cada arquivo (valida a leitura; arquivo com formato errado vai para a quarentena)
const GUILD_FILES = {
  config: 'object', pontos: 'object', xp: 'object', conquistas: 'object', recompensas: 'array', historico: 'object',
  logs: 'array', chamadas: 'object', presenca: 'object', presencaHistorico: 'array', resenhas: 'array', jogatinas: 'array',
  gravacoes: 'array', interacoes: 'object', boasvindas: 'object', tickets: 'object', autorole_panels: 'object'
};
const GLOBAL_FILES = { roblox: 'object' };

const defaultFor = (file, shape) => (file === 'tickets' ? { cfg: {}, abertos: {} } : shape === 'array' ? [] : {});

function createGuildData(store) {
  const cache = new Map(); // caminho -> objeto vivo (mesmo modelo de uso do bot: muta e chama save)

  function rel(scope, guildId, file) {
    if (scope === 'guild') {
      if (!GUILD_ID_RE.test(String(guildId))) throw new Error(`ID de servidor inválido: ${JSON.stringify(guildId)}`);
      if (!(file in GUILD_FILES)) throw new Error(`Arquivo de servidor desconhecido: ${file}`);
      return { path: `guilds/${guildId}/${file}.json`, shape: GUILD_FILES[file], file };
    }
    if (!(file in GLOBAL_FILES)) throw new Error(`Arquivo global desconhecido: ${file}`);
    return { path: `global/${file}.json`, shape: GLOBAL_FILES[file], file };
  }
  function open(r) {
    if (!cache.has(r.path)) cache.set(r.path, store.readSync(r.path, defaultFor(r.file, r.shape), { expect: r.shape }));
    return cache.get(r.path);
  }

  return {
    guildIds: () => store.listDirs('guilds').filter(id => GUILD_ID_RE.test(id)),
    load: (guildId, file) => open(rel('guild', guildId, file)),
    save: (guildId, file) => { const r = rel('guild', guildId, file); return store.save(r.path, open(r)); },
    loadGlobal: file => open(rel('global', null, file)),
    saveGlobal: file => { const r = rel('global', null, file); return store.save(r.path, open(r)); },
    // descarta o objeto em memória (a próxima leitura volta ao disco)
    forget: (guildId, file) => { cache.delete(rel('guild', guildId, file).path); }
  };
}

module.exports = { createGuildData, GUILD_ID_RE, GUILD_FILES, GLOBAL_FILES };

'use strict';
// =========================================================
// 🔁 Tenchiko • migração para dados por servidor (B2) — plan / apply / verify / rollback
//
// Princípios:
//  • Os arquivos antigos (DATA_DIR/*.json) NUNCA são alterados nem apagados por esta ferramenta.
//  • apply = valida tudo → backup com SHA-256 → monta tudo numa pasta temporária (staging) → confere
//    contagens e conteúdo → só então move as pastas para o lugar e grava o marcador _meta/schema.json POR ÚLTIMO.
//    Qualquer falha antes do marcador desfaz o que foi movido; os arquivos antigos continuam intactos.
//  • rollback = move o formato novo para _rolled_back-<data>/ (sem apagar) e, se pedido, restaura os
//    arquivos antigos a partir do backup.
//  • Dados que o código atual não usa ou que não têm servidor identificável vão para _legacy/ (preservados).
// =========================================================
const nodeFs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isDeepStrictEqual } = require('util');
const { createStore } = require('./storage');
const { GUILD_ID_RE } = require('./guilddata');

const TOOL_VERSION = 'b2-1';
const SCHEMA_VERSION = 2;

// formato antigo -> como cada arquivo é tratado
const LEGACY_GUILD = { pontos: 'object', xp: 'object', conquistas: 'object', recompensas: 'array', historico: 'object', logs: 'array',
  config: 'object', presenca: 'object', resenhas: 'array', jogatinas: 'array', gravacoes: 'array', interacoes: 'object' };
const GUILD_KEYED = { chamadas: 'object', boasvindas: 'object', tickets_cfg: 'object', tickets_abertos: 'object', autorole_panels: 'object' };
const SPECIAL = { presencaHistorico: 'array' };
const GLOBAL = { roblox: 'object' };
const ARCHIVE = { avisos: null, codes: null, atividades: null, suportes: null, recrutamentos: null, recrutamento_links: null };
const KNOWN = { ...LEGACY_GUILD, ...GUILD_KEYED, ...SPECIAL, ...GLOBAL, ...ARCHIVE };

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const countOf = v => (Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : v === null ? 0 : 1);
const silent = { log() {}, warn() {}, error() {} };
const stampOf = d => d.toISOString().replace(/[:.]/g, '-');

// ---------- 1) ler e validar os arquivos de origem ----------
function inspectSources(dir, fs = nodeFs) {
  const sources = {}, errors = [];
  for (const [name, expect] of Object.entries(KNOWN)) {
    let buf;
    try { buf = fs.readFileSync(path.join(dir, `${name}.json`)); }
    catch (e) { if (e.code !== 'ENOENT') errors.push({ file: `${name}.json`, code: 'READ_ERROR', error: e.message }); continue; }
    let value;
    try { value = JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, '')); }
    catch (e) { errors.push({ file: `${name}.json`, code: 'INVALID_JSON', error: e.message }); continue; }
    if ((expect === 'array' && !Array.isArray(value)) || (expect === 'object' && !isObj(value))) {
      errors.push({ file: `${name}.json`, code: 'BAD_SHAPE', error: `esperado ${expect}` }); continue;
    }
    sources[name] = { value, bytes: buf.length, sha256: sha256(buf), count: countOf(value) };
  }
  let unmapped = [];
  try { unmapped = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !(f.slice(0, -5) in KNOWN)); } catch (_) { /* ok */ }
  return { sources, errors, unmapped };
}

// ---------- 2) montar o plano (em memória, sem escrever nada) ----------
function buildPlan(sources, { legacyGuildId } = {}) {
  const L = legacyGuildId ? String(legacyGuildId) : null;
  const outputs = new Map(), items = [], warnings = [], errors = [];
  const needLegacy = new Set(), rejects = {};
  const put = (source, dest, value, units) => { outputs.set(dest, value); items.push({ source, dest, units }); };
  const reject = (source, key, value) => { (rejects[source] ||= {})[key] = value; };
  if (L && !GUILD_ID_RE.test(L)) errors.push({ code: 'BAD_LEGACY_GUILD', error: `ID do servidor principal inválido: ${L}` });

  // a) arquivos sem servidor nos registros -> servidor principal (informado pelo administrador)
  for (const f of Object.keys(LEGACY_GUILD)) {
    const s = sources[f]; if (!s) continue;
    if (s.count === 0) { items.push({ source: f, dest: null, units: 0 }); continue; }
    if (!L) { needLegacy.add(f); continue; }
    put(f, `guilds/${L}/${f}.json`, s.value, s.count);
  }
  // b) dados de usuário válidos em qualquer servidor
  if (sources.roblox) { if (sources.roblox.count) put('roblox', 'global/roblox.json', sources.roblox.value, sources.roblox.count); else items.push({ source: 'roblox', dest: null, units: 0 }); }

  // c) arquivos que já têm o servidor como chave/campo
  const callIndex = new Map();
  if (sources.chamadas) for (const [k, v] of Object.entries(sources.chamadas.value)) {
    if (GUILD_ID_RE.test(k) && isObj(v)) { put('chamadas', `guilds/${k}/chamadas.json`, v, 1); if (v.id != null) callIndex.set(String(v.id), k); } else reject('chamadas', k, v);
  }
  if (sources.boasvindas) for (const [k, v] of Object.entries(sources.boasvindas.value)) {
    if (GUILD_ID_RE.test(k) && isObj(v)) put('boasvindas', `guilds/${k}/boasvindas.json`, v, 1); else reject('boasvindas', k, v);
  }
  const tickets = {}; const tk = g => (tickets[g] ||= { cfg: {}, abertos: {} });
  if (sources.tickets_cfg) for (const [k, v] of Object.entries(sources.tickets_cfg.value)) {
    if (GUILD_ID_RE.test(k) && isObj(v)) { tk(k).cfg = v; items.push({ source: 'tickets_cfg', dest: `guilds/${k}/tickets.json`, units: 1 }); } else reject('tickets_cfg', k, v);
  }
  if (sources.tickets_abertos) for (const [ch, v] of Object.entries(sources.tickets_abertos.value)) {
    const g = isObj(v) ? String(v.guildId || '') : '';
    if (GUILD_ID_RE.test(g)) { tk(g).abertos[ch] = v; items.push({ source: 'tickets_abertos', dest: `guilds/${g}/tickets.json`, units: 1 }); } else reject('tickets_abertos', ch, v);
  }
  for (const [g, v] of Object.entries(tickets)) outputs.set(`guilds/${g}/tickets.json`, v);

  const panels = {};
  if (sources.autorole_panels) for (const [pid, v] of Object.entries(sources.autorole_panels.value)) {
    const g = isObj(v) ? String(v.guildId || '') : '';
    if (GUILD_ID_RE.test(g)) { (panels[g] ||= {})[pid] = v; items.push({ source: 'autorole_panels', dest: `guilds/${g}/autorole_panels.json`, units: 1 }); } else reject('autorole_panels', pid, v);
  }
  for (const [g, v] of Object.entries(panels)) outputs.set(`guilds/${g}/autorole_panels.json`, v);

  // d) histórico de presença: tenta descobrir o servidor pelo callId; o resto vai ao servidor principal
  if (sources.presencaHistorico) {
    const byGuild = {}; let inferred = 0, assignedLegacy = 0, unassigned = 0;
    for (const e of sources.presencaHistorico.value) {
      const viaCall = isObj(e) && e.callId != null ? callIndex.get(String(e.callId)) : null;
      const g = viaCall || L;
      if (!g) { unassigned++; continue; }
      if (viaCall) inferred++; else assignedLegacy++;
      (byGuild[g] ||= []).push(e);
    }
    if (unassigned) needLegacy.add('presencaHistorico');
    for (const [g, arr] of Object.entries(byGuild)) put('presencaHistorico', `guilds/${g}/presencaHistorico.json`, arr, arr.length);
    if (inferred) warnings.push(`presencaHistorico: ${inferred} registro(s) associados a um servidor pelo callId; ${assignedLegacy} ao servidor principal.`);
    if (!sources.presencaHistorico.count) items.push({ source: 'presencaHistorico', dest: null, units: 0 });
  }

  // e) arquivos sem uso no código atual / do QG: só preservados
  for (const f of Object.keys(ARCHIVE)) {
    const s = sources[f]; if (!s) continue;
    if (s.count === 0) items.push({ source: f, dest: null, units: 0 }); else put(f, `_legacy/${f}.json`, s.value, s.count);
  }
  // f) registros com chave/servidor inválido: nada é descartado
  for (const [src, obj] of Object.entries(rejects)) {
    put(src, `_legacy/${src}.rejeitados.json`, obj, Object.keys(obj).length);
    warnings.push(`${src}: ${Object.keys(obj).length} registro(s) sem servidor válido foram para _legacy/${src}.rejeitados.json.`);
  }
  if (needLegacy.size) errors.push({ code: 'LEGACY_GUILD_REQUIRED', files: [...needLegacy], error: `Há dados sem servidor identificável (${[...needLegacy].join(', ')}). Informe o ID do servidor principal (--legacy-guild).` });
  return { outputs, items, warnings, errors };
}

function checkCounts(sources, items) {
  const problems = [];
  for (const [name, s] of Object.entries(sources)) {
    const got = items.filter(i => i.source === name).reduce((a, i) => a + i.units, 0);
    if (got !== s.count) problems.push({ source: name, expected: s.count, got });
  }
  return problems;
}

function summarize(sources, plan) {
  const perSource = Object.entries(sources).map(([name, s]) => ({
    arquivo: `${name}.json`, itens: s.count, bytes: s.bytes,
    destinos: [...new Set(plan.items.filter(i => i.source === name && i.dest).map(i => i.dest))]
  }));
  const guilds = [...new Set([...plan.outputs.keys()].map(k => (k.match(/^guilds\/(\d+)\//) || [])[1]).filter(Boolean))].sort();
  return { perSource, guilds, destinations: [...plan.outputs.keys()].sort() };
}

// ---------- plan (somente leitura) ----------
function plan(dir, opts = {}) {
  const fs = opts.fs || nodeFs;
  const ins = inspectSources(path.resolve(dir), fs);
  if (ins.errors.length) return { ok: false, stage: 'validate', errors: ins.errors, unmapped: ins.unmapped };
  const p = buildPlan(ins.sources, opts);
  if (p.errors.length) return { ok: false, stage: 'plan', errors: p.errors, warnings: p.warnings, unmapped: ins.unmapped };
  const problems = checkCounts(ins.sources, p.items);
  if (problems.length) return { ok: false, stage: 'counts', errors: problems.map(x => ({ code: 'COUNT_MISMATCH', ...x })) };
  return { ok: true, ...summarize(ins.sources, p), warnings: p.warnings, unmapped: ins.unmapped, _sources: ins.sources, _plan: p };
}
const publicPlan = r => { const { _sources, _plan, ...rest } = r; return rest; };

function walkJson(dir, fs, base = dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walkJson(p, fs, base, out); else if (d.name.endsWith('.json')) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

// ---------- apply ----------
async function apply(dir, opts = {}) {
  const fs = opts.fs || nodeFs;
  const root = path.resolve(dir);
  const ts = stampOf(opts.now ? opts.now() : new Date());
  for (const d of ['_meta', 'guilds', 'global', '_legacy']) {
    if (fs.existsSync(path.join(root, d))) return { ok: false, stage: 'precheck', errors: [{ code: 'ALREADY_MIGRATED', error: `A pasta ${d}/ já existe em ${root}. Nada foi alterado.` }] };
  }
  const pl = plan(root, { ...opts, fs });
  if (!pl.ok) return pl;
  const { _sources: sources, _plan: p } = pl;
  if (p.outputs.size === 0 && !opts.allowEmpty) {
    return { ok: false, stage: 'precheck', errors: [{ code: 'EMPTY_SOURCES', error: 'Todos os arquivos de origem estão vazios ou ausentes: isso não parece ser a produção. Nada foi alterado. (Use allowEmpty/--allow-empty só se for intencional.)' }] };
  }

  // backup completo (todos os .json da raiz, inclusive os não mapeados) com SHA-256
  const backupRel = `_backups/pre-migration-${ts}`, backupDir = path.join(root, backupRel);
  const manifest = { createdAt: new Date().toISOString(), tool: TOOL_VERSION, legacyGuildId: opts.legacyGuildId || null, files: [] };
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    for (const f of fs.readdirSync(root).filter(x => x.endsWith('.json')).sort()) {
      const src = path.join(root, f), dst = path.join(backupDir, f);
      fs.copyFileSync(src, dst);
      const a = sha256(fs.readFileSync(src)), b = sha256(fs.readFileSync(dst));
      if (a !== b) throw new Error(`cópia de ${f} não confere com o original`);
      manifest.files.push({ file: f, bytes: fs.statSync(src).size, sha256: a, itens: f.slice(0, -5) in sources ? sources[f.slice(0, -5)].count : null });
    }
    fs.writeFileSync(path.join(backupDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
  } catch (e) { return { ok: false, stage: 'backup', errors: [{ code: 'BACKUP_FAILED', error: e.message }] }; }

  // staging
  const staging = path.join(root, `_staging-${ts}`);
  const cleanStaging = () => { try { fs.rmSync(staging, { recursive: true, force: true }); } catch (_) { /* ok */ } };
  try {
    fs.mkdirSync(staging, { recursive: true });
    const st = createStore({ dir: staging, fs, logger: silent, sweep: false });
    for (const [dest, value] of p.outputs) st.save(dest, value).catch(() => {});
    const { errors } = await st.flush();
    if (errors.length) throw new Error(`falha ao gravar no staging: ${errors.map(e => `${e.name}: ${e.error}`).join('; ')}`);
    // confere conteúdo e que não sobrou nem faltou arquivo
    const onDisk = walkJson(staging, fs).sort(), expected = [...p.outputs.keys()].sort();
    if (!isDeepStrictEqual(onDisk, expected)) throw new Error('lista de arquivos do staging difere do plano');
    for (const [dest, value] of p.outputs) {
      const back = JSON.parse(fs.readFileSync(path.join(staging, ...dest.split('/')), 'utf8'));
      if (!isDeepStrictEqual(back, value)) throw new Error(`conteúdo de ${dest} difere do plano após gravar`);
    }
  } catch (e) { cleanStaging(); return { ok: false, stage: 'staging', backupDir, errors: [{ code: 'STAGING_FAILED', error: e.message }] }; }

  // commit: move as pastas e grava o marcador por último
  const moved = [];
  try {
    for (const d of ['guilds', 'global', '_legacy']) {
      if (!fs.existsSync(path.join(staging, d))) continue;
      fs.renameSync(path.join(staging, d), path.join(root, d)); moved.push(d);
    }
    const meta = { schemaVersion: SCHEMA_VERSION, migratedAt: new Date().toISOString(), tool: TOOL_VERSION, legacyGuildId: opts.legacyGuildId || null,
      backup: backupRel, guilds: summarize(sources, p).guilds, sourceCounts: Object.fromEntries(Object.entries(sources).map(([k, s]) => [k, s.count])) };
    const rs = createStore({ dir: root, fs, logger: silent, sweep: false });
    rs.save('_meta/schema.json', meta).catch(() => {});
    const { errors } = await rs.flush();
    if (errors.length) throw new Error(`não consegui gravar o marcador: ${errors[0].error}`);
  } catch (e) {
    for (const d of moved.reverse()) { try { fs.renameSync(path.join(root, d), path.join(staging, d)); } catch (_) { /* fica registrado abaixo */ } }
    try { fs.rmSync(path.join(root, '_meta'), { recursive: true, force: true }); } catch (_) { /* ok */ }
    return { ok: false, stage: 'commit', backupDir, staging, errors: [{ code: 'COMMIT_FAILED', error: e.message, desfeito: moved.length === 0 ? 'nada foi movido' : 'pastas devolvidas ao staging' }] };
  }
  try { fs.rmdirSync(staging); } catch (_) { /* pode conter sobras: não apagar nada além de pasta vazia */ }
  return { ok: true, ...summarize(sources, p), warnings: p.warnings, backupDir, manifest: path.join(backupDir, 'MANIFEST.json') };
}

// ---------- verify: o formato novo ainda bate com os arquivos antigos? ----------
function verify(dir, opts = {}) {
  const fs = opts.fs || nodeFs, root = path.resolve(dir);
  let meta;
  try { meta = JSON.parse(fs.readFileSync(path.join(root, '_meta', 'schema.json'), 'utf8')); } catch (_) { return { ok: false, errors: [{ code: 'NOT_MIGRATED', error: 'Não há _meta/schema.json: o formato novo não está instalado.' }] }; }
  const pl = plan(root, { legacyGuildId: meta.legacyGuildId, fs });
  if (!pl.ok) return pl;
  const diffs = [];
  for (const [dest, value] of pl._plan.outputs) {
    let actual; try { actual = JSON.parse(fs.readFileSync(path.join(root, ...dest.split('/')), 'utf8')); } catch (e) { diffs.push({ dest, problem: 'ausente ou ilegível' }); continue; }
    if (!isDeepStrictEqual(actual, value)) diffs.push({ dest, problem: 'conteúdo diferente dos arquivos antigos' });
  }
  return { ok: diffs.length === 0, diffs, note: 'Diferenças são esperadas se o bot continuou gravando nos arquivos antigos ou no formato novo depois da migração.' };
}

// ---------- rollback ----------
function rollback(dir, opts = {}) {
  const fs = opts.fs || nodeFs, root = path.resolve(dir), ts = stampOf(opts.now ? opts.now() : new Date());
  let meta;
  try { meta = JSON.parse(fs.readFileSync(path.join(root, '_meta', 'schema.json'), 'utf8')); } catch (_) { return { ok: false, errors: [{ code: 'NOT_MIGRATED', error: 'Não há _meta/schema.json: nada a desfazer.' }] }; }
  const backupDir = path.join(root, meta.backup);
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(backupDir, 'MANIFEST.json'), 'utf8')); } catch (e) { return { ok: false, errors: [{ code: 'NO_BACKUP', error: `Manifesto do backup ilegível (${meta.backup}): ${e.message}` }] }; }
  const aside = path.join(root, `_rolled_back-${ts}`);
  const moved = [];
  try {
    fs.mkdirSync(aside, { recursive: true });
    for (const d of ['_meta', 'guilds', 'global', '_legacy']) { // marcador primeiro: o app passa a tratar como "não migrado"
      if (!fs.existsSync(path.join(root, d))) continue;
      fs.renameSync(path.join(root, d), path.join(aside, d)); moved.push(d);
    }
  } catch (e) { return { ok: false, errors: [{ code: 'ROLLBACK_FAILED', error: e.message, movidos: moved, destino: aside }] }; }

  const flat = [];
  for (const f of manifest.files) {
    const cur = path.join(root, f.file); let state;
    try { state = sha256(fs.readFileSync(cur)) === f.sha256 ? 'igual ao backup' : 'diferente do backup'; } catch (_) { state = 'ausente'; }
    flat.push({ file: f.file, state });
  }
  const restored = [];
  if (opts.restoreFlat) {
    fs.mkdirSync(path.join(aside, 'flat-antes-da-restauracao'), { recursive: true });
    for (const f of flat.filter(x => x.state !== 'igual ao backup')) {
      const cur = path.join(root, f.file);
      if (fs.existsSync(cur)) fs.copyFileSync(cur, path.join(aside, 'flat-antes-da-restauracao', f.file));
      fs.copyFileSync(path.join(backupDir, f.file), cur); restored.push(f.file);
    }
  }
  return { ok: true, movidoPara: aside, arquivosAntigos: flat, restaurados: restored };
}

module.exports = { plan, publicPlan, apply, verify, rollback, inspectSources, buildPlan, checkCounts, KNOWN, SCHEMA_VERSION };

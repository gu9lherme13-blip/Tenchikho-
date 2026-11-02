'use strict';
// =========================================================
// 🗄️ Tenchiko • camada de armazenamento JSON segura (B2)
//
//  • Gravação ATÔMICA: escreve num arquivo temporário, fsync e renomeia por cima do destino.
//  • FILA por arquivo: gravações do mesmo arquivo nunca se sobrepõem; várias gravações
//    pendentes são aglutinadas (vale o estado mais recente).
//  • Cópia .bak da última versão VÁLIDA antes de cada substituição.
//  • QUARENTENA: arquivo ilegível/corrompido é copiado byte a byte para _quarantine/ e o
//    original NUNCA é apagado nem sobrescrito silenciosamente:
//      - se existe .bak válido, ele é usado (recuperação);
//      - se não existe, o arquivo fica TRAVADO: leituras devolvem o valor padrão e as
//        gravações são recusadas até alguém resolver (resolveLocked).
//  • Erros explícitos (StorageError com .code) e eventos 'corrupt' / 'write-error'.
//  • Sem dependências externas. Compatível com Node 20 e CommonJS.
// =========================================================
const nodeFs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// só nomes relativos, com segmentos simples e terminando em .json (bloqueia "../", caminhos absolutos etc.)
const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*\.json$/;
const TMP_RE = /\.\d+\.\d+\.tmp$/;
const SWEEP_SUBDIRS = ['guilds', 'global', '_legacy', '_meta'];

class StorageError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    Object.assign(this, extra);
  }
}

function shapeOk(value, expect) {
  if (expect === 'array') return Array.isArray(value);
  if (expect === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return true;
}
function parseJson(raw, expect) {
  try {
    const value = JSON.parse(String(raw).replace(/^\uFEFF/, ''));
    return shapeOk(value, expect) ? { ok: true, value } : { ok: false, reason: 'formato inesperado (esperado ' + expect + ')' };
  } catch (e) { return { ok: false, reason: e.message }; }
}

function createStore(options = {}) {
  if (!options.dir) throw new Error('storage: a opção "dir" é obrigatória');
  const fs = options.fs || nodeFs;
  const log = options.logger || console;
  const root = path.resolve(options.dir);
  const events = new EventEmitter();
  const states = new Map();
  let seq = 0;

  const state = name => {
    let s = states.get(name);
    if (!s) {
      s = { name, locked: false, lockReason: null, corrupt: false, overwriteAllowed: false, quarantinePath: null,
        recoveredFromBackup: false, lastWriteAt: null, lastError: null, writes: 0, pending: null, waiters: [], running: false, drainPromise: null };
      states.set(name, s);
    }
    return s;
  };

  function resolveName(name) {
    if (typeof name !== 'string' || !NAME_RE.test(name)) throw new StorageError('BAD_NAME', `Nome de arquivo inválido: ${JSON.stringify(name)}`);
    const full = path.join(root, ...name.split('/'));
    if (!full.startsWith(root + path.sep)) throw new StorageError('BAD_NAME', `Nome fora do diretório de dados: ${name}`);
    return full;
  }

  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
  const quarantinePathFor = name => path.join(root, '_quarantine', `${name.replace(/\//g, '__')}.${stamp()}.${++seq}.corrupt`);

  // ---------- leitura (usada na inicialização) ----------
  function readSync(name, fallback, o = {}) {
    const full = resolveName(name), st = state(name);
    let raw;
    try { raw = fs.readFileSync(full, 'utf8'); }
    catch (e) {
      if (e.code === 'ENOENT') return fallback;
      st.locked = true; st.lockReason = 'READ_ERROR'; st.lastError = e.message;
      log.error(`❌ [storage] Não consegui ler ${name}: ${e.message}. As gravações neste arquivo ficam BLOQUEADAS.`);
      events.emit('corrupt', { name, reason: 'READ_ERROR', locked: true, recovered: false, error: e.message });
      return fallback;
    }
    const p = parseJson(raw, o.expect);
    if (p.ok) {
      if (st.locked && (st.lockReason === 'READ_ERROR' || st.lockReason === 'CORRUPT_NO_BACKUP' || st.lockReason === 'TARGET_CORRUPT')) { st.locked = false; st.lockReason = null; }
      st.corrupt = false;
      return p.value;
    }
    // ---- corrompido: preserva o original byte a byte e tenta o .bak ----
    st.corrupt = true;
    let q;
    try {
      fs.mkdirSync(path.join(root, '_quarantine'), { recursive: true });
      q = quarantinePathFor(name);
      fs.copyFileSync(full, q, nodeFs.constants.COPYFILE_EXCL);
      st.quarantinePath = q;
    } catch (e) {
      st.locked = true; st.lockReason = 'QUARANTINE_FAILED'; st.lastError = e.message;
      log.error(`❌ [storage] ${name} está corrompido e não consegui copiá-lo para a quarentena (${e.message}). Arquivo TRAVADO; o original não foi alterado.`);
      events.emit('corrupt', { name, reason: 'QUARANTINE_FAILED', locked: true, recovered: false, error: e.message });
      return fallback;
    }
    let bak = { ok: false };
    try { bak = parseJson(fs.readFileSync(full + '.bak', 'utf8'), o.expect); } catch (_) { /* sem .bak */ }
    if (bak.ok) {
      st.recoveredFromBackup = true; st.overwriteAllowed = true;
      log.warn(`⚠️ [storage] ${name} estava corrompido (${p.reason}). Usando a cópia .bak. Original preservado em ${q}.`);
      events.emit('corrupt', { name, reason: p.reason, quarantinePath: q, locked: false, recovered: true });
      return bak.value;
    }
    st.locked = true; st.lockReason = 'CORRUPT_NO_BACKUP';
    log.error(`❌ [storage] ${name} está corrompido (${p.reason}) e não há .bak válido. Original preservado em ${q}. Gravações BLOQUEADAS até resolver.`);
    events.emit('corrupt', { name, reason: p.reason, quarantinePath: q, locked: true, recovered: false });
    return fallback;
  }

  // ---------- escrita ----------
  async function writeSideFile(dest, content) {
    const tmp = `${dest}.${process.pid}.${++seq}.tmp`;
    let fh = null;
    try {
      fh = await fs.promises.open(tmp, 'wx');
      await fh.writeFile(content, 'utf8');
      await fh.sync();
      await fh.close(); fh = null;
      await fs.promises.rename(tmp, dest);
    } catch (e) {
      try { if (fh) await fh.close(); } catch (_) { /* ok */ }
      try { await fs.promises.unlink(tmp); } catch (_) { /* ok */ }
      throw e;
    }
  }

  async function writeAtomic(name, full, st, str) {
    const dir = path.dirname(full);
    try { await fs.promises.mkdir(dir, { recursive: true }); }
    catch (e) { throw new StorageError('WRITE_FAILED', `Não consegui criar a pasta de ${name}: ${e.message}`, { cause: e }); }

    let current = null;
    try { current = await fs.promises.readFile(full, 'utf8'); }
    catch (e) { if (e.code !== 'ENOENT') throw new StorageError('READ_TARGET', `Não consegui ler ${name} antes de gravar: ${e.message}`, { cause: e }); }

    if (current !== null) {
      if (parseJson(current).ok) {
        try { await writeSideFile(full + '.bak', current); }
        catch (e) { throw new StorageError('BACKUP_FAILED', `Não consegui criar o .bak de ${name}: ${e.message}`, { cause: e }); }
      } else if (st.overwriteAllowed && st.quarantinePath) {
        // original corrompido já está na quarentena; não toca no .bak (que guarda a última versão boa)
      } else {
        // alvo corrompido por fora (depois da leitura): preserva e trava
        let q = null;
        try { await fs.promises.mkdir(path.join(root, '_quarantine'), { recursive: true }); q = quarantinePathFor(name); await fs.promises.copyFile(full, q, nodeFs.constants.COPYFILE_EXCL); st.quarantinePath = q; } catch (_) { /* ok */ }
        st.locked = true; st.lockReason = 'TARGET_CORRUPT';
        log.error(`❌ [storage] ${name} foi alterado/corrompido fora do bot. Gravação recusada; cópia em ${q || '(falhou)'}.`);
        events.emit('corrupt', { name, reason: 'TARGET_CORRUPT', quarantinePath: q, locked: true, recovered: false });
        throw new StorageError('TARGET_CORRUPT', `O arquivo ${name} no disco está corrompido; gravação recusada para não sobrescrever o original.`, { quarantinePath: q });
      }
    }

    const tmp = `${full}.${process.pid}.${++seq}.tmp`;
    let fh = null;
    try {
      fh = await fs.promises.open(tmp, 'wx');
      await fh.writeFile(str, 'utf8');
      await fh.sync();
      await fh.close(); fh = null;
      await fs.promises.rename(tmp, full);
    } catch (e) {
      try { if (fh) await fh.close(); } catch (_) { /* ok */ }
      try { await fs.promises.unlink(tmp); } catch (_) { /* ok */ }
      throw new StorageError('WRITE_FAILED', `Falha ao gravar ${name}: ${e.message}`, { cause: e });
    }
    try { const dh = await fs.promises.open(dir, 'r'); try { await dh.sync(); } finally { await dh.close(); } } catch (_) { /* fsync de pasta não existe em todo sistema */ }
    st.overwriteAllowed = false; st.recoveredFromBackup = false;
    st.lastWriteAt = Date.now(); st.lastError = null; st.writes++;
  }

  async function drain(name, full, st) {
    st.running = true;
    try {
      while (st.pending !== null) {
        const str = st.pending; st.pending = null;
        const waiters = st.waiters; st.waiters = [];
        try {
          await writeAtomic(name, full, st, str);
          for (const w of waiters) w.resolve({ name, bytes: Buffer.byteLength(str) });
        } catch (err) {
          const e = err instanceof StorageError ? err : new StorageError('WRITE_FAILED', `Falha ao gravar ${name}: ${err.message}`, { cause: err });
          st.lastError = `${e.code}: ${e.message}`;
          events.emit('write-error', { name, error: e });
          for (const w of waiters) w.reject(e);
        }
      }
    } finally { st.running = false; st.drainPromise = null; }
  }

  function save(name, value) {
    let full, st;
    try { full = resolveName(name); st = state(name); } catch (e) { return Promise.reject(e); }
    if (st.locked) return Promise.reject(new StorageError('LOCKED', `${name} está travado (${st.lockReason}). Resolva o arquivo antes de gravar.`, { reason: st.lockReason, quarantinePath: st.quarantinePath }));
    let str;
    try { str = JSON.stringify(value, null, 2); }
    catch (e) { return Promise.reject(new StorageError('SERIALIZE', `Não consegui serializar ${name}: ${e.message}`, { cause: e })); }
    if (typeof str !== 'string') return Promise.reject(new StorageError('SERIALIZE', `Valor não serializável para ${name}`));
    return new Promise((resolve, reject) => {
      st.pending = str;                 // aglutina: vale sempre o estado mais recente
      st.waiters.push({ resolve, reject });
      if (!st.running) st.drainPromise = drain(name, full, st);
    });
  }

  async function flush() {
    for (;;) {
      const ps = [...states.values()].map(s => s.drainPromise).filter(Boolean);
      if (!ps.length) break;
      await Promise.all(ps.map(p => p.catch(() => {})));
    }
    return { errors: [...states.values()].filter(s => s.lastError).map(s => ({ name: s.name, error: s.lastError })) };
  }

  function resolveLocked(name, action) {
    resolveName(name);
    const st = state(name);
    if (!st.locked) return { changed: false };
    if (st.lockReason !== 'CORRUPT_NO_BACKUP' && st.lockReason !== 'TARGET_CORRUPT') throw new StorageError('NOT_RESOLVABLE', `O bloqueio ${st.lockReason} não pode ser resolvido por esta via.`);
    if (!st.quarantinePath || !fs.existsSync(st.quarantinePath)) throw new StorageError('NO_QUARANTINE', 'Não há cópia do original na quarentena; não vou liberar a gravação.');
    if (action !== 'accept-fallback') throw new StorageError('BAD_ACTION', `Ação desconhecida: ${action}`);
    st.locked = false; st.lockReason = null; st.overwriteAllowed = true;
    log.warn(`⚠️ [storage] ${name} liberado: a próxima gravação substitui o arquivo corrompido (original em ${st.quarantinePath}).`);
    return { changed: true, action, quarantinePath: st.quarantinePath };
  }

  function status() {
    return [...states.values()].map(s => ({ name: s.name, locked: s.locked, lockReason: s.lockReason, corrupt: s.corrupt,
      recoveredFromBackup: s.recoveredFromBackup, quarantinePath: s.quarantinePath, lastWriteAt: s.lastWriteAt, lastError: s.lastError,
      writes: s.writes, pending: s.pending !== null, running: s.running }));
  }

  // restos de gravações interrompidas (queda/SIGKILL). Não percorre node_modules etc.: só a raiz e as pastas de dados.
  function sweepTemp(minAgeMs = 60000) {
    const removed = [];
    const scan = (dir, recurse) => {
      let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const d of entries) {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) { if (recurse) scan(p, true); continue; }
        if (!TMP_RE.test(d.name)) continue;
        try { if (Date.now() - fs.statSync(p).mtimeMs >= minAgeMs) { fs.unlinkSync(p); removed.push(p); } } catch (_) { /* ok */ }
      }
    };
    scan(root, false);
    for (const sub of SWEEP_SUBDIRS) scan(path.join(root, sub), true);
    return removed;
  }

  function listDirs(sub) {
    if (typeof sub !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(sub)) throw new StorageError('BAD_NAME', 'Pasta inválida');
    try { return fs.readdirSync(path.join(root, sub), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort(); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }

  if (options.sweep !== false) { try { sweepTemp(options.sweepMinAgeMs ?? 60000); } catch (_) { /* ok */ } }

  return { root, events, readSync, save, flush, status, resolveLocked, sweepTemp, listDirs, StorageError };
}

module.exports = { createStore, StorageError, NAME_RE };

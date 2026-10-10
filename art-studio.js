'use strict';
// =========================================================
// 🎨 NVB ART STUDIO — editor de desenho (Canvas 2D + Pointer Events)
// Depende de art-core.js. Projetos ficam salvos NESTE dispositivo (IndexedDB).
// =========================================================
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const C = window.NVBArtCore;
  if (!C) { console.error('NVB Art Studio: art-core.js não foi carregado.'); return; }

  // ---------- utilidades de DOM ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v; else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v === true) el.setAttribute(k, ''); else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
    return el;
  }
  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  const ctxOf = c => c.getContext('2d');
  const blobOf = (canvas, type = 'image/png', q) => new Promise(res => canvas.toBlob(res, type, q));
  const loadImg = blob => new Promise((res, rej) => { const url = URL.createObjectURL(blob), im = new Image(); im.onload = () => { URL.revokeObjectURL(url); res(im); }; im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Não foi possível ler a imagem.')); }; im.src = url; });

  // ---------- estado ----------
  const TOOLS = [
    ['hand', '✋', 'Mão'], ['brush', '🖌️', 'Pincel'], ['pencil', '✏️', 'Lápis'], ['eraser', '🧽', 'Borracha'], ['fill', '🪣', 'Balde'], ['picker', '💧', 'Conta-gotas'],
    ['line', '╱', 'Linha'], ['rect', '▭', 'Retângulo'], ['square', '◻️', 'Quadrado'], ['circle', '◯', 'Círculo'], ['ellipse', '⬭', 'Elipse'],
    ['select', '⬚', 'Seleção'], ['move', '✥', 'Mover'], ['text', '🔤', 'Texto']
  ];
  const BRUSHES = [['basic', 'Básico'], ['pencil', 'Lápis'], ['marker', 'Marcador'], ['soft', 'Suave']];
  const PALETTE = ['#000000', '#3b3b4f', '#7a7a8c', '#bdbdc9', '#ffffff', '#4c1d95', '#6d28d9', '#8b5cf6', '#a78bfa', '#ddd6fe', '#1e3a8a', '#2563eb', '#4ea8ff', '#93c5fd', '#0f766e',
    '#10b981', '#50d890', '#bbf7d0', '#7f1d1d', '#dc2626', '#ff5577', '#f97316', '#facc15', '#fde68a', '#78350f', '#a16207', '#f9a8d4', '#ec4899', '#831843', '#d4a373'];
  const S = {
    tool: 'brush', brush: 'basic', color: '#8b5cf6', alpha: 1, size: 14, hardness: 0.8, smooth: 0.3, pressure: true, symmetry: false, fillShape: false, tol: 32,
    textSize: 48, textFont: 'sans-serif', textBold: false, recent: [], favs: [], lastPaintTool: 'brush'
  };
  let doc = null, V = { z: 1, x: 0, y: 0 }, history = new C.History(), dirty = false, saveState = 'idle', savedAt = null, project = { id: null, name: 'Sem título', createdAt: null };
  let sel = null, float = null, strokeCanvas = null, strokeCtx = null, raf = 0, mounted = false, spaceDown = false, autosaveTimer = 0, saving = false;
  const ST = { active: false, kind: null }; // traço em andamento
  const pointers = new Map(); let gesture = null, mode = null, panLast = null, ignoreUntilUp = false;
  let R = {}; // referências da interface
  let dpr = 1, checker = null;
  const tipCache = new Map();

  const prefsKey = 'nvb_art_prefs', lastKey = 'nvb_art_last';
  function loadPrefs() { try { Object.assign(S, JSON.parse(localStorage.getItem(prefsKey) || '{}')); } catch (e) { /* sem preferências */ } }
  function savePrefs() { try { const { color, alpha, size, hardness, smooth, pressure, symmetry, fillShape, tol, textSize, textFont, textBold, recent, favs, brush } = S; localStorage.setItem(prefsKey, JSON.stringify({ color, alpha, size, hardness, smooth, pressure, symmetry, fillShape, tol, textSize, textFont, textBold, recent, favs, brush })); } catch (e) { /* armazenamento cheio/bloqueado */ } }

  // ---------- documento e camadas ----------
  function makeLayer(name, w, h) { const canvas = makeCanvas(w, h); return { id: uid(), name, visible: true, opacity: 1, locked: false, canvas, ctx: ctxOf(canvas) }; }
  const activeLayer = () => doc && doc.layers.find(l => l.id === doc.active);
  const layerById = id => doc && doc.layers.find(l => l.id === id);
  function newDoc(w, h, bg, transparent, name) {
    commitFloat();
    doc = { w, h, bg: C.normHex(bg, '#ffffff'), transparent: !!transparent, layers: [], active: null };
    const l = makeLayer('Camada 1', w, h); doc.layers.push(l); doc.active = l.id;
    strokeCanvas = makeCanvas(w, h); strokeCtx = ctxOf(strokeCanvas);
    history.clear(); sel = null; float = null; project = { id: null, name: name || 'Sem título', createdAt: null };
    dirty = false; clearTimeout(autosaveTimer); setSaveState('idle'); fitView(); refreshAll();
  }
  function fitView() { if (!doc || !R.stage) return; V = C.fitView(doc.w, doc.h, R.vw || 360, R.vh || 600, 12); render(); updateZoomLabel(); }

  // ---------- histórico ----------
  const pushH = e => { history.push(e); updateUndoButtons(); };
  function updateUndoButtons() { if (R.undo) { R.undo.disabled = !history.canUndo(); R.redo.disabled = !history.canRedo(); } }
  function patchEntry(layer, box, before, after) {
    const w = box.x1 - box.x0, hh = box.y1 - box.y0;
    return { bytes: w * hh * 8, undo: () => { layer.ctx.putImageData(before, box.x0, box.y0); }, redo: () => { layer.ctx.putImageData(after, box.x0, box.y0); } };
  }
  function doUndo() { commitFloat(); if (history.undo()) { afterHistory(); } }
  function doRedo() { commitFloat(); if (history.redo()) { afterHistory(); } }
  function afterHistory() { markDirty(); updateUndoButtons(); refreshLayers(); render(); }

  // ---------- renderização ----------
  function scheduleRender() { if (!raf) raf = requestAnimationFrame(render); }
  function checkerPattern(c) {
    if (checker && checker.dpr === dpr) return checker.p;
    const s = Math.max(2, Math.round(8 * dpr)), t = makeCanvas(s * 2, s * 2), x = ctxOf(t);
    x.fillStyle = '#e5e5ea'; x.fillRect(0, 0, s * 2, s * 2); x.fillStyle = '#c4c4cc'; x.fillRect(0, 0, s, s); x.fillRect(s, s, s, s);
    checker = { dpr, p: c.createPattern(t, 'repeat') }; return checker.p;
  }
  function render() {
    raf = 0; if (!R.view || !doc) return;
    const c = R.vctx, W = R.view.width, H = R.view.height;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0b0712'; c.fillRect(0, 0, W, H);
    // fundo
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.beginPath(); c.rect(V.x * dpr, V.y * dpr, doc.w * V.z * dpr, doc.h * V.z * dpr); c.clip();
    if (doc.transparent) { c.fillStyle = checkerPattern(c); c.fillRect(V.x * dpr, V.y * dpr, doc.w * V.z * dpr, doc.h * V.z * dpr); } else { c.fillStyle = doc.bg; c.fillRect(V.x * dpr, V.y * dpr, doc.w * V.z * dpr, doc.h * V.z * dpr); }
    c.restore();
    c.setTransform(dpr * V.z, 0, 0, dpr * V.z, dpr * V.x, dpr * V.y);
    c.imageSmoothingEnabled = V.z < 3; c.imageSmoothingQuality = 'high';
    for (const L of doc.layers) {
      if (!L.visible) continue;
      c.globalAlpha = L.opacity; c.drawImage(L.canvas, 0, 0);
      if (L.id === doc.active) {
        if (ST.active && (ST.kind === 'paint' || ST.kind === 'shape') && ST.box) { c.globalAlpha = L.opacity * S.alpha; c.drawImage(strokeCanvas, 0, 0); }
        if (float && float.layerId === L.id) { c.globalAlpha = L.opacity; c.drawImage(float.canvas, float.x, float.y, float.canvas.width * float.s, float.canvas.height * float.s); }
      }
    }
    c.globalAlpha = 1;
    // contorno do desenho
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.strokeStyle = '#39204d'; c.lineWidth = 1; c.strokeRect(V.x - 0.5, V.y - 0.5, doc.w * V.z + 1, doc.h * V.z + 1);
    // seleção / flutuante
    const box = float ? { x: float.x, y: float.y, w: float.canvas.width * float.s, h: float.canvas.height * float.s } : sel;
    if (box) { c.setLineDash([6, 4]); c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.strokeRect(V.x + box.x * V.z, V.y + box.y * V.z, box.w * V.z, box.h * V.z); c.strokeStyle = '#8b5cf6'; c.lineDashOffset = 5; c.strokeRect(V.x + box.x * V.z, V.y + box.y * V.z, box.w * V.z, box.h * V.z); c.setLineDash([]); c.lineDashOffset = 0; }
  }
  function sizeCanvas() {
    if (!R.stage) return; const r = R.stage.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; R.vw = r.width; R.vh = r.height;
    R.view.width = Math.max(1, Math.round(r.width * dpr)); R.view.height = Math.max(1, Math.round(r.height * dpr)); checker = null;
    render();
  }
  const toDoc = (cx, cy) => { const r = R.view.getBoundingClientRect(); return { x: (cx - r.left - V.x) / V.z, y: (cy - r.top - V.y) / V.z }; };

  // ---------- pincéis (carimbos) ----------
  function tip(type, size, color, hardness, variant = 0) {
    const d = Math.max(1, Math.round(size * 2) / 2), key = `${type}|${d}|${color}|${hardness.toFixed(2)}|${variant}`;
    if (tipCache.has(key)) return tipCache.get(key);
    const dim = Math.max(2, Math.ceil(d) + 2), t = makeCanvas(dim, dim), x = ctxOf(t), cx = dim / 2, r = d / 2, rgb = C.hexToRgb(color);
    if (type === 'pencil') {
      const img = x.createImageData(dim, dim);
      for (let py = 0; py < dim; py++) for (let px = 0; px < dim; px++) {
        const dist = Math.hypot(px + 0.5 - cx, py + 0.5 - cx); if (dist > r) continue;
        const edge = Math.min(1, (r - dist) + 0.3), grain = 0.45 + Math.random() * 0.55, i = (py * dim + px) * 4;
        img.data[i] = rgb.r; img.data[i + 1] = rgb.g; img.data[i + 2] = rgb.b; img.data[i + 3] = Math.round(255 * edge * grain);
      }
      x.putImageData(img, 0, 0);
    } else if (type === 'marker') {
      x.translate(cx, cx); x.rotate(-Math.PI / 4); x.fillStyle = color; x.beginPath(); x.ellipse(0, 0, r, Math.max(0.5, r * 0.55), 0, 0, Math.PI * 2); x.fill();
    } else {
      const hd = type === 'soft' ? Math.min(hardness, 0.25) : hardness;
      if (hd >= 0.97) { x.fillStyle = color; x.beginPath(); x.arc(cx, cx, r, 0, Math.PI * 2); x.fill(); }
      else { const g = x.createRadialGradient(cx, cx, r * hd, cx, cx, r); g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`); g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`); x.fillStyle = g; x.beginPath(); x.arc(cx, cx, r, 0, Math.PI * 2); x.fill(); }
    }
    if (tipCache.size > 120) tipCache.delete(tipCache.keys().next().value);
    tipCache.set(key, t); return t;
  }
  const brushType = () => S.tool === 'pencil' ? 'pencil' : S.brush;
  function stampAt(ctx, x, y, size, erase) {
    const type = brushType(), pencil = type === 'pencil' && !erase, t = tip(type, size, erase ? '#000000' : S.color, S.hardness, pencil ? (Math.random() * 6) | 0 : 0), dim = t.width;
    if (pencil) { ctx.save(); ctx.globalAlpha = 0.32; }
    ctx.drawImage(t, x - dim / 2, y - dim / 2);
    if (S.symmetry) ctx.drawImage(t, doc.w - x - dim / 2, y - dim / 2);
    if (pencil) ctx.restore();
    const pad = dim + 2, bx = { x0: x - pad, y0: y - pad, x1: x + pad, y1: y + pad }, bs = { x0: doc.w - x - pad, y0: y - pad, x1: doc.w - x + pad, y1: y + pad };
    ST.box = C.unionBox(ST.box, S.symmetry ? C.unionBox(bx, bs) : bx);
  }
  const sizeFor = pr => S.size * (S.pressure && ST.pen ? 0.25 + 0.75 * pr : 1);
  const spacing = size => Math.max(0.5, size * (brushType() === 'pencil' ? 0.12 : 0.1));

  // ---------- traços ----------
  function toolDown(e) {
    const p = toDoc(e.clientX, e.clientY), t = S.tool; ST.pen = e.pointerType === 'pen'; ST.pr = ST.pen ? (e.pressure || 0.5) : 1;
    if (t !== 'move' && t !== 'select' && float) commitFloat();
    if (t === 'picker') { pickColor(p); ST.active = true; ST.kind = 'picker'; return; }
    if (t === 'select') { if (float) commitFloat(); ST.active = true; ST.kind = 'select'; ST.start = p; sel = null; render(); return; }
    if (t === 'move') {
      if (!float && !liftFloat(true)) return;
      ST.active = true; ST.kind = 'move'; ST.start = p; ST.fx = float.x; ST.fy = float.y; return;
    }
    const L = activeLayer();
    if (!L) return;
    if (L.locked) return toast('🔒 A camada está bloqueada.');
    if (!L.visible) return toast('👁️ A camada está oculta.');
    if (t === 'fill') return doFill(L, p);
    if (t === 'text') { ST.active = true; ST.kind = 'text'; ST.start = p; return; }
    ST.layer = L; ST.box = null; ST.last = p; ST.sm = p; ST.carry = 0;
    if (t === 'brush' || t === 'pencil') {
      ST.active = true; ST.kind = 'paint'; clearStroke(); const s = sizeFor(ST.pr); stampAt(strokeCtx, p.x, p.y, s, false); scheduleRender();
    } else if (t === 'eraser') {
      ST.active = true; ST.kind = 'erase'; ST.snap = makeCanvas(doc.w, doc.h); ctxOf(ST.snap).drawImage(L.canvas, 0, 0);
      L.ctx.save(); L.ctx.globalCompositeOperation = 'destination-out'; L.ctx.globalAlpha = S.alpha; stampAt(L.ctx, p.x, p.y, sizeFor(ST.pr), true); L.ctx.restore(); scheduleRender();
    } else { ST.active = true; ST.kind = 'shape'; ST.start = p; clearStroke(); }
  }
  function toolMove(e) {
    if (!ST.active) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null, list = evs && evs.length ? evs : [e];
    for (const ev of list) { ST.pr = ST.pen ? (ev.pressure || ST.pr) : 1; stepTo(toDoc(ev.clientX, ev.clientY)); }
  }
  function stepTo(p) {
    const k = ST.kind;
    if (k === 'picker') return pickColor(p);
    if (k === 'select') { const x0 = Math.round(Math.min(ST.start.x, p.x)), y0 = Math.round(Math.min(ST.start.y, p.y)), x1 = Math.round(Math.max(ST.start.x, p.x)), y1 = Math.round(Math.max(ST.start.y, p.y)); const b = C.clipBox({ x0, y0, x1, y1 }, doc.w, doc.h); sel = b ? { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 } : null; return scheduleRender(); }
    if (k === 'move') { float.x = Math.round(ST.fx + (p.x - ST.start.x)); float.y = Math.round(ST.fy + (p.y - ST.start.y)); return scheduleRender(); }
    if (k === 'paint' || k === 'erase') {
      ST.sm = C.smoothPoint(ST.sm, p, S.smooth);
      const ctx = k === 'paint' ? strokeCtx : ST.layer.ctx, s = sizeFor(ST.pr), sp = C.stampPoints(ST.last.x, ST.last.y, ST.sm.x, ST.sm.y, spacing(s), ST.carry);
      ST.carry = sp.carry;
      if (k === 'erase') { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = S.alpha; }
      for (const q of sp.pts) stampAt(ctx, q.x, q.y, s, k === 'erase');
      if (k === 'erase') ctx.restore();
      ST.last = { x: ST.sm.x, y: ST.sm.y }; return scheduleRender();
    }
    if (k === 'shape') { drawShape(ST.start, p); return scheduleRender(); }
  }
  function toolUp(e) {
    if (!ST.active) return; const p = toDoc(e.clientX, e.clientY), k = ST.kind; ST.active = false;
    if (k === 'picker' || k === 'move') { return scheduleRender(); }
    if (k === 'select') { if (!sel || sel.w < 2 || sel.h < 2) sel = null; return render(); }
    if (k === 'text') { if (Math.hypot(p.x - ST.start.x, p.y - ST.start.y) < 6) askText(ST.start); return; }
    if (k === 'paint' || k === 'shape') {
      if (k === 'paint') { ST.sm = p; const s = sizeFor(ST.pr); const sp = C.stampPoints(ST.last.x, ST.last.y, p.x, p.y, spacing(s), ST.carry); for (const q of sp.pts) stampAt(strokeCtx, q.x, q.y, s, false); }
      if (k === 'shape') drawShape(ST.start, p);
      commitStroke(); return;
    }
    if (k === 'erase') { commitErase(); }
  }
  function cancelStroke() {
    if (!ST.active) return; const k = ST.kind; ST.active = false;
    if ((k === 'paint' || k === 'shape')) { clearStroke(); ST.box = null; }
    if (k === 'erase' && ST.snap && ST.layer) { ST.layer.ctx.clearRect(0, 0, doc.w, doc.h); ST.layer.ctx.drawImage(ST.snap, 0, 0); ST.snap = null; }
    if (k === 'move' && float) { float.x = ST.fx; float.y = ST.fy; }
    render();
  }
  function clearStroke() { if (!strokeCtx) return; const b = ST.box && C.clipBox(ST.box, doc.w, doc.h); if (b) strokeCtx.clearRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); else if (!ST.box) strokeCtx.clearRect(0, 0, doc.w, doc.h); ST.box = null; }
  function commitStroke() {
    const L = ST.layer, b = ST.box && C.clipBox(ST.box, doc.w, doc.h);
    if (!L || !b) { clearStroke(); return render(); }
    const w = b.x1 - b.x0, hh = b.y1 - b.y0, before = L.ctx.getImageData(b.x0, b.y0, w, hh);
    L.ctx.save(); L.ctx.globalAlpha = S.alpha; L.ctx.drawImage(strokeCanvas, b.x0, b.y0, w, hh, b.x0, b.y0, w, hh); L.ctx.restore();
    const after = L.ctx.getImageData(b.x0, b.y0, w, hh); strokeCtx.clearRect(b.x0, b.y0, w, hh); ST.box = null;
    pushH(patchEntry(L, b, before, after)); markDirty(); render(); thumbSoon(); pushRecent();
  }
  function commitErase() {
    const L = ST.layer, snap = ST.snap, b = ST.box && C.clipBox(ST.box, doc.w, doc.h); ST.snap = null; ST.box = null;
    if (!L || !snap || !b) return render();
    const w = b.x1 - b.x0, hh = b.y1 - b.y0, before = ctxOf(snap).getImageData(b.x0, b.y0, w, hh), after = L.ctx.getImageData(b.x0, b.y0, w, hh);
    pushH(patchEntry(L, b, before, after)); markDirty(); render(); thumbSoon();
  }
  function drawShape(a, b) {
    clearStroke(); const x = strokeCtx, t = S.tool; x.save(); x.lineWidth = S.size; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = S.color; x.fillStyle = S.color;
    const draw = (ax, ay, bx, by) => {
      x.beginPath();
      if (t === 'line') { x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke(); return; }
      let w = bx - ax, hh = by - ay;
      if (t === 'square') { const m = Math.min(Math.abs(w), Math.abs(hh)); w = Math.sign(w || 1) * m; hh = Math.sign(hh || 1) * m; }
      if (t === 'rect' || t === 'square') { x.rect(ax, ay, w, hh); }
      else if (t === 'circle') { x.arc(ax, ay, Math.hypot(bx - ax, by - ay), 0, Math.PI * 2); }
      else { x.ellipse(ax + w / 2, ay + hh / 2, Math.max(0.5, Math.abs(w) / 2), Math.max(0.5, Math.abs(hh) / 2), 0, 0, Math.PI * 2); }
      if (S.fillShape) x.fill(); x.stroke();
    };
    draw(a.x, a.y, b.x, b.y); if (S.symmetry) draw(doc.w - a.x, a.y, doc.w - b.x, b.y); x.restore();
    const r = t === 'circle' ? Math.hypot(b.x - a.x, b.y - a.y) : 0, pad = S.size + 4;
    let box = t === 'circle' ? { x0: a.x - r, y0: a.y - r, x1: a.x + r, y1: a.y + r } : { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
    if (t === 'square') { const m = Math.min(Math.abs(b.x - a.x), Math.abs(b.y - a.y)); box = { x0: Math.min(a.x, a.x + Math.sign(b.x - a.x || 1) * m), y0: Math.min(a.y, a.y + Math.sign(b.y - a.y || 1) * m), x1: Math.max(a.x, a.x + Math.sign(b.x - a.x || 1) * m), y1: Math.max(a.y, a.y + Math.sign(b.y - a.y || 1) * m) }; }
    box = { x0: box.x0 - pad, y0: box.y0 - pad, x1: box.x1 + pad, y1: box.y1 + pad };
    if (S.symmetry) box = C.unionBox(box, { x0: doc.w - box.x1, y0: box.y0, x1: doc.w - box.x0, y1: box.y1 });
    ST.box = box; ST.kind = 'shape';
  }
  // balde de tinta (na camada ativa)
  function doFill(L, p) {
    const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) return;
    const img = L.ctx.getImageData(0, 0, doc.w, doc.h), r = C.fillRegion(img.data, doc.w, doc.h, x, y, S.tol);
    if (!r) return; const b = r.box, w = b.x1 - b.x0, hh = b.y1 - b.y0;
    const before = L.ctx.getImageData(b.x0, b.y0, w, hh);
    if (!C.applyFill(img.data, r.mask, doc.w, b, C.hexToRgb(S.color), S.alpha)) return;
    L.ctx.putImageData(img, 0, 0);
    const after = L.ctx.getImageData(b.x0, b.y0, w, hh); pushH(patchEntry(L, b, before, after)); markDirty(); pushRecent(); render(); thumbSoon();
  }
  function pickColor(p) {
    const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) return;
    const px = doc.layers.filter(l => l.visible).map(l => { const d = l.ctx.getImageData(x, y, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3], opacity: l.opacity }; });
    const out = C.blendPixels(px, doc.transparent ? null : C.hexToRgb(doc.bg));
    if (out.a > 0) setColor(C.rgbToHex(out.r, out.g, out.b), false);
  }

  // ---------- seleção / mover / imagens flutuantes ----------
  function liftFloat(cut) {
    const L = activeLayer(); if (!L) return false;
    if (L.locked) { toast('🔒 A camada está bloqueada.'); return false; } if (!L.visible) { toast('👁️ A camada está oculta.'); return false; }
    const r = sel ? { ...sel } : { x: 0, y: 0, w: doc.w, h: doc.h }, fc = makeCanvas(r.w, r.h);
    ctxOf(fc).drawImage(L.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    const liftBefore = cut ? L.ctx.getImageData(r.x, r.y, r.w, r.h) : null;
    if (cut) L.ctx.clearRect(r.x, r.y, r.w, r.h);
    float = { canvas: fc, x: r.x, y: r.y, s: 1, layerId: L.id, origin: r, liftBefore, cut, kind: 'move' };
    showFloatBar(); render(); return true;
  }
  function commitFloat() {
    if (!float) return; const f = float, L = layerById(f.layerId); float = null; hideFloatBar();
    if (!L) return render();
    const w = f.canvas.width * f.s, hh = f.canvas.height * f.s, dest = { x0: f.x, y0: f.y, x1: f.x + w, y1: f.y + hh };
    const origin = f.cut && f.origin ? { x0: f.origin.x, y0: f.origin.y, x1: f.origin.x + f.origin.w, y1: f.origin.y + f.origin.h } : null;
    const U = C.clipBox(C.unionBox(origin, dest), doc.w, doc.h); if (!U) { if (f.kind === 'import') removeLayerRaw(L, false); refreshLayers(); render(); return; }
    if (f.kind === 'import') { const idx = f.addIndex; pushH({ bytes: 200, undo: () => { const i = doc.layers.indexOf(L); if (i >= 0) doc.layers.splice(i, 1); if (doc.active === L.id) doc.active = (doc.layers[Math.max(0, i - 1)] || doc.layers[0]).id; }, redo: () => { doc.layers.splice(Math.min(idx, doc.layers.length), 0, L); doc.active = L.id; } }); }
    const uw = U.x1 - U.x0, uh = U.y1 - U.y0; let before = L.ctx.getImageData(U.x0, U.y0, uw, uh);
    if (f.cut && f.liftBefore) { const t = makeCanvas(uw, uh), tx = ctxOf(t); tx.putImageData(before, 0, 0); tx.putImageData(f.liftBefore, f.origin.x - U.x0, f.origin.y - U.y0); before = tx.getImageData(0, 0, uw, uh); }
    L.ctx.save(); L.ctx.imageSmoothingQuality = 'high'; L.ctx.drawImage(f.canvas, f.x, f.y, w, hh); L.ctx.restore();
    const after = L.ctx.getImageData(U.x0, U.y0, uw, uh); pushH(patchEntry(L, U, before, after));
    sel = f.kind === 'move' ? { x: Math.round(f.x), y: Math.round(f.y), w: Math.round(w), h: Math.round(hh) } : null; if (sel) sel = C.clipBox({ x0: sel.x, y0: sel.y, x1: sel.x + sel.w, y1: sel.y + sel.h }, doc.w, doc.h) ? sel : null;
    markDirty(); refreshLayers(); render(); thumbSoon();
  }
  function cancelFloat() {
    if (!float) return; const f = float, L = layerById(f.layerId); float = null; hideFloatBar();
    if (f.kind === 'import') { if (L) removeLayerRaw(L, false); }
    else if (L && f.cut && f.liftBefore) L.ctx.putImageData(f.liftBefore, f.origin.x, f.origin.y);
    refreshLayers(); render();
  }
  function showFloatBar() {
    if (!R.floatBar) return; R.floatBar.style.display = 'flex'; R.floatScaleWrap.style.display = float && float.kind === 'import' ? 'flex' : 'none';
    if (float) R.floatScale.value = Math.round(float.s * 100);
  }
  function hideFloatBar() { if (R.floatBar) R.floatBar.style.display = 'none'; }
  function duplicateSelection() { commitFloat(); if (!sel) return toast('Selecione uma área primeiro (ferramenta ⬚ Seleção).'); if (liftFloat(false)) { float.x += 20; float.y += 20; setTool('move'); render(); } }
  function deleteSelection() {
    commitFloat(); const L = activeLayer(); if (!L || L.locked) return toast('🔒 A camada está bloqueada.');
    const r = sel || { x: 0, y: 0, w: doc.w, h: doc.h }, b = { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }, before = L.ctx.getImageData(r.x, r.y, r.w, r.h);
    L.ctx.clearRect(r.x, r.y, r.w, r.h); pushH(patchEntry(L, b, before, L.ctx.getImageData(r.x, r.y, r.w, r.h))); markDirty(); render(); thumbSoon();
  }

  // importar imagem
  async function importImage(file) {
    const err = C.checkImportFile(file); if (err) return toast('❌ ' + err);
    if (doc.layers.length >= C.maxLayers(doc.w, doc.h)) return toast(`❌ Limite de ${C.maxLayers(doc.w, doc.h)} camadas para este tamanho de tela.`);
    try {
      const im = await loadImg(file), iw = im.naturalWidth, ih = im.naturalHeight;
      if (iw > C.LIMITS.maxImportSide || ih > C.LIMITS.maxImportSide) return toast(`❌ Imagem grande demais (máx. ${C.LIMITS.maxImportSide}px de lado).`);
      commitFloat();
      const src = C.fitContain(iw, ih, 2048, 2048), fc = makeCanvas(src.w, src.h); ctxOf(fc).drawImage(im, 0, 0, src.w, src.h);
      const L = makeLayer('Imagem', doc.w, doc.h), at = doc.layers.length; addLayerRaw(L, at, false);
      const fit = C.fitContain(fc.width, fc.height, doc.w, doc.h), s = fit.scale;
      float = { canvas: fc, x: Math.round((doc.w - fc.width * s) / 2), y: Math.round((doc.h - fc.height * s) / 2), s, layerId: L.id, origin: null, liftBefore: null, cut: false, kind: 'import', addIndex: at };
      setTool('move'); showFloatBar(); markDirty(); refreshLayers(); render(); toast('🖼️ Arraste para posicionar, ajuste a escala e toque em Aplicar.');
    } catch (e) { toast('❌ ' + e.message); }
  }

  // ---------- camadas ----------
  function addLayerRaw(L, index, record) {
    doc.layers.splice(index, 0, L); doc.active = L.id;
    if (record) pushH({ bytes: 200, undo: () => { const i = doc.layers.indexOf(L); if (i >= 0) doc.layers.splice(i, 1); if (doc.active === L.id) doc.active = (doc.layers[Math.max(0, i - 1)] || doc.layers[0]).id; }, redo: () => { doc.layers.splice(Math.min(index, doc.layers.length), 0, L); doc.active = L.id; } });
  }
  function removeLayerRaw(L, record) {
    const i = doc.layers.indexOf(L); if (i < 0) return; doc.layers.splice(i, 1); const prev = doc.active; if (doc.active === L.id) doc.active = (doc.layers[Math.max(0, i - 1)] || doc.layers[0]).id;
    if (record) pushH({ bytes: doc.w * doc.h * 4, undo: () => { doc.layers.splice(Math.min(i, doc.layers.length), 0, L); doc.active = prev; }, redo: () => { const j = doc.layers.indexOf(L); if (j >= 0) doc.layers.splice(j, 1); if (doc.active === L.id) doc.active = (doc.layers[Math.max(0, j - 1)] || doc.layers[0]).id; } });
  }
  function addLayer() {
    commitFloat(); if (doc.layers.length >= C.maxLayers(doc.w, doc.h)) return toast(`❌ Limite de ${C.maxLayers(doc.w, doc.h)} camadas para este tamanho de tela.`);
    const L = makeLayer(`Camada ${doc.layers.length + 1}`, doc.w, doc.h), at = doc.layers.indexOf(activeLayer()) + 1; addLayerRaw(L, at, true); layerChanged();
  }
  function dupLayer() {
    commitFloat(); const A = activeLayer(); if (!A) return; if (doc.layers.length >= C.maxLayers(doc.w, doc.h)) return toast(`❌ Limite de ${C.maxLayers(doc.w, doc.h)} camadas para este tamanho de tela.`);
    const L = makeLayer(A.name + ' cópia', doc.w, doc.h); L.ctx.drawImage(A.canvas, 0, 0); L.opacity = A.opacity; L.visible = A.visible; addLayerRaw(L, doc.layers.indexOf(A) + 1, true); layerChanged();
  }
  function delLayer() {
    commitFloat(); if (doc.layers.length <= 1) return toast('Mantenha ao menos uma camada. Use "Limpar camada" para apagar o conteúdo.');
    const A = activeLayer(); removeLayerRaw(A, true); layerChanged();
  }
  function moveLayer(dir) {
    commitFloat(); const A = activeLayer(), i = doc.layers.indexOf(A), j = i + dir; if (j < 0 || j >= doc.layers.length) return;
    const swap = (a, b) => { const t = doc.layers[a]; doc.layers[a] = doc.layers[b]; doc.layers[b] = t; };
    swap(i, j); pushH({ bytes: 100, undo: () => swap(j, i), redo: () => swap(i, j) }); layerChanged();
  }
  function setLayerProp(L, prop, val, record = true) {
    const old = L[prop]; if (old === val) return; L[prop] = val;
    if (record) pushH({ bytes: 100, undo: () => { L[prop] = old; }, redo: () => { L[prop] = val; } }); markDirty(); render();
  }
  async function renameLayer() { const A = activeLayer(), n = await askText2('Renomear camada', A.name); if (n) { setLayerProp(A, 'name', n.slice(0, 40)); refreshLayers(); } }
  function clearLayer() {
    commitFloat(); const L = activeLayer(); if (!L || L.locked) return toast('🔒 A camada está bloqueada.');
    const snap = makeCanvas(doc.w, doc.h); ctxOf(snap).drawImage(L.canvas, 0, 0); L.ctx.clearRect(0, 0, doc.w, doc.h);
    pushH({ bytes: doc.w * doc.h * 4, undo: () => { L.ctx.clearRect(0, 0, doc.w, doc.h); L.ctx.drawImage(snap, 0, 0); }, redo: () => { L.ctx.clearRect(0, 0, doc.w, doc.h); } }); markDirty(); render(); thumbSoon();
  }
  async function clearProject() {
    if (!await confirmBox('Limpar todo o projeto? Todas as camadas serão apagadas (dá para desfazer).')) return;
    commitFloat(); const snaps = doc.layers.map(L => { const s = makeCanvas(doc.w, doc.h); ctxOf(s).drawImage(L.canvas, 0, 0); return s; }), ls = [...doc.layers];
    for (const L of ls) if (!L.locked) L.ctx.clearRect(0, 0, doc.w, doc.h);
    pushH({ bytes: doc.w * doc.h * 4 * ls.length, undo: () => { ls.forEach((L, i) => { L.ctx.clearRect(0, 0, doc.w, doc.h); L.ctx.drawImage(snaps[i], 0, 0); }); }, redo: () => { ls.forEach(L => L.ctx.clearRect(0, 0, doc.w, doc.h)); } });
    markDirty(); render(); thumbSoon(); toast('🧹 Projeto limpo.');
  }
  function layerChanged() { markDirty(); refreshLayers(); render(); }
  function setBackground(color, transparent) {
    const old = { bg: doc.bg, t: doc.transparent }, nw = { bg: C.normHex(color, doc.bg), t: !!transparent };
    doc.bg = nw.bg; doc.transparent = nw.t; pushH({ bytes: 50, undo: () => { doc.bg = old.bg; doc.transparent = old.t; }, redo: () => { doc.bg = nw.bg; doc.transparent = nw.t; } }); markDirty(); render();
  }
  function resizeDoc(nw, nh) {
    const err = C.checkDocSize(nw, nh); if (err) return toast('❌ ' + err);
    commitFloat(); const old = { w: doc.w, h: doc.h, canvases: doc.layers.map(l => l.canvas), ctxs: doc.layers.map(l => l.ctx), stroke: strokeCanvas };
    const apply = (w, hh, canvases, ctxs, stroke) => { doc.w = w; doc.h = hh; doc.layers.forEach((l, i) => { l.canvas = canvases[i]; l.ctx = ctxs[i]; }); strokeCanvas = stroke; strokeCtx = ctxOf(stroke); sel = null; };
    const nc = doc.layers.map(l => { const c = makeCanvas(nw, nh); ctxOf(c).drawImage(l.canvas, 0, 0); return c; }), nx = nc.map(ctxOf), ns = makeCanvas(nw, nh);
    apply(nw, nh, nc, nx, ns);
    pushH({ bytes: old.w * old.h * 4 * doc.layers.length, undo: () => { apply(old.w, old.h, old.canvases, old.ctxs, old.stroke); fitView(); }, redo: () => { apply(nw, nh, nc, nx, ns); fitView(); } });
    markDirty(); fitView(); refreshAll();
  }

  // ---------- cores ----------
  function setColor(hex, addRecent = true) {
    S.color = C.normHex(hex, S.color); if (addRecent) pushRecent(); savePrefs(); syncUI();
  }
  function pushRecent() { const c = S.color; S.recent = [c, ...S.recent.filter(x => x !== c)].slice(0, 14); savePrefs(); renderSwatches(); }
  function toggleFav() { const c = S.color; S.favs = S.favs.includes(c) ? S.favs.filter(x => x !== c) : [c, ...S.favs].slice(0, 30); savePrefs(); renderSwatches(); toast(S.favs.includes(c) ? '⭐ Cor salva nos favoritos.' : 'Cor removida dos favoritos.'); }
  function toggleEraser() { if (S.tool === 'eraser') setTool(S.lastPaintTool || 'brush'); else setTool('eraser'); }

  // ---------- ferramentas ----------
  function setTool(t) {
    if (t !== 'move' && t !== 'select') commitFloat();
    if (['brush', 'pencil', 'line', 'rect', 'square', 'circle', 'ellipse'].includes(t)) S.lastPaintTool = t;
    S.tool = t; syncUI(); render();
  }

  // ---------- gestos (zoom/pan) e eventos de ponteiro ----------
  function startGesture() {
    const pts = [...pointers.values()].slice(0, 2), r = R.view.getBoundingClientRect();
    gesture = { d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, mx: (pts[0].x + pts[1].x) / 2 - r.left, my: (pts[0].y + pts[1].y) / 2 - r.top, v0: { ...V } }; mode = 'gesture'; ignoreUntilUp = true;
  }
  function onDown(e) {
    if (!doc) return; e.preventDefault();
    try { R.view.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro já liberado */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (pointers.size === 2) { cancelStroke(); startGesture(); return; }
    if (pointers.size > 2 || ignoreUntilUp) return;
    if (e.pointerType === 'mouse' && e.button === 2) return;
    if (S.tool === 'hand' || (e.pointerType === 'mouse' && (e.button === 1 || spaceDown))) { mode = 'pan'; panLast = { x: e.clientX, y: e.clientY }; return; }
    mode = 'tool'; toolDown(e);
  }
  function onMove(e) {
    if (!pointers.has(e.pointerId)) return; e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (mode === 'gesture' && gesture && pointers.size >= 2) {
      const pts = [...pointers.values()].slice(0, 2), r = R.view.getBoundingClientRect(), d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const mx = (pts[0].x + pts[1].x) / 2 - r.left, my = (pts[0].y + pts[1].y) / 2 - r.top;
      const nv = C.zoomAt(gesture.v0, gesture.v0.z * (d / gesture.d0), gesture.mx, gesture.my); V = { z: nv.z, x: nv.x + (mx - gesture.mx), y: nv.y + (my - gesture.my) };
      updateZoomLabel(); scheduleRender(); return;
    }
    if (mode === 'pan' && panLast) { V.x += e.clientX - panLast.x; V.y += e.clientY - panLast.y; panLast = { x: e.clientX, y: e.clientY }; scheduleRender(); return; }
    if (mode === 'tool') toolMove(e);
  }
  function onUp(e) {
    if (!pointers.has(e.pointerId)) return; e.preventDefault(); pointers.delete(e.pointerId);
    try { R.view.releasePointerCapture(e.pointerId); } catch (err) { /* sem captura */ }
    if (mode === 'tool' && e.type !== 'pointercancel') toolUp(e); else if (mode === 'tool') cancelStroke();
    if (pointers.size < 2) gesture = null;
    if (pointers.size === 0) { mode = null; ignoreUntilUp = false; panLast = null; }
  }
  function onWheel(e) {
    e.preventDefault(); const r = R.view.getBoundingClientRect(), f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    V = C.zoomAt(V, V.z * f, e.clientX - r.left, e.clientY - r.top); updateZoomLabel(); scheduleRender();
  }
  function zoomBy(f) { V = C.zoomAt(V, V.z * f, R.vw / 2, R.vh / 2); updateZoomLabel(); render(); }
  function updateZoomLabel() { if (R.zoomLabel) R.zoomLabel.textContent = Math.round(V.z * 100) + '%'; }

  // ---------- toast e diálogos ----------
  function toast(msg) {
    if (!R.root) return; const t = h('div', { class: 'as-toast' }, msg); R.root.append(t); setTimeout(() => t.remove(), 3200);
  }
  function modal(title, body, buttons, ref) {
    return new Promise(resolve => {
      const done = v => { ov.remove(); resolve(v); }; if (ref) ref.close = () => done(null);
      const btns = (buttons || []).map(b => h('button', { class: 'as-btn' + (b.primary ? ' primary' : ''), type: 'button', onclick: async () => { if (b.onClick) { const r = await b.onClick(); if (r === false) return; done(b.value); } else done(b.value); } }, b.label));
      const ov = h('div', { class: 'as-overlay', onclick: e => { if (e.target === ov) done(null); } }, h('div', { class: 'as-modal' }, h('h3', {}, title), body, h('div', { class: 'as-modal-btns' }, btns)));
      R.root.append(ov); const f = ov.querySelector('input,textarea,select'); if (f && f.type !== 'range') setTimeout(() => f.focus(), 50);
    });
  }
  const confirmBox = msg => modal('Confirmar', h('p', {}, msg), [{ label: 'Cancelar', value: false }, { label: 'Confirmar', value: true, primary: true }]).then(v => v === true);
  async function askText2(title, value) {
    const input = h('input', { class: 'as-input', value, maxlength: 60 });
    const r = await modal(title, input, [{ label: 'Cancelar', value: null }, { label: 'OK', value: 'ok', primary: true }]); return r === 'ok' ? input.value.trim() : null;
  }
  async function askText(pos) {
    const L = activeLayer(); if (!L || L.locked) return;
    const ta = h('textarea', { class: 'as-input', rows: 3, placeholder: 'Digite o texto...' }), fs = h('input', { class: 'as-input', type: 'number', min: 8, max: 600, value: S.textSize });
    const ff = h('select', { class: 'as-input' }, ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'].map(f => h('option', { value: f, selected: f === S.textFont }, f)));
    const bold = h('input', { type: 'checkbox', checked: S.textBold });
    const r = await modal('🔤 Adicionar texto', h('div', { class: 'as-form' }, ta, h('label', {}, 'Tamanho (px) ', fs), h('label', {}, 'Fonte ', ff), h('label', {}, bold, ' Negrito')), [{ label: 'Cancelar', value: null }, { label: 'Adicionar', value: 'ok', primary: true }]);
    if (r !== 'ok' || !ta.value.trim()) return;
    S.textSize = C.clamp(Number(fs.value) || 48, 8, 600); S.textFont = ff.value; S.textBold = bold.checked; savePrefs();
    const lines = ta.value.split('\n'), font = `${S.textBold ? 'bold ' : ''}${S.textSize}px ${S.textFont}`; L.ctx.save(); L.ctx.font = font;
    const wmax = Math.max(...lines.map(l => L.ctx.measureText(l).width)), lh = S.textSize * 1.2, b = C.clipBox({ x0: pos.x - 4, y0: pos.y - S.textSize - 4, x1: pos.x + wmax + 4, y1: pos.y + lh * lines.length }, doc.w, doc.h);
    L.ctx.restore(); if (!b) return toast('O texto ficou fora da tela.');
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0, before = L.ctx.getImageData(b.x0, b.y0, bw, bh);
    L.ctx.save(); L.ctx.font = font; L.ctx.fillStyle = S.color; L.ctx.globalAlpha = S.alpha; L.ctx.textBaseline = 'alphabetic'; lines.forEach((l, i) => L.ctx.fillText(l, pos.x, pos.y + i * lh)); L.ctx.restore();
    pushH(patchEntry(L, b, before, L.ctx.getImageData(b.x0, b.y0, bw, bh))); markDirty(); render(); thumbSoon(); pushRecent();
  }

  // ---------- dirty / salvamento ----------
  function markDirty() { dirty = true; setSaveState('dirty'); clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => { saveProject(true); }, 4000); }
  function setSaveState(s) {
    saveState = s; if (!R.saveInd) return;
    R.saveInd.textContent = s === 'dirty' ? '● não salvo' : s === 'saving' ? '⏳ salvando…' : s === 'saved' ? `✓ salvo ${savedAt ? savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}` : s === 'error' ? '⚠️ falha ao salvar' : '';
    R.saveInd.className = 'as-save ' + s;
  }
  window.addEventListener('beforeunload', e => { if (mounted && dirty) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mounted && dirty) saveProject(true); });

  // ---------- projetos (IndexedDB, neste dispositivo) ----------
  const IDB = {
    db: null,
    open() { return this.db ? Promise.resolve(this.db) : new Promise((res, rej) => { const rq = indexedDB.open('nvb-art-studio', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('projects', { keyPath: 'id' }); rq.onsuccess = () => { this.db = rq.result; res(this.db); }; rq.onerror = () => rej(rq.error || new Error('IndexedDB indisponível')); }); },
    async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('projects', mode), st = t.objectStore('projects'), rq = fn(st); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transação cancelada')); }); },
    put(p) { return this.tx('readwrite', s => s.put(p)); }, get(id) { return this.tx('readonly', s => s.get(id)); }, all() { return this.tx('readonly', s => s.getAll()); }, del(id) { return this.tx('readwrite', s => s.delete(id)); }
  };
  async function thumbBlob() {
    const t = C.fitContain(doc.w, doc.h, 240, 240), c = makeCanvas(t.w, t.h), x = ctxOf(c); x.imageSmoothingQuality = 'high';
    if (!doc.transparent) { x.fillStyle = doc.bg; x.fillRect(0, 0, t.w, t.h); }
    for (const L of doc.layers) if (L.visible) { x.globalAlpha = L.opacity; x.drawImage(L.canvas, 0, 0, t.w, t.h); } return blobOf(c, 'image/png');
  }
  async function saveProject(auto) {
    if (!doc || saving) return; commitFloat(); saving = true; clearTimeout(autosaveTimer); setSaveState('saving');
    try {
      if (!project.id) { project.id = uid() + uid(); project.createdAt = Date.now(); }
      const layers = []; for (const L of doc.layers) layers.push({ name: L.name, visible: L.visible, opacity: L.opacity, locked: L.locked, blob: await blobOf(L.canvas, 'image/png'), active: L.id === doc.active });
      await IDB.put({ id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: Date.now(), w: doc.w, h: doc.h, bg: doc.bg, transparent: doc.transparent, layers, thumb: await thumbBlob(), settings: { color: S.color, size: S.size, alpha: S.alpha } });
      try { localStorage.setItem(lastKey, project.id); } catch (e) { /* ok */ }
      dirty = false; savedAt = new Date(); setSaveState('saved'); if (!auto) toast('💾 Projeto salvo neste dispositivo.');
    } catch (e) { setSaveState('error'); toast('❌ Não foi possível salvar: ' + (e.message || e)); }
    finally { saving = false; if (dirty) { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => saveProject(true), 4000); } }
  }
  async function loadProject(id) {
    const p = await IDB.get(id); if (!p) throw new Error('Projeto não encontrado.');
    commitFloat(); doc = { w: p.w, h: p.h, bg: p.bg, transparent: p.transparent, layers: [], active: null };
    for (const d of p.layers) { const L = makeLayer(d.name, p.w, p.h); L.visible = d.visible; L.opacity = d.opacity; L.locked = d.locked; const im = await loadImg(d.blob); L.ctx.drawImage(im, 0, 0); doc.layers.push(L); if (d.active) doc.active = L.id; }
    if (!doc.active) doc.active = doc.layers[doc.layers.length - 1].id; strokeCanvas = makeCanvas(p.w, p.h); strokeCtx = ctxOf(strokeCanvas);
    history.clear(); sel = null; float = null; project = { id: p.id, name: p.name, createdAt: p.createdAt }; dirty = false; savedAt = new Date(p.updatedAt); setSaveState('saved');
    try { localStorage.setItem(lastKey, p.id); } catch (e) { /* ok */ } fitView(); refreshAll();
  }
  async function renameProject() { const n = await askText2('Nome do projeto', project.name); if (n) { project.name = n; if (R.nameBtn) R.nameBtn.textContent = n; markDirty(); } }
  async function openProjects() {
    let list = []; try { list = (await IDB.all()).sort((a, b) => b.updatedAt - a.updatedAt); } catch (e) { return toast('❌ O armazenamento do navegador não está disponível (modo privado?).'); }
    const grid = h('div', { class: 'as-projects' });
    const cleanup = [], ref = {}; let closeFn = () => ref.close && ref.close();
    const refresh = async () => { list = (await IDB.all()).sort((a, b) => b.updatedAt - a.updatedAt); fill(); };
    const fill = () => {
      grid.innerHTML = ''; if (!list.length) grid.append(h('p', { class: 'as-muted' }, 'Nenhum projeto salvo ainda.'));
      for (const p of list) {
        const url = URL.createObjectURL(p.thumb); cleanup.push(url);
        grid.append(h('div', { class: 'as-proj' }, h('img', { src: url, alt: '' }), h('b', {}, p.name), h('small', {}, `${p.w}×${p.h} • ${new Date(p.updatedAt).toLocaleString('pt-BR')}`),
          h('div', { class: 'as-proj-btns' },
            h('button', { class: 'as-btn primary', type: 'button', onclick: async () => { if (dirty && !await confirmBox('Há alterações não salvas no desenho atual. Abrir outro projeto mesmo assim?')) return; try { await loadProject(p.id); closeFn(); } catch (e) { toast('❌ ' + e.message); } } }, 'Abrir'),
            h('button', { class: 'as-btn', type: 'button', onclick: async () => { const n = await askText2('Renomear projeto', p.name); if (n) { p.name = n; await IDB.put(p); if (project.id === p.id) { project.name = n; R.nameBtn.textContent = n; } refresh(); } } }, 'Renomear'),
            h('button', { class: 'as-btn', type: 'button', onclick: async () => { await IDB.put({ ...p, id: uid() + uid(), name: p.name + ' cópia', createdAt: Date.now(), updatedAt: Date.now() }); refresh(); } }, 'Duplicar'),
            h('button', { class: 'as-btn danger', type: 'button', onclick: async () => { if (!await confirmBox(`Excluir "${p.name}" definitivamente?`)) return; await IDB.del(p.id); if (project.id === p.id) project.id = null; refresh(); } }, 'Excluir'))));
      }
    };
    fill();
    const note = h('p', { class: 'as-muted' }, '💾 Os projetos ficam salvos apenas neste dispositivo e navegador. Não há sincronização com a sua conta: limpar os dados do navegador apaga os projetos. Exporte em PNG para guardar uma cópia.');
    const p = modal('📚 Projetos', h('div', {}, note, grid), [{ label: 'Fechar', value: null }], ref); await p; cleanup.forEach(u => URL.revokeObjectURL(u));
  }

  // ---------- novo desenho, tamanho da tela, exportação ----------
  async function newDialog() {
    const presets = [[512, 512], [1024, 1024], [1080, 1350], [1080, 1920], [2048, 2048]];
    const w = h('input', { class: 'as-input', type: 'number', value: 1024, min: 1 }), hh = h('input', { class: 'as-input', type: 'number', value: 1024, min: 1 }), tr = h('input', { type: 'checkbox' }), bg = h('input', { type: 'color', value: '#ffffff' });
    const pre = h('div', { class: 'as-chips' }, presets.map(([a, b]) => h('button', { class: 'as-btn', type: 'button', onclick: () => { w.value = a; hh.value = b; } }, `${a}×${b}`)));
    const body = h('div', { class: 'as-form' }, pre, h('label', {}, 'Largura ', w), h('label', {}, 'Altura ', hh), h('label', {}, 'Cor de fundo ', bg), h('label', {}, tr, ' Fundo transparente'), h('p', { class: 'as-muted' }, `Máximo ${C.LIMITS.maxSide}px de lado e ${C.LIMITS.maxPixels / 1e6} milhões de pixels.`));
    const r = await modal('✨ Novo desenho', body, [{ label: 'Cancelar', value: null }, { label: 'Criar', value: 'ok', primary: true, onClick: () => { const e = C.checkDocSize(Number(w.value), Number(hh.value)); if (e) { toast('❌ ' + e); return false; } } }]);
    if (r !== 'ok') return;
    if (dirty && !await confirmBox('O desenho atual tem alterações não salvas. Criar um novo mesmo assim?')) return;
    newDoc(Math.round(Number(w.value)), Math.round(Number(hh.value)), bg.value, tr.checked, 'Sem título');
  }
  async function sizeDialog() {
    const w = h('input', { class: 'as-input', type: 'number', value: doc.w, min: 1 }), hh = h('input', { class: 'as-input', type: 'number', value: doc.h, min: 1 }), tr = h('input', { type: 'checkbox', checked: doc.transparent }), bg = h('input', { type: 'color', value: doc.bg });
    const body = h('div', { class: 'as-form' }, h('p', { class: 'as-muted' }, 'Ao mudar o tamanho, o conteúdo fica ancorado no canto superior esquerdo (pode cortar ou deixar espaço vazio). Dá para desfazer.'), h('label', {}, 'Largura ', w), h('label', {}, 'Altura ', hh), h('hr', {}), h('label', {}, 'Cor de fundo ', bg), h('label', {}, tr, ' Fundo transparente'));
    const r = await modal('📐 Tela e fundo', body, [{ label: 'Cancelar', value: null }, { label: 'Aplicar', value: 'ok', primary: true, onClick: () => { const e = C.checkDocSize(Number(w.value), Number(hh.value)); if (e) { toast('❌ ' + e); return false; } } }]);
    if (r !== 'ok') return;
    if (bg.value !== doc.bg || tr.checked !== doc.transparent) setBackground(bg.value, tr.checked);
    const nw = Math.round(Number(w.value)), nh = Math.round(Number(hh.value)); if (nw !== doc.w || nh !== doc.h) resizeDoc(nw, nh);
  }
  function compose(transparent, bgColor) {
    const c = makeCanvas(doc.w, doc.h), x = ctxOf(c);
    if (!transparent) { x.fillStyle = bgColor; x.fillRect(0, 0, doc.w, doc.h); }
    for (const L of doc.layers) if (L.visible) { x.globalAlpha = L.opacity; x.drawImage(L.canvas, 0, 0); } x.globalAlpha = 1; return c;
  }
  async function exportDialog() {
    commitFloat();
    const fmt = h('select', { class: 'as-input' }, h('option', { value: 'image/png' }, 'PNG (recomendado)'), h('option', { value: 'image/jpeg' }, 'JPEG'), h('option', { value: 'image/webp' }, 'WebP'));
    const q = h('input', { type: 'range', min: 40, max: 100, value: 92 }), tr = h('input', { type: 'checkbox', checked: doc.transparent });
    const info = h('p', { class: 'as-muted' }, `Tamanho exportado: ${doc.w}×${doc.h}px (a resolução do projeto).`);
    const body = h('div', { class: 'as-form' }, info, h('label', {}, 'Formato ', fmt), h('label', {}, 'Qualidade (JPEG/WebP) ', q), h('label', {}, tr, ' Fundo transparente (somente PNG e WebP)'));
    const r = await modal('📤 Exportar', body, [{ label: 'Cancelar', value: null }, { label: 'Exportar', value: 'ok', primary: true }]); if (r !== 'ok') return;
    const type = fmt.value, ext = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp', useTransparent = tr.checked && type !== 'image/jpeg';
    const bgc = doc.transparent ? '#ffffff' : doc.bg, canvas = compose(useTransparent, bgc), blob = await blobOf(canvas, type, Number(q.value) / 100);
    if (!blob) return toast('❌ Seu navegador não conseguiu exportar neste formato.');
    if (blob.type && blob.type !== type) toast(`ℹ️ O navegador exportou em ${blob.type} (não suporta ${ext.toUpperCase()}).`);
    const url = URL.createObjectURL(blob), a = h('a', { href: url, download: `${project.name.replace(/[^\w\- ]+/g, '').trim() || 'nvb-desenho'}.${blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'}` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); toast('📤 Imagem exportada.');
  }

  // ---------- interface ----------
  function rangeRow(label, key, min, max, step, fmt, onSet) {
    const out = h('span', { class: 'as-val' }), inp = h('input', { type: 'range', min, max, step, 'data-key': key });
    inp.addEventListener('input', () => { onSet(Number(inp.value)); syncUI(); }); inp.addEventListener('change', savePrefs);
    inp._out = out; inp._fmt = fmt; return h('label', { class: 'as-row' }, h('span', {}, label), inp, out);
  }
  function toggleRow(label, key, onSet) {
    const inp = h('input', { type: 'checkbox', 'data-key': key }); inp.addEventListener('change', () => { onSet(inp.checked); savePrefs(); syncUI(); }); return h('label', { class: 'as-row' }, h('span', {}, label), inp);
  }
  function renderSwatches() {
    if (!R.recent) return; const mk = (c, fav) => h('button', { class: 'as-sw', type: 'button', style: `background:${c}`, title: c, onclick: () => setColor(c) }, fav ? h('i', { onclick: ev => { ev.stopPropagation(); S.favs = S.favs.filter(x => x !== c); savePrefs(); renderSwatches(); } }, '×') : null);
    R.recent.innerHTML = ''; R.recent.append(...(S.recent.length ? S.recent.map(c => mk(c)) : [h('span', { class: 'as-muted' }, 'Suas últimas cores aparecem aqui.')]));
    R.favs.innerHTML = ''; R.favs.append(...(S.favs.length ? S.favs.map(c => mk(c, true)) : [h('span', { class: 'as-muted' }, 'Toque em ⭐ para salvar a cor atual.')]));
  }
  function syncUI() {
    if (!R.root) return;
    R.root.querySelectorAll('[data-key]').forEach(el => {
      const k = el.dataset.key, v = S[k]; if (el.type === 'checkbox') el.checked = !!v;
      else { const shown = k === 'alpha' || k === 'hardness' || k === 'smooth' ? Math.round(v * 100) : v; el.value = shown; if (el._out) el._out.textContent = (el._fmt || (x => x))(shown); }
    });
    R.root.querySelectorAll('.as-tool').forEach(b => b.classList.toggle('on', b.dataset.tool === S.tool));
    R.root.querySelectorAll('.as-btype').forEach(b => b.classList.toggle('on', b.dataset.type === S.brush));
    if (R.colorBtn) R.colorBtn.style.background = S.color; if (R.hex && document.activeElement !== R.hex) R.hex.value = S.color; if (R.native) R.native.value = S.color; if (R.prev) R.prev.style.background = S.color;
    if (R.toolName) R.toolName.textContent = (TOOLS.find(t => t[0] === S.tool) || [])[2] || '';
    const rgb = C.hexToRgb(S.color), hsl = C.rgbToHsl(rgb.r, rgb.g, rgb.b);
    if (R.hsl && !R.hsl.busy) { R.hsl[0].value = Math.round(hsl.h); R.hsl[1].value = Math.round(hsl.s); R.hsl[2].value = Math.round(hsl.l); }
  }
  let thumbTimer = 0; function thumbSoon() { clearTimeout(thumbTimer); thumbTimer = setTimeout(() => { if (R.sheetName === 'layers') refreshLayers(); }, 250); }
  function refreshLayers() {
    if (!R.layerList || !doc) return; R.layerList.innerHTML = '';
    [...doc.layers].reverse().forEach(L => {
      const th = makeCanvas(40, 40), tx = ctxOf(th), f = C.fitContain(doc.w, doc.h, 40, 40); tx.fillStyle = '#d8d8e0'; tx.fillRect(0, 0, 40, 40); tx.drawImage(L.canvas, 0, 0, f.w, f.h);
      const row = h('div', { class: 'as-layer' + (L.id === doc.active ? ' on' : ''), onclick: () => { if (doc.active !== L.id) { commitFloat(); doc.active = L.id; refreshLayers(); syncLayerControls(); } } },
        h('button', { class: 'as-ic', type: 'button', title: 'Mostrar/ocultar', onclick: e => { e.stopPropagation(); setLayerProp(L, 'visible', !L.visible); refreshLayers(); } }, L.visible ? '👁️' : '🚫'),
        h('span', { class: 'as-thumb' }, th), h('span', { class: 'as-lname' }, L.name),
        h('button', { class: 'as-ic', type: 'button', title: 'Bloquear/desbloquear', onclick: e => { e.stopPropagation(); setLayerProp(L, 'locked', !L.locked); refreshLayers(); } }, L.locked ? '🔒' : '🔓'));
      R.layerList.append(row);
    }); syncLayerControls();
  }
  function syncLayerControls() { const A = activeLayer(); if (A && R.layerOp) { R.layerOp.value = Math.round(A.opacity * 100); R.layerOpOut.textContent = Math.round(A.opacity * 100) + '%'; } }
  function refreshAll() { if (R.nameBtn) R.nameBtn.textContent = project.name; refreshLayers(); updateUndoButtons(); syncUI(); renderSwatches(); updateZoomLabel(); render(); }

  function openSheet(name) {
    const same = R.sheetName === name; R.sheetName = same ? null : name;
    for (const [k, el] of Object.entries(R.sheets)) el.style.display = k === R.sheetName ? 'block' : 'none';
    R.root.querySelectorAll('.as-sheetbtn').forEach(b => b.classList.toggle('on', b.dataset.sheet === R.sheetName));
    if (R.sheetName === 'layers') refreshLayers(); setTimeout(sizeCanvas, 30);
  }
  function openMenu() {
    const items = [['✨ Novo desenho', newDialog], ['📚 Projetos', openProjects], ['💾 Salvar agora', () => saveProject(false)], ['📤 Exportar imagem', exportDialog], ['🖼️ Importar imagem', () => R.file.click()], ['📐 Tela e fundo', sizeDialog],
      ['⧉ Duplicar seleção', duplicateSelection], ['⌫ Apagar seleção / camada inteira', deleteSelection], ['🧹 Limpar camada', clearLayer], ['🗑️ Limpar projeto', clearProject], ['✏️ Renomear projeto', renameProject], ['← Voltar ao site', exitStudio]];
    const list = h('div', { class: 'as-menu' }, items.map(([t, fn]) => h('button', { class: 'as-btn', type: 'button', onclick: () => { ov.remove(); fn(); } }, t)));
    const ov = h('div', { class: 'as-overlay menu', onclick: e => { if (e.target === ov) ov.remove(); } }, h('div', { class: 'as-modal' }, h('h3', {}, 'Menu'), list)); R.root.append(ov);
  }

  function buildUI() {
    const root = document.getElementById('artstudio'); R.root = root; root.innerHTML = '';
    injectCSS();
    const view = h('canvas', { class: 'as-view' }); R.view = view; R.vctx = ctxOf(view);
    R.undo = h('button', { class: 'as-ic', type: 'button', title: 'Desfazer', onclick: doUndo }, '↩️'); R.redo = h('button', { class: 'as-ic', type: 'button', title: 'Refazer', onclick: doRedo }, '↪️');
    R.nameBtn = h('button', { class: 'as-name', type: 'button', onclick: renameProject }, project.name); R.saveInd = h('span', { class: 'as-save' });
    R.zoomLabel = h('span', { class: 'as-zoom' }, '100%');
    const top = h('div', { class: 'as-top' }, h('button', { class: 'as-ic', type: 'button', title: 'Voltar ao site', onclick: exitStudio }, '←'), R.nameBtn, h('span', { class: 'as-spacer' }), R.saveInd, R.undo, R.redo, h('button', { class: 'as-ic', type: 'button', title: 'Menu', onclick: openMenu }, '⋯'));
    // barra flutuante (mover/importar)
    R.floatScale = h('input', { type: 'range', min: 5, max: 300, value: 100, oninput: e => { if (float) { const cx = float.x + float.canvas.width * float.s / 2, cy = float.y + float.canvas.height * float.s / 2; float.s = Number(e.target.value) / 100; float.x = Math.round(cx - float.canvas.width * float.s / 2); float.y = Math.round(cy - float.canvas.height * float.s / 2); scheduleRender(); } } });
    R.floatScaleWrap = h('label', { class: 'as-row', style: 'display:none' }, 'Escala', R.floatScale);
    R.floatBar = h('div', { class: 'as-floatbar', style: 'display:none' }, R.floatScaleWrap, h('button', { class: 'as-btn primary', type: 'button', onclick: commitFloat }, '✔ Aplicar'), h('button', { class: 'as-btn', type: 'button', onclick: cancelFloat }, '✖ Cancelar'));
    R.toolName = h('span', {}); R.zoomBox = h('div', { class: 'as-zoombox' }, h('button', { class: 'as-ic', type: 'button', onclick: () => zoomBy(1 / 1.25) }, '−'), R.zoomLabel, h('button', { class: 'as-ic', type: 'button', onclick: () => zoomBy(1.25) }, '+'), h('button', { class: 'as-ic', type: 'button', title: 'Ajustar à tela', onclick: fitView }, '⤢'));
    R.stage = h('div', { class: 'as-stage' }, view, R.floatBar, R.zoomBox, h('div', { class: 'as-toolname' }, R.toolName)); R.sheets = {};
    // ----- folha: cor -----
    R.hex = h('input', { class: 'as-input hex', maxlength: 7, placeholder: '#8B5CF6', onchange: e => setColor(e.target.value) });
    R.native = h('input', { type: 'color', class: 'as-native', oninput: e => setColor(e.target.value, false), onchange: e => setColor(e.target.value) }); R.prev = h('div', { class: 'as-prev' });
    const hsl = [['H', 360], ['S', 100], ['L', 100]].map(([l, m], i) => { const inp = h('input', { type: 'range', min: 0, max: m, oninput: () => { R.hsl.busy = true; const c = C.hslToRgb(R.hsl[0].value, R.hsl[1].value, R.hsl[2].value); setColor(C.rgbToHex(c.r, c.g, c.b), false); R.hsl.busy = false; }, onchange: () => pushRecent() }); return inp; }); R.hsl = hsl;
    R.recent = h('div', { class: 'as-sws' }); R.favs = h('div', { class: 'as-sws' });
    R.sheets.color = h('div', { class: 'as-sheet', style: 'display:none' }, h('div', { class: 'as-sheet-h' }, h('b', {}, '🌈 Cores'), h('button', { class: 'as-ic', type: 'button', onclick: () => openSheet('color') }, '✖')),
      h('div', { class: 'as-colorrow' }, R.prev, R.hex, R.native, h('button', { class: 'as-ic', type: 'button', title: 'Salvar nos favoritos', onclick: toggleFav }, '⭐'), h('button', { class: 'as-ic', type: 'button', title: 'Alternar cor/borracha', onclick: toggleEraser }, '🧽')),
      h('label', { class: 'as-row' }, h('span', {}, 'Matiz'), hsl[0]), h('label', { class: 'as-row' }, h('span', {}, 'Saturação'), hsl[1]), h('label', { class: 'as-row' }, h('span', {}, 'Luz'), hsl[2]),
      rangeRow('Opacidade', 'alpha', 1, 100, 1, v => v + '%', v => { S.alpha = v / 100; }),
      h('div', { class: 'as-sws' }, PALETTE.map(c => h('button', { class: 'as-sw', type: 'button', style: `background:${c}`, title: c, onclick: () => setColor(c) }))),
      h('small', {}, 'Recentes'), R.recent, h('small', {}, 'Favoritas'), R.favs);
    // ----- folha: pincel -----
    R.sheets.brush = h('div', { class: 'as-sheet', style: 'display:none' }, h('div', { class: 'as-sheet-h' }, h('b', {}, '🖌️ Pincel e ferramentas'), h('button', { class: 'as-ic', type: 'button', onclick: () => openSheet('brush') }, '✖')),
      h('div', { class: 'as-chips' }, BRUSHES.map(([k, n]) => h('button', { class: 'as-btn as-btype', 'data-type': k, type: 'button', onclick: () => { S.brush = k; if (S.tool !== 'brush') setTool('brush'); savePrefs(); syncUI(); } }, n))),
      rangeRow('Tamanho', 'size', 1, 200, 1, v => v + 'px', v => { S.size = v; }), rangeRow('Opacidade', 'alpha', 1, 100, 1, v => v + '%', v => { S.alpha = v / 100; }),
      rangeRow('Dureza', 'hardness', 0, 100, 1, v => v + '%', v => { S.hardness = v / 100; }), rangeRow('Suavidade do traço', 'smooth', 0, 100, 1, v => v + '%', v => { S.smooth = v / 100; }),
      toggleRow('Sensibilidade à pressão (caneta)', 'pressure', v => { S.pressure = v; }), toggleRow('↔ Espelhar horizontalmente (simetria)', 'symmetry', v => { S.symmetry = v; }),
      toggleRow('Preencher formas', 'fillShape', v => { S.fillShape = v; }), rangeRow('Tolerância do balde', 'tol', 0, 128, 1, v => v, v => { S.tol = v; }),
      h('div', { class: 'as-chips' }, h('button', { class: 'as-btn', type: 'button', onclick: duplicateSelection }, '⧉ Duplicar seleção'), h('button', { class: 'as-btn', type: 'button', onclick: deleteSelection }, '⌫ Apagar seleção')));
    // ----- folha: camadas -----
    R.layerList = h('div', { class: 'as-layers' }); R.layerOpOut = h('span', { class: 'as-val' });
    R.layerOp = h('input', { type: 'range', min: 0, max: 100, value: 100, oninput: e => { const A = activeLayer(); if (A) { A.opacity = Number(e.target.value) / 100; R.layerOpOut.textContent = e.target.value + '%'; scheduleRender(); } }, onpointerdown: () => { const A = activeLayer(); if (A) A._opOld = A.opacity; }, onchange: () => { const A = activeLayer(); if (A && A._opOld != null && A._opOld !== A.opacity) { const o = A._opOld, n = A.opacity; pushH({ bytes: 100, undo: () => { A.opacity = o; }, redo: () => { A.opacity = n; } }); markDirty(); } } });
    R.sheets.layers = h('div', { class: 'as-sheet', style: 'display:none' }, h('div', { class: 'as-sheet-h' }, h('b', {}, '📚 Camadas'), h('button', { class: 'as-ic', type: 'button', onclick: () => openSheet('layers') }, '✖')),
      h('div', { class: 'as-chips' }, h('button', { class: 'as-btn', type: 'button', onclick: addLayer }, '＋ Nova'), h('button', { class: 'as-btn', type: 'button', onclick: dupLayer }, '⧉ Duplicar'), h('button', { class: 'as-btn', type: 'button', onclick: renameLayer }, '✏️ Renomear'), h('button', { class: 'as-btn', type: 'button', onclick: () => moveLayer(1) }, '⬆ Subir'), h('button', { class: 'as-btn', type: 'button', onclick: () => moveLayer(-1) }, '⬇ Descer'), h('button', { class: 'as-btn', type: 'button', onclick: clearLayer }, '🧹 Limpar'), h('button', { class: 'as-btn danger', type: 'button', onclick: delLayer }, '🗑️ Excluir')),
      h('label', { class: 'as-row' }, h('span', {}, 'Opacidade da camada'), R.layerOp, R.layerOpOut), R.layerList);
    // ----- barra inferior -----
    R.colorBtn = h('button', { class: 'as-colorbtn', type: 'button', title: 'Cores', 'data-sheet': 'color', onclick: () => openSheet('color') });
    const tools = h('div', { class: 'as-tools' }, TOOLS.map(([id, ic, nm]) => h('button', { class: 'as-tool', type: 'button', 'data-tool': id, title: nm, onclick: () => setTool(id) }, h('span', {}, ic), h('small', {}, nm))));
    const bottom = h('div', { class: 'as-bottom' }, R.colorBtn, tools,
      h('button', { class: 'as-sheetbtn', type: 'button', 'data-sheet': 'brush', onclick: () => openSheet('brush') }, h('span', {}, '🎛️'), h('small', {}, 'Ajustes')), h('button', { class: 'as-sheetbtn', type: 'button', 'data-sheet': 'layers', onclick: () => openSheet('layers') }, h('span', {}, '📚'), h('small', {}, 'Camadas')));
    R.file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none', onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) importImage(f); } });
    root.append(top, R.stage, ...Object.values(R.sheets), bottom, R.file);
    // eventos
    view.addEventListener('pointerdown', onDown); view.addEventListener('pointermove', onMove); view.addEventListener('pointerup', onUp); view.addEventListener('pointercancel', onUp); view.addEventListener('wheel', onWheel, { passive: false });
    view.addEventListener('contextmenu', e => e.preventDefault()); ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => view.addEventListener(t, e => e.preventDefault()));
    window.addEventListener('resize', () => { if (R.root.classList.contains('active')) sizeCanvas(); }); window.addEventListener('orientationchange', () => setTimeout(() => { sizeCanvas(); fitView(); }, 250));
    if (window.ResizeObserver) new ResizeObserver(() => { if (R.root.classList.contains('active')) sizeCanvas(); }).observe(R.stage);
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', e => { if (e.code === 'Space') spaceDown = false; });
  }
  function onKey(e) {
    if (!mounted || !R.root.classList.contains('active')) return; const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.code === 'Space') { spaceDown = true; e.preventDefault(); return; }
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); } else if (mod && k === 'y') { e.preventDefault(); doRedo(); } else if (mod && k === 's') { e.preventDefault(); saveProject(false); }
    else if (!mod) { const m = { b: 'brush', p: 'pencil', e: 'eraser', g: 'fill', i: 'picker', l: 'line', r: 'rect', o: 'ellipse', m: 'select', v: 'move', t: 'text', h: 'hand' }[k]; if (m) setTool(m); else if (k === '[') { S.size = Math.max(1, S.size - 2); syncUI(); } else if (k === ']') { S.size = Math.min(200, S.size + 2); syncUI(); } else if (k === '+' || k === '=') zoomBy(1.25); else if (k === '-') zoomBy(1 / 1.25); else if (k === 'enter' && float) commitFloat(); else if (k === 'escape' && float) cancelFloat(); }
  }
  function injectCSS() {
    if (document.getElementById('as-css')) return;
    document.head.append(h('style', { id: 'as-css' }, `
#artstudio{display:none}
#artstudio.active{display:flex;position:fixed;inset:0;z-index:80;flex-direction:column;background:#0b0712;color:#f7f2ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;overscroll-behavior:none}
#artstudio *{box-sizing:border-box}
.as-top{display:flex;align-items:center;gap:6px;padding:6px 8px;padding-top:max(6px,env(safe-area-inset-top));background:#120a1d;border-bottom:1px solid #2a1840;flex:0 0 auto}
.as-spacer{flex:1}.as-name{background:none;border:0;color:#f7f2ff;font-weight:800;font-size:15px;max-width:34vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:8px 4px}
.as-save{font-size:11px;color:#a99bb8;white-space:nowrap}.as-save.dirty{color:#facc15}.as-save.saved{color:#50d890}.as-save.error{color:#ff5577}
.as-ic{background:#1d112e;border:1px solid #39204d;color:#fff;border-radius:11px;min-width:42px;height:42px;font-size:18px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0 8px}
.as-ic:disabled{opacity:.35}.as-stage{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;background:#0b0712}
.as-view{position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block}
.as-bottom{display:flex;align-items:stretch;gap:4px;padding:6px 6px;padding-bottom:max(6px,env(safe-area-inset-bottom));background:#120a1d;border-top:1px solid #2a1840;flex:0 0 auto}
.as-tools{display:flex;gap:4px;overflow-x:auto;flex:1;scrollbar-width:none;-webkit-overflow-scrolling:touch}.as-tools::-webkit-scrollbar{display:none}
.as-tool,.as-sheetbtn{flex:0 0 auto;min-width:54px;height:54px;background:#1d112e;border:1px solid #39204d;color:#fff;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;cursor:pointer;padding:2px 4px}
.as-tool span,.as-sheetbtn span{font-size:20px;line-height:1}.as-tool small,.as-sheetbtn small{font-size:10px;color:#cdbfda}
.as-tool.on,.as-sheetbtn.on{background:#4c1d95;border-color:#a78bfa;box-shadow:0 0 0 2px #8b5cf655}
.as-colorbtn{flex:0 0 auto;width:54px;height:54px;border-radius:50%;border:3px solid #fff;margin:0 2px;cursor:pointer;box-shadow:0 0 0 2px #39204d}
.as-toolname{position:absolute;left:8px;top:8px;background:#000a;padding:4px 10px;border-radius:999px;font-size:12px;pointer-events:none}
.as-zoombox{position:absolute;right:8px;top:8px;display:flex;align-items:center;gap:4px;background:#000a;padding:4px;border-radius:14px}
.as-zoombox .as-ic{min-width:36px;height:36px;font-size:16px}.as-zoom{font-size:12px;min-width:44px;text-align:center}
.as-floatbar{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;background:#120a1dee;border:1px solid #39204d;border-radius:14px;padding:8px;z-index:4;flex-wrap:wrap;justify-content:center;max-width:96%}
.as-sheet{position:absolute;left:0;right:0;bottom:calc(66px + env(safe-area-inset-bottom));max-height:52%;overflow:auto;background:#140c20f7;border-top:1px solid #39204d;border-radius:18px 18px 0 0;padding:10px 12px;z-index:6;-webkit-overflow-scrolling:touch}
.as-sheet-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.as-row{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:13px}.as-row>span:first-child{flex:0 0 118px;color:#cdbfda}.as-row input[type=range]{flex:1;min-width:0;height:30px;accent-color:#8b5cf6}.as-val{flex:0 0 46px;text-align:right;font-size:12px;color:#a99bb8}
.as-colorrow{display:flex;gap:8px;align-items:center;margin:6px 0}.as-prev{width:42px;height:42px;border-radius:10px;border:2px solid #fff;flex:0 0 auto}.as-native{width:48px;height:42px;border:0;background:none;padding:0}
.as-input{width:100%;background:#0b0810;border:1px solid #432958;color:#fff;border-radius:10px;padding:10px;font-size:15px;-webkit-user-select:text;user-select:text}.as-input.hex{flex:1}
.as-sws{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.as-sw{position:relative;width:32px;height:32px;border-radius:8px;border:2px solid #ffffff55;cursor:pointer;padding:0}
.as-sw i{position:absolute;right:-6px;top:-8px;background:#ff5577;color:#fff;border-radius:50%;width:16px;height:16px;font-size:12px;line-height:16px;font-style:normal;text-align:center}
.as-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.as-btn{background:#1d112e;border:1px solid #39204d;color:#fff;border-radius:11px;padding:10px 12px;font-size:13px;cursor:pointer;min-height:40px}
.as-btn.primary,.as-btn.on{background:#6d28d9;border-color:#a78bfa}.as-btn.danger{background:#7f1d1d;border-color:#dc2626}
.as-layers{display:flex;flex-direction:column;gap:6px;margin-top:8px}.as-layer{display:flex;align-items:center;gap:8px;background:#1d112e;border:1px solid #39204d;border-radius:12px;padding:6px}.as-layer.on{border-color:#a78bfa;background:#2a1450}
.as-lname{flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.as-thumb canvas{width:40px;height:40px;border-radius:6px;display:block}
.as-overlay{position:absolute;inset:0;background:#000b;z-index:20;display:flex;align-items:center;justify-content:center;padding:12px}
.as-modal{background:#140c20;border:1px solid #39204d;border-radius:18px;padding:16px;width:min(560px,100%);max-height:90%;overflow:auto}.as-modal h3{margin:0 0 10px}
.as-modal-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}.as-form{display:grid;gap:10px}.as-form label{display:grid;gap:4px;font-size:13px;color:#cdbfda}
.as-menu{display:grid;gap:6px}.as-menu .as-btn{text-align:left;font-size:15px}.as-muted{color:#a99bb8;font-size:12px;line-height:1.4}
.as-projects{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.as-proj{background:#1d112e;border:1px solid #39204d;border-radius:12px;padding:8px;display:grid;gap:4px}
.as-proj img{width:100%;height:110px;object-fit:contain;background:repeating-conic-gradient(#ddd 0 25%,#bbb 0 50%) 0 0/16px 16px;border-radius:8px}.as-proj small{color:#a99bb8;font-size:10px}.as-proj-btns{display:grid;grid-template-columns:1fr 1fr;gap:4px}.as-proj-btns .as-btn{padding:6px;min-height:34px;font-size:12px}
.as-toast{position:absolute;left:50%;top:64px;transform:translateX(-50%);background:#000d;border:1px solid #39204d;padding:10px 14px;border-radius:12px;z-index:40;font-size:13px;max-width:92%;text-align:center}
@media (orientation:landscape) and (max-height:520px){.as-sheet{left:auto;right:0;top:0;bottom:0;width:min(380px,52%);max-height:none;border-radius:18px 0 0 18px;border-top:0;border-left:1px solid #39204d}.as-tool,.as-sheetbtn{min-width:46px;height:46px}.as-tool small,.as-sheetbtn small{display:none}.as-colorbtn{width:44px;height:44px}.as-top{padding-top:4px;padding-bottom:4px}.as-ic{height:38px}}
`));
  }

  // ---------- abrir / fechar ----------
  async function open() {
    if (!mounted) { loadPrefs(); mount(); }
    document.body.style.overflow = 'hidden'; document.documentElement.style.overscrollBehavior = 'none';
    requestAnimationFrame(async () => {
      sizeCanvas(); syncUI();
      if (!doc) {
        let opened = false, last = null; try { last = localStorage.getItem(lastKey); } catch (e) { /* sem storage */ }
        if (last) { try { await loadProject(last); opened = true; } catch (e) { /* projeto removido: cria novo */ } }
        if (!opened) newDoc(1024, 1024, '#ffffff', false, 'Sem título');
        if (!localStorage.getItem('nvb_art_tip')) { try { localStorage.setItem('nvb_art_tip', '1'); } catch (e) { /* ok */ } toast('💾 Seus projetos ficam salvos neste dispositivo.'); }
      } else { fitView(); }
    });
  }
  function mount() { buildUI(); mounted = true; }
  async function exitStudio() {
    commitFloat(); if (dirty) await saveProject(true);
    document.body.style.overflow = ''; document.documentElement.style.overscrollBehavior = '';
    if (typeof window.go === 'function') window.go('home'); else R.root.classList.remove('active');
  }
  function close() { document.body.style.overflow = ''; document.documentElement.style.overscrollBehavior = ''; }

  window.NVBArt = { open, close, _state: () => ({ S, doc, V, history, float, sel }), _api: { setTool, addLayer, doUndo, doRedo, newDoc, importImage, saveProject, loadProject, compose, resizeDoc, doFill, commitFloat, setColor, toDoc } };
})();

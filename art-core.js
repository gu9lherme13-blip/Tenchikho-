'use strict';
// =========================================================
// 🎨 NVB ART STUDIO — NÚCLEO (lógica pura, sem DOM)
// Funciona no navegador (window.NVBArtCore) e no Node (testes).
// =========================================================
(function (root) {
  const Core = {};

  Core.LIMITS = { maxSide: 4096, maxPixels: 12000000, maxImportBytes: 15 * 1024 * 1024, maxImportSide: 8000, importTypes: ['image/png', 'image/jpeg', 'image/webp'] };
  Core.clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ---------- cores ----------
  Core.normHex = (v, fallback = '#8b5cf6') => {
    let s = String(v || '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map(c => c + c).join('');
    return /^[0-9a-f]{6}$/i.test(s) ? `#${s.toLowerCase()}` : fallback;
  };
  Core.hexToRgb = hex => { const h = Core.normHex(hex, '#000000').slice(1); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }; };
  Core.rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => Core.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  Core.rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
  };
  Core.hslToRgb = (h, s, l) => {
    h = ((h % 360) + 360) % 360; s = Core.clamp(s, 0, 100) / 100; l = Core.clamp(l, 0, 100) / 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
  };

  // ---------- geometria ----------
  Core.unionBox = (a, b) => !a ? b : !b ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
  Core.clipBox = (b, w, h) => {
    const x0 = Core.clamp(Math.floor(b.x0), 0, w), y0 = Core.clamp(Math.floor(b.y0), 0, h), x1 = Core.clamp(Math.ceil(b.x1), 0, w), y1 = Core.clamp(Math.ceil(b.y1), 0, h);
    return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
  };
  Core.fitView = (w, h, vw, vh, margin = 16) => {
    const z = Core.clamp(Math.min((vw - margin * 2) / w, (vh - margin * 2) / h), 0.02, 32);
    return { z, x: (vw - w * z) / 2, y: (vh - h * z) / 2 };
  };
  // zoom mantendo o ponto (cx, cy) da tela fixo sobre o mesmo ponto do desenho
  Core.zoomAt = (view, newZ, cx, cy) => {
    const z = Core.clamp(newZ, 0.02, 32), dx = (cx - view.x) / view.z, dy = (cy - view.y) / view.z;
    return { z, x: cx - dx * z, y: cy - dy * z };
  };
  // pontos de carimbo ao longo de um segmento, com espaçamento constante entre segmentos
  Core.stampPoints = (x0, y0, x1, y1, spacing, carry) => {
    const dx = x1 - x0, dy = y1 - y0, dist = Math.hypot(dx, dy), pts = [];
    if (dist === 0) return { pts, carry };
    let d = spacing - carry;
    while (d <= dist) { pts.push({ x: x0 + dx * (d / dist), y: y0 + dy * (d / dist) }); d += spacing; }
    return { pts, carry: dist - (d - spacing) };
  };
  Core.smoothPoint = (prev, cur, amount) => { const k = 1 - Core.clamp(amount, 0, 1) * 0.85; return { x: prev.x + (cur.x - prev.x) * k, y: prev.y + (cur.y - prev.y) * k }; };

  // ---------- limites de memória ----------
  Core.checkDocSize = (w, h) => {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return 'Informe largura e altura válidas.';
    if (w > Core.LIMITS.maxSide || h > Core.LIMITS.maxSide) return `O lado máximo é ${Core.LIMITS.maxSide}px.`;
    if (w * h > Core.LIMITS.maxPixels) return `O tamanho máximo é ${(Core.LIMITS.maxPixels / 1e6).toFixed(0)} milhões de pixels (ex.: 3464×3464).`;
    return null;
  };
  Core.maxLayers = (w, h) => Core.clamp(Math.floor(320e6 / (w * h * 4)), 3, 24);
  Core.checkImportFile = f => {
    if (!f) return 'Nenhum arquivo selecionado.';
    if (!Core.LIMITS.importTypes.includes(f.type)) return 'Formato não suportado. Use PNG, JPEG ou WebP.';
    if (f.size > Core.LIMITS.maxImportBytes) return `Arquivo grande demais (máx. ${Core.LIMITS.maxImportBytes / 1048576} MB).`;
    return null;
  };
  Core.fitContain = (iw, ih, w, h) => { const s = Math.min(w / iw, h / ih, 1); return { scale: s, w: Math.round(iw * s), h: Math.round(ih * s) }; };

  // ---------- balde de tinta (flood fill por linhas) ----------
  // Retorna { mask, box } com os pixels que serão preenchidos (sem alterar `data`).
  Core.fillRegion = (data, w, h, sx, sy, tol) => {
    sx = Math.floor(sx); sy = Math.floor(sy);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
    const i0 = (sy * w + sx) * 4, tr = data[i0], tg = data[i0 + 1], tb = data[i0 + 2], ta = data[i0 + 3];
    const match = i => Math.abs(data[i] - tr) <= tol && Math.abs(data[i + 1] - tg) <= tol && Math.abs(data[i + 2] - tb) <= tol && Math.abs(data[i + 3] - ta) <= tol;
    const mask = new Uint8Array(w * h), stack = [sx, sy];
    let x0 = sx, x1 = sx, y0 = sy, y1 = sy;
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      let xl = x; while (xl >= 0 && !mask[y * w + xl] && match((y * w + xl) * 4)) xl--; xl++;
      let xr = x; while (xr < w && !mask[y * w + xr] && match((y * w + xr) * 4)) xr++; xr--;
      if (xr < xl) continue;
      for (let i = xl; i <= xr; i++) mask[y * w + i] = 1;
      if (xl < x0) x0 = xl; if (xr > x1) x1 = xr; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= h) continue;
        let inRun = false;
        for (let i = xl; i <= xr; i++) {
          const ok = !mask[ny * w + i] && match((ny * w + i) * 4);
          if (ok && !inRun) { stack.push(i, ny); inRun = true; } else if (!ok) inRun = false;
        }
      }
    }
    return { mask, box: { x0, y0, x1: x1 + 1, y1: y1 + 1 } };
  };
  // aplica a cor (source-over) nos pixels da máscara; `a` de 0 a 1
  Core.applyFill = (data, mask, w, box, rgb, a) => {
    let changed = 0;
    for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) {
      if (!mask[y * w + x]) continue;
      const i = (y * w + x) * 4, da = data[i + 3] / 255, oa = a + da * (1 - a);
      if (oa > 0) {
        data[i] = Math.round((rgb.r * a + data[i] * da * (1 - a)) / oa);
        data[i + 1] = Math.round((rgb.g * a + data[i + 1] * da * (1 - a)) / oa);
        data[i + 2] = Math.round((rgb.b * a + data[i + 2] * da * (1 - a)) / oa);
      }
      data[i + 3] = Math.round(oa * 255); changed++;
    }
    return changed;
  };

  // ---------- composição de um pixel (conta-gotas) ----------
  // layers: de baixo para cima [{r,g,b,a (0-255), opacity (0-1)}]; bg: {r,g,b} ou null
  Core.blendPixels = (layers, bg) => {
    let r = bg ? bg.r : 0, g = bg ? bg.g : 0, b = bg ? bg.b : 0, a = bg ? 1 : 0;
    for (const p of layers) {
      const sa = (p.a / 255) * (p.opacity ?? 1); if (sa <= 0) continue;
      const oa = sa + a * (1 - sa);
      r = (p.r * sa + r * a * (1 - sa)) / oa; g = (p.g * sa + g * a * (1 - sa)) / oa; b = (p.b * sa + b * a * (1 - sa)) / oa; a = oa;
    }
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a };
  };

  // ---------- histórico (desfazer/refazer) com limite de memória ----------
  Core.History = class {
    constructor(maxBytes = 160e6, maxSteps = 300) { this.maxBytes = maxBytes; this.maxSteps = maxSteps; this.undoStack = []; this.redoStack = []; this.bytes = 0; this.busy = false; }
    push(entry) {
      if (this.busy) return;
      for (const e of this.redoStack) this.bytes -= e.bytes || 0;
      this.redoStack = [];
      this.undoStack.push(entry); this.bytes += entry.bytes || 0;
      while (this.undoStack.length > 1 && (this.bytes > this.maxBytes || this.undoStack.length > this.maxSteps)) this.bytes -= this.undoStack.shift().bytes || 0;
    }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    undo() { const e = this.undoStack.pop(); if (!e) return false; this.busy = true; try { e.undo(); } finally { this.busy = false; } this.redoStack.push(e); return true; }
    redo() { const e = this.redoStack.pop(); if (!e) return false; this.busy = true; try { e.redo(); } finally { this.busy = false; } this.undoStack.push(e); return true; }
    clear() { this.undoStack = []; this.redoStack = []; this.bytes = 0; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.NVBArtCore = Core;
})(typeof window !== 'undefined' ? window : globalThis);

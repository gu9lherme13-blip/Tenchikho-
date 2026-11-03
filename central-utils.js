'use strict';
const crypto = require('node:crypto');

// Permissões do Discord que liberam o painel: Administrador (0x8) e Gerenciar Servidor (0x20).
const PERMISSOES_STAFF = (1n << 3n) | (1n << 5n);

function podeGerenciar(permissions) {
  try { return (BigInt(permissions) & PERMISSOES_STAFF) !== 0n; } catch { return false; }
}

// Guarda só um HMAC do ID do membro: evita duplicidade sem armazenar o ID puro.
function memberHash(userId, secret) {
  if (!secret) throw new Error('HASH_SECRET ausente.');
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex');
}

function parseCookies(header) {
  const out = {};
  for (const parte of String(header || '').split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const nome = parte.slice(0, i).trim();
    if (!nome) continue;
    try { out[nome] = decodeURIComponent(parte.slice(i + 1).trim()); } catch { /* cookie malformado: ignora */ }
  }
  return out;
}

function sanitizeName(s) {
  const limpo = String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64);
  return limpo || 'Membro';
}

function validarChamada(body) {
  const erros = [];
  const b = body && typeof body === 'object' ? body : {};
  const title = String(b.title ?? '').trim();
  const notice = String(b.notice ?? '').trim();
  const durationMinutes = Number(b.durationMinutes);
  const guildId = String(b.guildId ?? '').trim();
  const channelId = String(b.channelId ?? '').trim();
  if (!title || title.length > 100) erros.push('Título é obrigatório (até 100 caracteres).');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 10080) erros.push('Duração deve ser entre 1 minuto e 7 dias.');
  if (notice.length > 1500) erros.push('O aviso pode ter até 1500 caracteres.');
  if (!/^\d{5,25}$/.test(guildId) || !/^\d{5,25}$/.test(channelId)) erros.push('Escolha servidor e canal válidos.');
  return { ok: erros.length === 0, erros, valor: { title, notice, durationMinutes, guildId, channelId } };
}

function duracaoMinutos(c) {
  const inicio = Date.parse(c.createdAt);
  const fim = Date.parse(c.closedAt || c.closesAt);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim)) return 0;
  return Math.max(0, Math.round((fim - inicio) / 60000));
}

// Versão segura para o navegador: nunca inclui o hash do membro.
function publicCall(c) {
  return {
    id: c.id, title: c.title, guildId: c.guildId, channelId: c.channelId,
    channelName: c.channelName || null, status: c.status,
    createdAt: c.createdAt, closesAt: c.closesAt, closedAt: c.closedAt || null,
    closeReason: c.closeReason || null, durationMinutes: duracaoMinutos(c),
    members: (c.members || []).map(m => ({ name: m.name, at: m.at }))
  };
}

function addMember(call, hash, name, at) {
  call.members = call.members || [];
  if (call.members.some(m => m.hash === hash)) return false;
  call.members.push({ name: sanitizeName(name), hash, at });
  return true;
}

module.exports = { podeGerenciar, memberHash, parseCookies, sanitizeName, validarChamada, duracaoMinutos, publicCall, addMember, PERMISSOES_STAFF };

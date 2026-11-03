'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const U = require('./central-utils');

test('podeGerenciar aceita Administrador e Gerenciar Servidor', () => {
  assert.equal(U.podeGerenciar('8'), true);
  assert.equal(U.podeGerenciar('32'), true);
  assert.equal(U.podeGerenciar('1024'), false);
  assert.equal(U.podeGerenciar('0'), false);
  assert.equal(U.podeGerenciar('abc'), false);
  assert.equal(U.podeGerenciar(undefined), false);
});

test('memberHash é estável, não revela o ID e depende do segredo', () => {
  const h = U.memberHash('123456789012345678', 'segredo-a');
  assert.equal(h, U.memberHash('123456789012345678', 'segredo-a'));
  assert.notEqual(h, U.memberHash('123456789012345679', 'segredo-a'));
  assert.equal(h.includes('123456789012345678'), false);
  assert.notEqual(h, U.memberHash('123456789012345678', 'segredo-b'));
  assert.throws(() => U.memberHash('1', ''));
});

test('parseCookies lê pares e ignora lixo', () => {
  assert.deepEqual(U.parseCookies('a=1; tch_sid=abc%2Fdef; x'), { a: '1', tch_sid: 'abc/def' });
  assert.deepEqual(U.parseCookies(undefined), {});
});

test('validarChamada exige título, duração e IDs válidos', () => {
  const ok = { title: ' Chamada geral ', durationMinutes: 30, guildId: '123456789012345678', channelId: '223456789012345678', notice: '' };
  const r = U.validarChamada(ok);
  assert.equal(r.ok, true);
  assert.equal(r.valor.title, 'Chamada geral');
  assert.equal(U.validarChamada({ ...ok, title: '' }).ok, false);
  assert.equal(U.validarChamada({ ...ok, durationMinutes: 0 }).ok, false);
  assert.equal(U.validarChamada({ ...ok, durationMinutes: 10081 }).ok, false);
  assert.equal(U.validarChamada({ ...ok, durationMinutes: 1.5 }).ok, false);
  assert.equal(U.validarChamada({ ...ok, channelId: 'abc' }).ok, false);
  assert.equal(U.validarChamada({ ...ok, notice: 'x'.repeat(1501) }).ok, false);
  assert.equal(U.validarChamada(null).ok, false);
});

test('addMember registra cada membro uma única vez e guarda só o nome', () => {
  const call = { members: [] };
  assert.equal(U.addMember(call, 'h1', 'Ana\n<b>', '2026-01-01T00:00:00Z'), true);
  assert.equal(U.addMember(call, 'h1', 'Ana', '2026-01-01T00:01:00Z'), false);
  assert.equal(call.members.length, 1);
  assert.equal(call.members[0].name, 'Ana<b>');
});

test('publicCall nunca expõe o hash do membro', () => {
  const c = { id: '1', title: 'T', guildId: 'g', channelId: 'c', status: 'open', createdAt: '2026-01-01T00:00:00Z', closesAt: '2026-01-01T00:30:00Z', members: [{ name: 'Ana', hash: 'SECRETO', at: '2026-01-01T00:05:00Z' }] };
  const p = U.publicCall(c);
  assert.equal(JSON.stringify(p).includes('SECRETO'), false);
  assert.equal(p.durationMinutes, 30);
  assert.deepEqual(p.members, [{ name: 'Ana', at: '2026-01-01T00:05:00Z' }]);
});

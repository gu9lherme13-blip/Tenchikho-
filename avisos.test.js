const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const A = require('./avisos');

test('aviso válido passa e é limpo', () => {
  const v = A.validarAviso({ titulo: '  Manutenção  ', descricao: 'Amanhã', conteudo: 'O servidor fica offline.' });
  assert.equal(v.ok, true);
  assert.equal(v.valor.titulo, 'Manutenção');
});
test('título e conteúdo são obrigatórios', () => {
  assert.equal(A.validarAviso({ titulo: '', conteudo: 'x' }).ok, false);
  assert.equal(A.validarAviso({ titulo: 'x', conteudo: '   ' }).ok, false);
});
test('limites de tamanho são respeitados', () => {
  assert.equal(A.validarAviso({ titulo: 'a'.repeat(101), conteudo: 'x' }).ok, false);
  assert.equal(A.validarAviso({ titulo: 'a', descricao: 'b'.repeat(301), conteudo: 'x' }).ok, false);
  assert.equal(A.validarAviso({ titulo: 'a', conteudo: 'c'.repeat(1501) }).ok, false);
  assert.equal(A.validarAviso({ titulo: 'a', conteudo: 'c'.repeat(1500) }).ok, true);
});
test('texto publicado tem título em negrito e omite descrição vazia', () => {
  assert.equal(A.montarTexto({ titulo: 'Oi', descricao: '', conteudo: 'Tudo bem' }), '📢 **Oi**\nTudo bem');
});
test('repositório salva, lista por servidor, atualiza e apaga', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avisos-'));
  const repo = A.criarRepositorio(dir);
  const a = repo.criar({ guildId: '111111111111111111', canalId: '1', titulo: 'T', descricao: '', conteudo: 'C', messageId: 'm1' });
  repo.criar({ guildId: '222222222222222222', canalId: '2', titulo: 'Outro', descricao: '', conteudo: 'C', messageId: 'm2' });
  assert.equal(repo.listar('111111111111111111').length, 1);
  assert.equal(repo.buscar('111111111111111111', a.id).titulo, 'T');
  assert.equal(repo.buscar('222222222222222222', a.id), null);
  assert.equal(repo.atualizar('111111111111111111', a.id, { titulo: 'Novo' }).titulo, 'Novo');
  assert.equal(repo.apagar('111111111111111111', a.id), true);
  assert.equal(repo.listar('111111111111111111').length, 0);
});
test('arquivo corrompido não é sobrescrito', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avisos-'));
  fs.writeFileSync(path.join(dir, 'avisos.json'), '{não é json');
  const repo = A.criarRepositorio(dir);
  assert.throws(() => repo.listar('111111111111111111'), /corrompido/);
  assert.ok(fs.readdirSync(dir).some(f => f.includes('corrompido')));
});

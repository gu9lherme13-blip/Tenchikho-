'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const F = require('./funcoes');

const G1 = '111111111111111111';
const G2 = '222222222222222222';
const CANAL = '333333333333333333';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tk-funcoes-'));

test('ativar e desligar persistem após criar nova instância (simula reinício)', () => {
  const dir = tmp();
  const a = F.criarConfigServidor(dir);
  a.definirAtivo(G1, 'chamada', true);
  const b = F.criarConfigServidor(dir);
  assert.equal(b.funcao(G1, 'chamada').enabled, true);
  b.definirAtivo(G1, 'chamada', false);
  assert.equal(F.criarConfigServidor(dir).funcao(G1, 'chamada').enabled, false);
});

test('configuração de um servidor não altera a de outro', () => {
  const dir = tmp();
  const c = F.criarConfigServidor(dir);
  c.salvarConfig(G1, 'chamada', { canalPadraoId: CANAL, duracaoPadrao: 45, avisoPadrao: 'Só no G1' });
  c.definirAtivo(G1, 'chamada', true);
  const g2 = c.funcao(G2, 'chamada');
  assert.equal(g2.enabled, false);
  assert.equal(g2.canalPadraoId, '');
  assert.equal(g2.duracaoPadrao, 30);
  assert.equal(g2.avisoPadrao, '');
  assert.equal(c.funcao(G1, 'chamada').duracaoPadrao, 45);
});

test('arquivo de configuração de um servidor fica separado do outro', () => {
  const dir = tmp();
  const c = F.criarConfigServidor(dir);
  c.definirAtivo(G1, 'chamada', true);
  c.definirAtivo(G2, 'chamada', false);
  assert.ok(fs.existsSync(path.join(dir, 'config', `${G1}.json`)));
  assert.ok(fs.existsSync(path.join(dir, 'config', `${G2}.json`)));
});

test('ID de servidor inválido é recusado (não vira caminho de arquivo)', () => {
  const c = F.criarConfigServidor(tmp());
  assert.throws(() => c.funcao('../../etc', 'chamada'), /ID de servidor inválido/);
  assert.throws(() => c.definirAtivo('abc', 'chamada', true), /ID de servidor inválido/);
});

test('configuração corrompida não é sobrescrita: cópia é guardada e erro é lançado', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'config'));
  const f = path.join(dir, 'config', `${G1}.json`);
  fs.writeFileSync(f, '{ isto não é json');
  const c = F.criarConfigServidor(dir);
  assert.throws(() => c.definirAtivo(G1, 'chamada', true), /corrompida/);
  assert.equal(fs.readFileSync(f, 'utf8'), '{ isto não é json');
  assert.ok(fs.readdirSync(path.join(dir, 'config')).some(n => n.includes('.corrompido-')));
});

test('validarConfig aceita valores válidos e recusa inválidos', () => {
  const ok = F.validarConfig('chamada', { canalPadraoId: CANAL, duracaoPadrao: '60', avisoPadrao: '  Olá  ' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.valor, { canalPadraoId: CANAL, duracaoPadrao: 60, avisoPadrao: 'Olá' });

  assert.equal(F.validarConfig('chamada', { canalPadraoId: 'abc', duracaoPadrao: 30 }).ok, false);
  assert.equal(F.validarConfig('chamada', { duracaoPadrao: 0 }).ok, false);
  assert.equal(F.validarConfig('chamada', { duracaoPadrao: 10081 }).ok, false);
  assert.equal(F.validarConfig('chamada', { duracaoPadrao: 30, avisoPadrao: 'x'.repeat(1501) }).ok, false);
});

test('validarConfig descarta campos fora do esquema', () => {
  const r = F.validarConfig('chamada', { duracaoPadrao: 30, enabled: true, outro: 'x' });
  assert.deepEqual(Object.keys(r.valor).sort(), ['avisoPadrao', 'canalPadraoId', 'duracaoPadrao']);
});

test('função inexistente não aceita configuração', () => {
  assert.equal(F.validarConfig('nao-existe', { x: 1 }).ok, false);
});

test('status: DESLIGADO quando a função nunca foi ativada', () => {
  const c = F.criarConfigServidor(tmp());
  const chamada = F.listarFuncoes(c, G1, true).find(f => f.chave === 'chamada');
  assert.equal(chamada.status, 'DESLIGADO');
  assert.equal(chamada.ativo, false);
});

test('status: ATIVO só quando ligada E bot presente no servidor', () => {
  const c = F.criarConfigServidor(tmp());
  c.definirAtivo(G1, 'chamada', true);
  const comBot = F.listarFuncoes(c, G1, true).find(f => f.chave === 'chamada');
  assert.equal(comBot.status, 'ATIVO');
  const semBot = F.listarFuncoes(c, G1, false).find(f => f.chave === 'chamada');
  assert.equal(semBot.status, 'DESLIGADO');
  assert.match(semBot.aviso, /bot não está neste servidor/);
});

test('funções sem código neste ZIP nunca aparecem como ATIVO', () => {
  const c = F.criarConfigServidor(tmp());
  // mesmo com o flag gravado manualmente no arquivo, não há como estar ativo
  c.definirAtivo(G1, 'ticket', true);
  const lista = F.listarFuncoes(c, G1, true);
  for (const f of lista.filter(x => !x.implementada)) {
    assert.equal(f.ativo, false, `${f.chave} não deveria estar ativo`);
    assert.equal(f.status, 'DESLIGADO');
    assert.equal(f.configuravel, true, `${f.chave} deveria aceitar configuração`);
    assert.ok(f.aviso);
  }
});

test('a lista contém as 15 funções pedidas, sem nomes inventados', () => {
  const nomes = F.FUNCOES.map(f => f.nome);
  assert.equal(nomes.length, 15);
  for (const n of ['Tenchikho.IA', 'Ticket', 'Roblox', 'Central de Avisos', 'Gerenciamento de Canais', 'Auto Cargo',
    'Aniversário', 'Boas-vindas', 'Chamada', 'Diagnóstico', 'Doações e Moeda Tenchi', 'Games', 'Moderação',
    'Recrutamento', 'Saída']) {
    assert.ok(nomes.includes(n), `faltando ${n}`);
  }
});

test('Chamada e Gerenciamento de Canais estão implementadas neste pacote', () => {
  assert.deepEqual(F.FUNCOES.filter(f => f.implementada).map(f => f.chave).sort(), ['canais', 'chamada']);
});

// ---------- nomes de canal (gerenciamento de canais) ----------
const { normalizarNomeCanal, validarNomeCanal } = require('./funcoes');
test('nome de canal vira minúsculo, com hífens e sem símbolos', () => {
  assert.equal(normalizarNomeCanal('  Jogo da Noite!! '), 'jogo-da-noite');
  assert.equal(normalizarNomeCanal('a   b--c'), 'a-b-c');
});
test('nome de canal sem letras ou números é recusado', () => {
  assert.equal(validarNomeCanal('!!!').ok, false);
  assert.equal(validarNomeCanal('   ').ok, false);
});
test('nome de canal com mais de 100 caracteres é recusado', () => {
  assert.equal(validarNomeCanal('a'.repeat(101)).ok, false);
  assert.equal(validarNomeCanal('a'.repeat(100)).ok, true);
});
test('configuração de canais aceita só categoria válida', () => {
  assert.equal(F.validarConfig('canais', { categoriaPadraoId: '' }).ok, true);
  assert.equal(F.validarConfig('canais', { categoriaPadraoId: '123456789012345678' }).ok, true);
  assert.equal(F.validarConfig('canais', { categoriaPadraoId: 'abc' }).ok, false);
});

test('todas as funções têm campos de configuração', () => {
  for (const f of F.FUNCOES) {
    if (f.chave === 'chamada' || f.chave === 'canais') continue;
    assert.ok((F.CAMPOS[f.chave] || []).length > 0, `${f.chave} sem campos`);
  }
});
test('doações: mínimo não pode passar do máximo nem o máximo do limite diário', () => {
  assert.equal(F.validarConfig('doacoes', { valorMinimo: 10, valorMaximo: 5, limiteDiario: 100 }).ok, false);
  assert.equal(F.validarConfig('doacoes', { valorMinimo: 1, valorMaximo: 500, limiteDiario: 100 }).ok, false);
  assert.equal(F.validarConfig('doacoes', { valorMinimo: 1, valorMaximo: 50, limiteDiario: 100 }).ok, true);
});
test('roblox: nome de usuário fora do padrão é recusado', () => {
  assert.equal(F.validarConfig('roblox', { usuario: 'ab' }).ok, false);
  assert.equal(F.validarConfig('roblox', { usuario: 'Nome_Valido1' }).ok, true);
});
test('mensagens de saída e boas-vindas aceitam {membro}', () => {
  const v = F.validarConfig('saida', { canalId: '', mensagem: 'Tchau, {membro}!' });
  assert.equal(v.ok, true);
  assert.equal(v.valor.mensagem, 'Tchau, {membro}!');
});


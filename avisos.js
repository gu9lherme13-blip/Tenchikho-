'use strict';
// Central de Avisos: validação, texto publicado no Discord e armazenamento dos avisos.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const LIMITES = Object.freeze({ titulo: 100, descricao: 300, conteudo: 1500 });

const limpar = t => String(t ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();

function validarAviso(corpo) {
  const b = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
  const titulo = limpar(b.titulo);
  const descricao = limpar(b.descricao);
  const conteudo = limpar(b.conteudo);
  const erros = [];
  if (!titulo) erros.push('Informe o título do aviso.');
  if (titulo.length > LIMITES.titulo) erros.push(`O título pode ter até ${LIMITES.titulo} caracteres.`);
  if (descricao.length > LIMITES.descricao) erros.push(`A descrição pode ter até ${LIMITES.descricao} caracteres.`);
  if (!conteudo) erros.push('Informe o conteúdo do aviso.');
  if (conteudo.length > LIMITES.conteudo) erros.push(`O conteúdo pode ter até ${LIMITES.conteudo} caracteres.`);
  return { ok: erros.length === 0, erros, valor: { titulo, descricao, conteudo } };
}

// Texto exatamente como é publicado no canal (também usado na prévia do painel).
function montarTexto(a) {
  return [`📢 **${a.titulo}**`, a.descricao, a.conteudo].filter(Boolean).join('\n');
}

// Armazenamento: todos os avisos em um arquivo JSON, com gravação atômica.
// Se o arquivo estiver corrompido, guarda uma cópia e falha em vez de sobrescrever.
function criarRepositorio(dataDir) {
  const file = path.join(dataDir, 'avisos.json');
  function ler() {
    if (!fs.existsSync(file)) return [];
    let d;
    try { d = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch {
      fs.copyFileSync(file, `${file}.corrompido-${Date.now()}`);
      throw new Error('avisos.json corrompido; cópia salva antes de qualquer gravação.');
    }
    return Array.isArray(d) ? d : [];
  }
  function gravar(lista) {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(lista, null, 2));
    fs.renameSync(tmp, file);
  }
  return {
    listar(guildId) {
      return ler().filter(a => a.guildId === guildId).sort((x, y) => String(y.criadoEm).localeCompare(String(x.criadoEm)));
    },
    buscar(guildId, id) {
      return ler().find(a => a.guildId === guildId && a.id === id) || null;
    },
    criar(dados) {
      const lista = ler();
      const aviso = { id: crypto.randomBytes(6).toString('hex'), ...dados, criadoEm: new Date().toISOString(), atualizadoEm: null };
      lista.push(aviso);
      gravar(lista);
      return aviso;
    },
    atualizar(guildId, id, campos) {
      const lista = ler();
      const i = lista.findIndex(a => a.guildId === guildId && a.id === id);
      if (i < 0) return null;
      lista[i] = { ...lista[i], ...campos, atualizadoEm: new Date().toISOString() };
      gravar(lista);
      return lista[i];
    },
    apagar(guildId, id) {
      const lista = ler();
      const i = lista.findIndex(a => a.guildId === guildId && a.id === id);
      if (i < 0) return false;
      lista.splice(i, 1);
      gravar(lista);
      return true;
    }
  };
}

module.exports = { LIMITES, validarAviso, montarTexto, criarRepositorio };

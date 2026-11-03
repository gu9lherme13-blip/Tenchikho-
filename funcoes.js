'use strict';
// =========================================================
// Tenchikho • registro de funções do painel
//
// Cada função mostra o estado REAL do código:
//  - implementada: true só quando o index.js deste pacote carrega o sistema de fato.
//  - motivo: explica por que uma função não pode ser ativada neste pacote.
// O "ativo" de cada função vem da configuração salva do servidor (enabled) somado
// à presença real do bot no servidor. Nada é marcado como ativo por aparência.
// =========================================================
const fs = require('node:fs');
const path = require('node:path');

const GUILD_ID_RE = /^\d{5,25}$/;
const MOTIVO_MODULO = 'O arquivo existe neste ZIP, mas o arquivo principal do bot que o carrega não foi enviado. Não há como ativá-lo aqui.';
const MOTIVO_SEM_CODIGO = 'Não há código deste sistema neste ZIP.';

const FUNCOES = Object.freeze([
  { chave: 'ia', nome: 'Tenchikho.IA', descricao: 'Comandos de IA (/ia, /imagem, /analisar, /traduzir, /resumir).', implementada: false, motivo: MOTIVO_MODULO },
  { chave: 'ticket', nome: 'Ticket', descricao: 'Painel de tickets com abertura por botão.', implementada: false, motivo: MOTIVO_MODULO },
  { chave: 'roblox', nome: 'Roblox', descricao: 'Vínculo de nick do Roblox com membros.', implementada: false, motivo: MOTIVO_MODULO },
  { chave: 'avisos', nome: 'Central de Avisos', descricao: 'Publicação centralizada de avisos.', implementada: false, motivo: MOTIVO_SEM_CODIGO },
  { chave: 'canais', nome: 'Gerenciamento de Canais', descricao: 'Cria, renomeia e apaga canais de texto e voz pelo painel.', implementada: true, motivo: null },
  { chave: 'autocargo', nome: 'Auto Cargo', descricao: 'Painel para membros escolherem cargos.', implementada: false, motivo: MOTIVO_MODULO },
  { chave: 'aniversario', nome: 'Aniversário', descricao: 'Mensagens automáticas de aniversário.', implementada: false, motivo: MOTIVO_MODULO },
  { chave: 'boasvindas', nome: 'Boas-vindas', descricao: 'Cartão de boas-vindas para novos membros.', implementada: false, motivo: MOTIVO_MODULO },
  { chave: 'chamada', nome: 'Chamada', descricao: 'Central de Chamadas: abre chamadas, registra presença por mensagem e guarda histórico.', implementada: true, motivo: null },
  { chave: 'diagnostico', nome: 'Diagnóstico', descricao: 'Verificação de estado do bot.', implementada: false, motivo: MOTIVO_SEM_CODIGO },
  { chave: 'doacoes', nome: 'Doações e Moeda Tenchi', descricao: 'Doações e moeda interna.', implementada: false, motivo: MOTIVO_SEM_CODIGO },
  { chave: 'games', nome: 'Games', descricao: 'Jogos e entretenimento.', implementada: false, motivo: MOTIVO_MODULO },
  { chave: 'moderacao', nome: 'Moderação', descricao: 'Histórico e ações de moderação.', implementada: false, motivo: MOTIVO_MODULO },
  { chave: 'recrutamento', nome: 'Recrutamento', descricao: 'Formulário e painel de recrutamento.', implementada: false, motivo: MOTIVO_MODULO },
  { chave: 'saida', nome: 'Saída', descricao: 'Aviso quando um membro sai do servidor.', implementada: false, motivo: MOTIVO_SEM_CODIGO }
]);

const CHAVES = new Set(FUNCOES.map(f => f.chave));
const porChave = chave => FUNCOES.find(f => f.chave === chave) || null;

// ---------- configuração por função ----------
const CONFIG_PADRAO = {
  chamada: { canalPadraoId: '', duracaoPadrao: 30, avisoPadrao: '' },
  canais: { categoriaPadraoId: '' }
};

function configPadrao(chave) {
  return { ...(CONFIG_PADRAO[chave] || {}) };
}

// Valida a configuração de uma função. Nunca aceita campos fora do esquema.
function validarConfig(chave, body) {
  const erros = [];
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  if (chave === 'canais') {
    const categoriaPadraoId = String(b.categoriaPadraoId ?? '').trim();
    if (categoriaPadraoId && !/^\d{5,25}$/.test(categoriaPadraoId)) erros.push('Categoria padrão inválida.');
    return { ok: erros.length === 0, erros, valor: { categoriaPadraoId } };
  }
  if (chave !== 'chamada') return { ok: false, erros: ['Esta função não tem configurações neste pacote.'], valor: null };

  const canalPadraoId = String(b.canalPadraoId ?? '').trim();
  const duracaoPadrao = Number(b.duracaoPadrao);
  const avisoPadrao = String(b.avisoPadrao ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();

  if (canalPadraoId && !/^\d{5,25}$/.test(canalPadraoId)) erros.push('Canal padrão inválido.');
  if (!Number.isInteger(duracaoPadrao) || duracaoPadrao < 1 || duracaoPadrao > 10080) erros.push('Duração padrão deve ser entre 1 minuto e 7 dias.');
  if (avisoPadrao.length > 1500) erros.push('O aviso padrão pode ter até 1500 caracteres.');

  return {
    ok: erros.length === 0,
    erros,
    valor: { canalPadraoId, duracaoPadrao, avisoPadrao }
  };
}

// ---------- nomes de canal ----------
// Discord guarda nomes de canal de texto em minúsculas e com hífens no lugar de espaços.
function normalizarNomeCanal(texto) {
  return String(texto ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validarNomeCanal(texto) {
  const nome = normalizarNomeCanal(texto);
  if (!nome) return { ok: false, erro: 'Informe um nome com letras ou números.', valor: null };
  if (nome.length > 100) return { ok: false, erro: 'O nome do canal pode ter até 100 caracteres.', valor: null };
  return { ok: true, erro: null, valor: nome };
}

// ---------- armazenamento por servidor ----------
// Um arquivo por servidor: DATA_DIR/config/<guildId>.json. Gravação atômica.
function criarConfigServidor(dataDir) {
  const dir = path.join(dataDir, 'config');
  function arquivo(guildId) {
    if (!GUILD_ID_RE.test(String(guildId))) throw new Error('ID de servidor inválido.');
    return path.join(dir, `${guildId}.json`);
  }
  function ler(guildId) {
    const f = arquivo(guildId);
    if (!fs.existsSync(f)) return {};
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
    } catch {
      // não sobrescreve um arquivo corrompido: guarda uma cópia e falha
      fs.copyFileSync(f, `${f}.corrompido-${Date.now()}`);
      throw new Error(`Configuração corrompida do servidor ${guildId}; cópia salva antes de qualquer gravação.`);
    }
  }
  function gravar(guildId, dados) {
    fs.mkdirSync(dir, { recursive: true });
    const f = arquivo(guildId);
    const tmp = `${f}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(dados, null, 2));
    fs.renameSync(tmp, f);
  }
  // Retorna a configuração de uma função já com os valores padrão preenchidos.
  function funcao(guildId, chave) {
    const bruto = ler(guildId)[chave] || {};
    return { enabled: bruto.enabled === true, ...configPadrao(chave), ...pick(bruto, chave) };
  }
  function pick(bruto, chave) {
    const out = {};
    for (const k of Object.keys(CONFIG_PADRAO[chave] || {})) if (k in bruto) out[k] = bruto[k];
    return out;
  }
  function definirAtivo(guildId, chave, enabled) {
    const todas = ler(guildId);
    todas[chave] = { ...(todas[chave] || {}), enabled: enabled === true };
    gravar(guildId, todas);
    return funcao(guildId, chave);
  }
  function salvarConfig(guildId, chave, valor) {
    const todas = ler(guildId);
    todas[chave] = { ...(todas[chave] || {}), ...valor, atualizadoEm: new Date().toISOString() };
    gravar(guildId, todas);
    return funcao(guildId, chave);
  }
  return { ler, funcao, definirAtivo, salvarConfig };
}

// Lista as funções de um servidor com status derivado do estado real.
// botPresente: true só quando o bot está de fato no servidor.
function listarFuncoes(configServidor, guildId, botPresente) {
  return FUNCOES.map(f => {
    const cfg = configServidor.funcao(guildId, f.chave);
    const ativo = f.implementada && cfg.enabled === true && botPresente === true;
    let aviso = null;
    if (!f.implementada) aviso = f.motivo;
    else if (cfg.enabled && !botPresente) aviso = 'O bot não está neste servidor, então a função não funciona agora.';
    return {
      chave: f.chave,
      nome: f.nome,
      descricao: f.descricao,
      implementada: f.implementada,
      enabled: f.implementada && cfg.enabled === true,
      ativo,
      status: ativo ? 'ATIVO' : 'DESLIGADO',
      aviso,
      configuravel: f.implementada && Object.prototype.hasOwnProperty.call(CONFIG_PADRAO, f.chave),
      config: f.implementada ? pickConfig(cfg, f.chave) : null
    };
  });
}

function pickConfig(cfg, chave) {
  const out = {};
  for (const k of Object.keys(CONFIG_PADRAO[chave] || {})) out[k] = cfg[k];
  return out;
}

module.exports = {
  FUNCOES, CHAVES, porChave, CONFIG_PADRAO, configPadrao, validarConfig,
  criarConfigServidor, listarFuncoes, GUILD_ID_RE,
  normalizarNomeCanal, validarNomeCanal
};

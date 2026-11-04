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
  { chave: 'avisos', nome: 'Central de Avisos', descricao: 'Publicação centralizada de avisos.', implementada: true, motivo: null },
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
// Campos de configuração de cada função. Tipos: canal (ID de canal ou vazio), id (ID numérico ou vazio),
// texto, longo, numero (inteiro entre min e max), sim_nao, opcao (lista fixa).
// A mensagem pode usar {membro} para o nome do membro.
const CAMPOS = Object.freeze({
  avisos: [
    { nome: 'canalId', rotulo: 'Canal de publicação', tipo: 'canal' },
    { nome: 'titulo', rotulo: 'Título', tipo: 'texto', max: 100 },
    { nome: 'descricao', rotulo: 'Descrição', tipo: 'longo', max: 300 },
    { nome: 'conteudo', rotulo: 'Conteúdo', tipo: 'longo', max: 1500 }
  ],
  saida: [
    { nome: 'canalId', rotulo: 'Canal de destino', tipo: 'canal' },
    { nome: 'mensagem', rotulo: 'Mensagem de saída ({membro} = nome do membro)', tipo: 'longo', max: 500, padrao: 'Até logo, {membro}!' }
  ],
  boasvindas: [
    { nome: 'canalId', rotulo: 'Canal de destino', tipo: 'canal' },
    { nome: 'mensagem', rotulo: 'Mensagem de boas-vindas ({membro} = nome do membro)', tipo: 'longo', max: 500, padrao: 'Bem-vindo, {membro}!' }
  ],
  aniversario: [
    { nome: 'canalId', rotulo: 'Canal de anúncio', tipo: 'canal' },
    { nome: 'horario', rotulo: 'Hora do anúncio (0 a 23)', tipo: 'numero', min: 0, max: 23, padrao: 9 },
    { nome: 'mensagem', rotulo: 'Mensagem ({membro} = nome do membro)', tipo: 'longo', max: 500, padrao: 'Feliz aniversário, {membro}!' }
  ],
  autocargo: [
    { nome: 'canalId', rotulo: 'Canal do painel de cargos', tipo: 'canal' },
    { nome: 'cargoId', rotulo: 'ID do cargo padrão', tipo: 'id' },
    { nome: 'mensagem', rotulo: 'Texto do painel', tipo: 'longo', max: 500 }
  ],
  diagnostico: [
    { nome: 'canalId', rotulo: 'Canal de relatórios', tipo: 'canal' },
    { nome: 'intervaloMinutos', rotulo: 'Intervalo entre verificações (minutos)', tipo: 'numero', min: 1, max: 1440, padrao: 60 }
  ],
  doacoes: [
    { nome: 'canalHistoricoId', rotulo: 'Canal do histórico de doações', tipo: 'canal' },
    { nome: 'valorMinimo', rotulo: 'Valor mínimo por doação (Tenchi)', tipo: 'numero', min: 1, max: 1000000, padrao: 1 },
    { nome: 'valorMaximo', rotulo: 'Valor máximo por doação (Tenchi)', tipo: 'numero', min: 1, max: 1000000, padrao: 500 },
    { nome: 'limiteDiario', rotulo: 'Limite diário por membro (Tenchi)', tipo: 'numero', min: 1, max: 1000000, padrao: 1000 }
  ],
  roblox: [
    { nome: 'usuario', rotulo: 'Nome de usuário do Roblox', tipo: 'usuario_roblox' },
    { nome: 'grupoId', rotulo: 'ID do grupo do Roblox', tipo: 'id' },
    { nome: 'mostrarPerfil', rotulo: 'Mostrar perfil no painel', tipo: 'sim_nao', padrao: true },
    { nome: 'canalId', rotulo: 'Canal de avisos da integração', tipo: 'canal' }
  ],
  moderacao: [
    { nome: 'canalLogId', rotulo: 'Canal de registros de moderação', tipo: 'canal' },
    { nome: 'acaoPadrao', rotulo: 'Ação padrão', tipo: 'opcao', opcoes: ['avisar', 'silenciar', 'expulsar'], padrao: 'avisar' },
    { nome: 'palavrasProibidas', rotulo: 'Palavras proibidas (separadas por vírgula)', tipo: 'longo', max: 1000 }
  ],
  ticket: [
    { nome: 'canalPainelId', rotulo: 'Canal do painel de tickets', tipo: 'canal' },
    { nome: 'categoriaId', rotulo: 'ID da categoria dos tickets', tipo: 'id' },
    { nome: 'mensagemAbertura', rotulo: 'Mensagem ao abrir ticket', tipo: 'longo', max: 500 }
  ],
  recrutamento: [
    { nome: 'canalId', rotulo: 'Canal de candidaturas', tipo: 'canal' },
    { nome: 'mensagem', rotulo: 'Texto do formulário', tipo: 'longo', max: 500 }
  ],
  games: [
    { nome: 'canalId', rotulo: 'Canal de jogos', tipo: 'canal' },
    { nome: 'mensagem', rotulo: 'Mensagem de abertura', tipo: 'longo', max: 500 }
  ],
  ia: [
    { nome: 'canalId', rotulo: 'Canal da IA', tipo: 'canal' },
    { nome: 'prompt', rotulo: 'Instruções para a IA', tipo: 'longo', max: 2000 }
  ]
});

// Valor padrão de cada campo, usado quando nada foi salvo ainda.
function padraoCampo(c) {
  if (c.padrao !== undefined) return c.padrao;
  if (c.tipo === 'numero') return c.min;
  if (c.tipo === 'sim_nao') return false;
  if (c.tipo === 'opcao') return c.opcoes[0];
  return '';
}

const CONFIG_PADRAO = {
  chamada: { canalPadraoId: '', duracaoPadrao: 30, avisoPadrao: '' },
  canais: { categoriaPadraoId: '' },
  ...Object.fromEntries(Object.entries(CAMPOS).map(([chave, campos]) =>
    [chave, Object.fromEntries(campos.map(c => [c.nome, padraoCampo(c)]))]))
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
  if (chave !== 'chamada') return validarCampos(chave, b);

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

function validarCampos(chave, b) {
  const erros = [];
  const valor = {};
  const campos = CAMPOS[chave];
  if (!campos) return { ok: false, erros: ['Esta função não tem configurações.'], valor: null };
  for (const c of campos) {
    const bruto = b[c.nome];
    if (c.tipo === 'canal' || c.tipo === 'id') {
      const v = String(bruto ?? '').trim();
      if (v && !/^\d{5,25}$/.test(v)) erros.push(`${c.rotulo}: ID inválido.`);
      valor[c.nome] = v;
    } else if (c.tipo === 'texto' || c.tipo === 'longo') {
      const v = String(bruto ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
      if (v.length > c.max) erros.push(`${c.rotulo}: até ${c.max} caracteres.`);
      valor[c.nome] = v;
    } else if (c.tipo === 'usuario_roblox') {
      const v = String(bruto ?? '').trim();
      if (v && !/^[A-Za-z0-9_]{3,20}$/.test(v)) erros.push('Nome de usuário do Roblox: 3 a 20 letras, números ou _.');
      valor[c.nome] = v;
    } else if (c.tipo === 'numero') {
      const n = Number(bruto);
      if (!Number.isInteger(n) || n < c.min || n > c.max) erros.push(`${c.rotulo}: entre ${c.min} e ${c.max}.`);
      valor[c.nome] = n;
    } else if (c.tipo === 'sim_nao') {
      valor[c.nome] = bruto === true || bruto === 'sim' || bruto === 'true';
    } else if (c.tipo === 'opcao') {
      if (!c.opcoes.includes(bruto)) erros.push(`${c.rotulo}: opção inválida.`);
      valor[c.nome] = c.opcoes.includes(bruto) ? bruto : c.opcoes[0];
    }
  }
  if (chave === 'doacoes') {
    if (valor.valorMinimo > valor.valorMaximo) erros.push('O valor mínimo não pode ser maior que o máximo.');
    if (valor.valorMaximo > valor.limiteDiario) erros.push('O valor máximo por doação não pode ser maior que o limite diário.');
  }
  return { ok: erros.length === 0, erros, valor };
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
      configuravel: Object.prototype.hasOwnProperty.call(CONFIG_PADRAO, f.chave),
      campos: CAMPOS[f.chave] || [],
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
  FUNCOES, CHAVES, porChave, CONFIG_PADRAO, CAMPOS, configPadrao, validarConfig,
  criarConfigServidor, listarFuncoes, GUILD_ID_RE,
  normalizarNomeCanal, validarNomeCanal
};

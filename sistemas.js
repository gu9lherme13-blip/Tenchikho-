'use strict';
// =========================================================
// 🦇 NVB • SISTEMAS — LOTE 3
// /resenha  (criar, historico, ver, ranking, organizador, cancelar)
// /jogatina (criar, historico, ver, ranking, organizador, cancelar)
// /recrutamento (registrar, avaliar, historico, ver, ranking, recrutador)
// Dados salvos em resenhas.json, jogatinas.json e recrutamentos.json (db.*).
// =========================================================
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, StringSelectMenuBuilder, MessageFlags
} = require('discord.js');

const COR = 0x7c3aed;
const NO_PING = { parse: [] };
const EPH = { flags: MessageFlags.Ephemeral };
const POR_PAGINA = 8;
const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const TIPOS = {
  resenha: { key: 'resenha', db: 'resenhas', sigla: 'RS', emoji: '💬', nome: 'Resenha', artigo: 'a', principal: 'Assunto ou proposta', localLabel: 'Local ou canal' },
  jogatina: { key: 'jogatina', db: 'jogatinas', sigla: 'JG', emoji: '🎮', nome: 'Jogatina', artigo: 'a', principal: 'Jogo que será jogado', localLabel: 'Mapa, modo ou servidor' }
};
const SITUACOES = ['Agendada', 'Em andamento', 'Concluída', 'Cancelada'];
const STATUS_RECR = ['Em análise', 'Aprovado', 'Recusado'];

// "25/12/2026 20:30", "25/12 20h", "hoje 21:00", "amanhã 19h30", "20:30" -> unix (horário de Brasília) ou null
function parseQuando(texto) {
  const t = semAcento(texto), hora = t.match(/(\d{1,2})\s*[:h]\s*(\d{2})?/);
  if (!hora) return null;
  const H = Number(hora[1]), M = Number(hora[2] || 0);
  if (H > 23 || M > 59) return null;
  const br = new Date(Date.now() - 3 * 3600 * 1000);
  let y = br.getUTCFullYear(), m = br.getUTCMonth() + 1, d = br.getUTCDate();
  const data = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (data) { d = Number(data[1]); m = Number(data[2]); if (data[3]) y = Number(data[3]) < 100 ? 2000 + Number(data[3]) : Number(data[3]); if (m < 1 || m > 12 || d < 1 || d > 31) return null; }
  else if (/amanha/.test(t)) d += 1;
  return Math.floor(Date.UTC(y, m - 1, d, H + 3, M) / 1000);
}
const quandoTxt = it => it.quandoTs ? `<t:${it.quandoTs}:F> (<t:${it.quandoTs}:R>)` : (it.quandoTexto || '—');
const dataTxt = iso => { const t = Math.floor(new Date(iso).getTime() / 1000); return Number.isFinite(t) ? `<t:${t}:d>` : '—'; };

module.exports = function iniciarSistemas(ctx) {
  const { client, GUILD_ID, db, readJson, writeDb, can, logAction, normalizeQG = semAcento } = ctx;
  for (const t of Object.values(TIPOS)) if (!Array.isArray(db[t.db])) db[t.db] = readJson(`${t.db}.json`, []);
  if (!Array.isArray(db.recrutamentos)) db.recrutamentos = [];

  const staffAtiv = i => can(i, 'comunidade') || can(i, 'admin');
  const staffRecr = i => can(i, 'recrutamento');
  const staffAval = i => can(i, 'aprovar');
  const pendentes = new Map(); // nonce -> dados do formulário (expira em 15 min)
  const novoNonce = () => Math.random().toString(36).slice(2, 10);
  const limparPendentes = () => { const agora = Date.now(); for (const [k, v] of pendentes) if (v.exp < agora) pendentes.delete(k); };
  setInterval(limparPendentes, 5 * 60 * 1000).unref?.();
  const mencao = id => `<@${id}>`;

  // ---------- comandos ----------
  function comandoAtividade(t) {
    return new SlashCommandBuilder().setName(t.key).setDescription(`Sistema de ${t.nome.toLowerCase()}s da NVB`)
      .addSubcommand(sc => sc.setName('criar').setDescription(`Cria e publica ${t.artigo} ${t.nome.toLowerCase()} (staff)`)
        .addUserOption(o => o.setName('organizador').setDescription('Quem organizou? (padrão: você)'))
        .addStringOption(o => o.setName('local').setDescription(t.localLabel).setMaxLength(150))
        .addChannelOption(o => o.setName('canal').setDescription('Canal do Discord (opcional)'))
        .addIntegerOption(o => o.setName('limite').setDescription('Limite de participantes (0 ou vazio = ilimitado)').setMinValue(0).setMaxValue(500)))
      .addSubcommand(sc => sc.setName('historico').setDescription(`Histórico de ${t.nome.toLowerCase()}s (staff)`)
        .addUserOption(o => o.setName('organizador').setDescription('Filtrar por organizador'))
        .addStringOption(o => o.setName('situacao').setDescription('Filtrar por situação').addChoices(...SITUACOES.map(s => ({ name: s, value: s }))))
        .addIntegerOption(o => o.setName('pagina').setDescription('Página').setMinValue(1)))
      .addSubcommand(sc => sc.setName('ver').setDescription('Mostra os detalhes e alterações (staff)')
        .addStringOption(o => o.setName('id').setDescription('ID (aparece no rodapé da publicação)').setRequired(true)))
      .addSubcommand(sc => sc.setName('ranking').setDescription(`Ranking de organizadores e participantes de ${t.nome.toLowerCase()}s`))
      .addSubcommand(sc => sc.setName('organizador').setDescription('Corrige quem organizou (staff)')
        .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true))
        .addUserOption(o => o.setName('usuario').setDescription('Novo organizador').setRequired(true)))
      .addSubcommand(sc => sc.setName('cancelar').setDescription(`Cancela ${t.artigo} ${t.nome.toLowerCase()} (staff)`)
        .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true))
        .addStringOption(o => o.setName('motivo').setDescription('Motivo').setMaxLength(200)));
  }
  const comandoRecrutamento = () => new SlashCommandBuilder().setName('recrutamento').setDescription('Sistema de recrutamento da NVB')
    .addSubcommand(sc => sc.setName('registrar').setDescription('Registra um recrutamento (staff)')
      .addBooleanOption(o => o.setName('aceita_regras').setDescription('O candidato aceitou as regras?').setRequired(true))
      .addUserOption(o => o.setName('candidato').setDescription('Candidato (se estiver no servidor)'))
      .addStringOption(o => o.setName('discord_nick').setDescription('Nick do Discord (se o candidato não estiver no servidor)').setMaxLength(60))
      .addUserOption(o => o.setName('recrutador').setDescription('Quem recrutou? (padrão: você)'))
      .addBooleanOption(o => o.setName('outro_cla').setDescription('Já participou de outro clã?'))
      .addStringOption(o => o.setName('contribuicao').setDescription('Como pode contribuir com a linhagem').setMaxLength(400)))
    .addSubcommand(sc => sc.setName('avaliar').setDescription('Aprova, recusa ou recoloca em análise (staff)')
      .addStringOption(o => o.setName('id').setDescription('ID do registro').setRequired(true))
      .addStringOption(o => o.setName('situacao').setDescription('Resultado').setRequired(true).addChoices(...STATUS_RECR.map(s => ({ name: s, value: s })))))
    .addSubcommand(sc => sc.setName('historico').setDescription('Histórico de recrutamentos (staff)')
      .addUserOption(o => o.setName('recrutador').setDescription('Filtrar por recrutador'))
      .addStringOption(o => o.setName('candidato').setDescription('Pesquisar por nome, Roblox ou Discord do candidato'))
      .addStringOption(o => o.setName('situacao').setDescription('Filtrar por situação').addChoices(...STATUS_RECR.map(s => ({ name: s, value: s }))))
      .addIntegerOption(o => o.setName('pagina').setDescription('Página').setMinValue(1)))
    .addSubcommand(sc => sc.setName('ver').setDescription('Mostra um registro completo (staff)')
      .addStringOption(o => o.setName('id').setDescription('ID do registro').setRequired(true)))
    .addSubcommand(sc => sc.setName('ranking').setDescription('Ranking de recrutadores (staff)'))
    .addSubcommand(sc => sc.setName('recrutador').setDescription('Corrige quem recrutou (staff)')
      .addStringOption(o => o.setName('id').setDescription('ID do registro').setRequired(true))
      .addUserOption(o => o.setName('usuario').setDescription('Novo recrutador').setRequired(true)));

  const COMANDOS = [...Object.values(TIPOS).map(comandoAtividade), comandoRecrutamento()].map(c => c.setDMPermission(false));
  const NOMES = new Set(COMANDOS.map(c => c.name));

  async function registrar() {
    if (process.env.NVB_REGISTER_COMMANDS === '0') return;
    const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
    if (!guild) { console.warn('⚠️ Sistemas: nenhum servidor encontrado para registrar.'); return; }
    for (const c of COMANDOS) {
      try { await guild.commands.create(c.toJSON()); }
      catch (e) { console.error(`❌ Sistemas: falha ao registrar /${c.name}:`, e.message); }
    }
    console.log(`🦇 Sistemas NVB (lote 3): ${COMANDOS.length} comandos registrados em "${guild.name}".`);
  }

  async function responder(i, p) {
    const payload = { allowedMentions: NO_PING, ...p };
    try {
      if (i.deferred && !i.replied) return await i.editReply(payload);
      if (i.deferred || i.replied) return await i.followUp(payload);
      return await i.reply(payload);
    } catch (e) { if (e?.code === 10062 || e?.code === 10015) return null; throw e; }
  }
  const negar = i => responder(i, { content: '❌ Você não possui o cargo necessário para usar isto.', ...EPH });
  async function nomeDe(i, user) {
    const m = await i.guild?.members?.fetch?.(user.id).catch(() => null);
    return m?.displayName || user.username;
  }

  // =====================================================
  // RESENHAS E JOGATINAS
  // =====================================================
  const lista = t => db[t.db];
  const achar = (t, id) => lista(t).find(x => x.id.toUpperCase() === String(id || '').trim().toUpperCase());
  const salvar = t => writeDb(t.db);
  const registrarHist = (it, por, acao, detalhe = '') => { (it.historico ||= []).push({ at: new Date().toISOString(), por, acao, detalhe }); };

  function cardAtividade(t, it) {
    const vagas = it.limite ? `${it.participantes.length}/${it.limite}` : `${it.participantes.length}/∞`;
    const parts = it.participantes.slice(0, 25).map(p => mencao(p.id)).join(' ') || '_Ninguém ainda_';
    const e = new EmbedBuilder().setColor(it.status === 'Cancelada' ? 0xef4444 : it.status === 'Concluída' ? 0x22c55e : COR)
      .setTitle(`${t.emoji} ${it.nome}`)
      .addFields(
        { name: '👑 Quem organizou?', value: mencao(it.organizadorId), inline: true },
        { name: `🎯 ${t.principal}`, value: String(it.principal).slice(0, 1000), inline: true },
        { name: '🗓️ Quando', value: quandoTxt(it) },
        { name: '⏱️ Duração', value: it.duracao || '—', inline: true },
        { name: `📍 ${t.localLabel}`, value: it.local || 'A definir', inline: true },
        { name: '👥 Vagas', value: vagas, inline: true },
        { name: '📌 Situação', value: it.status, inline: true },
        { name: `✅ Participantes (${it.participantes.length})`, value: parts.slice(0, 1000) }
      ).setFooter({ text: `ID: ${it.id} • NVB` });
    if (it.info) e.addFields({ name: 'ℹ️ Informações adicionais', value: String(it.info).slice(0, 1000) });
    if (it.status === 'Cancelada' && it.motivoCancelamento) e.addFields({ name: '🚫 Motivo', value: it.motivoCancelamento.slice(0, 500) });
    if (it.status === 'Concluída') e.addFields({ name: '🏁 Presenças confirmadas', value: String(it.presentes?.length || 0) });
    return e;
  }
  const botoesAtividade = (t, it) => (it.status === 'Concluída' || it.status === 'Cancelada') ? [] : [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ativ:join:${t.key}:${it.id}`).setLabel('Participar').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ativ:leave:${t.key}:${it.id}`).setLabel('Cancelar presença').setEmoji('❌').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ativ:list:${t.key}:${it.id}`).setLabel('Ver participantes').setEmoji('👥').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ativ:end:${t.key}:${it.id}`).setLabel('Encerrar').setEmoji('🏁').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ativ:cancel:${t.key}:${it.id}`).setLabel('Cancelar').setEmoji('🚫').setStyle(ButtonStyle.Secondary)
  )];
  const painel = (t, it) => ({ embeds: [cardAtividade(t, it)], components: botoesAtividade(t, it) });

  async function atualizarMensagem(t, it) {
    try {
      const ch = await client.channels.fetch(it.canalId).catch(() => null);
      const msg = await ch?.messages?.fetch?.(it.mensagemId).catch(() => null);
      await msg?.edit(painel(t, it));
    } catch (e) { console.warn(`⚠️ Não consegui atualizar a mensagem de ${t.key} ${it.id}:`, e.message); }
  }

  function finalizar(t, it, presentes, porId) {
    it.status = 'Concluída'; it.presentes = presentes; it.encerradaPor = porId; it.encerradaEm = new Date().toISOString();
    registrarHist(it, porId, 'encerrada', `${presentes.length} presença(s) confirmada(s)`);
    for (const uid of presentes) { try { logAction(t.key, uid, { id: it.id, nome: it.nome }); } catch { /* log opcional */ } }
    salvar(t);
  }

  // /resenha criar | /jogatina criar -> abre o formulário
  async function criarAtividade(i, t) {
    if (!staffAtiv(i)) return negar(i);
    const canal = i.options.getChannel('canal'), localTxt = i.options.getString('local');
    const nonce = novoNonce();
    pendentes.set(nonce, {
      kind: 'ativ', tipo: t.key, userId: i.user.id, exp: Date.now() + 15 * 60 * 1000,
      organizadorId: (i.options.getUser('organizador') || i.user).id, limite: i.options.getInteger('limite') || 0,
      local: [localTxt, canal ? `<#${canal.id}>` : null].filter(Boolean).join(' • ')
    });
    const campo = (id, label, estilo, obrigatorio, max, placeholder) => new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(estilo).setRequired(obrigatorio).setMaxLength(max).setPlaceholder(placeholder || ''));
    const modal = new ModalBuilder().setCustomId(`sis_modal:${nonce}`).setTitle(`${t.emoji} Nova ${t.nome.toLowerCase()}`).addComponents(
      campo('nome', `Nome da ${t.nome.toLowerCase()}`, TextInputStyle.Short, true, 80),
      campo('principal', t.principal, TextInputStyle.Short, true, 100),
      campo('quando', 'Data e horário (Brasília)', TextInputStyle.Short, true, 40, 'Ex.: 25/12/2026 20:30'),
      campo('duracao', 'Duração prevista', TextInputStyle.Short, false, 40, 'Ex.: 1h30'),
      campo('info', 'Informações adicionais', TextInputStyle.Paragraph, false, 500));
    return i.showModal(modal);
  }

  async function publicarAtividade(i, p) {
    const t = TIPOS[p.tipo], g = i.fields.getTextInputValue.bind(i.fields);
    const quandoTexto = g('quando').trim(), ts = parseQuando(quandoTexto);
    const orgUser = await client.users.fetch(p.organizadorId).catch(() => ({ id: p.organizadorId, username: 'Desconhecido' }));
    const it = {
      id: `${t.sigla}${Date.now().toString(36).toUpperCase()}`, tipo: t.key, nome: g('nome').trim(), principal: g('principal').trim(),
      quandoTexto, quandoTs: ts, duracao: (g('duracao') || '').trim(), local: p.local, limite: p.limite, info: (g('info') || '').trim(),
      organizadorId: p.organizadorId, organizadorNome: await nomeDe(i, orgUser), criadoPor: i.user.id, criadoPorNome: await nomeDe(i, i.user),
      criadoEm: new Date().toISOString(), status: 'Agendada', participantes: [], presentes: [], canalId: i.channelId, mensagemId: null, historico: []
    };
    registrarHist(it, i.user.id, 'criada', `organizador: ${it.organizadorNome}`);
    await i.reply({ ...painel(t, it), allowedMentions: NO_PING });
    const msg = await i.fetchReply().catch(() => null);
    it.mensagemId = msg?.id || null;
    lista(t).push(it); salvar(t);
    if (!ts) await i.followUp({ content: '⚠️ Não consegui interpretar a data/hora, então ela fica só como texto e a situação não muda sozinha. Use o formato `25/12/2026 20:30`.', ...EPH }).catch(() => {});
  }

  async function botaoAtividade(i) {
    const [, acao, tipoKey, id] = i.customId.split(':'), t = TIPOS[tipoKey], it = t && achar(t, id);
    if (!it) return i.reply({ content: '❌ Registro não encontrado.', ...EPH });
    const aberta = it.status === 'Agendada' || it.status === 'Em andamento';
    if (acao === 'list') {
      const txt = it.participantes.map((p, k) => `${k + 1}. ${mencao(p.id)}${it.presentes?.includes(p.id) ? ' ✅' : ''}`).join('\n') || 'Ninguém se inscreveu ainda.';
      return i.reply({ content: `👥 **Participantes de ${it.nome}** (${it.participantes.length}${it.limite ? `/${it.limite}` : ''})\n${txt}`.slice(0, 1900), allowedMentions: NO_PING, ...EPH });
    }
    if (!aberta) return i.reply({ content: `❌ Esta ${t.nome.toLowerCase()} está **${it.status.toLowerCase()}**.`, ...EPH });
    if (acao === 'join') {
      if (it.participantes.some(p => p.id === i.user.id)) return i.reply({ content: '✅ Você já está inscrito.', ...EPH });
      if (it.limite && it.participantes.length >= it.limite) return i.reply({ content: '❌ As vagas acabaram.', ...EPH });
      it.participantes.push({ id: i.user.id, nome: i.member?.displayName || i.user.username, at: new Date().toISOString() });
      salvar(t); return i.update(painel(t, it));
    }
    if (acao === 'leave') {
      if (!it.participantes.some(p => p.id === i.user.id)) return i.reply({ content: '❌ Você não está inscrito.', ...EPH });
      it.participantes = it.participantes.filter(p => p.id !== i.user.id);
      salvar(t); return i.update(painel(t, it));
    }
    if (!staffAtiv(i)) return negar(i);
    if (acao === 'cancel') {
      it.status = 'Cancelada'; it.motivoCancelamento = 'Cancelada pela staff'; registrarHist(it, i.user.id, 'cancelada', 'pelo botão'); salvar(t);
      return i.update(painel(t, it));
    }
    if (acao === 'end') {
      if (!it.participantes.length) { finalizar(t, it, [], i.user.id); return i.update(painel(t, it)); }
      const opcoes = it.participantes.slice(0, 25).map(p => ({ label: String(p.nome || p.id).slice(0, 100), value: p.id }));
      const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`ativ:endsel:${t.key}:${it.id}`).setPlaceholder('Quem esteve presente?').setMinValues(0).setMaxValues(opcoes.length).addOptions(opcoes));
      const todos = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ativ:endall:${t.key}:${it.id}`).setLabel('Todos presentes').setEmoji('✅').setStyle(ButtonStyle.Success));
      return i.reply({ content: `🏁 **Encerrar ${it.nome}**\nMarque quem esteve presente (só presenças confirmadas contam no ranking).${it.participantes.length > 25 ? '\n⚠️ Há mais de 25 inscritos: use **Todos presentes** ou marque os 25 primeiros.' : ''}`, components: [menu, todos], ...EPH });
    }
    if (acao === 'endall' || acao === 'endsel') {
      const presentes = acao === 'endall' ? it.participantes.map(p => p.id) : i.values.filter(v => it.participantes.some(p => p.id === v));
      finalizar(t, it, presentes, i.user.id);
      await i.update({ content: `🏁 Encerrada com **${presentes.length}** presença(s) confirmada(s).`, components: [] });
      return atualizarMensagem(t, it);
    }
  }

  const linhaItem = (t, it) => `**${it.id}** • ${it.nome}\n└ 👑 ${mencao(it.organizadorId)} • ${it.quandoTs ? `<t:${it.quandoTs}:d>` : (it.quandoTexto || '—')} • **${it.status}** • 👥 ${it.participantes.length}`;
  function paginaHistoricoAtiv(t, pagina, orgId, sit) {
    let itens = [...lista(t)].reverse();
    if (orgId && orgId !== '0') itens = itens.filter(x => x.organizadorId === orgId);
    if (sit && sit !== '-') itens = itens.filter(x => x.status === sit);
    const total = Math.max(1, Math.ceil(itens.length / POR_PAGINA)), p = Math.min(Math.max(1, pagina), total);
    const e = new EmbedBuilder().setColor(COR).setTitle(`📜 Histórico de ${t.nome.toLowerCase()}s`)
      .setDescription(itens.slice((p - 1) * POR_PAGINA, p * POR_PAGINA).map(x => linhaItem(t, x)).join('\n\n') || 'Nenhum registro encontrado.')
      .setFooter({ text: `Página ${p}/${total} • ${itens.length} registro(s)` });
    const comps = total > 1 ? [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sh:${t.key}:${p - 1}:${orgId || '0'}:${sit || '-'}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
      new ButtonBuilder().setCustomId(`sh:${t.key}:${p + 1}:${orgId || '0'}:${sit || '-'}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= total))] : [];
    return { embeds: [e], components: comps };
  }
  function detalheAtiv(t, it) {
    const hist = (it.historico || []).slice(-10).map(h => `• ${dataTxt(h.at)} **${h.acao}** por ${h.por ? mencao(h.por) : '—'}${h.detalhe ? ` — ${String(h.detalhe).slice(0, 80)}` : ''}`).join('\n') || '—';
    const e = cardAtividade(t, it);
    e.addFields({ name: '🧾 Registro', value: `Criada por ${mencao(it.criadoPor)} em ${dataTxt(it.criadoEm)}`.slice(0, 1000) }, { name: '🔁 Alterações e cancelamentos', value: hist.slice(0, 1000) });
    return e;
  }
  function rankingAtiv(t) {
    const orgs = {}, part = {};
    for (const it of lista(t)) if (it.status === 'Concluída') {
      orgs[it.organizadorId] = (orgs[it.organizadorId] || 0) + 1;
      for (const u of new Set(it.presentes || [])) part[u] = (part[u] || 0) + 1;
    }
    const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n], k) => `${['🥇', '🥈', '🥉'][k] || `**${k + 1}.**`} ${mencao(id)} — **${n}**`).join('\n') || '_Sem dados ainda._';
    return new EmbedBuilder().setColor(COR).setTitle(`🏆 Ranking de ${t.nome.toLowerCase()}s`)
      .addFields({ name: '👑 Organizadores (concluídas)', value: top(orgs) }, { name: '✅ Participação (presença confirmada)', value: top(part) })
      .setFooter({ text: 'Só contam atividades concluídas; canceladas não pontuam.' });
  }

  async function subAtividade(i, t) {
    const sub = i.options.getSubcommand();
    if (sub === 'criar') return criarAtividade(i, t);
    if (sub === 'ranking') return responder(i, { embeds: [rankingAtiv(t)] });
    if (!staffAtiv(i)) return negar(i);
    if (sub === 'historico') {
      const org = i.options.getUser('organizador'), sit = i.options.getString('situacao');
      return responder(i, { ...paginaHistoricoAtiv(t, i.options.getInteger('pagina') || 1, org?.id, sit), ...EPH });
    }
    const it = achar(t, i.options.getString('id', true));
    if (!it) return responder(i, { content: '❌ ID não encontrado. Ele aparece no rodapé da publicação.', ...EPH });
    if (sub === 'ver') return responder(i, { embeds: [detalheAtiv(t, it)], ...EPH });
    if (sub === 'organizador') {
      const u = i.options.getUser('usuario', true);
      if (u.bot) return responder(i, { content: '❌ Escolha um membro, não um bot.', ...EPH });
      registrarHist(it, i.user.id, 'organizador alterado', `${it.organizadorNome} → ${u.username}`);
      it.organizadorId = u.id; it.organizadorNome = await nomeDe(i, u); salvar(t); await atualizarMensagem(t, it);
      return responder(i, { content: `✅ Organizador de **${it.nome}** agora é ${mencao(u.id)}.`, ...EPH });
    }
    if (sub === 'cancelar') {
      if (it.status === 'Concluída' || it.status === 'Cancelada') return responder(i, { content: `❌ Já está **${it.status.toLowerCase()}**.`, ...EPH });
      it.status = 'Cancelada'; it.motivoCancelamento = i.options.getString('motivo') || 'Sem motivo informado';
      registrarHist(it, i.user.id, 'cancelada', it.motivoCancelamento); salvar(t); await atualizarMensagem(t, it);
      return responder(i, { content: `🚫 **${it.nome}** cancelada.`, ...EPH });
    }
  }

  // muda para "Em andamento" quando o horário chega (somente se a data foi interpretada)
  setInterval(async () => {
    const agora = Math.floor(Date.now() / 1000);
    for (const t of Object.values(TIPOS)) for (const it of lista(t)) {
      if (it.status === 'Agendada' && it.quandoTs && agora >= it.quandoTs) { it.status = 'Em andamento'; registrarHist(it, null, 'iniciada', 'automático'); salvar(t); await atualizarMensagem(t, it); }
    }
  }, 60 * 1000).unref?.();

  // =====================================================
  // RECRUTAMENTO (compatível com o formulário do site em db.recrutamentos)
  // =====================================================
  const rNome = x => x.nome || x.nickname || x.apelido || x.name || '—';
  const rData = x => x.data || x.criadoEm || null;
  const rPessoa = x => String(x.discordId || x.userId || '') || normalizeQG(x.roblox || x.discord || rNome(x));
  const achaRecr = id => db.recrutamentos.find(x => String(x.id || '').toUpperCase() === String(id || '').trim().toUpperCase());
  const salvarRecr = () => writeDb('recrutamentos');
  const linhaRecr = x => `**${x.id || '—'}** • ${rNome(x)} • 🎮 ${x.roblox || '—'}\n└ 🛡️ ${x.recrutadorId ? mencao(x.recrutadorId) : (x.recrutadorNome || '_sem recrutador_')} • ${rData(x) ? dataTxt(rData(x)) : '—'} • **${x.status || 'Em análise'}**`;

  async function registrarRecr(i) {
    if (!staffRecr(i)) return negar(i);
    const cand = i.options.getUser('candidato'), nick = i.options.getString('discord_nick');
    if (!cand && !nick) return responder(i, { content: '❌ Informe o `candidato` (membro) ou o `discord_nick`.', ...EPH });
    if (cand?.bot) return responder(i, { content: '❌ Bots não podem ser candidatos.', ...EPH });
    const recr = i.options.getUser('recrutador') || i.user;
    if (recr.id !== i.user.id && !staffAval(i)) return responder(i, { content: '❌ Só quem tem permissão de avaliação pode registrar em nome de outro recrutador.', ...EPH });
    const nonce = novoNonce();
    pendentes.set(nonce, {
      kind: 'recr', userId: i.user.id, exp: Date.now() + 15 * 60 * 1000, recrutadorId: recr.id,
      candidatoId: cand?.id || '', discord: cand?.username || nick, outroCla: !!i.options.getBoolean('outro_cla'),
      contribuicao: i.options.getString('contribuicao') || '', aceitaRegras: !!i.options.getBoolean('aceita_regras', true)
    });
    const campo = (id, label, estilo, max, placeholder) => new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(estilo).setRequired(true).setMaxLength(max).setPlaceholder(placeholder || ''));
    return i.showModal(new ModalBuilder().setCustomId(`sis_modal:${nonce}`).setTitle('🩸 Registro de recrutamento').addComponents(
      campo('nome', 'Nome ou apelido do candidato', TextInputStyle.Short, 60),
      campo('idade', 'Idade', TextInputStyle.Short, 3, 'Ex.: 16'),
      campo('roblox', 'Nick do Roblox', TextInputStyle.Short, 40),
      campo('disponibilidade', 'Disponibilidade', TextInputStyle.Short, 120, 'Dias e horários'),
      campo('motivo', 'Motivo para entrar na NVB', TextInputStyle.Paragraph, 500)));
  }

  async function salvarRecrutamento(i, p) {
    const g = i.fields.getTextInputValue.bind(i.fields), roblox = g('roblox').trim().replace(/^@/, '');
    const recrUser = await client.users.fetch(p.recrutadorId).catch(() => ({ id: p.recrutadorId, username: 'Desconhecido' }));
    const pessoa = p.candidatoId || normalizeQG(roblox);
    const existente = db.recrutamentos.find(x => x.status !== 'Recusado' && (rPessoa(x) === pessoa || (x.roblox && normalizeQG(x.roblox) === normalizeQG(roblox))));
    if (existente) return i.reply({ content: `❌ Este candidato já tem registro (**${existente.id}**, ${existente.status || 'Em análise'}). Para registrar de novo, a candidatura anterior precisa estar **Recusada**.`, ...EPH });
    const agora = new Date().toISOString(), recrNome = await nomeDe(i, recrUser);
    const item = {
      id: `R${Date.now().toString(36).toUpperCase()}`, nome: g('nome').trim(), idade: g('idade').trim(), roblox, discord: p.discord, discordId: p.candidatoId,
      disponibilidade: g('disponibilidade').trim(), motivo: g('motivo').trim(), outroCla: p.outroCla ? 'Sim' : 'Não', contribuicao: p.contribuicao,
      aceitaRegras: p.aceitaRegras, recrutadorId: p.recrutadorId, recrutadorNome: recrNome, recrutador: recrNome, registradoPor: i.user.id,
      status: 'Em análise', data: agora, dataRecrutamento: agora, origem: 'discord', historico: [{ at: agora, por: i.user.id, acao: 'registrado' }]
    };
    db.recrutamentos.push(item); salvarRecr();
    const e = new EmbedBuilder().setColor(COR).setTitle('🩸 Recrutamento registrado').addFields(
      { name: 'ID', value: item.id, inline: true }, { name: 'Candidato', value: `${item.nome}${p.candidatoId ? ` (${mencao(p.candidatoId)})` : ` (${p.discord})`}`, inline: true },
      { name: '🛡️ Quem recrutou?', value: mencao(item.recrutadorId), inline: true }, { name: '🎮 Roblox', value: roblox, inline: true },
      { name: 'Idade', value: item.idade, inline: true }, { name: 'Outro clã', value: item.outroCla, inline: true },
      { name: 'Aceitou as regras', value: item.aceitaRegras ? 'Sim' : 'Não', inline: true }, { name: 'Situação', value: item.status, inline: true },
      { name: 'Disponibilidade', value: item.disponibilidade }, { name: 'Motivo', value: item.motivo.slice(0, 1000) }
    );
    if (item.contribuicao) e.addFields({ name: 'Como pode contribuir', value: item.contribuicao.slice(0, 500) });
    return i.reply({ embeds: [e], allowedMentions: NO_PING });
  }

  function rankingRecr() {
    const grupos = {}, creditados = new Set();
    for (const x of db.recrutamentos) {
      const chave = x.recrutadorId || x.recrutadorNome || 'sem';
      const g = (grupos[chave] ||= { total: 0, aprovados: 0, recusados: 0, analise: 0, id: x.recrutadorId || null, nome: x.recrutadorNome || 'Sem recrutador' });
      g.total++;
      const st = x.status || 'Em análise';
      if (st === 'Aprovado') { const pk = rPessoa(x); if (!creditados.has(pk)) { creditados.add(pk); g.aprovados++; } }
      else if (st === 'Recusado') g.recusados++; else g.analise++;
    }
    const linhas = Object.values(grupos).sort((a, b) => b.aprovados - a.aprovados || b.total - a.total).slice(0, 15)
      .map((g, k) => `${['🥇', '🥈', '🥉'][k] || `**${k + 1}.**`} ${g.id ? mencao(g.id) : g.nome}\n└ 📋 ${g.total} • ✅ ${g.aprovados} • ❌ ${g.recusados} • ⏳ ${g.analise}`);
    return new EmbedBuilder().setColor(COR).setTitle('🏆 Ranking de recrutadores')
      .setDescription(linhas.join('\n') || 'Sem recrutamentos registrados.')
      .setFooter({ text: '📋 total • ✅ aprovados (sem contar a mesma pessoa duas vezes) • ❌ recusados • ⏳ em análise' });
  }
  function paginaHistoricoRecr(pagina, recrId, busca, sit) {
    let itens = [...db.recrutamentos].reverse();
    if (recrId && recrId !== '0') itens = itens.filter(x => x.recrutadorId === recrId);
    if (sit && sit !== '-') itens = itens.filter(x => (x.status || 'Em análise') === sit);
    if (busca && busca !== '-') { const b = normalizeQG(busca); itens = itens.filter(x => normalizeQG([rNome(x), x.roblox, x.discord, x.recrutadorNome].join(' ')).includes(b)); }
    const total = Math.max(1, Math.ceil(itens.length / POR_PAGINA)), p = Math.min(Math.max(1, pagina), total);
    const e = new EmbedBuilder().setColor(COR).setTitle('📜 Histórico de recrutamentos')
      .setDescription(itens.slice((p - 1) * POR_PAGINA, p * POR_PAGINA).map(linhaRecr).join('\n\n') || 'Nenhum registro encontrado.')
      .setFooter({ text: `Página ${p}/${total} • ${itens.length} registro(s)` });
    const b64 = () => (busca && busca !== '-') ? encodeURIComponent(String(busca).slice(0, 15)) : '-';
    const comps = total > 1 ? [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shr:${p - 1}:${recrId || '0'}:${sit || '-'}:${b64()}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
      new ButtonBuilder().setCustomId(`shr:${p + 1}:${recrId || '0'}:${sit || '-'}:${b64()}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= total))] : [];
    return { embeds: [e], components: comps };
  }

  async function subRecrutamento(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'registrar') return registrarRecr(i);
    if (!staffRecr(i)) return negar(i);
    if (sub === 'ranking') return responder(i, { embeds: [rankingRecr()], ...EPH });
    if (sub === 'historico') {
      const r = i.options.getUser('recrutador'), busca = i.options.getString('candidato'), sit = i.options.getString('situacao');
      return responder(i, { ...paginaHistoricoRecr(i.options.getInteger('pagina') || 1, r?.id, busca || '-', sit), ...EPH });
    }
    const x = achaRecr(i.options.getString('id', true));
    if (!x) return responder(i, { content: '❌ ID não encontrado. Use `/recrutamento historico` para ver os IDs.', ...EPH });
    if (sub === 'ver') {
      const hist = (x.historico || []).slice(-8).map(h => `• ${dataTxt(h.at)} **${h.acao}**${h.por ? ` por ${mencao(h.por)}` : ''}${h.detalhe ? ` — ${h.detalhe}` : ''}`).join('\n') || '—';
      const e = new EmbedBuilder().setColor(COR).setTitle(`🩸 ${rNome(x)} (${x.id})`).addFields(
        { name: 'Situação', value: x.status || 'Em análise', inline: true }, { name: '🛡️ Quem recrutou?', value: x.recrutadorId ? mencao(x.recrutadorId) : (x.recrutadorNome || '—'), inline: true },
        { name: '🎮 Roblox', value: x.roblox || '—', inline: true }, { name: 'Discord', value: x.discordId ? mencao(x.discordId) : (x.discord || '—'), inline: true },
        { name: 'Idade', value: String(x.idade || '—'), inline: true }, { name: 'Data', value: rData(x) ? dataTxt(rData(x)) : '—', inline: true },
        { name: 'Avaliado por', value: x.avaliadoPor ? mencao(x.avaliadoPor) : '—', inline: true }, { name: 'Disponibilidade', value: String(x.disponibilidade || '—').slice(0, 500) },
        { name: 'Motivo', value: String(x.motivo || '—').slice(0, 1000) }, { name: '🔁 Histórico', value: hist.slice(0, 1000) });
      return responder(i, { embeds: [e], allowedMentions: NO_PING, ...EPH });
    }
    if (sub === 'recrutador') {
      const u = i.options.getUser('usuario', true);
      if (u.bot) return responder(i, { content: '❌ Escolha um membro, não um bot.', ...EPH });
      const nome = await nomeDe(i, u);
      (x.historico ||= []).push({ at: new Date().toISOString(), por: i.user.id, acao: 'recrutador alterado', detalhe: `${x.recrutadorNome || '—'} → ${nome}` });
      x.recrutadorId = u.id; x.recrutadorNome = nome; x.recrutador = nome; salvarRecr();
      return responder(i, { content: `✅ Recrutador de **${rNome(x)}** agora é ${mencao(u.id)}.`, allowedMentions: NO_PING, ...EPH });
    }
    if (sub === 'avaliar') {
      if (!staffAval(i)) return negar(i);
      const novo = i.options.getString('situacao', true);
      if (novo === 'Aprovado') {
        const dup = db.recrutamentos.find(y => y !== x && y.status === 'Aprovado' && rPessoa(y) === rPessoa(x));
        if (dup) return responder(i, { content: `❌ Esta pessoa já foi aprovada no registro **${dup.id}**. Não conto duas vezes.`, ...EPH });
        if (!x.codigoEntrada) x.codigoEntrada = `NVB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      }
      const antes = x.status || 'Em análise';
      x.status = novo; x.avaliadoPor = i.user.id; x.avaliadoEm = new Date().toISOString();
      (x.historico ||= []).push({ at: x.avaliadoEm, por: i.user.id, acao: 'avaliado', detalhe: `${antes} → ${novo}` }); salvarRecr();
      await responder(i, { content: `${novo === 'Aprovado' ? '✅' : novo === 'Recusado' ? '❌' : '⏳'} **${rNome(x)}** (${x.id}): **${novo}** por ${mencao(i.user.id)}.`, allowedMentions: NO_PING });
      if (novo === 'Aprovado') await i.followUp({ content: `🔑 Código de entrada do site para **${rNome(x)}**: \`${x.codigoEntrada}\``, ...EPH }).catch(() => {});
      return;
    }
  }

  // ---------- roteamento ----------
  client.on('interactionCreate', async i => {
    try {
      if (i.isChatInputCommand?.() && NOMES.has(i.commandName)) {
        if (i.commandName === 'recrutamento') return await subRecrutamento(i);
        return await subAtividade(i, TIPOS[i.commandName]);
      }
      if (i.isModalSubmit?.() && i.customId.startsWith('sis_modal:')) {
        const p = pendentes.get(i.customId.split(':')[1]);
        if (!p || p.userId !== i.user.id) return await i.reply({ content: '❌ Este formulário expirou. Use o comando de novo.', ...EPH });
        pendentes.delete(i.customId.split(':')[1]);
        return await (p.kind === 'ativ' ? publicarAtividade(i, p) : salvarRecrutamento(i, p));
      }
      if ((i.isButton?.() || i.isStringSelectMenu?.()) && i.customId.startsWith('ativ:')) return await botaoAtividade(i);
      if (i.isButton?.() && (i.customId.startsWith('sh:') || i.customId.startsWith('shr:'))) {
        const partes = i.customId.split(':');
        if (partes[0] === 'sh') {
          if (!staffAtiv(i)) return await negar(i);
          return await i.update(paginaHistoricoAtiv(TIPOS[partes[1]], Number(partes[2]), partes[3], partes[4]));
        }
        if (!staffRecr(i)) return await negar(i);
        const busca = partes[4] === '-' ? '-' : decodeURIComponent(partes[4]);
        return await i.update(paginaHistoricoRecr(Number(partes[1]), partes[2], busca, partes[3]));
      }
    } catch (e) {
      console.error(`❌ Sistemas (${i.commandName || i.customId}):`, e.message);
      await responder(i, { content: `❌ Não consegui concluir: ${String(e.message || 'erro inesperado').slice(0, 200)}`, ...(i.deferred || i.replied ? {} : EPH) }).catch(() => {});
    }
  });

  if (client.isReady()) registrar(); else client.once('ready', registrar);
  console.log('🦇 Sistemas NVB (lote 3: resenha, jogatina, recrutamento) carregados.');
};

module.exports.parseQuando = parseQuando;

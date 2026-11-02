'use strict';
// =========================================================
// 🦇 NVB • SISTEMAS — LOTE 3
// /resenha  (criar, historico, ver, ranking, organizador, cancelar)
// /jogatina (criar, historico, ver, ranking, organizador, cancelar)
// Dados salvos em resenhas.json e jogatinas.json (db.*).
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
  const crypto = require('crypto');
  for (const t of Object.values(TIPOS)) if (!Array.isArray(db[t.db])) db[t.db] = readJson(`${t.db}.json`, []);

  const staffAtiv = i => can(i, 'comunidade') || can(i, 'admin');
  const staffAval = i => can(i, 'aprovar');
  const pendentes = new Map(); // nonce -> dados do formulário (expira em 15 min)
  const novoNonce = () => Math.random().toString(36).slice(2, 10);
  const limparPendentes = () => { const agora = Date.now(); for (const [k, v] of pendentes) if (v.exp < agora) pendentes.delete(k); };
  setInterval(limparPendentes, 5 * 60 * 1000).unref?.();
  const mencao = id => `<@${id}>`;

  // ---------- comandos ----------
  // Subcomandos retirados a pedido (historico, ver, organizador, cancelar): ficam só criar e ranking.
  function comandoAtividade(t) {
    return new SlashCommandBuilder().setName(t.key).setDescription(`Sistema de ${t.nome.toLowerCase()}s da NVB`)
      .addSubcommand(sc => sc.setName('criar').setDescription(`Cria e publica ${t.artigo} ${t.nome.toLowerCase()} (staff)`)
        .addUserOption(o => o.setName('organizador').setDescription('Quem organizou? (padrão: você)'))
        .addStringOption(o => o.setName('local').setDescription(t.localLabel).setMaxLength(150))
        .addChannelOption(o => o.setName('canal').setDescription('Canal do Discord (opcional)'))
        .addIntegerOption(o => o.setName('limite').setDescription('Limite de participantes (0 ou vazio = ilimitado)').setMinValue(0).setMaxValue(500)))
      .addSubcommand(sc => sc.setName('ranking').setDescription(`Ranking de organizadores e participantes de ${t.nome.toLowerCase()}s`));
  }
  const COMANDOS = Object.values(TIPOS).map(comandoAtividade).map(c => c.setDMPermission(false));
  // comandos antigos que não pertencem mais a este projeto são apagados do servidor deste aplicativo (/recrutamento foi retirado do Tenchiko)
  const REMOVER = ['recrutamento'];
  const NOMES = new Set(COMANDOS.map(c => c.name));

  async function registrar() {
    if (process.env.NVB_REGISTER_COMMANDS === '0') return;
    const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
    if (!guild) { console.warn('⚠️ Sistemas: nenhum servidor encontrado para registrar.'); return; }
    if (REMOVER.length) {
      let existentes = null; try { existentes = await guild.commands.fetch(); } catch (e) { console.warn('⚠️ Não consegui listar os comandos para limpar os antigos:', e.message); }
      for (const c of existentes ? [...existentes.values()] : []) {
        if (!REMOVER.includes(c.name)) continue;
        try { await c.delete(); console.log(`🗑️ Comando /${c.name} removido deste aplicativo (agora pertence a outro projeto).`); } catch (e) { console.error(`❌ Não consegui remover /${c.name}:`, e.message); }
      }
    }
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

  // ---------- roteamento ----------
  client.on('interactionCreate', async i => {
    try {
      if (i.isChatInputCommand?.() && NOMES.has(i.commandName)) {
        return await subAtividade(i, TIPOS[i.commandName]);
      }
      if (i.isModalSubmit?.() && i.customId.startsWith('sis_modal:')) {
        const p = pendentes.get(i.customId.split(':')[1]);
        if (!p || p.userId !== i.user.id) return await i.reply({ content: '❌ Este formulário expirou. Use o comando de novo.', ...EPH });
        pendentes.delete(i.customId.split(':')[1]);
        return await publicarAtividade(i, p);
      }
      if ((i.isButton?.() || i.isStringSelectMenu?.()) && i.customId.startsWith('ativ:')) return await botaoAtividade(i);
      if (i.isButton?.() && i.customId.startsWith('sh:')) {
        const partes = i.customId.split(':');
        if (!staffAtiv(i)) return await negar(i);
        return await i.update(paginaHistoricoAtiv(TIPOS[partes[1]], Number(partes[2]), partes[3], partes[4]));
      }
    } catch (e) {
      console.error(`❌ Sistemas (${i.commandName || i.customId}):`, e.message);
      await responder(i, { content: `❌ Não consegui concluir: ${String(e.message || 'erro inesperado').slice(0, 200)}`, ...(i.deferred || i.replied ? {} : EPH) }).catch(() => {});
    }
  });

  if (client.isReady()) registrar(); else client.once('ready', registrar);
  console.log('🦇 Sistemas carregados (resenha/jogatina).');
};

module.exports.parseQuando = parseQuando;

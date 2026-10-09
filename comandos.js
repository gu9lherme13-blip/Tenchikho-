'use strict';
// =========================================================
// 🦇 NVB • COMANDOS — LOTE 1
// Membros, pontos, ranking, conquistas, recompensas e cargos.
// Usa os dados e funções que já existem no index.js (db, addPoints etc.).
// =========================================================
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const COR = 0x7c3aed;
const NO_PING = { parse: [] };
const MEDALHAS = ['🥇', '🥈', '🥉'];

module.exports = function iniciarComandos(ctx) {
  const {
    client, GUILD_ID, db, writeDb, addPoints, removePoints, logAction, modHistory, level, rankPosition,
    participationCounts, memberRoleLabel, roleNames, findNvbRole, guard, can, safeReply, safeDefer
  } = ctx;

  const CARGOS_CHOICES = Object.entries(roleNames).map(([key, nome]) => ({ name: nome.replace(/\s*[^\p{L}\p{N}\s-]+\s*$/u, '').slice(0, 100) || key, value: key }));

  const usuarioOpt = (desc = 'Membro (padrão: você)', obrigatorio = false) =>
    o => o.setName('usuario').setDescription(desc).setRequired(obrigatorio);

  const COMANDOS = [
    new SlashCommandBuilder().setName('ajuda').setDescription('Mostra os comandos do QG NVB'),
    new SlashCommandBuilder().setName('nvb').setDescription('Mostra o perfil NVB de um membro').addUserOption(usuarioOpt()),
    new SlashCommandBuilder().setName('perfil').setDescription('Mostra o perfil NVB de um membro').addUserOption(usuarioOpt()),
    new SlashCommandBuilder().setName('nivel').setDescription('Mostra o nível e o progresso de XP').addUserOption(usuarioOpt()),
    new SlashCommandBuilder().setName('ranking').setDescription('Mostra o ranking de pontos da NVB'),
    new SlashCommandBuilder().setName('pontos').setDescription('Mostra os pontos de um membro').addUserOption(usuarioOpt()),
    new SlashCommandBuilder().setName('pontos-add').setDescription('Adiciona pontos a um membro (staff)')
      .addUserOption(usuarioOpt('Membro que recebe os pontos', true))
      .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade de pontos').setMinValue(1).setMaxValue(10000).setRequired(true))
      .addStringOption(o => o.setName('motivo').setDescription('Motivo').setMaxLength(200)),
    new SlashCommandBuilder().setName('pontos-remove').setDescription('Remove pontos de um membro (staff)')
      .addUserOption(usuarioOpt('Membro que perde os pontos', true))
      .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade de pontos').setMinValue(1).setMaxValue(10000).setRequired(true))
      .addStringOption(o => o.setName('motivo').setDescription('Motivo').setMaxLength(200)),
    new SlashCommandBuilder().setName('historico').setDescription('Mostra o histórico de moderação de um membro (staff)')
      .addUserOption(usuarioOpt('Membro', true)),
    new SlashCommandBuilder().setName('conquistas').setDescription('Mostra as conquistas de um membro').addUserOption(usuarioOpt()),
    new SlashCommandBuilder().setName('conquista-add').setDescription('Concede uma conquista a um membro (staff)')
      .addUserOption(usuarioOpt('Membro que recebe a conquista', true))
      .addStringOption(o => o.setName('nome').setDescription('Nome da conquista').setMaxLength(100).setRequired(true)),
    new SlashCommandBuilder().setName('recompensa').setDescription('Registra uma recompensa para um membro (staff)')
      .addUserOption(usuarioOpt('Membro que recebe a recompensa', true))
      .addStringOption(o => o.setName('nome').setDescription('Nome da recompensa').setMaxLength(100).setRequired(true))
      .addIntegerOption(o => o.setName('pontos').setDescription('Pontos bônus junto com a recompensa (opcional)').setMinValue(0).setMaxValue(10000)),
    new SlashCommandBuilder().setName('recompensas').setDescription('Mostra as recompensas de um membro').addUserOption(usuarioOpt()),
    new SlashCommandBuilder().setName('cargos').setDescription('Mostra os cargos da hierarquia NVB e quantos membros têm cada um'),
    new SlashCommandBuilder().setName('dar-cargo').setDescription('Dá um cargo da hierarquia NVB a um membro (staff)')
      .addUserOption(usuarioOpt('Membro', true))
      .addStringOption(o => o.setName('cargo').setDescription('Cargo NVB').setRequired(true).addChoices(...CARGOS_CHOICES)),
    new SlashCommandBuilder().setName('remover-cargo').setDescription('Remove um cargo da hierarquia NVB de um membro (staff)')
      .addUserOption(usuarioOpt('Membro', true))
      .addStringOption(o => o.setName('cargo').setDescription('Cargo NVB').setRequired(true).addChoices(...CARGOS_CHOICES))
  ].map(c => c.setDMPermission(false));

  const NOMES = new Set(COMANDOS.map(c => c.name));

  async function registrar() {
    if (process.env.NVB_REGISTER_COMMANDS === '0') return;
    const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
    if (!guild) { console.warn('⚠️ Comandos: nenhum servidor encontrado para registrar.'); return; }
    // create (e não set): nunca apaga outros comandos do aplicativo.
    for (const c of COMANDOS) {
      try { await guild.commands.create(c.toJSON()); }
      catch (e) { console.error(`❌ Comandos: falha ao registrar /${c.name}:`, e.message); }
    }
    console.log(`🦇 Comandos NVB (lote 1): ${COMANDOS.length} registrados em "${guild.name}".`);
  }

  // ---------- helpers ----------
  const efêmero = { flags: MessageFlags.Ephemeral };
  const alvoUser = i => i.options.getUser('usuario') || i.user;
  const num = n => Number(n || 0).toLocaleString('pt-BR');
  async function membroDe(i, user) { return i.guild.members.fetch(user.id).catch(() => null); }
  function barra(pct) { const c = Math.max(0, Math.min(10, Math.round(pct * 10))); return '█'.repeat(c) + '░'.repeat(10 - c); }
  function ultimaAtividade(userId) {
    const logs = Array.isArray(db.logs) ? db.logs : [];
    for (let k = logs.length - 1; k >= 0; k--) if (logs[k]?.userId === userId && logs[k].at) return Math.floor(new Date(logs[k].at).getTime() / 1000);
    return null;
  }
  function resumo(userId) {
    const pontos = Number(db.pontos[userId] || 0), xp = Number(db.xp[userId] || 0), lv = level(xp);
    return { pontos, xp, lv, proximo: lv * 100, rank: rankPosition(userId), part: participationCounts(userId), conquistas: (db.conquistas[userId] || []).length };
  }
  const ehBot = u => !!u?.bot;

  // ---------- execução ----------
  async function executar(i) {
    const nome = i.commandName;

    if (nome === 'ajuda') {
      const e = new EmbedBuilder().setColor(COR).setTitle('🦇 QG NVB • Comandos')
        .setDescription('Comandos disponíveis neste bot. Os de staff exigem o cargo correspondente.')
        .addFields(
          { name: '👥 Membros', value: '`/nvb` `/perfil` `/nivel` `/conquistas` `/recompensas` `/cargos`' },
          { name: '🪙 Pontos', value: '`/pontos` `/ranking`' },
          { name: '🛠️ Staff', value: '`/pontos-add` `/pontos-remove` `/conquista-add` `/recompensa` `/dar-cargo` `/remover-cargo` `/historico`' },
          { name: '🌌 Diversão', value: '`/multiverso` `/interacao` `/ship` `/interacao-animal` `/personagem` `/personagem-anime` `/animequiz` `/destino-anime` `/transformacao-anime` `/poder-anime` `/batalha-anime` `/duelo-anime`' },
          { name: '🤖 IA', value: '`/ia` `/imagem` `/imagem-editar` `/analisar` `/traduzir` `/resumir` `/avatar-estilo` `/avatar-cena` `/moderar-texto` — ou mencione o bot.' }
        ).setFooter({ text: 'Nytheris Vampyre Bloodline' });
      return safeReply(i, { embeds: [e], ...efêmero });
    }

    if (nome === 'nvb' || nome === 'perfil') {
      const user = alvoUser(i);
      if (ehBot(user)) return safeReply(i, { content: '❌ Bots não têm perfil NVB.', ...efêmero });
      const m = await membroDe(i, user);
      if (!m) return safeReply(i, { content: '❌ Esse membro não está no servidor.', ...efêmero });
      const r = resumo(user.id), ult = ultimaAtividade(user.id), rbx = db.roblox[user.id]?.username;
      const e = new EmbedBuilder().setColor(COR).setTitle(`🦇 ${m.displayName}`).setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setDescription(`👤 <@${user.id}>\n🏷️ ${memberRoleLabel(m)}${rbx ? `\n🎮 Roblox: **${rbx}**` : ''}`)
        .addFields(
          { name: '⭐ Nível', value: `${r.lv}`, inline: true },
          { name: '✨ XP', value: num(r.xp), inline: true },
          { name: '🪙 Pontos', value: num(r.pontos), inline: true },
          { name: '🏆 Ranking', value: r.rank === '—' ? '—' : `#${r.rank}`, inline: true },
          { name: '🏅 Conquistas', value: `${r.conquistas}`, inline: true },
          { name: '🟢 Presenças', value: `${r.part.presencas}`, inline: true },
          { name: '🎪 Eventos', value: `${r.part.eventos}`, inline: true },
          { name: '🎮 Jogatinas', value: `${r.part.jogatinas}`, inline: true },
          { name: '💬 Resenhas', value: `${r.part.resenhas}`, inline: true },
          { name: '🕒 Última atividade', value: ult ? `<t:${ult}:R>` : 'Sem registro' }
        ).setFooter({ text: 'Nytheris Vampyre Bloodline' });
      return safeReply(i, { embeds: [e], allowedMentions: NO_PING });
    }

    if (nome === 'nivel') {
      const user = alvoUser(i);
      if (ehBot(user)) return safeReply(i, { content: '❌ Bots não têm nível.', ...efêmero });
      const r = resumo(user.id), noNivel = r.xp - (r.lv - 1) * 100;
      const e = new EmbedBuilder().setColor(COR).setTitle(`⭐ Nível de ${user.username}`)
        .setDescription(`**Nível ${r.lv}**\n\`${barra(noNivel / 100)}\` ${noNivel}/100 XP\nFaltam **${Math.max(0, r.proximo - r.xp)} XP** para o nível ${r.lv + 1}.\n\n✨ XP total: **${num(r.xp)}**`);
      return safeReply(i, { embeds: [e] });
    }

    if (nome === 'pontos') {
      const user = alvoUser(i);
      if (ehBot(user)) return safeReply(i, { content: '❌ Bots não têm pontos.', ...efêmero });
      const r = resumo(user.id);
      return safeReply(i, { content: `🪙 <@${user.id}> tem **${num(r.pontos)}** pontos${r.rank === '—' ? '' : ` (#${r.rank} no ranking)`}.`, allowedMentions: NO_PING });
    }

    if (nome === 'ranking') {
      const lista = Object.entries(db.pontos).filter(([, p]) => Number(p) > 0).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 10);
      const linhas = lista.map(([id, p], k) => `${MEDALHAS[k] || `**${k + 1}.**`} <@${id}> — **${num(p)}** 🪙 • nível ${level(db.xp[id] || 0)}`);
      const meu = rankPosition(i.user.id);
      const e = new EmbedBuilder().setColor(COR).setTitle('🏆 Ranking NVB')
        .setDescription(linhas.join('\n') || 'Ainda não há pontos registrados.')
        .setFooter({ text: meu === '—' ? 'Você ainda não está no ranking.' : `Sua posição: #${meu}` });
      return safeReply(i, { embeds: [e], allowedMentions: NO_PING });
    }

    if (nome === 'pontos-add' || nome === 'pontos-remove') {
      const add = nome === 'pontos-add';
      if (!(await guard(i, add ? 'pontosAdd' : 'pontosRemove'))) return;
      const user = i.options.getUser('usuario', true), qtd = i.options.getInteger('quantidade', true), motivo = i.options.getString('motivo') || 'Sem motivo informado';
      if (ehBot(user)) return safeReply(i, { content: '❌ Bots não recebem pontos.', ...efêmero });
      if (add && user.id === i.user.id && !i.memberPermissions?.has('Administrator')) return safeReply(i, { content: '❌ Você não pode dar pontos a si mesmo.', ...efêmero });
      if (add) addPoints(user.id, qtd, `${motivo} (por ${i.user.id})`);
      else if (!removePoints(user.id, qtd, `${motivo} (por ${i.user.id})`)) return safeReply(i, { content: `❌ <@${user.id}> tem apenas **${num(db.pontos[user.id] || 0)}** pontos.`, allowedMentions: NO_PING, ...efêmero });
      await modHistory(user.id, add ? 'pontos_add' : 'pontos_remove', { quantidade: qtd, motivo, por: i.user.id });
      return safeReply(i, { content: `${add ? '✅ +' : '➖ -'}${num(qtd)} pontos para <@${user.id}>.\n📝 ${motivo}\n🪙 Total: **${num(db.pontos[user.id] || 0)}**`, allowedMentions: NO_PING });
    }

    if (nome === 'historico') {
      if (!(await guard(i, 'moderacao'))) return;
      const user = i.options.getUser('usuario', true), h = (db.historico[user.id] || []).slice(-10).reverse();
      const linhas = h.map(x => `• <t:${Math.floor(new Date(x.at).getTime() / 1000)}:d> **${x.action}** ${x.details ? `— ${String(typeof x.details === 'string' ? x.details : (x.details.motivo || x.details.reason || JSON.stringify(x.details))).slice(0, 120)}` : ''}`);
      return safeReply(i, { embeds: [new EmbedBuilder().setColor(COR).setTitle(`📜 Histórico de ${user.username}`).setDescription(linhas.join('\n') || 'Nenhum registro.')], ...efêmero });
    }

    if (nome === 'conquistas') {
      const user = alvoUser(i), lista = db.conquistas[user.id] || [];
      const linhas = lista.slice(-20).reverse().map(x => `🏅 ${typeof x === 'string' ? x : (x.nome || 'Conquista')}`);
      return safeReply(i, { embeds: [new EmbedBuilder().setColor(COR).setTitle(`🏆 Conquistas de ${user.username} (${lista.length})`).setDescription(linhas.join('\n') || 'Nenhuma conquista ainda.')] });
    }

    if (nome === 'conquista-add') {
      if (!(await guard(i, 'conquista'))) return;
      const user = i.options.getUser('usuario', true), nomeC = i.options.getString('nome', true).trim();
      if (ehBot(user)) return safeReply(i, { content: '❌ Bots não recebem conquistas.', ...efêmero });
      if (!Array.isArray(db.conquistas[user.id])) db.conquistas[user.id] = [];
      if (db.conquistas[user.id].some(x => (typeof x === 'string' ? x : x.nome) === nomeC)) return safeReply(i, { content: '❌ Esse membro já tem essa conquista.', ...efêmero });
      db.conquistas[user.id].push({ nome: nomeC, por: i.user.id, at: new Date().toISOString() });
      writeDb('conquistas'); logAction('conquista', user.id, { nome: nomeC, por: i.user.id });
      return safeReply(i, { content: `🏅 <@${user.id}> recebeu a conquista **${nomeC}**!`, allowedMentions: NO_PING });
    }

    if (nome === 'recompensa') {
      if (!(await guard(i, 'recompensa'))) return;
      const user = i.options.getUser('usuario', true), nomeR = i.options.getString('nome', true).trim(), pts = i.options.getInteger('pontos') || 0;
      if (ehBot(user)) return safeReply(i, { content: '❌ Bots não recebem recompensas.', ...efêmero });
      if (!Array.isArray(db.recompensas)) db.recompensas = [];
      db.recompensas.push({ userId: user.id, nome: nomeR, pontos: pts, por: i.user.id, at: new Date().toISOString() });
      writeDb('recompensas');
      if (pts > 0) addPoints(user.id, pts, `Recompensa: ${nomeR}`);
      logAction('recompensa', user.id, { nome: nomeR, pontos: pts, por: i.user.id });
      return safeReply(i, { content: `🎁 <@${user.id}> recebeu a recompensa **${nomeR}**${pts ? ` (+${num(pts)} 🪙)` : ''}!`, allowedMentions: NO_PING });
    }

    if (nome === 'recompensas') {
      const user = alvoUser(i), lista = (db.recompensas || []).filter(x => x.userId === user.id).slice(-15).reverse();
      const linhas = lista.map(x => `🎁 **${x.nome}**${x.pontos ? ` • ${num(x.pontos)} 🪙` : ''} • <t:${Math.floor(new Date(x.at).getTime() / 1000)}:d>`);
      return safeReply(i, { embeds: [new EmbedBuilder().setColor(COR).setTitle(`🎁 Recompensas de ${user.username}`).setDescription(linhas.join('\n') || 'Nenhuma recompensa registrada.')] });
    }

    if (nome === 'cargos') {
      await safeDefer(i);
      await i.guild.members.fetch().catch(() => {});
      const linhas = Object.entries(roleNames).map(([key, label]) => {
        const r = findNvbRole(i.guild, key);
        return r ? `${label} — **${r.members.size}**` : `${label} — _cargo não encontrado_`;
      });
      return safeReply(i, { embeds: [new EmbedBuilder().setColor(COR).setTitle('🏷️ Hierarquia NVB').setDescription(linhas.join('\n'))] });
    }

    if (nome === 'dar-cargo' || nome === 'remover-cargo') {
      if (!(await guard(i, 'admin'))) return;
      const dar = nome === 'dar-cargo', user = i.options.getUser('usuario', true), key = i.options.getString('cargo', true);
      const alvo = await membroDe(i, user), role = findNvbRole(i.guild, key), eu = i.guild.members.me;
      if (!alvo) return safeReply(i, { content: '❌ Esse membro não está no servidor.', ...efêmero });
      if (!role) return safeReply(i, { content: `❌ Não encontrei o cargo **${roleNames[key]}** neste servidor.`, ...efêmero });
      if (role.managed) return safeReply(i, { content: '❌ Esse cargo é gerenciado por uma integração.', ...efêmero });
      if (!eu?.permissions.has('ManageRoles') || role.position >= eu.roles.highest.position) return safeReply(i, { content: '❌ Meu cargo precisa estar **acima** desse cargo na lista de cargos do servidor (e eu preciso da permissão Gerenciar cargos).', ...efêmero });
      const admin = i.memberPermissions?.has('Administrator');
      if (!admin && role.position >= i.member.roles.highest.position) return safeReply(i, { content: '❌ Você só pode gerenciar cargos abaixo do seu cargo mais alto.', ...efêmero });
      if (dar ? alvo.roles.cache.has(role.id) : !alvo.roles.cache.has(role.id)) return safeReply(i, { content: dar ? '❌ O membro já tem esse cargo.' : '❌ O membro não tem esse cargo.', ...efêmero });
      await (dar ? alvo.roles.add(role, `por ${i.user.tag}`) : alvo.roles.remove(role, `por ${i.user.tag}`));
      await modHistory(user.id, dar ? 'cargo_add' : 'cargo_remove', { cargo: role.name, por: i.user.id });
      return safeReply(i, { content: `${dar ? '✅ Cargo' : '➖ Cargo'} **${role.name}** ${dar ? 'dado a' : 'removido de'} <@${user.id}>.`, allowedMentions: NO_PING });
    }
  }

  client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand?.() || !NOMES.has(i.commandName)) return;
    try { await executar(i); }
    catch (e) {
      console.error(`❌ /${i.commandName}:`, e.message);
      await safeReply(i, { content: `❌ Não consegui executar este comando: ${String(e.message || 'erro inesperado').slice(0, 200)}`, ...(i.deferred || i.replied ? {} : efêmero) }).catch(() => {});
    }
  });

  if (client.isReady()) registrar(); else client.once('ready', registrar);
  console.log('🦇 Comandos NVB (lote 1) carregados.');
};

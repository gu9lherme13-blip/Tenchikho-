'use strict';
// =========================================================
// 🦇 NVB PAINEL — servidor (login com Discord, servidores e painéis de auto cargos)
// Rotas:  GET /auth/discord  •  GET /auth/callback
//         GET /api/painel/config  •  GET /api/painel/me  •  POST /api/painel/logout
//         GET /api/painel/guild/:id  •  /autoroles (GET, POST, PUT /:panelId, DELETE /:panelId)
// Variáveis: DISCORD_CLIENT_SECRET (obrigatória p/ login), PUBLIC_URL (opcional), CLIENT_ID
// =========================================================
const crypto = require('crypto');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const TTL_SESSAO = 12 * 3600 * 1000;
const PERIGOSAS = ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageWebhooks', 'BanMembers', 'KickMembers', 'ModerateMembers', 'ManageMessages'];
const PERMISSOES_CONVITE = 268520448; // Ver canais, Enviar mensagens, Inserir links, Ler histórico e Gerenciar cargos
const RE_EMOJI_CUSTOM = /^<(a?):(\w{2,32}):(\d{17,20})>$/;

module.exports = function iniciarPainel(ctx) {
  const { app, client, db, readJson, writeDb } = ctx;
  const JOGOS_API = require('./jogos')({ client, db, readJson, writeDb });
  if (!db.autorole_panels || typeof db.autorole_panels !== 'object' || Array.isArray(db.autorole_panels)) db.autorole_panels = readJson('autorole_panels.json', {});
  const salvar = () => writeDb('autorole_panels');
  for (const k of ['boasvindas', 'tickets_cfg', 'tickets_abertos']) if (!db[k] || typeof db[k] !== 'object' || Array.isArray(db[k])) db[k] = readJson(`${k}.json`, {});

  const sessoes = new Map(), estados = new Map();
  setInterval(() => { const agora = Date.now(); for (const [k, v] of sessoes) if (agora - v.criadoEm > TTL_SESSAO) sessoes.delete(k); for (const [k, v] of estados) if (v < agora) estados.delete(k); }, 10 * 60 * 1000).unref?.();

  const clientId = () => process.env.CLIENT_ID || '';
  const secret = () => process.env.DISCORD_CLIENT_SECRET || '';
  const baseUrl = req => String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || (req ? `${req.headers['x-forwarded-proto'] || req.protocol || 'https'}://${req.get ? req.get('host') : req.headers.host}` : '')).replace(/\/+$/, '');
  const convite = guildId => `https://discord.com/oauth2/authorize?client_id=${clientId()}&scope=${encodeURIComponent('bot applications.commands')}&permissions=${PERMISSOES_CONVITE}${guildId ? `&guild_id=${guildId}&disable_guild_select=true` : ''}`;
  const iconeGuild = g => g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${String(g.icon).startsWith('a_') ? 'gif' : 'png'}?size=128` : null;
  const avatarUser = u => u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${/^\d+$/.test(String(u.id)) ? Number((BigInt(u.id) >> 22n) % 6n) : 0}.png`;
  const cookies = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim().split('=')).filter(a => a[0] && a.length >= 2).map(a => [a[0], decodeURIComponent(a.slice(1).join('='))]));
  const paginaErro = (res, msg) => res.status(400).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#0b0712;color:#f7f2ff;font-family:system-ui;padding:24px"><h2>🦇 Não foi possível entrar</h2><p>${String(msg).replace(/[<>&]/g, '')}</p><p><a style="color:#a78bfa" href="/">← Voltar</a></p>`);

  // ---------- login com Discord (OAuth2) ----------
  app.get('/auth/discord', (req, res) => {
    if (!secret() || !clientId()) return paginaErro(res, 'O login com Discord ainda não foi configurado (falta DISCORD_CLIENT_SECRET no Render).');
    const state = crypto.randomBytes(16).toString('hex'); estados.set(state, Date.now() + 10 * 60 * 1000);
    const seguro = /^https/i.test(baseUrl(req));
    res.setHeader('Set-Cookie', `nvb_oauth=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${seguro ? '; Secure' : ''}`);
    const url = `https://discord.com/oauth2/authorize?client_id=${clientId()}&response_type=code&scope=${encodeURIComponent('identify guilds')}&redirect_uri=${encodeURIComponent(baseUrl(req) + '/auth/callback')}&state=${state}&prompt=none`;
    res.redirect(url);
  });
  app.get('/auth/callback', async (req, res) => {
    try {
      const { code, state, error } = req.query || {};
      if (error) return paginaErro(res, 'Você cancelou o login no Discord.');
      if (!code || !state || !estados.has(String(state)) || cookies(req).nvb_oauth !== String(state)) return paginaErro(res, 'Sessão de login inválida ou expirada. Tente entrar de novo.');
      estados.delete(String(state));
      const tk = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId(), client_secret: secret(), grant_type: 'authorization_code', code: String(code), redirect_uri: baseUrl(req) + '/auth/callback' }), signal: AbortSignal.timeout(15000) });
      const tj = await tk.json().catch(() => ({}));
      if (!tk.ok) console.error('❌ token Discord:', tk.status, tj.error || '', tj.error_description || '');
      if (!tk.ok || !tj.access_token) return paginaErro(res, 'O Discord recusou o login. Confira o Client Secret e a URL de retorno (Redirect) do aplicativo.');
      const h = { Authorization: `Bearer ${tj.access_token}` };
      const [ur, gr] = await Promise.all([fetch('https://discord.com/api/users/@me', { headers: h, signal: AbortSignal.timeout(15000) }), fetch('https://discord.com/api/users/@me/guilds', { headers: h, signal: AbortSignal.timeout(15000) })]);
      const user = await ur.json().catch(() => null), guilds = gr.ok ? await gr.json().catch(() => []) : [];
      if (!ur.ok || !user || !user.id) return paginaErro(res, 'Não consegui ler o seu perfil do Discord.');
      const token = crypto.randomBytes(32).toString('hex');
      sessoes.set(token, { userId: user.id, nome: user.global_name || user.username, avatar: avatarUser(user), guilds: Array.isArray(guilds) ? guilds : [], criadoEm: Date.now() });
      res.setHeader('Set-Cookie', 'nvb_oauth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
      res.redirect(`/#login=${token}`); // no fragmento: não aparece em logs do servidor
    } catch (e) { console.error('❌ /auth/callback:', e.message); paginaErro(res, 'Falha ao falar com o Discord. Tente novamente.'); }
  });

  const sessao = req => { const h = String(req.headers.authorization || ''); if (!h.startsWith('Bearer ')) return null; const s = sessoes.get(h.slice(7)); if (!s) return null; if (Date.now() - s.criadoEm > TTL_SESSAO) { sessoes.delete(h.slice(7)); return null; } return s; };
  const podeGerenciar = g => g.owner === true || (() => { try { const p = BigInt(g.permissions || '0'); return (p & 0x8n) !== 0n || (p & 0x20n) !== 0n; } catch { return false; } })();

  app.get('/api/painel/config', (req, res) => res.json({ ok: true, loginDisponivel: !!(secret() && clientId()), conviteGeral: clientId() ? convite() : null, botAvatar: client.user ? client.user.displayAvatarURL({ extension: 'png', size: 256 }) : null }));
  app.get('/api/painel/me', (req, res) => {
    const s = sessao(req); if (!s) return res.status(401).json({ ok: false, error: 'Faça login com o Discord.' });
    const guilds = s.guilds.filter(podeGerenciar).map(g => ({ id: g.id, nome: g.name, icone: iconeGuild(g), botPresente: client.guilds.cache.has(g.id), conviteUrl: convite(g.id) }))
      .sort((a, b) => Number(b.botPresente) - Number(a.botPresente) || a.nome.localeCompare(b.nome));
    res.json({ ok: true, usuario: { id: s.userId, nome: s.nome, avatar: s.avatar }, guilds, bot: { online: client.isReady(), nome: client.user?.tag || null } });
  });
  app.post('/api/painel/logout', (req, res) => { const h = String(req.headers.authorization || ''); if (h.startsWith('Bearer ')) sessoes.delete(h.slice(7)); res.json({ ok: true }); });

  // ---------- acesso a um servidor: o usuário precisa gerenciar o servidor E o bot precisa estar nele ----------
  async function acesso(req, res) {
    const s = sessao(req); if (!s) { res.status(401).json({ ok: false, error: 'Faça login com o Discord.' }); return null; }
    const guild = client.guilds.cache.get(String(req.params.id || '')); if (!guild) { res.status(404).json({ ok: false, error: 'O bot não está neste servidor. Convide-o primeiro.' }); return null; }
    let membro = null; try { membro = await guild.members.fetch(s.userId); } catch (e) { /* não está no servidor */ }
    const ok = membro && (guild.ownerId === s.userId || membro.permissions.has('Administrator') || membro.permissions.has('ManageGuild'));
    if (!ok) { res.status(403).json({ ok: false, error: 'Você precisa de "Gerenciar servidor" neste servidor.' }); return null; }
    return { s, guild, membro, eu: guild.members.me };
  }
  const perigosa = r => PERIGOSAS.some(p => r.permissions.has(p));
  const cargosAtribuiveis = (guild, eu) => [...guild.roles.cache.values()].filter(r => r.id !== guild.id && !r.managed && eu && r.position < eu.roles.highest.position && !perigosa(r)).sort((a, b) => b.position - a.position);
  const canaisEnviaveis = (guild, eu) => [...guild.channels.cache.values()].filter(c => (c.type === 0 || c.type === 5) && eu && c.permissionsFor && c.permissionsFor(eu)?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])).sort((a, b) => (a.rawPosition || 0) - (b.rawPosition || 0));
  const painelPublico = p => ({ id: p.id, titulo: p.titulo, descricao: p.descricao, cor: p.cor, modo: p.modo, canalId: p.canalId, mensagemId: p.mensagemId, cargos: p.cargos, criadoEm: p.criadoEm, atualizadoEm: p.atualizadoEm });
  const painelsDo = guildId => Object.values(db.autorole_panels).filter(p => p.guildId === guildId).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

  app.get('/api/painel/guild/:id', async (req, res) => {
    try {
      const a = await acesso(req, res); if (!a) return; const { guild, eu } = a;
      res.json({ ok: true, guild: { id: guild.id, nome: guild.name, icone: iconeGuild(guild), membros: guild.memberCount, canais: canaisEnviaveis(guild, eu).map(c => ({ id: c.id, nome: c.name })),
        cargos: cargosAtribuiveis(guild, eu).map(r => ({ id: r.id, nome: r.name, cor: r.hexColor })), paineis: painelsDo(guild.id).length, botPodeGerenciarCargos: !!eu?.permissions.has('ManageRoles'),
        categorias: [...guild.channels.cache.values()].filter(c => c.type === 4).map(c => ({ id: c.id, nome: c.name })),
        funcoes: { autocargos: painelsDo(guild.id).length, boasvindas: !!(db.boasvindas[guild.id] && db.boasvindas[guild.id].ativo), tickets: !!(db.tickets_cfg[guild.id] && db.tickets_cfg[guild.id].ativo) } } });
    } catch (e) { console.error('❌ /api/painel/guild:', e.message); res.status(500).json({ ok: false, error: 'Não foi possível carregar o servidor.' }); }
  });
  app.get('/api/painel/guild/:id/autoroles', async (req, res) => { const a = await acesso(req, res); if (!a) return; res.json({ ok: true, paineis: painelsDo(a.guild.id).map(painelPublico) }); });

  // ---------- validação e montagem do painel ----------
  function parseEmoji(txt) {
    const t = String(txt || '').trim(); if (!t) return null;
    const m = t.match(RE_EMOJI_CUSTOM); if (m) return { animated: m[1] === 'a', name: m[2], id: m[3] };
    return /^\p{Extended_Pictographic}/u.test(t) && t.length <= 12 ? { name: t } : null;
  }
  function validar(guild, eu, b) {
    const titulo = String(b.titulo || '').trim().slice(0, 100), descricao = String(b.descricao || '').trim().slice(0, 1000), modo = b.modo === 'multi' ? 'multi' : 'single';
    const cor = /^#[0-9a-f]{6}$/i.test(String(b.cor || '')) ? String(b.cor).toLowerCase() : '#8b5cf6';
    if (!titulo) return { erro: 'Dê um título ao painel.' };
    if (!Array.isArray(b.cargos) || !b.cargos.length) return { erro: 'Escolha pelo menos um cargo.' };
    if (b.cargos.length > 25) return { erro: 'O máximo é 25 cargos por painel.' };
    const permitidos = new Map(cargosAtribuiveis(guild, eu).map(r => [r.id, r])), vistos = new Set(), cargos = [];
    for (const c of b.cargos) {
      const id = String(c.roleId || c.id || ''); const r = guild.roles.cache.get(id);
      if (!r) return { erro: 'Um dos cargos escolhidos não existe mais.' };
      if (vistos.has(id)) return { erro: `O cargo "${r.name}" foi escolhido duas vezes.` }; vistos.add(id);
      if (!permitidos.has(id)) return { erro: `O cargo "${r.name}" não pode entrar em painel: ele está acima do cargo do bot, é gerenciado por integração ou tem permissões de administração.` };
      cargos.push({ roleId: id, rotulo: String(c.rotulo || r.name).trim().slice(0, 100) || r.name, descricao: String(c.descricao || '').trim().slice(0, 100), emoji: String(c.emoji || '').trim() && parseEmoji(c.emoji) ? String(c.emoji).trim() : '' });
    }
    return { titulo, descricao, modo, cor, cargos };
  }
  function montarMensagem(p) {
    const e = new EmbedBuilder().setColor(parseInt(p.cor.slice(1), 16)).setTitle(p.titulo).setFooter({ text: p.modo === 'single' ? 'Escolha um cargo no menu. Para remover, limpe a seleção.' : 'Escolha os cargos que quiser no menu.' });
    if (p.descricao) e.setDescription(p.descricao);
    const menu = new StringSelectMenuBuilder().setCustomId(`ar:${p.id}`).setPlaceholder(p.modo === 'single' ? 'Escolha o seu cargo' : 'Escolha os seus cargos').setMinValues(0).setMaxValues(p.modo === 'single' ? 1 : p.cargos.length)
      .addOptions(p.cargos.map(c => { const o = { label: c.rotulo, value: c.roleId }; if (c.descricao) o.description = c.descricao; const em = parseEmoji(c.emoji); if (em) o.emoji = em; return o; }));
    return { embeds: [e], components: [new ActionRowBuilder().addComponents(menu)], allowedMentions: { parse: [] } };
  }
  const erroDiscord = e => e && e.code === 50013 ? 'O bot não tem permissão nesse canal.' : e && e.code === 10003 ? 'O canal não existe mais.' : e && e.code === 50001 ? 'O bot não enxerga esse canal.' : `Erro do Discord: ${e && e.message}`;

  app.post('/api/painel/guild/:id/autoroles', async (req, res) => {
    try {
      const a = await acesso(req, res); if (!a) return; const { guild, eu, s } = a, b = req.body || {};
      if (!eu?.permissions.has('ManageRoles')) return res.status(400).json({ ok: false, error: 'O bot precisa da permissão "Gerenciar cargos" neste servidor.' });
      if (painelsDo(guild.id).length >= 30) return res.status(400).json({ ok: false, error: 'Limite de 30 painéis por servidor.' });
      const v = validar(guild, eu, b); if (v.erro) return res.status(400).json({ ok: false, error: v.erro });
      const canal = canaisEnviaveis(guild, eu).find(c => c.id === String(b.canalId || '')); if (!canal) return res.status(400).json({ ok: false, error: 'Escolha um canal onde o bot possa enviar mensagens e embeds.' });
      const agora = new Date().toISOString(), p = { id: crypto.randomBytes(6).toString('hex'), guildId: guild.id, canalId: canal.id, mensagemId: null, ...v, criadoPor: s.userId, criadoEm: agora, atualizadoEm: agora };
      try { const msg = await canal.send(montarMensagem(p)); p.mensagemId = msg.id; } catch (e) { return res.status(400).json({ ok: false, error: erroDiscord(e) }); }
      db.autorole_panels[p.id] = p; salvar(); res.json({ ok: true, painel: painelPublico(p) });
    } catch (e) { console.error('❌ criar painel:', e.message); res.status(500).json({ ok: false, error: 'Não foi possível criar o painel.' }); }
  });
  app.put('/api/painel/guild/:id/autoroles/:panelId', async (req, res) => {
    try {
      const a = await acesso(req, res); if (!a) return; const { guild, eu } = a, p = db.autorole_panels[String(req.params.panelId)];
      if (!p || p.guildId !== guild.id) return res.status(404).json({ ok: false, error: 'Painel não encontrado.' });
      const v = validar(guild, eu, req.body || {}); if (v.erro) return res.status(400).json({ ok: false, error: v.erro });
      const novo = { ...p, ...v, atualizadoEm: new Date().toISOString() };
      const canal = await client.channels.fetch(p.canalId).catch(() => null), msg = canal && p.mensagemId ? await canal.messages.fetch(p.mensagemId).catch(() => null) : null;
      try { if (msg) await msg.edit(montarMensagem(novo)); else if (canal) { const m2 = await canal.send(montarMensagem(novo)); novo.mensagemId = m2.id; } else return res.status(400).json({ ok: false, error: 'O canal do painel não existe mais.' }); }
      catch (e) { return res.status(400).json({ ok: false, error: erroDiscord(e) }); }
      db.autorole_panels[p.id] = novo; salvar(); res.json({ ok: true, painel: painelPublico(novo) });
    } catch (e) { console.error('❌ editar painel:', e.message); res.status(500).json({ ok: false, error: 'Não foi possível salvar o painel.' }); }
  });
  app.delete('/api/painel/guild/:id/autoroles/:panelId', async (req, res) => {
    try {
      const a = await acesso(req, res); if (!a) return; const p = db.autorole_panels[String(req.params.panelId)];
      if (!p || p.guildId !== a.guild.id) return res.status(404).json({ ok: false, error: 'Painel não encontrado.' });
      try { const canal = await client.channels.fetch(p.canalId).catch(() => null), msg = canal && p.mensagemId ? await canal.messages.fetch(p.mensagemId).catch(() => null) : null; if (msg) await msg.delete(); } catch (e) { /* mensagem já apagada */ }
      delete db.autorole_panels[p.id]; salvar(); res.json({ ok: true });
    } catch (e) { console.error('❌ apagar painel:', e.message); res.status(500).json({ ok: false, error: 'Não foi possível apagar o painel.' }); }
  });

  // ---------- jogos nos canais (aba Games) ----------
  app.get('/api/painel/guild/:id/jogos', async (req, res) => {
    try {
      const a = await acesso(req, res); if (!a) return;
      const r = JOGOS_API.resumo(a.guild.id);
      res.json({ ok: true, jogos: JOGOS_API.JOGOS, categoriaNome: JOGOS_API.CATEGORIA, canais: canaisEnviaveis(a.guild, a.eu).map(c => ({ id: c.id, nome: c.name })),
        config: r.config, placar: r.placar, historico: r.historico, podeCriarCategoria: !!a.eu?.permissions.has('ManageChannels') });
    } catch (e) { console.error('❌ jogos (GET):', e.message); res.status(500).json({ ok: false, error: 'Não foi possível carregar os jogos.' }); }
  });
  app.put('/api/painel/guild/:id/jogos', async (req, res) => {
    try {
      const a = await acesso(req, res); if (!a) return; const { guild, eu } = a;
      const pedidos = (req.body && req.body.canais) || {};
      const permitidos = new Set(canaisEnviaveis(guild, eu).map(c => c.id));
      const usados = new Set(), canais = {};
      for (const j of JOGOS_API.JOGOS) {
        const v = pedidos[j.id] ? String(pedidos[j.id]) : null;
        if (v) {
          if (!permitidos.has(v)) return res.status(400).json({ ok: false, error: `O canal escolhido para ${j.nome} não está disponível para o bot.` });
          if (usados.has(v)) return res.status(400).json({ ok: false, error: 'Cada canal só pode ter um jogo.' });
          usados.add(v);
        }
        canais[j.id] = v;
      }
      JOGOS_API.salvarConfig(guild.id, canais);
      res.json({ ok: true, config: JOGOS_API.cfgDe(guild.id) });
    } catch (e) { console.error('❌ jogos (PUT):', e.message); res.status(500).json({ ok: false, error: 'Não foi possível salvar os canais dos jogos.' }); }
  });
  app.post('/api/painel/guild/:id/jogos/categoria', async (req, res) => {
    try {
      const a = await acesso(req, res); if (!a) return; const { guild, eu } = a;
      if (!eu?.permissions.has('ManageChannels')) return res.status(400).json({ ok: false, error: 'O bot precisa da permissão "Gerenciar canais" para criar a categoria.' });
      const cat = guild.channels.cache.find(c => c.type === 4 && c.name === JOGOS_API.CATEGORIA) || await guild.channels.create({ name: JOGOS_API.CATEGORIA, type: 4, reason: 'Painel: categoria de jogos' });
      const canais = {};
      for (const j of JOGOS_API.JOGOS) {
        const existente = guild.channels.cache.find(c => c.type === 0 && c.name === j.canal && c.parentId === cat.id);
        const c = existente || await guild.channels.create({ name: j.canal, type: 0, parent: cat.id, reason: 'Painel: canal do jogo ' + j.nome });
        canais[j.id] = c.id;
      }
      JOGOS_API.salvarConfig(guild.id, canais);
      res.json({ ok: true, config: JOGOS_API.cfgDe(guild.id) });
    } catch (e) { console.error('❌ jogos (categoria):', e.message); res.status(500).json({ ok: false, error: erroDiscord(e) }); }
  });

  // ---------- quando um membro usa o menu de cargos ----------
  client.on('interactionCreate', async i => {
    if (!i.isStringSelectMenu?.() || !String(i.customId).startsWith('ar:')) return;
    try {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const p = db.autorole_panels[String(i.customId).slice(3)];
      if (!p) return i.editReply({ content: '❌ Este painel foi removido.' });
      const guild = i.guild, membro = i.member, eu = guild?.members?.me;
      if (!guild || guild.id !== p.guildId || !membro) return i.editReply({ content: '❌ Painel inválido para este servidor.' });
      const permitidos = new Map(cargosAtribuiveis(guild, eu).map(r => [r.id, r])), escolhidos = new Set(i.values.filter(v => p.cargos.some(c => c.roleId === v)));
      const add = [], rem = [], pulados = [];
      for (const c of p.cargos) {
        const r = permitidos.get(c.roleId); const tem = membro.roles.cache.has(c.roleId);
        if (!r) { if (escolhidos.has(c.roleId)) pulados.push(c.rotulo); continue; }
        if (escolhidos.has(c.roleId) && !tem) add.push(r); else if (!escolhidos.has(c.roleId) && tem) rem.push(r);
      }
      if (add.length) await membro.roles.add(add, 'Painel de auto cargos NVB');
      if (rem.length) await membro.roles.remove(rem, 'Painel de auto cargos NVB');
      const linhas = [...add.map(r => `➕ **${r.name}**`), ...rem.map(r => `➖ **${r.name}**`)];
      if (pulados.length) linhas.push(`⚠️ Não consegui dar: ${pulados.join(', ')} (o cargo do bot precisa ficar acima deles).`);
      await i.editReply({ content: linhas.length ? `Pronto!\n${linhas.join('\n')}` : 'Nada mudou: seus cargos já estavam assim.', allowedMentions: { parse: [] } });
    } catch (e) {
      console.error('❌ menu de cargos:', e.message);
      const msg = e.code === 50013 ? '❌ O bot não tem permissão para mudar esses cargos. Avise a staff.' : '❌ Não consegui atualizar seus cargos agora.';
      (i.deferred || i.replied ? i.editReply({ content: msg }) : i.reply({ content: msg, flags: MessageFlags.Ephemeral })).catch(() => {});
    }
  });


  // =====================================================
  // BOAS-VINDAS
  // =====================================================
  const BV_PADRAO = { ativo: false, canalId: '', titulo: 'Bem-vindo(a) à {servidor}!', mensagem: 'Olá, {usuario}! Você é o membro nº {membros}. Leia as regras e aproveite a comunidade. 🦇', cor: '#8b5cf6' };
  const aplicar = (txt, m, guild) => String(txt || '').replace(/\{usuario\}/gi, `<@${m.id}>`).replace(/\{nome\}/gi, (m.user && m.user.username) || m.username || 'membro').replace(/\{servidor\}/gi, guild.name).replace(/\{membros\}/gi, String(guild.memberCount));
  function msgBoasVindas(cfg, m, guild) {
    const e = new EmbedBuilder().setColor(parseInt(cfg.cor.slice(1), 16)).setTitle(aplicar(cfg.titulo, m, guild).slice(0, 256)).setDescription(aplicar(cfg.mensagem, m, guild).slice(0, 2000));
    if (m.displayAvatarURL) e.setThumbnail(m.displayAvatarURL());
    return { content: `<@${m.id}>`, embeds: [e], allowedMentions: { users: [m.id], parse: [] } };
  }
  app.get('/api/painel/guild/:id/boasvindas', async (req, res) => { const a = await acesso(req, res); if (!a) return; res.json({ ok: true, config: { ...BV_PADRAO, ...(db.boasvindas[a.guild.id] || {}) } }); });
  app.put('/api/painel/guild/:id/boasvindas', async (req, res) => {
    try {
      const a = await acesso(req, res); if (!a) return; const b = req.body || {}, ativo = !!b.ativo;
      const titulo = String(b.titulo || '').trim().slice(0, 100), mensagem = String(b.mensagem || '').trim().slice(0, 1500), cor = /^#[0-9a-f]{6}$/i.test(String(b.cor || '')) ? String(b.cor).toLowerCase() : '#8b5cf6';
      const canal = canaisEnviaveis(a.guild, a.eu).find(c => c.id === String(b.canalId || ''));
      if (ativo && !canal) return res.status(400).json({ ok: false, error: 'Escolha um canal onde o bot possa enviar mensagens e embeds.' });
      if (!titulo || !mensagem) return res.status(400).json({ ok: false, error: 'Preencha o título e a mensagem.' });
      db.boasvindas[a.guild.id] = { ativo, canalId: canal ? canal.id : '', titulo, mensagem, cor, atualizadoPor: a.s.userId, atualizadoEm: new Date().toISOString() }; writeDb('boasvindas');
      res.json({ ok: true, config: { ...BV_PADRAO, ...db.boasvindas[a.guild.id] } });
    } catch (e) { console.error('❌ boas-vindas:', e.message); res.status(500).json({ ok: false, error: 'Não foi possível salvar.' }); }
  });
  app.post('/api/painel/guild/:id/boasvindas/testar', async (req, res) => {
    try {
      const a = await acesso(req, res); if (!a) return; const cfg = { ...BV_PADRAO, ...(db.boasvindas[a.guild.id] || {}) };
      const canal = canaisEnviaveis(a.guild, a.eu).find(c => c.id === cfg.canalId); if (!canal) return res.status(400).json({ ok: false, error: 'Salve um canal válido antes de testar.' });
      try { await canal.send(msgBoasVindas(cfg, a.membro, a.guild)); } catch (e) { return res.status(400).json({ ok: false, error: erroDiscord(e) }); }
      res.json({ ok: true });
    } catch (e) { console.error('❌ teste boas-vindas:', e.message); res.status(500).json({ ok: false, error: 'Não foi possível enviar o teste.' }); }
  });
  client.on('guildMemberAdd', async m => {
    try {
      const cfg = db.boasvindas[m.guild.id]; if (!cfg || !cfg.ativo || !cfg.canalId || (m.user && m.user.bot)) return;
      const canal = await client.channels.fetch(cfg.canalId).catch(() => null); if (!canal) return console.warn('⚠️ Boas-vindas: canal não encontrado em', m.guild.name);
      await canal.send(msgBoasVindas({ ...BV_PADRAO, ...cfg }, m, m.guild));
    } catch (e) { console.error('❌ Boas-vindas ao entrar:', e.message); }
  });

  // =====================================================
  // TICKETS
  // =====================================================
  const slug = t => String(t || 'membro').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'membro';
  const PERM_TICKET = ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks'];
  const msgPainelTicket = (cfg, guildId) => ({ embeds: [new EmbedBuilder().setColor(0x8b5cf6).setTitle(cfg.titulo).setDescription(cfg.descricao)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`tk:abrir:${guildId}`).setLabel('Abrir ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary))], allowedMentions: { parse: [] } });
  const abertosDo = guildId => Object.values(db.tickets_abertos).filter(t => t.guildId === guildId);
  app.get('/api/painel/guild/:id/tickets', async (req, res) => {
    const a = await acesso(req, res); if (!a) return; const cfg = db.tickets_cfg[a.guild.id] || null;
    res.json({ ok: true, config: cfg && { ativo: cfg.ativo, canalId: cfg.canalId, categoriaId: cfg.categoriaId, cargoStaffId: cfg.cargoStaffId, titulo: cfg.titulo, descricao: cfg.descricao }, abertos: abertosDo(a.guild.id).length,
      cargos: [...a.guild.roles.cache.values()].filter(r => r.id !== a.guild.id && !r.managed).sort((x, y) => y.position - x.position).map(r => ({ id: r.id, nome: r.name, cor: r.hexColor })) });
  });
  app.put('/api/painel/guild/:id/tickets', async (req, res) => {
    try {
      const a = await acesso(req, res); if (!a) return; const { guild, eu } = a, b = req.body || {};
      if (!eu?.permissions.has('ManageChannels')) return res.status(400).json({ ok: false, error: 'O bot precisa da permissão "Gerenciar canais" para criar os tickets.' });
      const canal = canaisEnviaveis(guild, eu).find(c => c.id === String(b.canalId || '')); if (!canal) return res.status(400).json({ ok: false, error: 'Escolha um canal onde o bot possa enviar mensagens e embeds.' });
      const staff = guild.roles.cache.get(String(b.cargoStaffId || '')); if (!staff || staff.id === guild.id || staff.managed) return res.status(400).json({ ok: false, error: 'Escolha o cargo da equipe que atende os tickets.' });
      let categoriaId = ''; if (b.categoriaId) { const cat = guild.channels.cache.get(String(b.categoriaId)); if (!cat || cat.type !== 4) return res.status(400).json({ ok: false, error: 'Categoria inválida.' }); categoriaId = cat.id; }
      const titulo = String(b.titulo || '').trim().slice(0, 100), descricao = String(b.descricao || '').trim().slice(0, 1000); if (!titulo || !descricao) return res.status(400).json({ ok: false, error: 'Preencha o título e a descrição do painel.' });
      const antigo = db.tickets_cfg[guild.id] || {}, cfg = { ...antigo, ativo: true, canalId: canal.id, categoriaId, cargoStaffId: staff.id, titulo, descricao, contador: antigo.contador || 0 };
      try { const velho = antigo.canalId && antigo.mensagemId ? await (await client.channels.fetch(antigo.canalId).catch(() => null))?.messages?.fetch(antigo.mensagemId).catch(() => null) : null;
        if (velho && antigo.canalId === canal.id) await velho.edit(msgPainelTicket(cfg, guild.id)); else { if (velho) await velho.delete().catch(() => {}); cfg.mensagemId = (await canal.send(msgPainelTicket(cfg, guild.id))).id; } }
      catch (e) { return res.status(400).json({ ok: false, error: erroDiscord(e) }); }
      db.tickets_cfg[guild.id] = cfg; writeDb('tickets_cfg'); res.json({ ok: true });
    } catch (e) { console.error('❌ tickets:', e.message); res.status(500).json({ ok: false, error: 'Não foi possível salvar os tickets.' }); }
  });
  app.delete('/api/painel/guild/:id/tickets', async (req, res) => {
    const a = await acesso(req, res); if (!a) return; const cfg = db.tickets_cfg[a.guild.id]; if (!cfg) return res.json({ ok: true });
    try { const m = cfg.canalId && cfg.mensagemId ? await (await client.channels.fetch(cfg.canalId).catch(() => null))?.messages?.fetch(cfg.mensagemId).catch(() => null) : null; if (m) await m.delete(); } catch (e) { /* já apagada */ }
    delete db.tickets_cfg[a.guild.id]; writeDb('tickets_cfg'); res.json({ ok: true });
  });
  async function tratarTicket(i) {
    const [, acao, guildId] = String(i.customId).split(':'), guild = i.guild;
    if (acao === 'abrir') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const cfg = guild && db.tickets_cfg[guild.id]; if (!cfg || !cfg.ativo || guild.id !== guildId) return i.editReply({ content: '❌ O sistema de tickets não está ativo.' });
      const ja = Object.entries(db.tickets_abertos).find(([cid, t]) => t.guildId === guild.id && t.userId === i.user.id);
      if (ja) { if (guild.channels.cache.has(ja[0])) return i.editReply({ content: `🎫 Você já tem um ticket aberto: <#${ja[0]}>` }); delete db.tickets_abertos[ja[0]]; }
      const eu = guild.members.me; if (!eu?.permissions.has('ManageChannels')) return i.editReply({ content: '❌ O bot perdeu a permissão de criar canais. Avise a equipe.' });
      cfg.contador = (cfg.contador || 0) + 1;
      const canal = await guild.channels.create({ name: `ticket-${slug(i.user.username)}-${cfg.contador}`, type: 0, parent: cfg.categoriaId || undefined, reason: `Ticket de ${i.user.tag || i.user.username}`,
        permissionOverwrites: [{ id: guild.id, deny: ['ViewChannel'] }, { id: i.user.id, allow: PERM_TICKET }, { id: cfg.cargoStaffId, allow: PERM_TICKET }, { id: eu.id, allow: [...PERM_TICKET, 'ManageChannels'] }] });
      db.tickets_abertos[canal.id] = { guildId: guild.id, userId: i.user.id, criadoEm: new Date().toISOString() }; writeDb('tickets_abertos'); writeDb('tickets_cfg');
      await canal.send({ content: `<@${i.user.id}> <@&${cfg.cargoStaffId}>`, embeds: [new EmbedBuilder().setColor(0x8b5cf6).setTitle('🎫 Ticket aberto').setDescription('Explique o que você precisa. A equipe vai responder aqui.')],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`tk:fechar:${guild.id}`).setLabel('Fechar ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger))], allowedMentions: { users: [i.user.id], roles: [cfg.cargoStaffId] } });
      return i.editReply({ content: `✅ Ticket criado: <#${canal.id}>` });
    }
    if (acao === 'fechar') {
      const t = db.tickets_abertos[i.channelId], cfg = guild && db.tickets_cfg[guild.id];
      if (!t || !cfg) return i.reply({ content: '❌ Este canal não é um ticket ativo.', flags: MessageFlags.Ephemeral });
      const pode = i.user.id === t.userId || i.member?.roles?.cache?.has(cfg.cargoStaffId) || i.member?.permissions?.has('ManageChannels');
      if (!pode) return i.reply({ content: '❌ Só quem abriu o ticket ou a equipe pode fechar.', flags: MessageFlags.Ephemeral });
      await i.reply({ content: '🔒 Ticket será fechado em 5 segundos...' }); delete db.tickets_abertos[i.channelId]; writeDb('tickets_abertos');
      setTimeout(() => { i.channel.delete('Ticket fechado').catch(e => console.error('❌ Fechar ticket:', e.message)); }, 5000);
    }
  }
  client.on('interactionCreate', async i => {
    if (!i.isButton?.() || !String(i.customId).startsWith('tk:')) return;
    try { await tratarTicket(i); }
    catch (e) { console.error('❌ ticket:', e.message); const msg = e.code === 50013 ? '❌ O bot não tem permissão para criar o ticket. Avise a equipe.' : '❌ Não consegui concluir agora.'; (i.deferred || i.replied ? i.editReply({ content: msg }) : i.reply({ content: msg, flags: MessageFlags.Ephemeral })).catch(() => {}); }
  });

  // =====================================================
  // DIAGNÓSTICO
  // =====================================================
  app.get('/api/painel/guild/:id/diagnostico', async (req, res) => {
    try {
      const a = await acesso(req, res); if (!a) return; const { guild, eu } = a, c = [];
      const add = (nivel, titulo, detalhe) => c.push({ nivel, titulo, detalhe: detalhe || '' });
      add(client.isReady() ? 'ok' : 'erro', client.isReady() ? 'Bot online' : 'Bot offline', client.user ? client.user.tag : '');
      for (const [p, nome, para] of [['ViewChannel', 'Ver canais', 'ler os canais'], ['SendMessages', 'Enviar mensagens', 'publicar painéis e mensagens'], ['EmbedLinks', 'Inserir links (embeds)', 'mostrar mensagens com visual'], ['ManageRoles', 'Gerenciar cargos', 'Auto cargos'], ['ManageChannels', 'Gerenciar canais', 'Tickets']])
        add(eu && eu.permissions.has(p) ? 'ok' : (p === 'ManageChannels' || p === 'ManageRoles' ? 'aviso' : 'erro'), `Permissão: ${nome}`, eu && eu.permissions.has(p) ? '' : `Sem esta permissão o bot não consegue usar ${para}.`);
      const dar = cargosAtribuiveis(guild, eu).length; add(dar ? 'ok' : 'aviso', `${dar} cargo(s) podem entrar em painéis`, dar ? '' : 'Nenhum. Coloque o cargo do bot ACIMA dos cargos que você quer usar (Configurações do servidor → Cargos).');
      for (const p of painelsDo(guild.id)) {
        const canal = await client.channels.fetch(p.canalId).catch(() => null), msg = canal && p.mensagemId ? await canal.messages.fetch(p.mensagemId).catch(() => null) : null;
        const perdidos = p.cargos.filter(r => !guild.roles.cache.has(r.roleId)).length;
        add(msg && !perdidos ? 'ok' : 'aviso', `Painel "${p.titulo}"`, !canal ? 'O canal não existe mais.' : !msg ? 'A mensagem foi apagada no Discord. Edite o painel para publicar de novo.' : perdidos ? `${perdidos} cargo(s) do painel foram apagados.` : '');
      }
      const bv = db.boasvindas[guild.id]; if (bv && bv.ativo) { const ok = !!canaisEnviaveis(guild, eu).find(x => x.id === bv.canalId); add(ok ? 'ok' : 'erro', 'Boas-vindas', ok ? '' : 'O bot não consegue enviar no canal escolhido.'); }
      const tk = db.tickets_cfg[guild.id]; if (tk && tk.ativo) { const staff = guild.roles.cache.has(tk.cargoStaffId), cat = !tk.categoriaId || guild.channels.cache.has(tk.categoriaId); add(staff && cat && eu?.permissions.has('ManageChannels') ? 'ok' : 'erro', 'Tickets', !staff ? 'O cargo da equipe foi apagado.' : !cat ? 'A categoria foi apagada.' : !eu?.permissions.has('ManageChannels') ? 'O bot perdeu "Gerenciar canais".' : `${abertosDo(guild.id).length} ticket(s) aberto(s).`); }
      res.json({ ok: true, checks: c, resumo: { ok: c.filter(x => x.nivel === 'ok').length, aviso: c.filter(x => x.nivel === 'aviso').length, erro: c.filter(x => x.nivel === 'erro').length } });
    } catch (e) { console.error('❌ diagnóstico:', e.message); res.status(500).json({ ok: false, error: 'Não foi possível rodar o diagnóstico.' }); }
  });

  console.log(`🦇 Painel NVB carregado (login com Discord ${secret() && clientId() ? 'configurado' : 'NÃO configurado: falta DISCORD_CLIENT_SECRET'}).`);
};
module.exports.PERIGOSAS = PERIGOSAS;

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, ChannelType, EmbedBuilder, PermissionFlagsBits,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder,
} = require('discord.js');
const EFEMERA = 64; // flag de resposta visível só para quem clicou

const { DISCORD_TOKEN, CLIENT_ID, DISCORD_CLIENT_SECRET, PUBLIC_URL } = process.env;
for (const [nome, valor] of Object.entries({ DISCORD_TOKEN, CLIENT_ID, DISCORD_CLIENT_SECRET, PUBLIC_URL })) {
  if (!valor) { console.error(`Defina ${nome} nas variáveis de ambiente.`); process.exit(1); }
}

const BASE = PUBLIC_URL.replace(/\/+$/, '');
const REDIRECT_URI = `${BASE}/auth/callback`;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Funções exibidas no painel. "implementada" indica se já tem comportamento no bot.
const FUNCOES = [
  { chave: 'chamada', nome: 'Chamada', implementada: false },
  { chave: 'canais', nome: 'Gerenciamento de Canais', implementada: false },
  { chave: 'avisos', nome: 'Avisos', implementada: true },
  { chave: 'ticket', nome: 'Tickets', implementada: true },
  { chave: 'moderacao', nome: 'Moderação', implementada: false },
  { chave: 'boasvindas', nome: 'Boas-vindas', implementada: true },
  { chave: 'aniversario', nome: 'Aniversário', implementada: false },
  { chave: 'saida', nome: 'Saída', implementada: false },
  { chave: 'autocargo', nome: 'Auto Cargo', implementada: true },
  { chave: 'moeda', nome: 'Moeda Tenchikho', implementada: false },
  { chave: 'games', nome: 'Games', implementada: false },
  { chave: 'ia', nome: 'Tenchikho IA', implementada: false },
  { chave: 'automacao', nome: 'Automação', implementada: false },
  { chave: 'recrutamento', nome: 'Recrutamento', implementada: false },
  { chave: 'roblox', nome: 'Roblox', implementada: true },
];

// Campos aceitos por função. Qualquer outro campo é ignorado.
const CAMPOS = {
  boasvindas: {
    canalId: 'id', mensagem: 'texto', embed: 'bool', cargoId: 'id', dm: 'bool', mensagemDm: 'texto',
    tituloCartao: 'titulo', subtituloCartao: 'curto', textoCartao: 'curto', rodapeCartao: 'curto',
    corMoldura: 'cor', fotoUrl: 'texto', fotoDados: 'imagem',
    canalAnuncioId: 'id', textoAnuncio: 'texto',
  },
  autocargo: { cargoMembroId: 'id', cargoBotId: 'id' },
  avisos: { canalId: 'id' },
};
const LIMITE_TEXTO = 500;

// ---------- configuração em disco (gravação atômica) ----------
function lerConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
function salvarConfig(cfg) {
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
}
function configDaFuncao(guildId, chave) {
  return lerConfig()[guildId]?.[chave] || { ativa: false, campos: {} };
}

// ---------- bot ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('clientReady', c => console.log(`Tenchiko conectado como ${c.user.tag}`));
client.once('clientReady', async c => {
  try {
    await c.application.commands.set([{
      name: 'avatar',
      description: 'Mostra o avatar de um jogador do Roblox',
      options: [{ name: 'nick', description: 'Nome de usuário do Roblox', type: 3, required: true }],
    }]);
  } catch (e) {
    console.error('Falha ao registrar /avatar:', e.message);
  }
});

// ---------- cartão de Boas-vindas em imagem ----------
function caminhoArredondado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function gerarCartaoBoasVindas(member, c) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const W = 1024, H = 1536;
  const corMoldura = c.corMoldura || '#5b4bff';
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';

  const fundo = ctx.createLinearGradient(0, 0, 0, H);
  fundo.addColorStop(0, '#070a1a');
  fundo.addColorStop(1, '#1a0a2e');
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, W, H);

  ctx.lineWidth = 16;
  ctx.strokeStyle = corMoldura;
  caminhoArredondado(ctx, 40, 40, W - 80, H - 80, 48);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#b46bff';
  caminhoArredondado(ctx, 80, 80, W - 160, H - 160, 36);
  ctx.stroke();

  // metade de cima: foto (se houver link)
  const px0 = 80, py0 = 80, px1 = W - 80, py1 = 808;
  const origemFoto = c.fotoArquivo || c.fotoUrl;
  if (origemFoto) {
    try {
      const foto = await loadImage(origemFoto);
      const aw = px1 - px0, ah = py1 - py0;
      const escala = Math.max(aw / foto.width, ah / foto.height);
      const fw = foto.width * escala, fh = foto.height * escala;
      ctx.save();
      caminhoArredondado(ctx, px0, py0, aw, ah, 24);
      ctx.clip();
      ctx.drawImage(foto, px0 + (aw - fw) / 2, py0 + (ah - fh) / 2, fw, fh);
      ctx.restore();
    } catch (e) {
      console.error('Cartão: foto do link não carregou:', e.message);
    }
  }
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#b46bff';
  caminhoArredondado(ctx, px0, py0, px1 - px0, py1 - py0, 24);
  ctx.stroke();

  // ícone do membro no meio, na linha entre a foto e o texto
  const img = await loadImage(member.displayAvatarURL({ extension: 'png', size: 512 }));
  const r = 150, cx = W / 2, cy = py1;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, cx - r, cy - r, 2 * r, 2 * r);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#b46bff';
  ctx.stroke();

  // textos na parte de baixo
  const titulo = c.tituloCartao || 'BEM-VINDO(A)!';
  let tamanho = 88;
  ctx.font = `bold ${tamanho}px sans-serif`;
  while (ctx.measureText(titulo).width > W - 260 && tamanho > 40) {
    tamanho -= 2;
    ctx.font = `bold ${tamanho}px sans-serif`;
  }
  ctx.fillStyle = '#f2eaff';
  ctx.fillText(titulo, W / 2, 1082);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText(member.user.username.slice(0, 40), W / 2, 1148);
  ctx.fillStyle = '#9fb0ff';
  ctx.font = '34px sans-serif';
  
  ctx.fillStyle = corMoldura;
  ctx.fillRect(180, 1190, W - 360, 3);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText((c.subtituloCartao || 'QUE BOM TER VOCÊ AQUI!').toUpperCase(), W / 2, 1271);
  ctx.fillStyle = '#d6d6ff';
  ctx.font = '32px sans-serif';
  ctx.fillText(c.textoCartao || 'Aproveite ao máximo nosso servidor!', W / 2, 1320);

  const data = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  ctx.fillStyle = '#b98cff';
  ctx.font = '30px sans-serif';
  ctx.fillText(data, W / 2, 1373);
  ctx.fillStyle = '#8f7fd6';
  ctx.font = '26px sans-serif';
  ctx.fillText((c.rodapeCartao || 'BEM-VINDO À LINHAGEM').toUpperCase(), W / 2, 1416);

  return canvas.encode('png');
}

client.on('guildMemberAdd', async member => {
  const auto = configDaFuncao(member.guild.id, 'autocargo');
  if (auto.ativa) {
    const cargo = member.user.bot ? auto.campos.cargoBotId : auto.campos.cargoMembroId;
    if (cargo) await member.roles.add(cargo).catch(e => console.error('Auto cargo:', e.message));
  }

  const cfg = configDaFuncao(member.guild.id, 'boasvindas');
  if (!cfg.ativa) return;
  const c = cfg.campos || {};
  const modelo = c.mensagem || 'Bem-vindo(a), {membro}!';
  const texto = modelo.replaceAll('{membro}', `<@${member.id}>`);

  if (c.canalId) {
    const canal = member.guild.channels.cache.get(c.canalId);
    if (canal && canal.isTextBased()) {
      let payload = { content: texto, allowedMentions: { users: [member.id] } };
      if (c.embed) {
        try {
          const png = await gerarCartaoBoasVindas(member, c);
          payload = { content: texto, files: [{ attachment: png, name: 'boas-vindas.png' }], allowedMentions: { users: [member.id] } };
        } catch (e) {
          console.error('Cartão de boas-vindas (imagem):', e.message);
          payload = {
            embeds: [new EmbedBuilder()
              .setTitle(c.tituloCartao || '👋 Bem-vindo(a)!')
              .setDescription(`**${c.subtituloCartao || 'Que bom ter você aqui!'}**\n${texto}`)
              .setThumbnail(member.displayAvatarURL({ size: 256 }))
              .setFooter({ text: c.rodapeCartao || 'Bem-vindo à linhagem' })
              .setColor(0x3970ac)],
            allowedMentions: { users: [member.id] },
          };
        }
      }
      await canal.send(payload).catch(e => console.error('Boas-vindas:', e.message));
    }
  }

  if (c.canalAnuncioId) {
    const canalAnuncio = member.guild.channels.cache.get(c.canalAnuncioId);
    if (canalAnuncio && canalAnuncio.isTextBased()) {
      const textoAnuncio = (c.textoAnuncio || 'Boas-vindas ao NVB, seja bem-vindo(a), {membro}!').replaceAll('{membro}', `<@${member.id}>`);
      await canalAnuncio.send({ content: textoAnuncio, allowedMentions: { users: [member.id] } })
        .catch(e => console.error('Anúncio de entrada:', e.message));
    }
  }

  if (c.cargoId) {
    await member.roles.add(c.cargoId).catch(e => console.error('Boas-vindas cargo:', e.message));
  }

  if (c.dm) {
    const dmTexto = (c.mensagemDm || 'Bem-vindo(a) ao servidor!').replaceAll('{membro}', member.user.username);
    await member.send({ content: dmTexto }).catch(() => {});
  }
});

// ---------- tickets ----------
function parseOpcoes(texto) {
  return (texto || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 25).map(l => {
    const partes = l.split('|');
    const label = (partes[0] || '').trim().slice(0, 100);
    const description = (partes[1] || '').trim().slice(0, 100);
    const mensagem = partes.slice(2).join('|').trim().replace(/\\n/g, '\n').slice(0, 4000);
    return { label, description: description || undefined, mensagem: mensagem || undefined };
  }).filter(o => o.label);
}

function idTicketNovo() {
  return crypto.randomBytes(6).toString('hex');
}

function normalizaTicketConfig(campos) {
  const v = validarCampos('ticket', campos || {});
  if (!v.ok) throw new Error(v.erro);
  return v.valor;
}

function ticketsDaGuild(guildId) {
  const cfg = configDaFuncao(guildId, 'ticket');
  const salvos = Array.isArray(cfg.tickets) ? cfg.tickets : [];
  // Compatibilidade com versões antigas que tinham apenas um painel.
  if (!salvos.length && cfg.campos?.canalPainelId) {
    return [{ id: 'legacy', ...cfg.campos }];
  }
  return salvos;
}

function salvarTicketsGuild(guildId, tickets, ativa = true) {
  const cfg = lerConfig();
  cfg[guildId] = cfg[guildId] || {};
  const atual = cfg[guildId].ticket || {};
  cfg[guildId].ticket = {
    ativa: ativa ?? !!atual.ativa,
    campos: atual.campos || {},
    tickets,
  };
  salvarConfig(cfg);
}

async function publicarPainelTicket(guild, campos, ticketId) {
  const canal = guild.channels.cache.get(campos.canalPainelId);
  if (!canal || !canal.isTextBased()) throw new Error('canal do painel inválido.');
  const cartao = new EmbedBuilder()
    .setTitle(campos.tituloPainel || '🎫 Atendimento')
    .setDescription(campos.textoPainel || 'Clique no botão para abrir um ticket privado com a equipe.')
    .setColor(0x3970ac);

  const lista = parseOpcoes(campos.opcoes);
  const linha = lista.length
    ? new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ticket:menu:${ticketId}`)
          .setPlaceholder('Selecione uma opção abaixo...')
          .addOptions(lista.map((o, idx) => ({ label: o.label, value: `op:${idx}`, description: o.description })))
      )
    : new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket:abrir:${ticketId}`)
          .setLabel(campos.textoBotao || '🎫 Abrir ticket')
          .setStyle(ButtonStyle.Primary)
      );

  const payload = { embeds: [cartao], components: [linha] };
  if (campos.painelMsgId) {
    const antiga = await canal.messages.fetch(campos.painelMsgId).catch(() => null);
    if (antiga) {
      try { await antiga.edit(payload); return antiga.id; }
      catch (e) { console.error('Painel de tickets (editar):', e.message); }
    }
  }
  const nova = await canal.send(payload);
  return nova.id;
}

function normalizaCargos(x) {
  return Array.isArray(x) ? x : (x ? [x] : []);
}

async function abrirTicket(i, campos, opcao) {
  const tipo = opcao?.label || null;
  const guild = i.guild;
  const existente = guild.channels.cache.find(c => c.topic === `ticket:${i.user.id}`);
  if (existente) return i.reply({ content: `Você já tem um ticket aberto: <#${existente.id}>`, flags: EFEMERA });
  await i.deferReply({ flags: EFEMERA });
  const permissoesMembro = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: i.user.id, allow: permissoesMembro },
    { id: client.user.id, allow: [...permissoesMembro, PermissionFlagsBits.ManageChannels] },
  ];
  for (const cid of normalizaCargos(campos.cargoEquipeId)) overwrites.push({ id: cid, allow: permissoesMembro });
  const cfgTodos = lerConfig();
  cfgTodos[guild.id] = cfgTodos[guild.id] || {};
  const numero = (cfgTodos[guild.id].ticketNumero || 0) + 1;
  cfgTodos[guild.id].ticketNumero = numero;
  salvarConfig(cfgTodos);
  const numeroTxt = String(numero).padStart(3, '0');
  const nomeBase = [`ticket-${numeroTxt}`, tipo].filter(Boolean).join('-');
  const nome = nomeBase.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 90);
  const canal = await guild.channels.create({
    name: nome,
    type: ChannelType.GuildText,
    parent: campos.categoriaId || null,
    topic: `ticket:${i.user.id}`,
    permissionOverwrites: overwrites,
  });
  const botao = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:fechar').setLabel(campos.textoBotaoFechar || '🔒 Fechar ticket').setStyle(ButtonStyle.Danger)
  );
  const corpo = (opcao?.mensagem || campos.mensagemAbertura || 'Olá {membro}! A equipe vai te atender em breve.').replaceAll('{membro}', `<@${i.user.id}>`);
  const mencaoEquipe = normalizaCargos(campos.cargoEquipeId).map(cid => `<@&${cid}>`).join(' ');
  await canal.send({
    content: mencaoEquipe || undefined,
    embeds: [new EmbedBuilder().setTitle(tipo ? `🎫 ${tipo}` : '🎫 Ticket').setDescription(corpo).setColor(0x3970ac)],
    components: [botao],
    allowedMentions: { users: [i.user.id], roles: normalizaCargos(campos.cargoEquipeId) },
  });
  await i.editReply({ content: `Ticket criado: <#${canal.id}>` });
}

async function fecharTicket(i) {
  const canal = i.channel;
  if (!canal || !canal.topic || !canal.topic.startsWith('ticket:')) {
    return i.reply({ content: 'Este não é um canal de ticket.', flags: EFEMERA });
  }
  await i.reply({ content: '🔒 Este ticket será fechado em 5 segundos.' });
  setTimeout(() => canal.delete('Ticket fechado').catch(e => console.error('Fechar ticket:', e.message)), 5000);
}

function comLimite(promessa, ms) {
  return Promise.race([
    promessa,
    new Promise((_, rej) => setTimeout(() => rej(new Error('o bot demorou mais de 12 segundos')), ms)),
  ]);
}

function abrirTicketSeguro(i, campos, tipo) {
  return comLimite(abrirTicket(i, campos, tipo), 12000);
}

async function tratarAvatar(i) {
  if (!i.guild) return i.reply({ content: 'Use este comando dentro de um servidor.', flags: EFEMERA });
  const cfg = configDaFuncao(i.guild.id, 'roblox');
  if (!cfg.ativa) return i.reply({ content: 'A função Roblox está desligada neste servidor.', flags: EFEMERA });
  const nick = i.options.getString('nick', true).trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(nick)) {
    return i.reply({ content: 'Nick inválido. Use de 3 a 20 letras, números ou underline.', flags: EFEMERA });
  }
  await i.deferReply();
  try {
    const r1 = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [nick], excludeBannedUsers: false }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r1.ok) throw new Error('usernames ' + r1.status);
    const usuario = (await r1.json()).data?.[0];
    if (!usuario) return await i.editReply({ content: `Não encontrei o jogador **${nick}** no Roblox.` });

    const r2 = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${usuario.id}&size=420x420&format=Png&isCircular=false`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r2.ok) throw new Error('thumbnails ' + r2.status);
    const imagem = (await r2.json()).data?.[0]?.imageUrl || null;

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('Avatar Roblox')
      .setURL(`https://www.roblox.com/users/${usuario.id}/profile`)
      .setDescription(`Avatar de ${usuario.name}`)
      .addFields(
        { name: 'Nome', value: usuario.displayName || usuario.name, inline: true },
        { name: 'ID', value: String(usuario.id), inline: true },
      )
      .setFooter({ text: 'Tenchikho' });
    if (imagem) embed.setImage(imagem);
    return await i.editReply({ embeds: [embed] });
  } catch (e) {
    console.error('Erro no /avatar:', e.message);
    return await i.editReply({ content: 'Não consegui consultar o Roblox agora. Tente de novo em instantes.' });
  }
}

client.on('interactionCreate', async i => {
  if (i.isChatInputCommand() && i.commandName === 'avatar') return tratarAvatar(i);
  if (!i.guild || !(i.isButton() || i.isStringSelectMenu())) return;
  try {
    const cfg = configDaFuncao(i.guild.id, 'ticket');
    if (!cfg.ativa) return i.reply({ content: 'O sistema de tickets está desligado.', flags: EFEMERA });
    if (i.isStringSelectMenu() && i.customId.startsWith('ticket:menu')) {
      const ticketId = i.customId.split(':')[2];
      const tickets = ticketsDaGuild(i.guild.id);
      const ticket = tickets.find(t => t.id === ticketId) || tickets[0];
      if (!ticket) return i.reply({ content: 'Este painel de ticket não está mais configurado.', flags: EFEMERA });
      const lista = parseOpcoes(ticket.opcoes);
      const idx = Number(String(i.values[0]).split(':')[1]);
      return await abrirTicketSeguro(i, ticket, lista[idx] || { label: 'Ticket' });
    }
    if (i.isButton() && i.customId.startsWith('ticket:abrir')) {
      const ticketId = i.customId.split(':')[2];
      const tickets = ticketsDaGuild(i.guild.id);
      const ticket = tickets.find(t => t.id === ticketId) || tickets[0];
      if (!ticket) return i.reply({ content: 'Este painel de ticket não está mais configurado.', flags: EFEMERA });
      return await abrirTicketSeguro(i, ticket, null);
    }
    if (i.isButton() && i.customId === 'ticket:fechar') return await fecharTicket(i);
  } catch (e) {
    console.error('Tickets:', e.message, e.stack);
    const msgErro = { content: `Não consegui abrir o ticket: ${e.message}. Confira se o bot tem Gerenciar Canais e se a categoria existe.`, flags: EFEMERA };
    if (i.deferred || i.replied) await i.editReply(msgErro).catch(() => {});
    else await i.reply(msgErro).catch(() => {});
  }
});

client.on('error', e => console.error('Erro no bot:', e.message));
client.login(DISCORD_TOKEN).catch(e => {
  console.error('Falha ao conectar no Discord:', e.message);
  process.exit(1);
});

// ---------- sessões ----------
const sessoes = new Map();
const estados = new Map();

function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '').split(';').map(s => s.trim().split('='))
      .filter(p => p.length === 2).map(([k, v]) => [k, decodeURIComponent(v)])
  );
}
function sessaoAtual(req) {
  const sid = cookies(req).sid;
  const s = sid && sessoes.get(sid);
  if (!s || s.expira < Date.now()) return null;
  return s;
}
// Administrador ou Gerenciar Servidor
function podeGerenciar(g) {
  const p = BigInt(g.permissoes);
  return (p & 0x8n) !== 0n || (p & 0x20n) !== 0n;
}

// ---------- servidor web ----------
const app = express();
app.use(express.json({ limit: '3mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true, bot: client.isReady() }));

app.get('/convidar', (req, res) => {
  const url = 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'bot applications.commands',
    permissions: process.env.BOT_PERMISSIONS || '0',
  });
  res.redirect(url);
});

app.get('/auth/login', (req, res) => {
  const st = crypto.randomBytes(16).toString('hex');
  estados.set(st, Date.now() + 10 * 60e3);
  const url = 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds',
    state: st,
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !estados.has(state) || estados.get(state) < Date.now()) {
    return res.status(400).send('Login inválido. Tente de novo pelo painel.');
  }
  estados.delete(state);
  try {
    const tokenResp = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const token = await tokenResp.json();
    if (!token.access_token) return res.status(400).send('Falha no login com o Discord.');
    const h = { Authorization: `Bearer ${token.access_token}` };
    const user = await (await fetch('https://discord.com/api/users/@me', { headers: h })).json();
    const guilds = await (await fetch('https://discord.com/api/users/@me/guilds', { headers: h })).json();

    const sid = crypto.randomBytes(24).toString('hex');
    sessoes.set(sid, {
      user: {
        id: user.id,
        nome: user.global_name || user.username,
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null,
      },
      guilds: guilds.map(g => ({ id: g.id, nome: g.name, icon: g.icon || null, permissoes: g.permissions })),
      expira: Date.now() + 12 * 3600e3,
    });
    res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`);
    res.redirect('/');
  } catch (e) {
    console.error('Login:', e.message);
    res.status(500).send('Erro no login. Tente de novo.');
  }
});

app.post('/auth/logout', (req, res) => {
  const sid = cookies(req).sid;
  if (sid) sessoes.delete(sid);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const s = sessaoAtual(req);
  if (!s) return res.status(401).json({ error: 'Faça login com o Discord.' });
  const servidores = s.guilds.filter(podeGerenciar).map(g => ({
    id: g.id,
    nome: g.nome,
    icon: g.icon || null,
    botPresente: client.guilds.cache.has(g.id),
  }));
  res.json({ user: s.user, servidores, botOnline: client.isReady(), botNome: client.user ? client.user.username : null });
});

// Checa login, permissão no servidor e presença do bot antes de cada ação.
function autorizar(req, res) {
  const s = sessaoAtual(req);
  if (!s) { res.status(401).json({ error: 'Faça login com o Discord.' }); return null; }
  const g = s.guilds.find(x => x.id === req.params.id);
  if (!g || !podeGerenciar(g)) { res.status(403).json({ error: 'Sem permissão neste servidor.' }); return null; }
  const guild = client.guilds.cache.get(g.id);
  if (!guild) { res.status(409).json({ error: 'O bot não está neste servidor. Use "Convidar bot".' }); return null; }
  return guild;
}

app.get('/api/guilds/:id/funcoes', (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  const lista = FUNCOES.map(f => ({ ...f, ...configDaFuncao(guild.id, f.chave) }));
  res.json({ funcoes: lista });
});

app.get('/api/guilds/:id/cargos', (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  const cargos = guild.roles.cache
    .filter(r => !r.managed && r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map(r => ({ id: r.id, nome: r.name }));
  res.json({ cargos });
});

app.get('/api/guilds/:id/canais', (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  const canais = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText)
    .map(c => ({ id: c.id, nome: c.name }));
  res.json({ canais });
});

function validarCampos(chave, campos) {
  const esquema = CAMPOS[chave];
  if (!esquema) return { ok: true, valor: {} };
  const valor = {};
  for (const [nome, tipo] of Object.entries(esquema)) {
    const v = campos?.[nome];
    if (v === undefined || v === null || v === '') continue;
    if (tipo === 'bool') {
      valor[nome] = ['true', 'sim', true].includes(v);
    } else if (tipo === 'imagem') {
      const d = String(v);
      if (!/^data:image\/(png|jpeg|jpg);base64,/.test(d)) return { ok: false, erro: 'A foto precisa ser PNG ou JPG.' };
      valor[nome] = d;
    } else if (tipo === 'cor') {
      const cor = String(v).trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(cor)) return { ok: false, erro: `${nome} precisa ser uma cor no formato #RRGGBB.` };
      valor[nome] = cor;
    } else if (tipo === 'ids') {
      const lista = (Array.isArray(v) ? v : [v]).map(x => String(x)).filter(Boolean);
      if (lista.length > 10) return { ok: false, erro: `${nome}: no máximo 10 cargos.` };
      if (lista.some(x => !/^\d{17,20}$/.test(x))) return { ok: false, erro: `ID de cargo inválido em ${nome}.` };
      valor[nome] = lista;
    } else if (tipo === 'id') {
      if (!/^\d{17,20}$/.test(String(v))) return { ok: false, erro: `ID inválido em ${nome}.` };
      valor[nome] = String(v);
    } else {
      const limite = tipo === 'curto' ? 80 : tipo === 'titulo' ? 256 : tipo === 'longo' ? 1500 : tipo === 'enorme' ? 1000000 : LIMITE_TEXTO;
      const t = String(v).trim();
      if (t.length > limite) return { ok: false, erro: `${nome} passa de ${limite} caracteres.` };
      valor[nome] = t;
    }
  }
  return { ok: true, valor };
}

app.put('/api/guilds/:id/funcoes/:chave', async (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  const { chave } = req.params;
  if (!FUNCOES.some(f => f.chave === chave)) return res.status(404).json({ error: 'Função não existe.' });
  const v = validarCampos(chave, req.body?.campos);
  if (!v.ok) return res.status(400).json({ error: v.erro });
  if (chave === 'boasvindas') {
    const anteriorC = configDaFuncao(guild.id, 'boasvindas').campos || {};
    if (v.valor.fotoDados) {
      const m = v.valor.fotoDados.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 2 * 1024 * 1024) return res.status(400).json({ error: 'A foto passa de 2 MB.' });
      const pasta = path.join(DATA_DIR, 'cartoes');
      fs.mkdirSync(pasta, { recursive: true });
      const arquivo = path.join(pasta, `${guild.id}-foto.${m[1] === 'png' ? 'png' : 'jpg'}`);
      fs.writeFileSync(arquivo, buf);
      v.valor.fotoArquivo = arquivo;
    } else if (anteriorC.fotoArquivo) {
      v.valor.fotoArquivo = anteriorC.fotoArquivo;
    }
    delete v.valor.fotoDados;
  }
  const ativa = !!req.body?.ativa;
  const fn = FUNCOES.find(f => f.chave === chave);
  if (ativa && !fn.implementada) {
    return res.status(400).json({ error: 'Esta função ainda não tem comportamento no bot.' });
  }
  if (chave === 'ticket') {
    // A função Tickets agora é gerenciada pelos endpoints /tickets.
    // Este endpoint continua existindo para compatibilidade e para ativar/desativar a função.
  }
  const cfg = lerConfig();
  cfg[guild.id] = cfg[guild.id] || {};
  if (chave === 'ticket') {
    const anterior = cfg[guild.id].ticket || {};
    cfg[guild.id][chave] = { ativa, campos: anterior.campos || v.valor, tickets: Array.isArray(anterior.tickets) ? anterior.tickets : [] };
  } else {
    cfg[guild.id][chave] = { ativa, campos: v.valor };
  }
  try { salvarConfig(cfg); } catch (e) { return res.status(500).json({ error: 'Não consegui salvar.' }); }
  res.json({ ok: true, configuracao: cfg[guild.id][chave] });
});

// ---------- gerenciamento de vários painéis de tickets ----------
app.get('/api/guilds/:id/tickets', (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  const cfg = configDaFuncao(guild.id, 'ticket');
  res.json({ tickets: ticketsDaGuild(guild.id), ativa: !!cfg.ativa });
});

app.post('/api/guilds/:id/tickets', async (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  try {
    const campos = normalizaTicketConfig(req.body?.campos);
    if (!campos.canalPainelId) throw new Error('Escolha o canal do painel.');
    const ticket = { id: idTicketNovo(), ...campos };
    ticket.painelMsgId = await publicarPainelTicket(guild, ticket, ticket.id);
    const atuais = ticketsDaGuild(guild.id).filter(t => t.id !== 'legacy');
    const cfg = configDaFuncao(guild.id, 'ticket');
    salvarTicketsGuild(guild.id, [...atuais, ticket], cfg.ativa);
    res.json({ ok: true, ticket });
  } catch (e) {
    res.status(400).json({ error: 'Não consegui criar o ticket: ' + e.message });
  }
});

app.put('/api/guilds/:id/tickets/:ticketId', async (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  try {
    const id = String(req.params.ticketId);
    const todos = ticketsDaGuild(guild.id);
    const antigo = todos.find(t => t.id === id);
    if (!antigo) return res.status(404).json({ error: 'Ticket não encontrado.' });
    const campos = normalizaTicketConfig(req.body?.campos);
    if (!campos.canalPainelId) throw new Error('Escolha o canal do painel.');
    const novoId = id === 'legacy' ? idTicketNovo() : id;
    const ticket = { id: novoId, ...campos, painelMsgId: antigo.painelMsgId };
    if (antigo.canalPainelId && antigo.canalPainelId !== campos.canalPainelId && antigo.painelMsgId) {
      const canalAntigo = guild.channels.cache.get(antigo.canalPainelId);
      if (canalAntigo?.isTextBased()) {
        const msgAntiga = await canalAntigo.messages.fetch(antigo.painelMsgId).catch(() => null);
        if (msgAntiga) await msgAntiga.delete().catch(() => {});
      }
      ticket.painelMsgId = null;
    }
    ticket.painelMsgId = await publicarPainelTicket(guild, ticket, ticket.id);
    const atuais = todos.filter(t => t.id !== 'legacy' && t.id !== id);
    const atualizados = [...atuais, ticket];
    const cfg = configDaFuncao(guild.id, 'ticket');
    salvarTicketsGuild(guild.id, atualizados, cfg.ativa);
    res.json({ ok: true, ticket });
  } catch (e) {
    res.status(400).json({ error: 'Não consegui editar o ticket: ' + e.message });
  }
});

app.delete('/api/guilds/:id/tickets/:ticketId', async (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  try {
    const id = String(req.params.ticketId);
    const atuais = ticketsDaGuild(guild.id).filter(t => t.id !== 'legacy');
    const ticket = atuais.find(t => t.id === id);
    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado.' });
    if (ticket.painelMsgId && ticket.canalPainelId) {
      const canal = guild.channels.cache.get(ticket.canalPainelId);
      if (canal?.isTextBased()) {
        const msg = await canal.messages.fetch(ticket.painelMsgId).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      }
    }
    const cfg = configDaFuncao(guild.id, 'ticket');
    salvarTicketsGuild(guild.id, atuais.filter(t => t.id !== id), cfg.ativa);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Não consegui excluir o ticket: ' + e.message });
  }
});

// Envia uma mensagem de teste agora, usando os campos do formulário (sem salvar).
app.post('/api/guilds/:id/funcoes/:chave/teste', async (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  const sessao = sessaoAtual(req);
  const { chave } = req.params;
  const fn = FUNCOES.find(f => f.chave === chave);
  if (!fn) return res.status(404).json({ error: 'Função não existe.' });
  if (!fn.implementada) return res.status(400).json({ error: 'Esta função ainda não tem comportamento no bot para testar.' });
  if (!['boasvindas', 'avisos'].includes(chave)) return res.status(400).json({ error: 'Esta função não tem teste de mensagem. Use Ativar.' });
  const v = validarCampos(chave, req.body?.campos);
  if (!v.ok) return res.status(400).json({ error: v.erro });
  const canalId = v.valor.canalId;
  if (!canalId) return res.status(400).json({ error: 'Escolha um canal para o teste.' });
  const canal = guild.channels.cache.get(canalId);
  if (!canal || !canal.isTextBased()) return res.status(400).json({ error: 'Canal inválido.' });
  const texto = chave === 'boasvindas'
    ? (v.valor.mensagem || 'Bem-vindo(a), {membro}!').replaceAll('{membro}', `<@${sessao.user.id}>`)
    : '🧪 Teste da função Avisos.';
  try {
    console.log(`Teste de boas-vindas: cartao=${!!(chave === 'boasvindas' && v.valor.embed)} canal=${canal.name}`);
    if (chave === 'boasvindas' && v.valor.embed) {
      const membro = await guild.members.fetch(sessao.user.id);
      const png = await gerarCartaoBoasVindas(membro, { ...configDaFuncao(guild.id, 'boasvindas').campos, ...v.valor });
      await canal.send({ content: texto, files: [{ attachment: png, name: 'boas-vindas.png' }], allowedMentions: { users: [sessao.user.id] } });
    } else {
      await canal.send({ content: texto, allowedMentions: { users: [sessao.user.id] } });
    }
    if (chave === 'boasvindas' && v.valor.canalAnuncioId) {
      const canalAnuncio = guild.channels.cache.get(v.valor.canalAnuncioId);
      if (canalAnuncio && canalAnuncio.isTextBased()) {
        const textoAnuncio = (v.valor.textoAnuncio || 'Boas-vindas ao NVB, seja bem-vindo(a), {membro}!').replaceAll('{membro}', `<@${sessao.user.id}>`);
        await canalAnuncio.send({ content: textoAnuncio, allowedMentions: { users: [sessao.user.id] } });
      }
    }
    if (chave === 'boasvindas' && v.valor.dm) {
      const membro = await guild.members.fetch(sessao.user.id);
      const dmTexto = (v.valor.mensagemDm || 'Bem-vindo(a) ao servidor!').replaceAll('{membro}', membro.user.username);
      try {
        await membro.send({ content: dmTexto });
      } catch (e) {
        console.error('Teste de DM:', e.message);
        return res.status(400).json({ error: 'O canal foi enviado, mas não consegui mandar a DM: ' + e.message + '. Confira se o seu privado aceita mensagens de membros do servidor.' });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('Teste de boas-vindas:', e.message);
    res.status(500).json({ error: 'Não consegui enviar: ' + e.message });
  }
});

app.post('/api/guilds/:id/avisos', async (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  const cfg = configDaFuncao(guild.id, 'avisos');
  if (!cfg.ativa) return res.status(400).json({ error: 'Ative a função Avisos antes de enviar.' });
  const canalId = String(req.body?.canalId || '');
  const texto = String(req.body?.texto || '').trim();
  if (!/^\d{17,20}$/.test(canalId)) return res.status(400).json({ error: 'Escolha um canal.' });
  if (!texto || texto.length > 1500) return res.status(400).json({ error: 'O aviso precisa ter de 1 a 1500 caracteres.' });
  const canal = guild.channels.cache.get(canalId);
  if (!canal || !canal.isTextBased()) return res.status(400).json({ error: 'Canal inválido.' });
  try {
    await canal.send({ content: texto, allowedMentions: { parse: [] } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Não consegui enviar. Confira as permissões do bot nesse canal.' });
  }
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`Painel em http://localhost:${PORT}`));

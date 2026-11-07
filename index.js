require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, ChannelType, EmbedBuilder, PermissionFlagsBits, AuditLogEvent,
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
  { chave: 'ticket', nome: 'Ticket', implementada: true },
  { chave: 'moderacao', nome: 'Moderação', implementada: true },
  { chave: 'boasvindas', nome: 'Boas vindas', implementada: true },
  { chave: 'aniversario', nome: 'Aniversário', implementada: true },
  { chave: 'saida', nome: 'Saída', implementada: true },
  { chave: 'autocargo', nome: 'Auto cargo', implementada: true },
  { chave: 'games', nome: 'Games', implementada: true },
  { chave: 'recrutamento', nome: 'Recrutamento', implementada: true },
  { chave: 'roblox', nome: 'Roblox', implementada: true },
].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

// Campos aceitos por função. Qualquer outro campo é ignorado.
const CAMPOS = {
  boasvindas: {
    canalId: 'id', mensagem: 'texto', embed: 'bool', cargoId: 'id', dm: 'bool', mensagemDm: 'texto',
    tituloCartao: 'titulo', subtituloCartao: 'curto', textoCartao: 'curto', rodapeCartao: 'curto',
    corMoldura: 'cor', fotoUrl: 'texto', fotoDados: 'imagem',
    canalAnuncioId: 'id', textoAnuncio: 'texto',
  },
  avisos: { canalId: 'id' },
  aniversario: { canalId: 'id', horaPostagem: 'curto', mensagem: 'texto' },
  saida: { canalId: 'id', formato: 'curto', mensagem: 'texto', tituloEmbed: 'curto', logsCanalId: 'id' },
  moderacao: { logsCanalId: 'id', cargosIds: 'ids' },
  games: { categoriaId: 'id', canalMatematicaId: 'id', canalCacaId: 'id', canalResultadosId: 'id', canalXadrezId: 'id', canalDamaId: 'id' },
  recrutamento: {
    canalId: 'id', canalAprovacoesId: 'id', cargoAutomaticoId: 'id', prefixo: 'curto', cargosAvaliamIds: 'ids',
    conviteLink: 'texto', servidorDestinoId: 'id', cargoDestinoId: 'id', mensagemAprovacao: 'texto', mensagemRecusa: 'texto',
  },
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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    ...(process.env.MESSAGE_CONTENT === '1' ? [GatewayIntentBits.MessageContent] : []),
  ],
});

client.once('clientReady', c => console.log(`Tenchiko conectado como ${c.user.tag}`));
client.once('clientReady', async c => {
  try {
    await c.application.commands.set([
      {
        name: 'avatar',
        description: 'Mostra o avatar de um jogador do Roblox',
        options: [{ name: 'nick', description: 'Nome de usuário do Roblox', type: 3, required: true }],
      },
      {
        name: 'matematica',
        description: 'Começa um desafio de matemática neste canal',
        options: [{
          name: 'nivel', description: 'Dificuldade', type: 3, required: true,
          choices: [{ name: 'Fácil', value: 'facil' }, { name: 'Médio', value: 'medio' }, { name: 'Difícil', value: 'dificil' }],
        }],
      },
      { name: 'cacapalavras', description: 'Começa um caça-palavras neste canal' },
      { name: 'ranking', description: 'Mostra o ranking geral dos games' },
      {
        name: 'mod',
        description: 'Ações de moderação',
        options: [
          { name: 'avisar', description: 'Registra uma advertência', type: 1, options: [
            { name: 'usuario', description: 'Membro', type: 6, required: true },
            { name: 'motivo', description: 'Motivo', type: 3, required: true },
          ] },
          { name: 'silenciar', description: 'Silencia um membro por um tempo', type: 1, options: [
            { name: 'usuario', description: 'Membro', type: 6, required: true },
            { name: 'minutos', description: 'Tempo em minutos (1 a 40320)', type: 4, required: true, min_value: 1, max_value: 40320 },
            { name: 'motivo', description: 'Motivo', type: 3, required: true },
          ] },
          { name: 'expulsar', description: 'Expulsa um membro do servidor', type: 1, options: [
            { name: 'usuario', description: 'Membro', type: 6, required: true },
            { name: 'motivo', description: 'Motivo', type: 3, required: true },
          ] },
          { name: 'banir', description: 'Bane um usuário do servidor', type: 1, options: [
            { name: 'usuario', description: 'Usuário', type: 6, required: true },
            { name: 'motivo', description: 'Motivo', type: 3, required: true },
          ] },
          { name: 'desbanir', description: 'Remove o banimento de um usuário', type: 1, options: [
            { name: 'id_usuario', description: 'ID do usuário banido', type: 3, required: true },
          ] },
          { name: 'limpar', description: 'Apaga mensagens do canal atual', type: 1, options: [
            { name: 'quantidade', description: 'Quantas mensagens (1 a 100)', type: 4, required: true, min_value: 1, max_value: 100 },
          ] },
          { name: 'bloquear', description: 'Impede que membros enviem mensagens neste canal', type: 1, options: [] },
          { name: 'desbloquear', description: 'Libera o envio de mensagens neste canal', type: 1, options: [] },
        ],
      },
      {
        name: 'aniversario',
        description: 'Registra o seu aniversário no servidor',
        options: [{ name: 'data', description: 'Dia e mês, no formato DD/MM (ex: 05/03)', type: 3, required: true }],
      },
    ]);
  } catch (e) {
    console.error('Falha ao registrar comandos:', e.message);
  }
  setInterval(() => checarAniversarios().catch(e => console.error('Aniversários:', e.message)), 60 * 1000);
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

client.on('guildMemberAdd', member => aplicarRecrutamentoAoEntrar(member).catch(e => console.error('Recrutamento ao entrar:', e.message)));

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


// ---------- aniversário ----------
const ANIV_DIR = path.join(DATA_DIR, 'aniversarios');
fs.mkdirSync(ANIV_DIR, { recursive: true });
const ARQ_POSTADOS = path.join(ANIV_DIR, 'postados.json');
let postados = {};
try { postados = JSON.parse(fs.readFileSync(ARQ_POSTADOS, 'utf8')); } catch { postados = {}; }
function lerAniversarios(guildId) {
  try { return JSON.parse(fs.readFileSync(path.join(ANIV_DIR, `${guildId}.json`), 'utf8')); } catch { return []; }
}
function salvarAniversarios(guildId, lista) {
  const f = path.join(ANIV_DIR, `${guildId}.json`);
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(lista, null, 2));
  fs.renameSync(tmp, f);
}
function dataValida(dia, mes) {
  const dias = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= dias[mes - 1];
}
function agoraBrasilia() {
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  const hora = p.hour === '24' ? '00' : p.hour;
  return { dia: Number(p.day), mes: Number(p.month), data: `${p.year}-${p.month}-${p.day}`, hora: `${hora}:${p.minute}` };
}
async function checarAniversarios() {
  const t = agoraBrasilia();
  let mudou = false;
  for (const guild of client.guilds.cache.values()) {
    const cfg = configDaFuncao(guild.id, 'aniversario');
    if (!cfg.ativa) continue;
    const campos = cfg.campos || {};
    if (!campos.canalId) continue;
    const hora = campos.horaPostagem || '00:00';
    if (t.hora < hora) continue;
    const canal = await guild.channels.fetch(campos.canalId).catch(() => null);
    if (!canal || !canal.isTextBased()) continue;
    for (const a of lerAniversarios(guild.id)) {
      if (a.dia !== t.dia || a.mes !== t.mes) continue;
      const chave = `${guild.id}:${t.data}:${a.userId}`;
      if (postados[chave]) continue;
      const modelo = String(campos.mensagem || '').trim() || '🎉 Hoje é aniversário de {membro}! Parabéns!';
      const texto = modelo.replace(/\{membro\}/g, `<@${a.userId}>`);
      try {
        await canal.send({ content: texto, allowedMentions: { users: [a.userId] } });
        postados[chave] = true;
        mudou = true;
      } catch (e) {
        console.error('Aniversário não postado:', e.message);
      }
    }
  }
  // limpa registros de dias anteriores
  for (const k of Object.keys(postados)) {
    const data = k.split(':')[1];
    if (data && data < t.data) { delete postados[k]; mudou = true; }
  }
  if (mudou) fs.writeFileSync(ARQ_POSTADOS, JSON.stringify(postados));
}
async function tratarAniversario(i) {
  if (!i.guild) return i.reply({ content: 'Use este comando dentro de um servidor.', flags: EFEMERA });
  const cfg = configDaFuncao(i.guild.id, 'aniversario');
  if (!cfg.ativa) return i.reply({ content: 'A função Aniversário está desligada neste servidor.', flags: EFEMERA });
  const texto = i.options.getString('data', true).trim();
  const m = texto.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m || !dataValida(Number(m[1]), Number(m[2]))) {
    return i.reply({ content: 'Data inválida. Use o formato DD/MM, por exemplo 05/03.', flags: EFEMERA });
  }
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const lista = lerAniversarios(i.guild.id).filter(a => a.userId !== i.user.id);
  lista.push({ userId: i.user.id, nome: i.member?.displayName || i.user.username, dia, mes });
  salvarAniversarios(i.guild.id, lista);
  const txt = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
  return i.reply({ content: `Anotado! Seu aniversário é em ${txt}.`, flags: EFEMERA });
}


// ---------- auto cargos (painéis) ----------
const AC_DIR = path.join(DATA_DIR, 'autocargos');
fs.mkdirSync(AC_DIR, { recursive: true });
function lerPaineis(gid) {
  try { return JSON.parse(fs.readFileSync(path.join(AC_DIR, `${gid}.json`), 'utf8')); } catch { return []; }
}
function salvarPaineis(gid, lista) {
  const f = path.join(AC_DIR, `${gid}.json`);
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(lista, null, 2));
  fs.renameSync(tmp, f);
}
function validarPainel(b) {
  const erros = [];
  const nome = String(b.nome || '').trim();
  if (!nome || nome.length > 60) erros.push('Nome interno: de 1 a 60 caracteres.');
  const canalId = String(b.canalId || '').trim();
  if (!/^\d{17,20}$/.test(canalId)) erros.push('ID do canal inválido.');
  const titulo = String(b.titulo || '').trim();
  if (!titulo || titulo.length > 100) erros.push('Título: de 1 a 100 caracteres.');
  const descricao = String(b.descricao || '').trim();
  if (descricao.length > 400) erros.push('Descrição: até 400 caracteres.');
  const tipo = b.tipo === 'multipla' ? 'multipla' : 'unica';
  const ativo = !!b.ativo;
  const entrada = Array.isArray(b.opcoes) ? b.opcoes : [];
  if (!entrada.length) erros.push('Adicione pelo menos uma opção.');
  if (entrada.length > 25) erros.push('Um painel aceita no máximo 25 opções.');
  const opcoes = entrada.map((o, idx) => {
    const n = String(o.nome || '').trim();
    const cargoId = String(o.cargoId || '').trim();
    if (!n || n.length > 80) erros.push(`Opção ${idx + 1}: nome de 1 a 80 caracteres.`);
    if (!/^\d{17,20}$/.test(cargoId)) erros.push(`Opção ${idx + 1}: escolha um cargo.`);
    return {
      id: String(o.id || '') || crypto.randomUUID(),
      nome: n,
      emoji: String(o.emoji || '').trim().slice(0, 8) || null,
      cargoId,
      ativa: o.ativa !== false,
    };
  });
  return { erros, valor: { nome, canalId, titulo, descricao, tipo, ativo, opcoes } };
}
function montarPainelDiscord(p) {
  const ativas = p.opcoes.filter(o => o.ativa);
  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle(p.titulo)
    .setDescription(p.descricao || 'Selecione abaixo os cargos que deseja receber.');
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`autocargo:${p.id}`)
    .setPlaceholder('Escolha seus cargos')
    .setMinValues(0)
    .setMaxValues(p.tipo === 'multipla' ? Math.max(1, ativas.length) : 1)
    .addOptions(ativas.map(o => {
      const opt = { label: o.nome.slice(0, 100), value: o.id };
      if (o.emoji) opt.emoji = o.emoji;
      return opt;
    }));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

// Clique no menu: adiciona os cargos marcados e tira os que foram desmarcados
async function tratarAutocargo(i) {
  const pid = i.customId.split(':')[1];
  await i.deferReply({ flags: EFEMERA });
  if (!configDaFuncao(i.guild.id, 'autocargo').ativa) return i.editReply({ content: 'Os painéis de cargos estão desligados neste servidor.' });
  const p = lerPaineis(i.guild.id).find(x => x.id === pid);
  if (!p) return i.editReply({ content: 'Este painel não existe mais.' });
  if (!p.ativo) return i.editReply({ content: 'Este painel está desativado no momento.' });
  const membro = i.member;
  const escolhidos = new Set(i.values);
  const adicionar = [];
  const remover = [];
  for (const o of p.opcoes.filter(x => x.ativa)) {
    const tem = membro.roles.cache.has(o.cargoId);
    const quer = escolhidos.has(o.id);
    if (quer && !tem) adicionar.push(o.cargoId);
    if (!quer && tem) remover.push(o.cargoId);
  }
  try {
    if (adicionar.length) await membro.roles.add(adicionar);
    if (remover.length) await membro.roles.remove(remover);
  } catch (e) {
    return i.editReply({ content: 'Não consegui atualizar seus cargos. Confira se o bot tem a permissão "Gerenciar cargos" e está acima desses cargos.' });
  }
  const nomeDe = id => i.guild.roles.cache.get(id)?.name || 'cargo';
  const partes = [];
  if (adicionar.length) partes.push('Recebeu: ' + adicionar.map(nomeDe).join(', '));
  if (remover.length) partes.push('Removido: ' + remover.map(nomeDe).join(', '));
  return i.editReply({ content: partes.length ? partes.join(' · ') : 'Nenhuma alteração nos seus cargos.' });
}


// ---------- games (etapa 1) ----------
const GAMES_DIR = path.join(DATA_DIR, 'games');
fs.mkdirSync(GAMES_DIR, { recursive: true });
const NOMES_CANAIS = {
  categoria: '🎮・GAMES', xadrez: '♟️・xadrez', dama: '⚫・dama',
  caca: '🔎・caca-palavras', matematica: '➗・matematica', resultados: '🏆・resultado-games',
};
const PALAVRAS_CACA = ['ROBLOX', 'TENCHIKHO', 'DISCORD', 'GAMES', 'NVB', 'AVATAR', 'CARGO', 'TICKET', 'CHAMADA', 'MEMBRO', 'SERVIDOR', 'CONVITE'];
const DURACAO_JOGO_MS = 2 * 60 * 1000;
const jogosAtivos = new Map(); // canalId -> sessão em andamento

function lerRanking(gid) {
  try { return JSON.parse(fs.readFileSync(path.join(GAMES_DIR, `${gid}-ranking.json`), 'utf8')); } catch { return {}; }
}
function salvarRanking(gid, r) {
  const f = path.join(GAMES_DIR, `${gid}-ranking.json`);
  const t = f + '.tmp';
  fs.writeFileSync(t, JSON.stringify(r, null, 2));
  fs.renameSync(t, f);
}
function registrarEstatistica(gid, userId, nome, jogo, pontos, resultado) {
  const r = lerRanking(gid);
  const u = r[userId] || { nome, vitorias: 0, derrotas: 0, empates: 0, pontos: 0, partidas: 0, jogos: {} };
  u.nome = nome;
  u.partidas += 1;
  u.pontos += pontos;
  u.jogos[jogo] = (u.jogos[jogo] || 0) + 1;
  if (resultado === 'vitoria') u.vitorias += 1;
  else if (resultado === 'derrota') u.derrotas += 1;
  else if (resultado === 'empate') u.empates += 1;
  r[userId] = u;
  salvarRanking(gid, r);
}

// Cria a categoria e os canais que faltam (não duplica nada)
async function prepararGames(guild) {
  const existentes = await guild.channels.fetch();
  let categoria = existentes.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === NOMES_CANAIS.categoria.toLowerCase());
  if (!categoria) categoria = await guild.channels.create({ name: NOMES_CANAIS.categoria, type: ChannelType.GuildCategory });
  const ids = {};
  const criados = [];
  for (const chave of ['xadrez', 'dama', 'caca', 'matematica', 'resultados']) {
    const nome = NOMES_CANAIS[chave];
    let canal = existentes.find(c => c.parentId === categoria.id && c.name.toLowerCase() === nome.toLowerCase());
    if (!canal) {
      canal = await guild.channels.create({ name: nome, type: ChannelType.GuildText, parent: categoria.id });
      criados.push(nome);
    }
    ids[chave] = canal.id;
  }
  return { categoriaId: categoria.id, canais: ids, criados };
}

async function postarResultadoGames(guild, embed) {
  const campos = configDaFuncao(guild.id, 'games').campos || {};
  if (!campos.canalResultadosId) return;
  const canal = await guild.channels.fetch(campos.canalResultadosId).catch(() => null);
  if (canal && canal.isTextBased()) await canal.send({ embeds: [embed], allowedMentions: { parse: [] } });
}

function gerarQuestaoMat(nivel) {
  const r = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  if (nivel === 'facil') {
    const op = Math.random() < 0.5 ? '+' : '-';
    let a = r(1, 50), b = r(1, 50);
    if (op === '-' && b > a) [a, b] = [b, a];
    return { pergunta: `${a} ${op} ${b} = ?`, resposta: op === '+' ? a + b : a - b };
  }
  if (nivel === 'medio') {
    if (Math.random() < 0.5) {
      const a = r(2, 12), b = r(2, 12);
      return { pergunta: `${a} × ${b} = ?`, resposta: a * b };
    }
    const b = r(2, 12), q = r(2, 12);
    return { pergunta: `${b * q} ÷ ${b} = ?`, resposta: q };
  }
  const a = r(10, 99), b = r(2, 12), c = r(1, 50);
  if (Math.random() < 0.5) return { pergunta: `${a} × ${b} + ${c} = ?`, resposta: a * b + c };
  return { pergunta: `(${a} + ${c}) × ${b} = ?`, resposta: (a + c) * b };
}

function nomeNivel(n) { return { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }[n] || n; }

async function iniciarMatematica(i) {
  const cfg = configDaFuncao(i.guild.id, 'games');
  if (!cfg.ativa) return i.reply({ content: 'Os games estão desligados neste servidor.', flags: EFEMERA });
  const campos = cfg.campos || {};
  if (!campos.canalMatematicaId || i.channelId !== campos.canalMatematicaId) {
    return i.reply({ content: 'Use este comando no canal ➗・matematica.', flags: EFEMERA });
  }
  if (jogosAtivos.has(i.channelId)) return i.reply({ content: 'Já existe uma partida em andamento neste canal.', flags: EFEMERA });
  const nivel = i.options.getString('nivel', true);
  const sessao = {
    tipo: 'matematica', guildId: i.guild.id, canalId: i.channelId, nivel,
    inicio: Date.now(), placar: {}, questao: null, timer: null,
  };
  jogosAtivos.set(i.channelId, sessao);
  await i.reply({ content: `➗ Desafio de matemática (${nomeNivel(nivel)}) começou! Responda no chat. Duração: 2 minutos.` });
  sessao.timer = setTimeout(() => encerrarJogo(sessao), DURACAO_JOGO_MS);
  sessao.questao = gerarQuestaoMat(nivel);
  const canal = await i.guild.channels.fetch(i.channelId).catch(() => null);
  if (canal) await canal.send(`Quanto é: **${sessao.questao.pergunta}**`);
}

async function respostaMatematica(msg, sessao) {
  if (!sessao.questao) return;
  const texto = msg.content.trim();
  if (!/^-?\d+$/.test(texto)) return;
  const dono = sessao.placar[msg.author.id] || (sessao.placar[msg.author.id] = { nome: msg.member?.displayName || msg.author.username, acertos: 0, erros: 0, pontos: 0 });
  if (Number(texto) === sessao.questao.resposta) {
    dono.acertos += 1;
    dono.pontos += 10;
    await msg.reply(`✅ Acertou! +10 pontos.`).catch(() => {});
    sessao.questao = gerarQuestaoMat(sessao.nivel);
    await msg.channel.send(`Próxima: **${sessao.questao.pergunta}**`).catch(() => {});
  } else {
    dono.erros += 1;
    await msg.react('❌').catch(() => {});
  }
}

async function encerrarJogo(sessao) {
  if (!jogosAtivos.has(sessao.canalId)) return;
  jogosAtivos.delete(sessao.canalId);
  clearTimeout(sessao.timer);
  const guild = client.guilds.cache.get(sessao.guildId);
  if (!guild) return;
  const jogadores = Object.entries(sessao.placar).sort((a, b) => b[1].pontos - a[1].pontos);
  const topo = jogadores.length ? jogadores[0][1].pontos : 0;
  const campeoes = jogadores.filter(([, j]) => j.pontos === topo);
  const empate = campeoes.length > 1;
  for (const [uid, j] of jogadores) {
    const resultado = !jogadores.length ? null : (j.pontos === topo ? (empate ? 'empate' : 'vitoria') : 'derrota');
    if (resultado) registrarEstatistica(sessao.guildId, uid, j.nome, sessao.tipo, j.pontos, resultado);
  }
  const segundos = Math.round((Date.now() - sessao.inicio) / 1000);
  const linhas = jogadores.length
    ? jogadores.map(([, j]) => `• ${j.nome}: ${j.acertos} acertos, ${j.erros} erros, ${j.pontos} pts`).join('\n')
    : 'Ninguém respondeu.';
  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle('🧮 Resultado: desafio de matemática')
    .setDescription(linhas)
    .addFields(
      { name: 'Dificuldade', value: nomeNivel(sessao.nivel), inline: true },
      { name: 'Tempo', value: `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`, inline: true },
      { name: 'Vencedor', value: campeoes.length && topo > 0 ? (empate ? 'Empate: ' : '') + campeoes.map(([, j]) => j.nome).join(', ') : 'Nenhum', inline: true },
    )
    .setTimestamp(new Date());
  await postarResultadoGames(guild, embed);
  const canal = await guild.channels.fetch(sessao.canalId).catch(() => null);
  if (canal) await canal.send('🏁 Desafio encerrado. O resultado foi enviado para 🏆・resultado-games.').catch(() => {});
}

async function iniciarCaca(i) {
  const cfg = configDaFuncao(i.guild.id, 'games');
  if (!cfg.ativa) return i.reply({ content: 'Os games estão desligados neste servidor.', flags: EFEMERA });
  const campos = cfg.campos || {};
  if (!campos.canalCacaId || i.channelId !== campos.canalCacaId) {
    return i.reply({ content: 'Use este comando no canal 🔎・caca-palavras.', flags: EFEMERA });
  }
  if (jogosAtivos.has(i.channelId)) return i.reply({ content: 'Já existe uma partida em andamento neste canal.', flags: EFEMERA });
  const palavras = [...PALAVRAS_CACA].sort(() => Math.random() - 0.5).slice(0, 5);
  const grade = montarGradeCaca(palavras);
  const sessao = {
    tipo: 'caca', guildId: i.guild.id, canalId: i.channelId, palavras, grade,
    encontradas: new Set(), inicio: Date.now(), placar: {}, timer: null, nivel: 'padrao',
  };
  jogosAtivos.set(i.channelId, sessao);
  sessao.timer = setTimeout(() => encerrarJogo(sessao), DURACAO_JOGO_MS);
  const linhasGrade = grade.map(l => l.join(' ')).join('\n');
  await i.reply({
    content: `🔎 **CAÇA-PALAVRAS**\nEncontre as palavras na grade e digite-as no chat, uma de cada vez.\n\n\`\`\`\n${linhasGrade}\n\`\`\`\n**Palavras:** ${palavras.join(', ')}\n⏱️ Tempo: 02:00`,
  });
}

function montarGradeCaca(palavras) {
  const N = 12;
  const grade = Array.from({ length: N }, () => Array(N).fill(''));
  for (const palavra of palavras) {
    let colocada = false;
    for (let tent = 0; tent < 200 && !colocada; tent++) {
      const horizontal = Math.random() < 0.5;
      const r = Math.floor(Math.random() * N);
      const c = Math.floor(Math.random() * N);
      const dr = horizontal ? 0 : 1;
      const dc = horizontal ? 1 : 0;
      if (r + dr * (palavra.length - 1) >= N || c + dc * (palavra.length - 1) >= N) continue;
      let cabe = true;
      for (let k = 0; k < palavra.length; k++) {
        const celula = grade[r + dr * k][c + dc * k];
        if (celula && celula !== palavra[k]) { cabe = false; break; }
      }
      if (!cabe) continue;
      for (let k = 0; k < palavra.length; k++) grade[r + dr * k][c + dc * k] = palavra[k];
      colocada = true;
    }
  }
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return grade.map(l => l.map(c => c || letras[Math.floor(Math.random() * letras.length)]));
}

async function respostaCaca(msg, sessao) {
  const texto = msg.content.trim().toUpperCase();
  if (!/^[A-Z]{3,20}$/.test(texto)) return;
  const dono = sessao.placar[msg.author.id] || (sessao.placar[msg.author.id] = { nome: msg.member?.displayName || msg.author.username, acertos: 0, erros: 0, pontos: 0 });
  if (sessao.palavras.includes(texto) && !sessao.encontradas.has(texto)) {
    sessao.encontradas.add(texto);
    dono.acertos += 1;
    dono.pontos += 10;
    await msg.reply(`✅ **${texto}** encontrada! +10 pontos.`).catch(() => {});
    if (sessao.encontradas.size === sessao.palavras.length) encerrarJogo(sessao);
  } else if (!sessao.palavras.includes(texto)) {
    dono.erros += 1;
    await msg.react('❌').catch(() => {});
  }
}

client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild) return;
  const sessao = jogosAtivos.get(msg.channelId);
  if (!sessao) return;
  if (sessao.tipo === 'matematica') return respostaMatematica(msg, sessao);
  if (sessao.tipo === 'caca') return respostaCaca(msg, sessao);
});


// ---------- saída ----------
const TEXTO_SAIDA_PADRAO = '👋 Membro saiu\n\nO membro {user} deixou o servidor.\n\n👥 Membros restantes: {memberCount}';
function dataBR(d) { return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
function horaBR(d) { return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }); }
function dadosSaida(userId, displayName, guild, tipo) {
  const agora = new Date();
  const username = (guild.members.cache.get(userId)?.user.username) || displayName;
  return {
    user: `<@${userId}>`,
    username,
    displayName,
    server: guild.name,
    memberCount: String(guild.memberCount),
    userId,
    date: dataBR(agora),
    time: horaBR(agora),
    tipo,
  };
}
function formatarSaida(modelo, dados) {
  return String(modelo).replace(/\{(\w+)\}/g, (m, k) => (dados[k] !== undefined ? dados[k] : m));
}
async function enviarSaida(canal, campos, dados, avatar, tipo, motivo) {
  const texto = formatarSaida(String(campos.mensagem || '').trim() || TEXTO_SAIDA_PADRAO, dados)
    + (motivo ? `\n\n📝 Motivo: ${motivo}` : '');
  if (campos.formato === 'embed') {
    const embed = new EmbedBuilder()
      .setColor(0xdc2626)
      .setTitle(formatarSaida(campos.tituloEmbed || '🚪 Membro saiu', dados))
      .setDescription(texto)
      .setFooter({ text: 'Tenchikho' })
      .setTimestamp(new Date());
    if (avatar) embed.setThumbnail(avatar);
    await canal.send({ embeds: [embed], allowedMentions: { users: [dados.userId] } });
  } else {
    await canal.send({ content: texto, allowedMentions: { users: [dados.userId] } });
  }
}
// Descobre se a saída foi por conta própria, expulsão ou banimento (registro de auditoria)
async function tipoDeSaida(guild, userId) {
  const agora = Date.now();
  try {
    const bans = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 5 });
    const b = bans.entries.find(e => e.target?.id === userId && agora - e.createdTimestamp < 15000);
    if (b) return { tipo: 'banido', moderador: b.executor, motivo: b.reason || null };
    const kicks = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 5 });
    const k = kicks.entries.find(e => e.target?.id === userId && agora - e.createdTimestamp < 15000);
    if (k) return { tipo: 'expulso', moderador: k.executor, motivo: k.reason || null };
  } catch { /* sem permissão de auditoria: trata como saída comum */ }
  return { tipo: 'saiu', moderador: null, motivo: null };
}
client.on('guildMemberRemove', async member => {
  const cfg = configDaFuncao(member.guild.id, 'saida');
  if (!cfg.ativa) return;
  const c = cfg.campos || {};
  const info = await tipoDeSaida(member.guild, member.id);
  const nome = member.displayName || member.user.username;
  const dados = dadosSaida(member.id, nome, member.guild, info.tipo);
  if (c.canalId) {
    const canal = await member.guild.channels.fetch(c.canalId).catch(() => null);
    if (canal && canal.isTextBased()) {
      await enviarSaida(canal, c, dados, member.user.displayAvatarURL(), info.tipo, info.motivo)
        .catch(e => console.error('Saída não enviada:', e.message));
    }
  }
  if (c.logsCanalId) {
    const logs = await member.guild.channels.fetch(c.logsCanalId).catch(() => null);
    if (logs && logs.isTextBased()) {
      const rotulo = { saiu: 'Saiu por conta própria', expulso: 'Expulso', banido: 'Banido' }[info.tipo];
      const embed = new EmbedBuilder()
        .setColor(info.tipo === 'saiu' ? 0x6b7280 : 0xdc2626)
        .setTitle(`🚪 ${rotulo}`)
        .addFields(
          { name: 'Usuário', value: `${nome} (${member.user.username})`, inline: true },
          { name: 'ID', value: member.id, inline: true },
          { name: 'Data', value: `${dados.date} ${dados.time}`, inline: true },
          { name: 'Moderador', value: info.moderador ? `<@${info.moderador.id}>` : '—', inline: true },
          { name: 'Motivo', value: info.motivo || '—', inline: true },
        )
        .setTimestamp(new Date());
      await logs.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
    }
  }
});

// ---------- moderação ----------
const MOD_DIR = path.join(DATA_DIR, 'moderacao');
fs.mkdirSync(MOD_DIR, { recursive: true });
function lerMod(gid) {
  try { return JSON.parse(fs.readFileSync(path.join(MOD_DIR, `${gid}.json`), 'utf8')); }
  catch { return { avisos: [], acoes: [] }; }
}
function salvarMod(gid, d) {
  const f = path.join(MOD_DIR, `${gid}.json`);
  const t = f + '.tmp';
  fs.writeFileSync(t, JSON.stringify(d, null, 2));
  fs.renameSync(t, f);
}
function podeModerar(membro, guild) {
  if (membro.permissions.has(PermissionFlagsBits.Administrator) || membro.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const cargos = configDaFuncao(guild.id, 'moderacao').campos?.cargosIds || [];
  return cargos.some(id => membro.roles.cache.has(id));
}
// Retorna uma mensagem de erro se a ação não puder ser feita, ou null se puder
function hierarquiaMod(moderador, alvo, guild) {
  if (alvo.id === guild.ownerId) return 'O dono do servidor não pode ser moderado.';
  if (alvo.id === moderador.id) return 'Você não pode aplicar uma ação em você mesmo.';
  const me = guild.members.me;
  if (me && alvo.roles.highest.position >= me.roles.highest.position) return 'O cargo desse membro está igual ou acima do cargo do bot.';
  const modAdmin = moderador.id === guild.ownerId || moderador.permissions.has(PermissionFlagsBits.Administrator);
  if (!modAdmin && alvo.roles.highest.position >= moderador.roles.highest.position) return 'O cargo desse membro está igual ou acima do seu.';
  return null;
}
function registrarAcaoMod(gid, tipo, alvo, moderador, motivo, detalhe) {
  const d = lerMod(gid);
  d.acoes.push({
    id: crypto.randomUUID(), tipo,
    userId: alvo.id, nome: alvo.nome,
    moderadorId: moderador.id, moderadorNome: moderador.nome,
    motivo: motivo || null, detalhe: detalhe || null,
    data: new Date().toISOString(),
  });
  salvarMod(gid, d);
}
async function logarMod(guild, titulo, campos) {
  const cfg = configDaFuncao(guild.id, 'moderacao').campos || {};
  if (!cfg.logsCanalId) return;
  const canal = await guild.channels.fetch(cfg.logsCanalId).catch(() => null);
  if (!canal || !canal.isTextBased()) return;
  const embed = new EmbedBuilder().setColor(0xdc2626).setTitle(titulo).addFields(campos).setTimestamp(new Date());
  await canal.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}
async function tratarMod(i) {
  if (!i.guild) return i.reply({ content: 'Use este comando dentro de um servidor.', flags: EFEMERA });
  if (!configDaFuncao(i.guild.id, 'moderacao').ativa) return i.reply({ content: 'A moderação está desligada neste servidor.', flags: EFEMERA });
  const moderador = i.member;
  if (!podeModerar(moderador, i.guild)) return i.reply({ content: 'Você não tem permissão para usar a moderação.', flags: EFEMERA });
  const sub = i.options.getSubcommand();
  const eu = { id: i.user.id, nome: moderador.displayName || i.user.username };
  await i.deferReply({ flags: EFEMERA });
  try {
    if (sub === 'avisar') {
      const alvoM = i.options.getMember('usuario');
      const motivo = i.options.getString('motivo', true);
      if (!alvoM) return i.editReply({ content: 'Esse usuário não está no servidor.' });
      const erro = hierarquiaMod(moderador, alvoM, i.guild);
      if (erro) return i.editReply({ content: erro });
      const d = lerMod(i.guild.id);
      d.avisos.push({ id: crypto.randomUUID(), userId: alvoM.id, nome: alvoM.displayName, moderadorId: eu.id, moderadorNome: eu.nome, motivo, data: new Date().toISOString() });
      salvarMod(i.guild.id, d);
      const total = d.avisos.filter(a => a.userId === alvoM.id).length;
      registrarAcaoMod(i.guild.id, 'advertencia', { id: alvoM.id, nome: alvoM.displayName }, eu, motivo, `Advertência ${total}`);
      await alvoM.send(`⚠️ Você recebeu uma advertência no servidor ${i.guild.name}.\n📝 Motivo: ${motivo}`).catch(() => {});
      await logarMod(i.guild, '⚠️ Advertência aplicada', [
        { name: 'Usuário', value: `<@${alvoM.id}>`, inline: true },
        { name: 'Moderador', value: `<@${eu.id}>`, inline: true },
        { name: 'Motivo', value: motivo },
        { name: 'Advertências', value: `${total}` , inline: true },
      ]);
      return i.editReply({ content: `⚠️ Advertência aplicada a <@${alvoM.id}>. Motivo: ${motivo}. Advertências: ${total}.` });
    }
    if (sub === 'silenciar') {
      const alvoM = i.options.getMember('usuario');
      const minutos = i.options.getInteger('minutos', true);
      const motivo = i.options.getString('motivo', true);
      if (!alvoM) return i.editReply({ content: 'Esse usuário não está no servidor.' });
      const erro = hierarquiaMod(moderador, alvoM, i.guild);
      if (erro) return i.editReply({ content: erro });
      await alvoM.timeout(minutos * 60 * 1000, motivo);
      registrarAcaoMod(i.guild.id, 'silenciamento', { id: alvoM.id, nome: alvoM.displayName }, eu, motivo, `${minutos} min`);
      await logarMod(i.guild, '🔇 Membro silenciado', [
        { name: 'Usuário', value: `<@${alvoM.id}>`, inline: true },
        { name: 'Moderador', value: `<@${eu.id}>`, inline: true },
        { name: 'Tempo', value: `${minutos} min`, inline: true },
        { name: 'Motivo', value: motivo },
      ]);
      return i.editReply({ content: `🔇 <@${alvoM.id}> silenciado por ${minutos} minuto(s). Motivo: ${motivo}.` });
    }
    if (sub === 'expulsar') {
      const alvoM = i.options.getMember('usuario');
      const motivo = i.options.getString('motivo', true);
      if (!alvoM) return i.editReply({ content: 'Esse usuário não está no servidor.' });
      const erro = hierarquiaMod(moderador, alvoM, i.guild);
      if (erro) return i.editReply({ content: erro });
      await alvoM.kick(motivo);
      registrarAcaoMod(i.guild.id, 'expulsao', { id: alvoM.id, nome: alvoM.displayName }, eu, motivo, null);
      await logarMod(i.guild, '👢 Membro expulso', [
        { name: 'Usuário', value: `${alvoM.displayName} (${alvoM.id})`, inline: true },
        { name: 'Moderador', value: `<@${eu.id}>`, inline: true },
        { name: 'Motivo', value: motivo },
      ]);
      return i.editReply({ content: `👢 ${alvoM.displayName} foi expulso. Motivo: ${motivo}.` });
    }
    if (sub === 'banir') {
      const usuario = i.options.getUser('usuario', true);
      const motivo = i.options.getString('motivo', true);
      const alvoM = await i.guild.members.fetch(usuario.id).catch(() => null);
      if (alvoM) {
        const erro = hierarquiaMod(moderador, alvoM, i.guild);
        if (erro) return i.editReply({ content: erro });
      }
      await i.guild.members.ban(usuario.id, { reason: motivo });
      registrarAcaoMod(i.guild.id, 'banimento', { id: usuario.id, nome: usuario.username }, eu, motivo, null);
      await logarMod(i.guild, '🔨 Membro banido', [
        { name: 'Usuário', value: `${usuario.username} (${usuario.id})`, inline: true },
        { name: 'Moderador', value: `<@${eu.id}>`, inline: true },
        { name: 'Motivo', value: motivo },
        { name: 'Data', value: dataBR(new Date()), inline: true },
      ]);
      return i.editReply({ content: `🔨 ${usuario.username} foi banido. Motivo: ${motivo}.` });
    }
    if (sub === 'desbanir') {
      const id = i.options.getString('id_usuario', true).trim();
      if (!/^\d{17,20}$/.test(id)) return i.editReply({ content: 'ID inválido.' });
      await i.guild.members.unban(id);
      registrarAcaoMod(i.guild.id, 'desbanimento', { id, nome: id }, eu, null, null);
      await logarMod(i.guild, '🔓 Membro desbanido', [
        { name: 'Usuário', value: id, inline: true },
        { name: 'Moderador', value: `<@${eu.id}>`, inline: true },
      ]);
      return i.editReply({ content: `🔓 Banimento removido do ID ${id}.` });
    }
    if (sub === 'limpar') {
      const q = i.options.getInteger('quantidade', true);
      const apagadas = await i.channel.bulkDelete(q, true);
      registrarAcaoMod(i.guild.id, 'limpeza', { id: i.channelId, nome: i.channel.name }, eu, null, `${apagadas.size} mensagens`);
      await logarMod(i.guild, '🧹 Mensagens apagadas', [
        { name: 'Canal', value: `<#${i.channelId}>`, inline: true },
        { name: 'Moderador', value: `<@${eu.id}>`, inline: true },
        { name: 'Quantidade', value: `${apagadas.size}`, inline: true },
      ]);
      return i.editReply({ content: `🧹 ${apagadas.size} mensagem(ns) apagada(s). (Mensagens com mais de 14 dias não podem ser apagadas.)` });
    }
    if (sub === 'bloquear' || sub === 'desbloquear') {
      const bloquear = sub === 'bloquear';
      await i.channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: bloquear ? false : null });
      registrarAcaoMod(i.guild.id, bloquear ? 'canal_bloqueado' : 'canal_desbloqueado', { id: i.channelId, nome: i.channel.name }, eu, null, null);
      await logarMod(i.guild, bloquear ? '🔒 Canal bloqueado' : '🔓 Canal desbloqueado', [
        { name: 'Canal', value: `<#${i.channelId}>`, inline: true },
        { name: 'Moderador', value: `<@${eu.id}>`, inline: true },
      ]);
      return i.editReply({ content: bloquear ? '🔒 Canal bloqueado para envio de mensagens.' : '🔓 Canal liberado para envio de mensagens.' });
    }
    return i.editReply({ content: 'Ação desconhecida.' });
  } catch (e) {
    return i.editReply({ content: 'Não consegui executar a ação: ' + e.message + '. Confira se o bot tem a permissão necessária e se o cargo dele está acima do membro.' });
  }
}

client.on('interactionCreate', async i => {
  if (i.isChatInputCommand() && i.commandName === 'avatar') return tratarAvatar(i);
  if (i.isChatInputCommand() && i.commandName === 'aniversario') return tratarAniversario(i);
  if (i.isChatInputCommand() && i.commandName === 'matematica') return iniciarMatematica(i);
  if (i.isChatInputCommand() && i.commandName === 'cacapalavras') return iniciarCaca(i);
  if (i.isChatInputCommand() && i.commandName === 'ranking') return mostrarRanking(i);
  if (i.isChatInputCommand() && i.commandName === 'mod') return tratarMod(i);
  if (i.isButton() && i.customId.startsWith('recrutamento:') && i.guild) return tratarBotaoRecrutamento(i);
  if (i.isStringSelectMenu() && i.customId.startsWith('autocargo:') && i.guild) return tratarAutocargo(i);
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

const voltarDe = new Map();
app.get('/auth/login', (req, res) => {
  const st = crypto.randomBytes(16).toString('hex');
  estados.set(st, Date.now() + 10 * 60e3);
  voltarDe.set(st, req.query.voltar === '/recrutamento' ? '/recrutamento' : '/');
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
  const destino = voltarDe.get(state) || '/';
  voltarDe.delete(state);
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
    res.redirect(destino);
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
  res.json({ user: s.user, servidores, botOnline: client.isReady(), botNome: client.user ? client.user.username : null, botAvatar: client.user ? client.user.displayAvatarURL({ extension: 'png', size: 128 }) : null });
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

app.get('/api/commands', async (req, res) => {
  const s = sessaoAtual(req);
  if (!s) return res.status(401).json({ error: 'Faça login com o Discord.' });
  try {
    const commands = await client.application.commands.fetch();
    const lista = [...commands.values()].map(c => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      type: c.type,
      options: (c.options || []).map(o => ({
        name: o.name,
        description: o.description || '',
        type: o.type,
        required: !!o.required,
        choices: (o.choices || []).map(ch => ({ name: ch.name, value: ch.value })),
        options: (o.options || []).map(so => ({
          name: so.name,
          description: so.description || '',
          type: so.type,
          required: !!so.required,
          choices: (so.choices || []).map(ch => ({ name: ch.name, value: ch.value }))
        }))
      }))
    }));
    lista.sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
    res.json({ commands: lista });
  } catch (e) {
    console.error('Comandos:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar os comandos registrados.' });
  }
});

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

app.get('/api/guilds/:id/canais', async (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  await guild.channels.fetch().catch(() => {});
  const canais = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText)
    .map(c => ({ id: c.id, nome: c.name }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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
  if (chave === 'saida') {
    const v = validarCampos(chave, req.body?.campos);
    if (!v.ok) return res.status(400).json({ error: v.erro });
    if (!v.valor.canalId) return res.status(400).json({ error: 'Escolha o canal de saída e clique em Salvar antes do teste.' });
    const canal = await guild.channels.fetch(v.valor.canalId).catch(() => null);
    if (!canal || !canal.isTextBased()) return res.status(400).json({ error: 'O bot não encontrou o canal de saída. Confira se ele tem permissão para ver e enviar mensagens nele.' });
    const membro = await guild.members.fetch(sessao.user.id).catch(() => null);
    const dados = dadosSaida(membro ? membro.id : sessao.user.id, membro ? membro.displayName : sessao.user.nome, guild, 'saiu');
    try {
      await enviarSaida(canal, v.valor, dados, membro ? membro.user.displayAvatarURL() : null, 'saiu', null);
    } catch (e) {
      return res.status(400).json({ error: 'Não consegui enviar o teste: ' + e.message });
    }
    return res.json({ ok: true, mensagem: 'Teste enviado no canal de saída.' });
  }
  if (chave === 'moderacao') {
    const v = validarCampos(chave, req.body?.campos);
    if (!v.ok) return res.status(400).json({ error: v.erro });
    if (!v.valor.logsCanalId) return res.status(400).json({ error: 'Escolha o canal de logs e clique em Salvar antes do teste.' });
    const canal = await guild.channels.fetch(v.valor.logsCanalId).catch(() => null);
    if (!canal || !canal.isTextBased()) return res.status(400).json({ error: 'O bot não encontrou o canal de logs.' });
    try { await canal.send('🧪 Teste: os logs de moderação vão aparecer aqui.'); }
    catch (e) { return res.status(400).json({ error: 'Não consegui enviar no canal de logs: ' + e.message }); }
    return res.json({ ok: true, mensagem: 'Teste enviado no canal de logs.' });
  }
  if (chave === 'recrutamento') {
    const v = validarCampos(chave, req.body?.campos);
    if (!v.ok) return res.status(400).json({ error: v.erro });
    const membro = await guild.members.fetch(sessao.user.id).catch(() => null);
    if (!membro) return res.status(400).json({ error: 'Você precisa estar no servidor para receber o teste.' });
    const nome = sessao.user.nome || membro.user.username;
    if (!v.valor.canalId) return res.status(400).json({ error: 'Cole o ID do canal das fichas e clique em Salvar antes do teste.' });
    const canalFichas = await guild.channels.fetch(v.valor.canalId).catch(() => null);
    if (!canalFichas) return res.status(400).json({ error: 'O bot não encontrou o canal das fichas. Confira o ID e se o bot tem permissão para ver e enviar mensagens nele.' });
    try {
      await canalFichas.send(`🧪 Teste: esta é a forma como as fichas vão aparecer aqui, com os botões Aprovar e Recusar.`);
    } catch (e) {
      return res.status(400).json({ error: 'Não consegui enviar no canal das fichas: ' + e.message + '. Dê ao bot as permissões Ver canal e Enviar mensagens nele.' });
    }
    const texto = textoAprovacao(v.valor, nome);
    try {
      await membro.send(texto);
    } catch (e) {
      return res.status(400).json({ error: 'Não consegui mandar a DM de teste: ' + e.message + '. Confira se o seu privado aceita mensagens de membros do servidor.' });
    }
    return res.json({ ok: true, mensagem: 'Teste enviado: uma mensagem apareceu no canal das fichas e a mensagem de aprovação chegou no seu privado.' });
  }
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

// ---------- recrutamento ----------
const PERGUNTAS = [
  { campo: 'nomeDiscord', rotulo: 'Nome no Discord', max: 40 },
  { campo: 'nome', rotulo: 'Nome', max: 60 },
  { campo: 'idade', rotulo: 'Idade', max: 3 },
  { campo: 'experiencia', rotulo: 'Experiência', max: 500 },
  { campo: 'jaParticipou', rotulo: 'Já participou de algum clã/comunidade?', max: 300 },
  { campo: 'horario', rotulo: 'Horário disponível', max: 120 },
  { campo: 'motivo', rotulo: 'Motivo de entrar', max: 500 },
  { campo: 'roblox', rotulo: 'Nick no Roblox', max: 20 },
];
const CAND_DIR = path.join(DATA_DIR, 'candidaturas');
fs.mkdirSync(CAND_DIR, { recursive: true });
function arquivoCandidaturas(guildId) { return path.join(CAND_DIR, `${guildId}.json`); }
function lerCandidaturas(guildId) {
  try { return JSON.parse(fs.readFileSync(arquivoCandidaturas(guildId), 'utf8')); } catch { return []; }
}
function salvarCandidaturas(guildId, lista) {
  const f = arquivoCandidaturas(guildId);
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(lista, null, 2));
  fs.renameSync(tmp, f);
}
// Primeiro servidor com o recrutamento ligado (o link público usa este servidor)
function servidorRecrutamentoAtivo() {
  const cfg = lerConfig();
  const preferido = cfg._recrutamentoPublico;
  if (preferido && cfg[preferido]?.recrutamento?.ativa && client.guilds.cache.has(preferido)) return preferido;
  for (const [gid, c] of Object.entries(cfg)) {
    if (gid.startsWith('_')) continue;
    if (c?.recrutamento?.ativa && client.guilds.cache.has(gid)) return gid;
  }
  return null;
}
function textoAprovacao(campos, nome) {
  const base = textoComMembro(campos.mensagemAprovacao, nome,
    'Parabéns, sua candidatura foi aprovada! Seja bem-vindo(a) ao servidor.');
  return campos.conviteLink ? `${base}\n\nEntre no servidor pelo link: ${campos.conviteLink}` : base;
}
function textoComMembro(modelo, nome, padrao) {
  return (String(modelo || '').trim() || padrao).replace(/\{membro\}/g, nome);
}
async function podeAvaliar(s, guild) {
  const g = s.guilds.find(x => x.id === guild.id);
  if (g && podeGerenciar(g)) return true;
  const cargos = configDaFuncao(guild.id, 'recrutamento').campos?.cargosAvaliamIds || [];
  if (!cargos.length) return false;
  try {
    const m = await guild.members.fetch(s.user.id);
    return cargos.some(id => m.roles.cache.has(id));
  } catch { return false; }
}
async function autorizarRecrutamento(req, res) {
  const s = sessaoAtual(req);
  if (!s) { res.status(401).json({ error: 'Faça login com o Discord.' }); return null; }
  const guild = client.guilds.cache.get(req.params.id);
  if (!guild) { res.status(409).json({ error: 'O bot não está neste servidor.' }); return null; }
  if (!(await podeAvaliar(s, guild))) { res.status(403).json({ error: 'Sem permissão para ver as candidaturas.' }); return null; }
  return { s, guild };
}


// Posta o resultado da decisão no canal de aprovações (se configurado).
async function postarResultadoCanal(guild, c, porId) {
  const campos = configDaFuncao(guild.id, 'recrutamento').campos || {};
  if (!campos.canalAprovacoesId) return;
  const canal = await guild.channels.fetch(campos.canalAprovacoesId).catch(() => null);
  if (!canal || !canal.isTextBased()) return;
  const aprovada = c.status === 'aprovada';
  const embed = new EmbedBuilder()
    .setColor(aprovada ? 0x22c55e : 0xdc2626)
    .setTitle(aprovada ? '✅ Candidatura aprovada' : '❌ Candidatura recusada')
    .addFields(
      { name: 'Candidato', value: `<@${c.userId}> (${c.usuario})`, inline: true },
      { name: 'Roblox', value: c.roblox, inline: true },
      { name: 'Decidida por', value: `<@${porId}>`, inline: true },
    )
    .setTimestamp(new Date());
  await canal.send({ embeds: [embed], allowedMentions: { parse: [] } });
}

// Aprovação/recusa acontece no servidor de recrutamento. O candidato pode estar fora dele.
// Quando aprovado, o bot aguarda a entrada no servidor de destino e aplica NVB_{membro} + cargo.
async function executarDecisao(guild, c, acao, porId) {
  const campos = configDaFuncao(guild.id, 'recrutamento').campos || {};
  const avisos = [];
  const agora = new Date().toISOString();
  const nomeCurto = (c.nomeDiscord || c.usuario || '').trim();
  const usuario = await client.users.fetch(c.userId).catch(() => null);
  if (!usuario) throw new Error('Não consegui encontrar a conta do candidato no Discord.');

  if (acao === 'aprovar') {
    // A aprovação NÃO depende de o candidato estar em nenhum servidor.
    // Também não fazemos fetch do servidor/cargo neste momento: os IDs ficam
    // salvos e são validados/aplicados somente quando o candidato entrar.
    if (!campos.servidorDestinoId) throw new Error('Configure o ID do servidor de destino no recrutamento.');
    if (!campos.cargoDestinoId) throw new Error('Configure o ID do cargo no servidor de destino.');

    try { await usuario.send(textoAprovacao(campos, nomeCurto)); }
    catch { avisos.push('Não consegui enviar a DM. O candidato pode ter bloqueado mensagens privadas.'); }

    c.destino = {
      guildId: String(campos.servidorDestinoId),
      cargoId: String(campos.cargoDestinoId),
      prefixo: String(campos.prefixo ?? 'NVB_'),
      aguardandoEntrada: true
    };
    c.status = 'aprovada';
  } else {
    const texto = textoComMembro(campos.mensagemRecusa, nomeCurto,
      'Obrigado por se candidatar. Infelizmente, desta vez sua candidatura não foi aprovada.');
    try { await usuario.send(texto); }
    catch { avisos.push('Não consegui enviar a DM ao candidato.'); }
    c.status = 'recusada';
  }
  c.historico = [...(c.historico || []), { quando: agora, acao: c.status, por: porId }];
  c.decididaEm = agora;
  try { await postarResultadoCanal(guild, c, porId); } catch (e) { console.error('Resultado no canal:', e.message); }
  return avisos;
}

// Ao entrar no servidor de destino, procura uma candidatura aprovada e aplica apenas o apelido e o cargo.
async function aplicarRecrutamentoAoEntrar(member) {
  if (member.user.bot) return;
  const cfg = lerConfig();
  for (const [guildId, config] of Object.entries(cfg)) {
    if (guildId.startsWith('_')) continue;
    const campos = config?.recrutamento?.campos || {};
    if (campos.servidorDestinoId !== member.guild.id) continue;
    const lista = lerCandidaturas(guildId);
    const c = lista.find(x => x.userId === member.id && x.status === 'aprovada' && x.destino?.guildId === member.guild.id && x.destino?.aguardandoEntrada);
    if (!c) continue;
    const nomeCurto = (c.nomeDiscord || c.usuario || member.user.username).trim();
    const apelido = (String(c.destino.prefixo || 'NVB_') + nomeCurto).slice(0, 32);
    const avisos = [];
    try { await member.setNickname(apelido); } catch { avisos.push('apelido'); }
    try { await member.roles.add(c.destino.cargoId); } catch { avisos.push('cargo'); }
    c.destino.aguardandoEntrada = false;
    c.destino.aplicadoEm = new Date().toISOString();
    c.historico = [...(c.historico || []), { quando: new Date().toISOString(), acao: 'entrada_servidor_destino', por: 'sistema' }];
    salvarCandidaturas(guildId, lista);
    if (avisos.length) console.error(`Recrutamento ${member.user.tag}: falha ao aplicar ${avisos.join(' e ')}`);
    break;
  }
}

// Monta a ficha no canal de recrutamento, com os botões Aprovar e Recusar.
async function postarFichaNoCanal(gid, c) {
  const campos = configDaFuncao(gid, 'recrutamento').campos || {};
  if (!campos.canalId) return;
  const guild = client.guilds.cache.get(gid);
  const canal = guild ? await guild.channels.fetch(campos.canalId).catch(() => null) : null;
  if (!canal) return;
  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle(`Nova candidatura: ${c.usuario}`)
    .addFields(
      { name: 'Nome', value: c.nome.slice(0, 1024), inline: true },
      { name: 'Idade', value: c.idade.slice(0, 1024), inline: true },
      { name: 'Roblox', value: c.roblox.slice(0, 1024), inline: true },
      { name: 'Nome no Discord', value: c.nomeDiscord.slice(0, 1024), inline: true },
      { name: 'Candidato', value: `<@${c.userId}>`, inline: true },
      { name: 'Experiência', value: c.experiencia.slice(0, 1024) },
      { name: 'Já participou de clã/comunidade?', value: c.jaParticipou.slice(0, 1024) },
      { name: 'Horário disponível', value: c.horario.slice(0, 1024) },
      { name: 'Motivo de entrar', value: c.motivo.slice(0, 1024) },
    )
    .setFooter({ text: 'Status: pendente' });
  const botoes = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`recrutamento:aprovar:${c.id}`).setLabel('Aprovar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`recrutamento:recusar:${c.id}`).setLabel('Recusar').setStyle(ButtonStyle.Danger),
  );
  const msg = await canal.send({ embeds: [embed], components: [botoes] });
  c.canalId = canal.id;
  c.mensagemId = msg.id;
}

// Depois de decidir, tira os botões da ficha no canal e mostra o resultado.
async function atualizarMensagemCanal(guild, c) {
  if (!c.canalId || !c.mensagemId) return;
  try {
    const canal = guild.channels.cache.get(c.canalId);
    const msg = await canal.messages.fetch(c.mensagemId);
    const rotulo = c.status === 'aprovada' ? 'aprovada' : 'recusada';
    const embed = EmbedBuilder.from(msg.embeds[0]).setFooter({ text: `Status: ${rotulo}` });
    await msg.edit({ embeds: [embed], components: [] });
  } catch (e) {
    console.error('Atualizar ficha no canal:', e.message);
  }
}

// Clique nos botões da ficha no canal.
async function tratarBotaoRecrutamento(i) {
  const [, acao, cid] = i.customId.split(':');
  await i.deferUpdate();
  const responder = content => i.followUp({ content, flags: EFEMERA }).catch(() => null);
  const membroClicou = await i.guild.members.fetch(i.user.id).catch(() => null);
  if (!membroClicou) return responder('Não consegui confirmar a sua permissão.');
  const cargos = configDaFuncao(i.guild.id, 'recrutamento').campos?.cargosAvaliamIds || [];
  const permitido = membroClicou.permissions.has(PermissionFlagsBits.Administrator)
    || membroClicou.permissions.has(PermissionFlagsBits.ManageGuild)
    || cargos.some(id => membroClicou.roles.cache.has(id));
  if (!permitido) return responder('Você não tem permissão para avaliar candidaturas.');

  const lista = lerCandidaturas(i.guild.id);
  const c = lista.find(x => x.id === cid);
  if (!c) return responder('Candidatura não encontrada.');
  if (c.status !== 'pendente') return responder('Esta candidatura já foi decidida.');
  try {
    const avisos = await executarDecisao(i.guild, c, acao === 'aprovar' ? 'aprovar' : 'recusar', i.user.id);
    salvarCandidaturas(i.guild.id, lista);
    await atualizarMensagemCanal(i.guild, c);
    const texto = c.status === 'aprovada' ? 'Candidatura aprovada.' : 'Candidatura recusada.';
    await responder(avisos.length ? `${texto} Avisos: ${avisos.join(' ')}` : texto);
  } catch (e) {
    await responder(e.message);
  }
}

app.get('/recrutamento', (req, res) => res.sendFile(path.join(__dirname, 'public', 'recrutamento.html')));

app.get('/api/recrutamento/publico', (req, res) => {
  const gid = servidorRecrutamentoAtivo();
  if (!gid) return res.json({ aberto: false, perguntas: PERGUNTAS });
  const g = client.guilds.cache.get(gid);
  res.json({ aberto: true, servidorNome: g?.name || 'Tenchikho', perguntas: PERGUNTAS });
});

app.post('/api/recrutamento/enviar', async (req, res) => {
  const s = sessaoAtual(req);
  if (!s) return res.status(401).json({ error: 'Entre com o Discord para enviar a candidatura.' });
  const gid = servidorRecrutamentoAtivo();
  if (!gid) return res.status(409).json({ error: 'O recrutamento está fechado no momento.' });
  const b = req.body || {};
  const dados = {};
  for (const p of PERGUNTAS) {
    if (p.campo === 'nomeDiscord') continue; // vem automático da conta logada
    const v = String(b[p.campo] ?? '').trim();
    if (!v) return res.status(400).json({ error: `Preencha: ${p.rotulo}.` });
    if (v.length > p.max) return res.status(400).json({ error: `${p.rotulo} passa de ${p.max} caracteres.` });
    dados[p.campo] = v;
  }
  dados.nomeDiscord = String(s.user.nome || s.user.id).slice(0, 40);
  if (!/^[A-Za-z0-9_]{3,20}$/.test(dados.roblox)) {
    return res.status(400).json({ error: 'Nick no Roblox inválido. Use de 3 a 20 letras, números ou underline.' });
  }
  if (!/^\d{1,3}$/.test(dados.idade)) return res.status(400).json({ error: 'Idade inválida.' });
  const lista = lerCandidaturas(gid);
  if (lista.some(c => c.userId === s.user.id && c.status === 'pendente')) {
    return res.status(409).json({ error: 'Você já tem uma candidatura pendente.' });
  }
  const c = {
    id: crypto.randomUUID(),
    userId: s.user.id,
    usuario: s.user.nome || s.user.username || s.user.id,
    ...dados,
    status: 'pendente',
    criadaEm: new Date().toISOString(),
    historico: [{ quando: new Date().toISOString(), acao: 'enviada' }],
  };
  lista.push(c);
  salvarCandidaturas(gid, lista);
  postarFichaNoCanal(gid, c).then(() => salvarCandidaturas(gid, lista)).catch(e => console.error('Ficha no canal:', e.message));
  res.json({ ok: true });
});

app.get('/api/guilds/:id/recrutamento/permissao', async (req, res) => {
  const s = sessaoAtual(req);
  const guild = client.guilds.cache.get(req.params.id);
  if (!s || !guild) return res.json({ ok: false });
  res.json({ ok: await podeAvaliar(s, guild), publico: lerConfig()._recrutamentoPublico === guild.id });
});

app.get('/api/guilds/:id/recrutamento/candidaturas', async (req, res) => {
  const a = await autorizarRecrutamento(req, res);
  if (!a) return;
  const q = String(req.query.q || '').toLowerCase();
  const status = String(req.query.status || 'todos');
  const lista = lerCandidaturas(a.guild.id)
    .filter(c => status === 'todos' || c.status === status)
    .filter(c => !q || [c.usuario, c.nome, c.nomeDiscord, c.roblox].some(v => String(v || '').toLowerCase().includes(q)))
    .map(({ historico, ...resto }) => resto)
    .sort((x, y) => (x.criadaEm < y.criadaEm ? 1 : -1));
  res.json({ candidaturas: lista });
});

app.get('/api/guilds/:id/recrutamento/candidaturas/:cid', async (req, res) => {
  const a = await autorizarRecrutamento(req, res);
  if (!a) return;
  const c = lerCandidaturas(a.guild.id).find(x => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'Candidatura não encontrada.' });
  res.json({ candidatura: c });
});

app.post('/api/guilds/:id/recrutamento/candidaturas/:cid/decisao', async (req, res) => {
  const a = await autorizarRecrutamento(req, res);
  if (!a) return;
  const acao = req.body?.acao;
  if (!['aprovar', 'recusar'].includes(acao)) return res.status(400).json({ error: 'Ação inválida.' });
  const lista = lerCandidaturas(a.guild.id);
  const c = lista.find(x => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'Candidatura não encontrada.' });
  if (c.status !== 'pendente') return res.status(409).json({ error: 'Esta candidatura já foi decidida.' });
  try {
    const avisos = await executarDecisao(a.guild, c, acao, a.s.user.id);
    salvarCandidaturas(a.guild.id, lista);
    await atualizarMensagemCanal(a.guild, c);
    res.json({ ok: true, status: c.status, avisos });
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
});

// Painel: lista e apagar (só administradores do servidor)
app.get('/api/guilds/:id/aniversarios', (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  const lista = lerAniversarios(guild.id).slice().sort((x, y) => (x.mes - y.mes) || (x.dia - y.dia));
  res.json({ aniversarios: lista });
});
app.delete('/api/guilds/:id/aniversarios/:uid', (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  const lista = lerAniversarios(guild.id);
  const nova = lista.filter(a => a.userId !== req.params.uid);
  if (nova.length === lista.length) return res.status(404).json({ error: 'Cadastro não encontrado.' });
  salvarAniversarios(guild.id, nova);
  res.json({ ok: true });
});


app.get('/api/guilds/:id/autocargos', (req, res) => {
  const g = autorizar(req, res);
  if (!g) return;
  res.json({ paineis: lerPaineis(g.id) });
});

app.post('/api/guilds/:id/autocargos', (req, res) => {
  const g = autorizar(req, res);
  if (!g) return;
  const { erros, valor } = validarPainel(req.body || {});
  if (erros.length) return res.status(400).json({ error: erros.join(' ') });
  const lista = lerPaineis(g.id);
  const id = String(req.body.id || '');
  const existente = id ? lista.find(p => p.id === id) : null;
  const painel = {
    id: existente?.id || crypto.randomUUID(),
    ...valor,
    mensagemId: existente?.mensagemId || null,
    canalPublicadoId: existente?.canalPublicadoId || null,
  };
  const avisos = [];
  const me = g.members.me;
  for (const o of painel.opcoes) {
    const r = g.roles.cache.get(o.cargoId);
    if (!r) avisos.push(`O cargo da opção "${o.nome}" não existe mais.`);
    else if (me && r.position >= me.roles.highest.position) avisos.push(`O bot precisa estar acima do cargo "${r.name}" na lista de cargos.`);
  }
  const idx = lista.findIndex(p => p.id === painel.id);
  if (idx >= 0) lista[idx] = painel; else lista.push(painel);
  salvarPaineis(g.id, lista);
  res.json({ ok: true, painel, avisos });
});

app.post('/api/guilds/:id/autocargos/:pid/publicar', async (req, res) => {
  const g = autorizar(req, res);
  if (!g) return;
  const lista = lerPaineis(g.id);
  const p = lista.find(x => x.id === req.params.pid);
  if (!p) return res.status(404).json({ error: 'Painel não encontrado.' });
  if (!p.opcoes.some(o => o.ativa)) return res.status(400).json({ error: 'Ative pelo menos uma opção antes de publicar.' });
  const canal = await g.channels.fetch(p.canalId).catch(() => null);
  if (!canal || !canal.isTextBased()) return res.status(400).json({ error: 'O bot não encontrou o canal. Confira o ID e as permissões dele nesse canal.' });
  try {
    const payload = montarPainelDiscord(p);
    let msg = null;
    if (p.mensagemId && p.canalPublicadoId === canal.id) msg = await canal.messages.fetch(p.mensagemId).catch(() => null);
    const novo = !msg;
    if (msg) await msg.edit(payload);
    else msg = await canal.send(payload);
    p.mensagemId = msg.id;
    p.canalPublicadoId = canal.id;
    salvarPaineis(g.id, lista);
    res.json({ ok: true, mensagem: novo ? 'Painel publicado no canal.' : 'Painel atualizado no canal.' });
  } catch (e) {
    res.status(400).json({ error: 'Não consegui publicar: ' + e.message });
  }
});

app.delete('/api/guilds/:id/autocargos/:pid', async (req, res) => {
  const g = autorizar(req, res);
  if (!g) return;
  const lista = lerPaineis(g.id);
  const p = lista.find(x => x.id === req.params.pid);
  if (!p) return res.status(404).json({ error: 'Painel não encontrado.' });
  if (p.mensagemId && p.canalPublicadoId) {
    const canal = await g.channels.fetch(p.canalPublicadoId).catch(() => null);
    if (canal) await canal.messages.delete(p.mensagemId).catch(() => {});
  }
  salvarPaineis(g.id, lista.filter(x => x.id !== p.id));
  res.json({ ok: true });
});



app.post('/api/guilds/:id/games/preparar', async (req, res) => {
  const g = autorizar(req, res);
  if (!g) return;
  try {
    const r = await prepararGames(g);
    const cfg = lerConfig();
    cfg[g.id] = cfg[g.id] || {};
    const anterior = cfg[g.id].games || { ativa: false, campos: {} };
    cfg[g.id].games = {
      ativa: anterior.ativa,
      campos: {
        ...anterior.campos,
        categoriaId: r.categoriaId,
        canalXadrezId: r.canais.xadrez,
        canalDamaId: r.canais.dama,
        canalCacaId: r.canais.caca,
        canalMatematicaId: r.canais.matematica,
        canalResultadosId: r.canais.resultados,
      },
    };
    salvarConfig(cfg);
    res.json({ ok: true, criados: r.criados });
  } catch (e) {
    res.status(400).json({ error: 'Não consegui criar os canais: ' + e.message + '. Confira se o bot tem a permissão Gerenciar canais.' });
  }
});

app.get('/api/guilds/:id/ranking', (req, res) => {
  const g = autorizar(req, res);
  if (!g) return;
  res.json({ ranking: lerRanking(g.id) });
});

async function mostrarRanking(i) {
  const r = lerRanking(i.guild.id);
  const lista = Object.entries(r).sort((a, b) => b[1].pontos - a[1].pontos).slice(0, 10);
  if (!lista.length) return i.reply({ content: 'Ainda não há partidas registradas neste servidor.' });
  const medalhas = ['🥇', '🥈', '🥉'];
  const linhas = lista.map(([, u], idx) => `${medalhas[idx] || `${idx + 1}.`} ${u.nome} — ${u.pontos} pts (V ${u.vitorias} · D ${u.derrotas} · E ${u.empates})`);
  const embed = new EmbedBuilder().setColor(0x22c55e).setTitle('🏆 RANKING GERAL').setDescription(linhas.join('\n'));
  return i.reply({ embeds: [embed] });
}

app.post('/api/guilds/:id/recrutamento/usar-no-link', (req, res) => {
  const g = autorizar(req, res);
  if (!g) return;
  const cfg = lerConfig();
  if (!cfg[g.id]?.recrutamento?.ativa) return res.status(400).json({ error: 'Ative o Recrutamento neste servidor antes de usá-lo no link.' });
  cfg._recrutamentoPublico = g.id;
  salvarConfig(cfg);
  res.json({ ok: true, nome: g.name });
});

app.listen(PORT, () => console.log(`Painel em http://localhost:${PORT}`));

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, ChannelType, EmbedBuilder } = require('discord.js');

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
  { chave: 'ticket', nome: 'Ticket', implementada: false },
  { chave: 'moderacao', nome: 'Moderação', implementada: false },
  { chave: 'boasvindas', nome: 'Boas-vindas', implementada: true },
];

// Campos aceitos por função. Qualquer outro campo é ignorado.
const CAMPOS = {
  boasvindas: { canalId: 'id', mensagem: 'texto', embed: 'bool', cargoId: 'id', dm: 'bool', mensagemDm: 'texto' },
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

client.on('guildMemberAdd', async member => {
  const cfg = configDaFuncao(member.guild.id, 'boasvindas');
  if (!cfg.ativa) return;
  const c = cfg.campos || {};
  const modelo = c.mensagem || 'Bem-vindo(a), {membro}!';
  const texto = modelo.replaceAll('{membro}', `<@${member.id}>`);

  if (c.canalId) {
    const canal = member.guild.channels.cache.get(c.canalId);
    if (canal && canal.isTextBased()) {
      const payload = c.embed
        ? {
            embeds: [new EmbedBuilder()
              .setTitle('👋 Seja bem-vindo(a)!')
              .setDescription(texto)
              .setThumbnail(member.displayAvatarURL({ size: 128 }))
              .setFooter({ text: `Membro #${member.guild.memberCount}` })
              .setColor(0x3970ac)],
            allowedMentions: { users: [member.id] },
          }
        : { content: texto, allowedMentions: { users: [member.id] } };
      await canal.send(payload).catch(e => console.error('Boas-vindas:', e.message));
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
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true, bot: client.isReady() }));

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
      guilds: guilds.map(g => ({ id: g.id, nome: g.name, permissoes: g.permissions })),
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
    } else if (tipo === 'id') {
      if (!/^\d{17,20}$/.test(String(v))) return { ok: false, erro: `ID inválido em ${nome}.` };
      valor[nome] = String(v);
    } else {
      const t = String(v).trim();
      if (t.length > LIMITE_TEXTO) return { ok: false, erro: `${nome} passa de ${LIMITE_TEXTO} caracteres.` };
      valor[nome] = t;
    }
  }
  return { ok: true, valor };
}

app.put('/api/guilds/:id/funcoes/:chave', (req, res) => {
  const guild = autorizar(req, res);
  if (!guild) return;
  const { chave } = req.params;
  if (!FUNCOES.some(f => f.chave === chave)) return res.status(404).json({ error: 'Função não existe.' });
  const v = validarCampos(chave, req.body?.campos);
  if (!v.ok) return res.status(400).json({ error: v.erro });
  const ativa = !!req.body?.ativa;
  const fn = FUNCOES.find(f => f.chave === chave);
  if (ativa && !fn.implementada) {
    return res.status(400).json({ error: 'Esta função ainda não tem comportamento no bot.' });
  }
  const cfg = lerConfig();
  cfg[guild.id] = cfg[guild.id] || {};
  cfg[guild.id][chave] = { ativa, campos: v.valor };
  try { salvarConfig(cfg); } catch (e) { return res.status(500).json({ error: 'Não consegui salvar.' }); }
  res.json({ ok: true, configuracao: cfg[guild.id][chave] });
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
    await canal.send({ content: texto, allowedMentions: { users: [sessao.user.id] } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Não consegui enviar. Confira as permissões do bot nesse canal.' });
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

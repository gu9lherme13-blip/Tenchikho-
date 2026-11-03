require("dotenv").config();
const express = require("express");
const path = require("node:path");
const crypto = require("node:crypto");
const { Client, GatewayIntentBits, PermissionsBitField, ChannelType } = require("discord.js");
const store = require("./store");
const U = require("./central-utils");
const { instalarArquivosPublicos } = require("./static-files");
const F = require("./funcoes");

for (const k of ["DISCORD_TOKEN", "CLIENT_ID", "DISCORD_CLIENT_SECRET", "HASH_SECRET", "PUBLIC_URL"]) {
  if (!process.env[k]) { console.error(`Defina ${k} no .env antes de iniciar.`); process.exit(1); }
}

const PUBLIC_URL = process.env.PUBLIC_URL.replace(/\/+$/, "");
const REDIRECT_URI = `${PUBLIC_URL}/auth/callback`;
const DISCORD_API = "https://discord.com/api/v10";
const COOKIE_SESSAO = "tch_sid";
const COOKIE_ESTADO = "tch_state";
const SESSAO_SEG = 12 * 60 * 60;
const PERMS_CANAL = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ReadMessageHistory
];

const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
const configServidor = F.criarConfigServidor(DATA_DIR);

const sessoes = new Map(); // token -> { user, guilds, expiraEm }
const estados = new Map(); // state OAuth -> expiraEm

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" });
  next();
});
app.use(express.json({ limit: "100kb" }));
instalarArquivosPublicos(app, __dirname);

app.get("/", (req, res) => {
  res.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
  res.sendFile(path.join(__dirname, "index.html"), { dotfiles: "deny" });
});
app.get("/health", (req, res) => res.json({ ok: true }));

const cookie = (nome, valor, maxAge) => `${nome}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function sessaoAtual(req) {
  const token = U.parseCookies(req.headers.cookie)[COOKIE_SESSAO];
  const s = token ? sessoes.get(token) : null;
  if (!s) return null;
  if (s.expiraEm < Date.now()) { sessoes.delete(token); return null; }
  return s;
}

// ---------- Login com Discord (OAuth2) ----------
app.get("/auth/login", (req, res) => {
  const state = crypto.randomBytes(24).toString("base64url");
  estados.set(state, Date.now() + 10 * 60 * 1000);
  res.append("Set-Cookie", cookie(COOKIE_ESTADO, state, 600));
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds",
    state
  }).toString();
  res.redirect(url.toString());
});

app.get("/auth/callback", asyncRoute(async (req, res) => {
  const { code, state } = req.query;
  const esperado = U.parseCookies(req.headers.cookie)[COOKIE_ESTADO];
  res.append("Set-Cookie", cookie(COOKIE_ESTADO, "", 0));
  const valido = typeof state === "string" && esperado === state && (estados.get(state) || 0) > Date.now();
  if (typeof state === "string") estados.delete(state);
  if (!valido || typeof code !== "string") return res.status(400).send("Login inválido ou expirado. Tente entrar de novo.");

  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI
    })
  });
  if (!tokenRes.ok) return res.status(502).send("Não foi possível concluir o login com o Discord.");
  const { access_token } = await tokenRes.json();
  const auth = { Authorization: `Bearer ${access_token}` };
  const [uRes, gRes] = await Promise.all([
    fetch(`${DISCORD_API}/users/@me`, { headers: auth }),
    fetch(`${DISCORD_API}/users/@me/guilds`, { headers: auth })
  ]);
  if (!uRes.ok || !gRes.ok) return res.status(502).send("Não foi possível ler sua conta do Discord.");
  const user = await uRes.json();
  const guilds = (await gRes.json())
    .filter(g => U.podeGerenciar(g.permissions))
    .map(g => ({ id: g.id, name: g.name }));

  // O token do Discord não é guardado: só a sessão do site, com validade limitada.
  const token = crypto.randomBytes(32).toString("base64url");
  sessoes.set(token, {
    user: { id: user.id, name: user.global_name || user.username },
    guilds,
    expiraEm: Date.now() + SESSAO_SEG * 1000
  });
  res.append("Set-Cookie", cookie(COOKIE_SESSAO, token, SESSAO_SEG));
  res.redirect("/");
}));

app.post("/auth/logout", (req, res) => {
  const token = U.parseCookies(req.headers.cookie)[COOKIE_SESSAO];
  if (token) sessoes.delete(token);
  res.append("Set-Cookie", cookie(COOKIE_SESSAO, "", 0));
  res.json({ ok: true });
});

// ---------- API protegida por sessão ----------
const api = express.Router();
api.use((req, res, next) => {
  const s = sessaoAtual(req);
  if (!s) return res.status(401).json({ error: "Faça login com o Discord." });
  req.sessao = s;
  next();
});

const staffDoServidor = (req, guildId) => req.sessao.guilds.some(g => g.id === String(guildId));
const SEM_PERMISSAO = { error: "Você não tem permissão de staff neste servidor." };

function encerrar(id, motivo) {
  const state = store.read();
  const i = state.calls.findIndex(c => c.id === id);
  if (i < 0) return null;
  const [call] = state.calls.splice(i, 1);
  call.status = "closed";
  call.closedAt = new Date().toISOString();
  call.closeReason = motivo;
  state.history.unshift(call);
  store.write(state);
  return call;
}

async function canalPermitido(guildId, channelId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { erro: "O bot não está neste servidor.", status: 404 };
  const canal = await guild.channels.fetch(channelId).catch(() => null);
  if (!canal || canal.guildId !== guild.id || canal.type !== ChannelType.GuildText) {
    return { erro: "Canal de texto não encontrado neste servidor.", status: 400 };
  }
  const me = guild.members.me;
  if (!me || !canal.permissionsFor(me)?.has(PERMS_CANAL)) {
    return { erro: "O bot precisa de Ver canal, Enviar mensagens e Ler histórico neste canal.", status: 403 };
  }
  return { canal };
}

api.get("/me", (req, res) => {
  res.json({
    user: req.sessao.user,
    guilds: req.sessao.guilds.map(g => ({ id: g.id, name: g.name, botPresente: client.guilds.cache.has(g.id) }))
  });
});

api.get("/guilds/:guildId/channels", asyncRoute(async (req, res) => {
  const gid = req.params.guildId;
  if (!staffDoServidor(req, gid)) return res.status(403).json(SEM_PERMISSAO);
  const guild = client.guilds.cache.get(gid);
  if (!guild) return res.status(404).json({ error: "O bot não está neste servidor." });
  const me = guild.members.me;
  const canais = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText && me && c.permissionsFor(me)?.has(PERMS_CANAL))
    .map(c => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ canais });
}));

api.get("/guilds/:guildId/calls", (req, res) => {
  const gid = req.params.guildId;
  if (!staffDoServidor(req, gid)) return res.status(403).json(SEM_PERMISSAO);
  const s = store.read();
  res.json({
    abertas: s.calls.filter(c => c.guildId === gid).map(c => U.publicCall(c)),
    historico: s.history.filter(c => c.guildId === gid).slice(0, 100).map(c => U.publicCall(c))
  });
});

api.get("/calls/:id", (req, res) => {
  const s = store.read();
  const call = [...s.calls, ...s.history].find(c => c.id === req.params.id);
  if (!call || !staffDoServidor(req, call.guildId)) return res.status(404).json({ error: "Chamada não encontrada." });
  res.json({ chamada: U.publicCall(call) });
});

api.post("/calls", asyncRoute(async (req, res) => {
  const v = U.validarChamada(req.body);
  if (!v.ok) return res.status(400).json({ error: v.erros.join(" ") });
  const { title, notice, durationMinutes, guildId, channelId } = v.valor;
  if (!staffDoServidor(req, guildId)) return res.status(403).json(SEM_PERMISSAO);
  if (!configServidor.funcao(guildId, "chamada").enabled) {
    return res.status(403).json({ error: "A Central de Chamadas está desligada neste servidor. Ative-a no painel de funções." });
  }

  const checagem = await canalPermitido(guildId, channelId);
  if (checagem.erro) return res.status(checagem.status).json({ error: checagem.erro });
  if (store.read().calls.some(c => c.channelId === channelId)) {
    return res.status(409).json({ error: "Já existe uma chamada aberta neste canal." });
  }

  const agora = Date.now();
  const call = {
    id: `${agora}-${crypto.randomBytes(4).toString("hex")}`,
    title, guildId, channelId,
    channelName: checagem.canal.name,
    status: "open",
    createdAt: new Date(agora).toISOString(),
    closesAt: new Date(agora + durationMinutes * 60000).toISOString(),
    members: []
  };
  const texto = [
    `📢 **${title}**`,
    notice || configServidor.funcao(guildId, "chamada").avisoPadrao || "",
    "Para confirmar presença, envie qualquer mensagem neste canal.",
    `⏳ Prazo: ${durationMinutes} minuto(s).`
  ].filter(Boolean).join("\n");
  try {
    await checagem.canal.send({ content: texto, allowedMentions: { parse: [] } });
  } catch (err) {
    console.error("Envio aviso:", err.message);
    return res.status(502).json({ error: "Não consegui publicar o aviso no Discord. Verifique as permissões do bot." });
  }
  const state = store.read();
  state.calls.unshift(call);
  store.write(state);
  res.status(201).json({ chamada: U.publicCall(call) });
}));

api.post("/calls/:id/close", (req, res) => {
  const call = store.read().calls.find(c => c.id === req.params.id);
  if (!call) return res.status(404).json({ error: "Chamada aberta não encontrada." });
  if (!staffDoServidor(req, call.guildId)) return res.status(403).json(SEM_PERMISSAO);
  const enc = encerrar(call.id, "Encerrada pela staff");
  res.json({ chamada: U.publicCall(enc) });
});

// ---------- Painel de funções (status real + configuração por servidor) ----------
function botNoServidor(gid) {
  return client.guilds.cache.has(gid);
}

api.get("/guilds/:guildId/functions", (req, res) => {
  const gid = req.params.guildId;
  if (!staffDoServidor(req, gid)) return res.status(403).json(SEM_PERMISSAO);
  if (!F.GUILD_ID_RE.test(gid)) return res.status(400).json({ error: "Servidor inválido." });
  try {
    res.json({ funcoes: F.listarFuncoes(configServidor, gid, botNoServidor(gid)) });
  } catch (err) {
    console.error("Funções:", err.message);
    res.status(500).json({ error: err.message });
  }
});

function alternarFuncao(req, res, ativar) {
  const gid = req.params.guildId;
  const chave = req.params.chave;
  if (!staffDoServidor(req, gid)) return res.status(403).json(SEM_PERMISSAO);
  const f = F.porChave(chave);
  if (!f) return res.status(404).json({ error: "Função não encontrada." });
  if (!f.implementada) return res.status(409).json({ error: f.motivo });
  if (ativar && !botNoServidor(gid)) return res.status(409).json({ error: "O bot precisa estar neste servidor para ativar esta função." });
  try {
    const cfg = configServidor.definirAtivo(gid, chave, ativar);
    let encerradas = 0;
    if (!ativar && chave === "chamada") {
      // Desligar para de verdade: as chamadas abertas deste servidor são encerradas agora.
      for (const c of store.read().calls.filter(c => c.guildId === gid)) {
        if (encerrar(c.id, "Central desligada pela staff")) encerradas++;
      }
    }
    res.json({ chave, enabled: cfg.enabled, chamadasEncerradas: encerradas });
  } catch (err) {
    console.error("Ativar função:", err.message);
    res.status(500).json({ error: "Não foi possível salvar a alteração." });
  }
}
api.post("/guilds/:guildId/functions/:chave/ativar", (req, res) => alternarFuncao(req, res, true));
api.post("/guilds/:guildId/functions/:chave/desligar", (req, res) => alternarFuncao(req, res, false));

api.put("/guilds/:guildId/functions/:chave/config", (req, res) => {
  const gid = req.params.guildId;
  const chave = req.params.chave;
  if (!staffDoServidor(req, gid)) return res.status(403).json(SEM_PERMISSAO);
  const f = F.porChave(chave);
  if (!f) return res.status(404).json({ error: "Função não encontrada." });
  if (!f.implementada) return res.status(409).json({ error: f.motivo });
  const v = F.validarConfig(chave, req.body);
  if (!v.ok) return res.status(400).json({ error: v.erros.join(" ") });
  try {
    const cfg = configServidor.salvarConfig(gid, chave, v.valor);
    res.json({ chave, config: F.listarFuncoes(configServidor, gid, botNoServidor(gid)).find(x => x.chave === chave).config, enabled: cfg.enabled });
  } catch (err) {
    console.error("Salvar config:", err.message);
    res.status(500).json({ error: "Não foi possível salvar a configuração." });
  }
});

app.use("/api", api);

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Requisição inválida." });
  console.error("Erro:", err.message);
  res.status(500).json({ error: "Erro interno." });
});

// ---------- Presença: qualquer mensagem de membro na janela da chamada ----------
client.on("messageCreate", message => {
  try {
    if (!message.guild || message.author.bot) return;
    const agora = Date.now();
    const state = store.read();
    const call = state.calls.find(c =>
      c.status === "open" && c.guildId === message.guildId &&
      c.channelId === message.channelId && Date.parse(c.closesAt) > agora);
    if (!call) return;
    if (!configServidor.funcao(message.guildId, "chamada").enabled) return;
    // O conteúdo da mensagem nunca é lido nem gravado.
    const hash = U.memberHash(message.author.id, process.env.HASH_SECRET);
    const nome = message.member?.displayName || message.author.globalName || message.author.username;
    if (U.addMember(call, hash, nome, new Date(agora).toISOString())) store.write(state);
  } catch (err) {
    console.error("Presença:", err.message);
  }
});

// Encerramento automático pelo prazo e limpeza de sessões vencidas.
setInterval(() => {
  try {
    const agora = Date.now();
    for (const c of store.read().calls) {
      if (Date.parse(c.closesAt) <= agora) encerrar(c.id, "Prazo encerrado");
    }
  } catch (err) {
    console.error("Encerramento automático:", err.message);
  }
  const agora = Date.now();
  for (const [t, s] of sessoes) if (s.expiraEm < agora) sessoes.delete(t);
  for (const [st, exp] of estados) if (exp < agora) estados.delete(st);
}, 15000).unref?.();

client.once("ready", () => console.log(`Tenchikho conectado como ${client.user.tag}`));
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error("Falha ao conectar no Discord:", err.message);
  process.exit(1);
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`Central de Chamadas em http://localhost:${PORT}`));

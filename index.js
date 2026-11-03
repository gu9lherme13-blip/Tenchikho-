require("dotenv").config();
const express = require("express");
const path = require("node:path");
const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
const store = require("./store");

if (!process.env.DISCORD_TOKEN) {
  console.error("Defina DISCORD_TOKEN no .env antes de iniciar.");
  process.exit(1);
}
if (!process.env.PANEL_API_KEY) {
  console.error("Defina PANEL_API_KEY no .env antes de iniciar.");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Proteção provisória por chave. Em produção, substitua por validação da sessão OAuth2
// e verificação do cargo/permissão de staff no servidor Discord.
app.use("/api", (req, res, next) => {
  if (req.get("x-panel-key") !== process.env.PANEL_API_KEY) {
    return res.status(401).json({ error: "Acesso não autorizado." });
  }
  next();
});

function getState() { return store.read(); }
function saveState(state) { store.write(state); }
function activeCallFor(channelId) {
  return getState().calls.find(c => c.status === "open" && c.channelId === channelId);
}
function closeCall(callId, reason = "Encerrada pela staff") {
  const state = getState();
  const idx = state.calls.findIndex(c => c.id === callId && c.status === "open");
  if (idx < 0) return null;
  const [call] = state.calls.splice(idx, 1);
  call.status = "closed";
  call.closedAt = new Date().toISOString();
  call.closeReason = reason;
  state.history.unshift(call);
  saveState(state);
  return call;
}

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;
  const call = activeCallFor(message.channelId);
  if (!call) return;
  const memberName = message.member?.displayName || message.author.globalName || message.author.username;
  if (!call.members.some(m => m.userId === message.author.id)) {
    call.members.push({ userId: message.author.id, name: memberName });
    const state = getState();
    const i = state.calls.findIndex(c => c.id === call.id);
    if (i >= 0) {
      state.calls[i] = call;
      saveState(state);
    }
  }
});

client.once("ready", () => console.log(`Tenchikho conectado como ${client.user.tag}`));

app.get("/api/status", (req, res) => {
  const s = getState();
  res.json({
    bot: client.isReady(),
    open: s.calls,
    history: s.history.slice(0, 100),
    guilds: client.guilds.cache.map(g => ({ id: g.id, name: g.name })),
    channels: client.channels.cache.filter(c => c.isTextBased() && c.guildId)
      .map(c => ({ id: c.id, name: c.name, guildId: c.guildId }))
  });
});

app.post("/api/calls", async (req, res) => {
  const { title, channelId, durationMinutes, notice } = req.body || {};
  if (!title || !channelId || !Number.isInteger(Number(durationMinutes)) ||
      Number(durationMinutes) < 1 || Number(durationMinutes) > 10080) {
    return res.status(400).json({ error: "Informe título, canal e duração entre 1 minuto e 7 dias." });
  }
  const channel = await client.channels.fetch(String(channelId)).catch(() => null);
  if (!channel || !channel.isTextBased() || !channel.guild) {
    return res.status(400).json({ error: "Canal de texto não encontrado." });
  }
  const me = channel.guild.members.me;
  if (!me || !channel.permissionsFor(me)?.has([
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ReadMessageHistory
  ])) {
    return res.status(403).json({ error: "O bot precisa de Ver canal, Enviar mensagens e Ler histórico." });
  }
  const now = Date.now();
  const call = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: String(title).slice(0, 100),
    channelId: String(channelId),
    guildId: channel.guildId,
    status: "open",
    createdAt: new Date(now).toISOString(),
    closesAt: new Date(now + Number(durationMinutes) * 60000).toISOString(),
    members: []
  };
  const state = getState();
  state.calls.unshift(call);
  saveState(state);
  await channel.send({
    content: `📢 **${call.title}**\n${notice ? String(notice).slice(0, 1500) + "\n" : ""}Para confirmar presença, envie qualquer mensagem neste canal.\n⏳ Prazo: ${Number(durationMinutes)} minuto(s).`
  });
  setTimeout(() => closeCall(call.id, "Prazo encerrado"), Number(durationMinutes) * 60000).unref?.();
  res.status(201).json({ call });
});

app.post("/api/calls/:id/close", (req, res) => {
  const call = closeCall(req.params.id);
  if (!call) return res.status(404).json({ error: "Chamada aberta não encontrada." });
  res.json({ call });
});

app.get("/api/calls/:id", (req, res) => {
  const s = getState();
  const call = [...s.calls, ...s.history].find(c => c.id === req.params.id);
  if (!call) return res.status(404).json({ error: "Chamada não encontrada." });
  res.json({ call });
});

// Recupera encerramentos vencidos após reinício do processo.
setInterval(() => {
  const s = getState();
  const now = Date.now();
  for (const c of s.calls) {
    if (c.status === "open" && Date.parse(c.closesAt) <= now) closeCall(c.id, "Prazo encerrado");
  }
}, 15000).unref?.();

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Painel disponível na porta ${port}`));
client.login(process.env.DISCORD_TOKEN);
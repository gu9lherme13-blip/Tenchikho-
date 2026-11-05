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

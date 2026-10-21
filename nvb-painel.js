'use strict';
// =========================================================
// 🦇 NVB PAINEL — telas (Início do painel, Servidores, Funções/auto cargos, Menu)
// Painel do Tenchiko Bloodline (projeto independente).
// As funções de desenho em HTML são puras (testáveis); a parte com DOM só roda no navegador.
// =========================================================
(function (root) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const R = {};

  // ---------- HTML puro ----------
  R.icone = g => g.icone ? `<img class="pv-gi" src="${esc(g.icone)}" alt="">` : `<span class="pv-gi ph">${esc(String(g.nome || '?').slice(0, 1).toUpperCase())}</span>`;
  R.precisaLogin = (loginOk) => `<div class="card pv-hero"><div class="icon">🦇</div><h2>Entre com o Discord</h2><p>Use sua conta do Discord para gerenciar os servidores onde você tem a permissão <b>Gerenciar servidor</b> e criar painéis de auto cargos.</p>${loginOk === false ? '<div class="notice">⚠️ O login com Discord ainda não foi configurado pelo dono do site (falta o Client Secret no Render).</div>' : '<a class="btn primary" href="/auth/discord">🔐 Entrar com Discord</a>'}</div>`;
  R.servidores = (guilds, selecionado) => !guilds.length ? '<div class="card"><p>Nenhum servidor encontrado. Você precisa ter a permissão <b>Gerenciar servidor</b>.</p></div>' :
    `<div class="pv-list">${guilds.map(g => `<div class="card pv-server${g.id === selecionado ? ' on' : ''}">${R.icone(g)}<div class="pv-server-i"><b>${esc(g.nome)}</b><small>${g.botPresente ? '<span class="pv-dot on"></span> Bot no servidor' : '<span class="pv-dot"></span> Bot não está aqui'}</small></div>${g.botPresente ? `<button class="btn ${g.id === selecionado ? 'green' : 'primary'}" data-pv="selecionar" data-id="${esc(g.id)}">${g.id === selecionado ? '✔ Selecionado' : 'Gerenciar'}</button>` : `<a class="btn blue" target="_blank" rel="noopener" href="${esc(g.conviteUrl)}">Convidar bot</a>`}</div>`).join('')}</div>`;
  R.visao = (info, bot) => `<div class="card pv-hero"><div class="pv-row">${R.icone(info)}<div><h2 style="margin:0">${esc(info.nome)}</h2><small class="muted"><span class="pv-dot ${bot && bot.online ? 'on' : ''}"></span> ${bot && bot.online ? 'Bot online' : 'Bot offline'}</small></div></div></div>
    <div class="pv-stats"><div class="card pv-stat"><b>${Number(info.membros || 0).toLocaleString('pt-BR')}</b><small>membros</small></div><div class="card pv-stat"><b>${Number(info.paineis || 0)}</b><small>painéis de cargos</small></div><div class="card pv-stat"><b>${info.cargos.length}</b><small>cargos disponíveis</small></div></div>
    ${info.botPodeGerenciarCargos ? '' : '<div class="notice">⚠️ O bot não tem a permissão <b>Gerenciar cargos</b> neste servidor. Sem ela, os painéis não conseguem dar cargos.</div>'}
    <div class="card"><h3>Funções</h3><p>Crie menus de cargos que os membros usam direto no Discord.</p><button class="btn primary" data-pv="ir" data-tela="roles">Abrir Funções</button></div>`;
  R.cartaoPainel = (p, canais) => { const c = (canais || []).find(x => x.id === p.canalId); return `<div class="card pv-panel"><div class="pv-panel-h"><b>${esc(p.titulo)}</b><span class="pill">${p.modo === 'single' ? 'Seleção única' : 'Seleção múltipla'}</span></div><small class="muted">${p.cargos.length} cargo(s) • ${c ? '#' + esc(c.nome) : 'canal indisponível'}</small><div class="pv-chips">${p.cargos.slice(0, 6).map(r => `<span class="pv-chip">${esc(r.emoji || '')} ${esc(r.rotulo)}</span>`).join('')}${p.cargos.length > 6 ? `<span class="pv-chip">+${p.cargos.length - 6}</span>` : ''}</div><div class="pv-actions"><button class="btn" data-pv="editar" data-id="${esc(p.id)}">✏️ Editar</button><button class="btn danger" data-pv="apagar" data-id="${esc(p.id)}">🗑️ Apagar</button></div></div>`; };
  R.funcoes = (guild, paineis, info) => `<div class="pv-bar"><div><h2 style="margin:0">Auto cargos</h2><small class="muted">${esc(guild ? guild.nome : '')}</small></div><button class="btn primary" data-pv="novo">＋ Criar painel</button></div>
    <p class="muted">Cada painel publica uma mensagem com um menu em um canal do Discord, para os membros escolherem cargos.</p>
    ${paineis.length ? paineis.map(p => R.cartaoPainel(p, info.canais)).join('') : '<div class="card"><p>Nenhum painel ainda. Toque em <b>Criar painel</b>.</p></div>'}`;
  R.editor = (info, p) => {
    const sel = new Map((p ? p.cargos : []).map(c => [c.roleId, c]));
    return `<div class="pv-modal-b"><div class="pv-modal-c"><h3>${p ? 'Editar painel' : 'Novo painel de cargos'}</h3>
      <label class="label">Título<input class="input" id="pvTitulo" maxlength="100" value="${esc(p ? p.titulo : 'Escolha seus cargos')}"></label>
      <label class="label">Descrição<textarea class="input" id="pvDesc" rows="3" maxlength="1000">${esc(p ? p.descricao : '')}</textarea></label>
      <label class="label">Canal<select class="input" id="pvCanal">${info.canais.map(c => `<option value="${esc(c.id)}"${p && p.canalId === c.id ? ' selected' : ''}>#${esc(c.nome)}</option>`).join('')}</select></label>
      <label class="label">Modo<select class="input" id="pvModo"><option value="single"${!p || p.modo === 'single' ? ' selected' : ''}>Seleção única (um cargo por vez)</option><option value="multi"${p && p.modo === 'multi' ? ' selected' : ''}>Seleção múltipla</option></select></label>
      <label class="label">Cor da mensagem<input type="color" id="pvCor" value="${esc(p ? p.cor : '#8b5cf6')}"></label>
      <div class="label">Cargos do painel (até 25)</div>
      ${info.cargos.length ? `<div class="pv-roles">${info.cargos.map(r => { const c = sel.get(r.id); return `<div class="pv-role" data-role="${esc(r.id)}"><label class="pv-check"><input type="checkbox"${c ? ' checked' : ''}> <span class="pv-swatch" style="background:${esc(r.cor)}"></span> ${esc(r.nome)}</label><div class="pv-role-f"><input class="input" placeholder="Nome no menu" maxlength="100" value="${esc(c ? c.rotulo : '')}" data-f="rotulo"><input class="input" placeholder="Emoji" maxlength="40" value="${esc(c ? c.emoji : '')}" data-f="emoji"><input class="input" placeholder="Descrição curta" maxlength="100" value="${esc(c ? c.descricao : '')}" data-f="descricao"></div></div>`; }).join('')}</div>` : '<div class="notice">Nenhum cargo disponível. O cargo do bot precisa ficar <b>acima</b> dos cargos que você quer usar, e cargos com permissões de administração não podem entrar em painel.</div>'}
      <div class="pv-actions"><button class="btn" data-pv="fechar">Cancelar</button><button class="btn primary" data-pv="salvar" data-id="${esc(p ? p.id : '')}">${p ? 'Salvar e atualizar mensagem' : 'Publicar painel'}</button></div></div></div>`;
  };
  R.payload = v => ({ titulo: String(v.titulo || '').trim(), descricao: String(v.descricao || '').trim(), canalId: v.canalId, modo: v.modo === 'multi' ? 'multi' : 'single', cor: v.cor || '#8b5cf6',
    cargos: (v.cargos || []).filter(c => c.marcado).map(c => ({ roleId: c.roleId, rotulo: String(c.rotulo || '').trim(), descricao: String(c.descricao || '').trim(), emoji: String(c.emoji || '').trim() })) });
  const GRUPOS = [
    ['🤖 IA', ['/ia', '/imagem', '/analisar', '/traduzir', '/resumir'], 'Converse com a IA, gere imagens, analise fotos, traduza e resuma. O bot também responde quando você o menciona.'],
    ['🎮 Diversão e Games', ['/multiverso', '/interacao', '/ship', '/interacao-animal', '/personagem', '/personagem-anime', '/animequiz', '/destino-anime', '/transformacao-anime', '/poder-anime', '/batalha-anime', '/duelo-anime'], 'Interações com GIFs de anime, ship, quiz, duelos e cartões de animais e personagens.'],
    ['👥 Membros', ['/ajuda', '/perfil', '/nivel', '/conquistas', '/recompensas', '/cargos'], 'Perfil, nível, conquistas, recompensas e recursos de membros.'],
    ['📋 Atividades', ['/resenha', '/jogatina'], 'Crie resenhas e jogatinas com inscrição por botão e ranking de quem organiza e participa.'],
    ['🛠️ Staff', ['/conquista-add', '/recompensa', '/dar-cargo', '/remover-cargo'], 'Comandos para a equipe, com checagem de cargo e de hierarquia.']
  ];
  R.loja = () => `<section class="store-hero card"><div class="store-mark">💎</div><span class="store-kicker">TESOURO DE NYTHERIS</span><h2>Loja Tenkhyrons</h2><p>Relíquias, títulos e artefatos para personalizar sua identidade dentro do universo Tenchiko.</p><div class="store-balance"><span>Moeda oficial</span><b>✦ Tenkhyron</b><small>Prévia visual: compras e pagamentos ainda não estão conectados.</small></div></section>
    <div class="store-section-head"><div><span class="pv-home-label">CATÁLOGO</span><h2>Itens da linhagem</h2></div><span class="pill">7 itens</span></div><div class="store-grid">
    <article class="store-item card"><div class="store-art crystal">✧</div><span class="store-rarity common">COMUM</span><h3>Fragmento de Cristal</h3><p>Fragmento violeta para colecionar e usar em futuras receitas.</p><div class="store-buy"><b>100 <small>✦</small></b><button class="btn" disabled>Em breve</button></div></article>
    <article class="store-item card"><div class="store-art crest">♜</div><span class="store-rarity rare">RARO</span><h3>Brasão Vampírico</h3><p>Emblema ancestral para representar sua posição na linhagem.</p><div class="store-buy"><b>350 <small>✦</small></b><button class="btn" disabled>Em breve</button></div></article>
    <article class="store-item card"><div class="store-art title-art">✦</div><span class="store-rarity rare">RARO</span><h3>Título Especial</h3><p>Títulos decorativos para exibir junto ao seu nome no perfil.</p><div class="store-buy"><b>250–1.000 <small>✦</small></b><button class="btn" disabled>Em breve</button></div></article>
    <article class="store-item card"><div class="store-art frame-art">◈</div><span class="store-rarity epic">ÉPICO</span><h3>Moldura de Perfil</h3><p>Moldura temática para destacar seu perfil com visual exclusivo.</p><div class="store-buy"><b>800 <small>✦</small></b><button class="btn" disabled>Em breve</button></div></article>
    <article class="store-item card"><div class="store-art relic-art">♜</div><span class="store-rarity legendary">LENDÁRIO</span><h3>Relíquia Ancestral</h3><p>Peça rara da história de Nytheris para colecionadores.</p><div class="store-buy"><b>1.800 <small>✦</small></b><button class="btn" disabled>Em breve</button></div></article>
    <article class="store-item card"><div class="store-art crown-art">♛</div><span class="store-rarity legendary">LENDÁRIO</span><h3>Coroa de Nytheris</h3><p>Cosmético de prestígio de uma futura coleção especial.</p><div class="store-buy"><b>2.500 <small>✦</small></b><button class="btn" disabled>Em breve</button></div></article>
    <article class="store-item card"><div class="store-art potion-art">⚗</div><span class="store-rarity epic">ÉPICO</span><h3>Poção de Experiência</h3><p>Consumível planejado para o sistema de níveis.</p><div class="store-buy"><b>500 <small>✦</small></b><button class="btn" disabled>Em breve</button></div></article></div>
    <div class="store-section-head"><div><span class="pv-home-label">ACESSO PREMIUM</span><h2>Assinaturas mensais</h2></div></div><p class="muted">Planos propostos. Pagamentos e renovações ainda não estão ativos.</p><div class="store-plans">
    <article class="store-plan card"><span class="store-rarity common">INICIAL</span><h3>Neófito</h3><div class="store-price">R$ 4,99 <small>/ mês</small></div><p>300 Tenkhyrons por ciclo mensal</p><ul><li>Identidade premium</li><li>Cosméticos selecionados</li></ul><button class="btn" disabled>Em breve</button></article>
    <article class="store-plan card featured"><span class="store-rarity rare">POPULAR</span><h3>Sangue Nobre</h3><div class="store-price">R$ 9,99 <small>/ mês</small></div><p>750 Tenkhyrons por ciclo mensal</p><ul><li>Benefícios Neófito</li><li>Títulos e molduras selecionados</li></ul><button class="btn" disabled>Em breve</button></article>
    <article class="store-plan card"><span class="store-rarity epic">ELITE</span><h3>Herdeiro Ancestral</h3><div class="store-price">R$ 19,99 <small>/ mês</small></div><p>1.700 Tenkhyrons por ciclo mensal</p><ul><li>Benefícios anteriores</li><li>Coleções premium selecionadas</li></ul><button class="btn" disabled>Em breve</button></article>
    <article class="store-plan card"><span class="store-rarity legendary">SUPREMO</span><h3>Imperador de Nytheris</h3><div class="store-price">R$ 29,99 <small>/ mês</small></div><p>2.800 Tenkhyrons por ciclo mensal</p><ul><li>Benefícios anteriores</li><li>Cosméticos de prestígio</li></ul><button class="btn" disabled>Em breve</button></article></div><div class="notice">🔒 A loja está em modo de apresentação. Nenhum pagamento será cobrado nem item entregue até a integração real com o bot, banco de dados e provedor de pagamento.</div>`;
  R.landing = (conviteGeral, logado, loginOk, botAvatar) => `<section class="hero pv-landing"><div class="pv-landing-brand"><div class="pv-bat">${botAvatar ? `<img src="${esc(botAvatar)}" alt="Ícone do Tenchikho" class="pv-bot-logo">` : '🦇'}</div><div class="pv-wordmark">TENCHIKHO</div><div class="pv-submark">BLOODLINE</div></div><p class="pv-tagline">Mais que um bot, uma linhagem.</p><p class="pv-landing-copy">Todas as ferramentas do Tenchiko em um só lugar. Gerencie sua comunidade, configure seu bot e acompanhe cada detalhe com uma experiência exclusiva, intuitiva e elegante.</p><div class="nav">${conviteGeral ? `<a class="btn primary pv-cta" target="_blank" rel="noopener" href="${esc(conviteGeral)}">＋ Convidar bot ao servidor</a>` : ''}${logado ? '<button class="btn blue pv-cta pv-cta-outline" data-pv="ir" data-tela="overview">▦ Abrir painel de controle</button>' : (loginOk === false ? '<button class="btn pv-cta" disabled>Login indisponível</button>' : '<a class="btn blue pv-cta pv-cta-outline" href="/auth/discord">Entrar com Discord　↗</a>')}</div></section>
    <div class="pv-home-intro"><span class="pv-home-label">CENTRAL TENCHIKO</span><h2>Seu servidor. Seu estilo. Seu controle.</h2><p class="muted">Entre com o Discord e escolha um servidor que você administra para abrir as ferramentas disponíveis.</p></div><div class="grid pv-feature-grid">
    <div class="card pv-feature"><div class="pv-feature-icon">🎭</div><h3>Auto cargos</h3><p>Crie painéis de seleção de cargos e publique no canal desejado.</p></div>
    <div class="card pv-feature"><div class="pv-feature-icon">🛡️</div><h3>Moderação</h3><p>Os comandos de moderação do bot ficam disponíveis no Discord conforme as permissões da equipe.</p><button class="btn pv-card-link" data-pv="ir" data-tela="commands">Ver comandos ↗</button></div>
    <div class="card pv-feature"><div class="pv-feature-icon">🛍️</div><h3>Loja e recompensas</h3><p>Área destacada para os recursos de economia e recompensas do Tenchiko.</p><button class="btn pv-card-link" data-pv="ir" data-tela="commands">Consultar comandos e recompensas ↗</button></div>
    <div class="card pv-feature"><div class="pv-feature-icon">🤖</div><h3>Tenchiko.IA</h3><p>Veja os recursos de inteligência artificial disponíveis nos comandos.</p></div>
    <div class="card pv-feature"><div class="pv-feature-icon">🎮</div><h3>Games e interações</h3><p>Quizzes, duelos e interações de anime para sua comunidade.</p></div>
    <div class="card pv-feature"><div class="pv-feature-icon">🎫</div><h3>Tickets e suporte</h3><p>Organize pedidos de ajuda com canais privados para cada atendimento.</p></div></div>`;
  const cartaoComandos = (g) => `<div class="card pv-panel"><div class="pv-panel-h"><b>${esc(g[0])}</b></div><p class="muted">${esc(g[2])}</p><div class="pv-chips">${g[1].map(c => `<span class="pv-chip">${esc(c)}</span>`).join('')}</div></div>`;
  R.paginaComandos = () => `<h2>Comandos</h2><p class="muted">Digite <b>/</b> no Discord para ver as opções de cada comando.</p>${GRUPOS.map(cartaoComandos).join('')}`;
  R.paginaIA = () => `<h2>Tenchiko.IA</h2>${cartaoComandos(GRUPOS[0])}<div class="card"><h3>Como usar</h3><p>No Discord, use <b>/ia</b> com a sua pergunta, ou <b>mencione o bot</b> em qualquer canal. Há limite diário por membro para controlar o custo.</p></div>`;
  R.jogos = (d, info) => {
    const cfg = (d.config && d.config.canais) || {};
    const nomeJogo = id => { const j = d.jogos.find(x => x.id === id); return j ? j.nome : id; };
    const selects = d.jogos.map(j => `<label class="label">${esc(j.nome)}<select class="input" data-jogo="${esc(j.id)}"><option value="">— desativado —</option>${d.canais.map(c => `<option value="${esc(c.id)}"${cfg[j.id] === c.id ? ' selected' : ''}>#${esc(c.nome)}</option>`).join('')}</select><small class="muted">Nome sugerido para o canal: #${esc(j.canal)}</small></label>`).join('');
    const placar = d.placar.length ? `<div class="pv-tabela-wrap"><table class="pv-tabela"><thead><tr><th>Jogador</th><th>V</th><th>D</th><th>E</th><th>Pontos</th></tr></thead><tbody>${d.placar.map(p => `<tr><td>${esc(p.nome)}</td><td>${p.v}</td><td>${p.d}</td><td>${p.e}</td><td><b>${p.p}</b></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Ainda não há partidas registradas neste servidor.</p>';
    const hist = d.historico.length ? d.historico.map(h => `<div class="pv-hist"><b>${esc(nomeJogo(h.jogo))}</b><small>${new Date(h.at).toLocaleString('pt-BR')} · ${h.jogadores.map(j => esc(j.nome)).join(' × ')}</small><small>${esc(h.resumo || '')}</small></div>`).join('') : '<p class="muted">Nenhuma partida ainda.</p>';
    return `<h2>Games</h2><p class="muted">Ative cada jogo em um canal. Os membros jogam digitando no canal: ${d.jogos.map(j => `<b>${esc(j.nome)}</b>`).join(', ')}.</p>
      <div class="card pv-form"><h3>Canais dos jogos</h3>${selects}
        <div class="pv-actions"><button class="btn primary" data-pv="jg-salvar">Salvar canais</button><button class="btn" data-pv="jg-categoria" ${d.podeCriarCategoria ? '' : 'disabled'}>🎮 Criar categoria "${esc(d.categoriaNome)}" com os canais</button></div>
        ${d.podeCriarCategoria ? '' : '<small class="muted">Para criar a categoria, o bot precisa da permissão "Gerenciar canais".</small>'}</div>
      <div class="card"><h3>Placar</h3>${placar}</div>
      <div class="card"><h3>Histórico</h3>${hist}</div>`;
  };

  const FUNCOES = [['🎭', 'Auto Cargos', 'autocargos', 'autocargos'], ['👋', 'Boas-vindas', 'boasvindas', 'boasvindas'], ['🎫', 'Tickets', 'tickets', 'tickets'], ['🎮', 'Games', 'games', null], ['🤖', 'Tenchiko.IA', 'ia', null], ['🩺', 'Diagnóstico', 'diag', null]];
  R.funcoesLista = (info) => `<div class="pv-list">${FUNCOES.map(([ic, nome, tela, chave]) => { const ativo = chave ? (chave === 'autocargos' ? info.funcoes.autocargos > 0 : !!info.funcoes[chave]) : true;
    return `<div class="card pv-fn"><div class="pv-fn-top"><span class="pv-fn-ic">${ic}</span><div class="pv-fn-t"><b>${esc(nome)}</b><small>${esc(info.nome)}</small></div>${chave ? `<span class="pill ${ativo ? 'on' : ''}">${ativo ? 'Ativo' : 'Desligado'}</span>` : ''}</div><button class="btn primary" style="width:100%" data-pv="ir" data-tela="${tela}">Configurar</button></div>`; }).join('')}</div>`;
  R.dashboard = (me, info, guilds, selId) => {
    const f = info.funcoes, ativas = (f.autocargos > 0 ? 1 : 0) + (f.boasvindas ? 1 : 0) + (f.tickets ? 1 : 0), online = !!(me.bot && me.bot.online);
    const sel = guilds.find(g => g.id === selId) || {};
    const icone = info.icone ? `<img class="pv-gi pv-gi-lg" src="${esc(info.icone)}" alt="">` : `<div class="pv-gi pv-gi-lg ph">${esc(String(info.nome || "T").charAt(0).toUpperCase())}</div>`;
    const avatar = me.usuario.avatar ? `<img class="pv-av" src="${esc(me.usuario.avatar)}" alt="">` : "";
    const conv = sel.conviteUrl ? `<a class="btn primary" target="_blank" rel="noopener" href="${esc(sel.conviteUrl)}">＋ Convidar bot</a>` : "";
    const botTag = `<span class="pv-bot"><span class="pv-dot ${online ? "on" : ""}"></span> ${online ? "Bot online" : "Bot offline"}</span>`;
    const quick = [["🎭", "Auto Cargos", "autocargos"], ["👋", "Boas-vindas", "boasvindas"], ["🎫", "Suporte", "tickets"], ["🩺", "Diagnóstico", "diag"]]
      .map(([ic, n, t]) => `<button class="card pv-q" data-pv="ir" data-tela="${t}"><span>${ic}</span><b>${n}</b></button>`).join("");
    return `<div class="card pv-switch"><label class="pv-switch-l">Servidor ativo<select class="input" data-pv-change="trocar">${guilds.filter(g => g.botPresente).map(g => `<option value="${esc(g.id)}"${g.id === selId ? " selected" : ""}>${esc(g.nome)}</option>`).join("")}</select></label>${botTag}</div>
    <div class="card pv-dash-banner"><div class="pv-banner-id">${icone}<div><span class="kicker">Servidor sob seu comando</span><h2>${esc(info.nome)}</h2>${botTag}</div></div>
      <div class="pv-actions">${conv}<button class="btn" data-pv="ir" data-tela="servers">Trocar servidor</button></div></div>
    ${info.botPodeGerenciarCargos ? "" : '<div class="notice">⚠️ O bot não tem a permissão <b>Gerenciar cargos</b> neste servidor. Rode o <b>Diagnóstico</b> para ver o que ajustar.</div>'}
    <div class="pv-dash">
      <div class="pv-dash-main">
        <h3>Acesso rápido</h3><div class="pv-quick">${quick}</div>
        <div class="card"><h3>Estatísticas</h3><div class="pv-stats">
          <div class="card pv-stat"><span class="pv-stat-ic">👥</span><small>Total de membros</small><b>${Number(info.membros || 0).toLocaleString("pt-BR")}</b></div>
          <div class="card pv-stat"><span class="pv-stat-ic">🤖</span><small>Bot</small><b class="${online ? "ok" : ""}">${online ? "Online" : "Offline"}</b></div>
          <div class="card pv-stat"><span class="pv-stat-ic">🧩</span><small>Funções ativas</small><b>${ativas}</b></div>
          <div class="card pv-stat"><span class="pv-stat-ic">🎭</span><small>Painéis de cargos</small><b>${f.autocargos}</b></div>
        </div></div>
        <h3>Funções</h3>${R.funcoesLista(info)}
      </div>
      <aside class="pv-dash-side">
        <div class="card pv-profile">${avatar}<div><b>${esc(me.usuario.nome)}</b><small class="muted">Gerencia este servidor</small></div></div>
        <div class="card pv-side-card"><span class="kicker">Bot</span>${botTag}<small class="muted">Estado reportado pelo painel agora.</small></div>
      </aside>
    </div>`;
  };
  const optCanais = (info, sel) => info.canais.map(c => `<option value="${esc(c.id)}"${sel === c.id ? ' selected' : ''}>#${esc(c.nome)}</option>`).join('');
  R.boasvindas = (cfg, info) => `<h2>Boas-vindas</h2><p class="muted">O bot dá boas-vindas a quem entra no servidor. Variáveis: <b>{usuario}</b> (menção), <b>{nome}</b>, <b>{servidor}</b>, <b>{membros}</b>.</p>
    <div class="card pv-form"><label class="pv-check"><input type="checkbox" id="bvAtivo"${cfg.ativo ? ' checked' : ''}> Ativar boas-vindas</label>
    <label class="label">Canal<select class="input" id="bvCanal">${info.canais.length ? optCanais(info, cfg.canalId) : '<option value="">Nenhum canal disponível</option>'}</select></label>
    <label class="label">Título<input class="input" id="bvTitulo" maxlength="100" value="${esc(cfg.titulo)}"></label>
    <label class="label">Mensagem<textarea class="input" id="bvMsg" rows="4" maxlength="1500">${esc(cfg.mensagem)}</textarea></label>
    <label class="label">Cor<input type="color" id="bvCor" value="${esc(cfg.cor)}"></label>
    <div class="pv-actions"><button class="btn primary" data-pv="bv-salvar">Salvar</button><button class="btn" data-pv="bv-testar">Enviar teste</button></div></div>`;
  R.tickets = (d, info) => { const c = d.config || {}; return `<h2>Tickets</h2><p class="muted">Painel com o botão <b>Abrir ticket</b>. Cada ticket vira um canal privado só do membro e da equipe. ${d.abertos ? `<b>${d.abertos}</b> ticket(s) aberto(s) agora.` : ''}</p>
    <div class="card pv-form"><label class="label">Canal do painel<select class="input" id="tkCanal">${info.canais.length ? optCanais(info, c.canalId) : '<option value="">Nenhum canal disponível</option>'}</select></label>
    <label class="label">Categoria dos tickets (opcional)<select class="input" id="tkCat"><option value="">Sem categoria</option>${info.categorias.map(x => `<option value="${esc(x.id)}"${c.categoriaId === x.id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
    <label class="label">Cargo da equipe<select class="input" id="tkStaff">${d.cargos.map(r => `<option value="${esc(r.id)}"${c.cargoStaffId === r.id ? ' selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></label>
    <label class="label">Título<input class="input" id="tkTitulo" maxlength="100" value="${esc(c.titulo || 'Suporte')}"></label>
    <label class="label">Descrição<textarea class="input" id="tkDesc" rows="3" maxlength="1000">${esc(c.descricao || 'Precisa de ajuda? Clique no botão para abrir um ticket.')}</textarea></label>
    <div class="pv-actions"><button class="btn primary" data-pv="tk-salvar">${c.ativo ? 'Salvar e atualizar painel' : 'Publicar painel'}</button>${c.ativo ? '<button class="btn danger" data-pv="tk-desativar">Desativar</button>' : ''}</div></div>`; };
  R.diag = (r, info) => `<div class="pv-bar"><div><h2 style="margin:0">Diagnóstico</h2><small class="muted">${esc(info.nome)}</small></div><button class="btn" data-pv="diag-rodar">🔄 Rodar de novo</button></div>
    <div class="pv-stats"><div class="card pv-stat"><small>OK</small><b class="ok">${r.resumo.ok}</b></div><div class="card pv-stat"><small>Avisos</small><b>${r.resumo.aviso}</b></div><div class="card pv-stat"><small>Erros</small><b class="${r.resumo.erro ? 'bad' : ''}">${r.resumo.erro}</b></div></div>
    <div class="pv-list">${r.checks.map(c => `<div class="card pv-dg ${esc(c.nivel)}"><span>${c.nivel === 'ok' ? '✅' : c.nivel === 'aviso' ? '⚠️' : '❌'}</span><div><b>${esc(c.titulo)}</b>${c.detalhe ? `<small>${esc(c.detalhe)}</small>` : ''}</div></div>`).join('')}</div>`;

  // ---------- navegador ----------
  if (typeof document === 'undefined') { root.NVBPainelRender = R; if (typeof module !== 'undefined') module.exports = R; return; }

  const KT = 'nvb_painel_token', KG = 'nvb_painel_guild';
  const S = { token: null, me: null, config: null, guildId: null, info: null, paineis: [] };
  const $ = (id) => document.getElementById(id);
  const aviso = m => { if (typeof window.toast === 'function') window.toast(m); else alert(m); };
  try { S.token = localStorage.getItem(KT); S.guildId = localStorage.getItem(KG); } catch (e) { /* sem storage */ }
  const NAV = { home: 'home', overview: 'home', diag: 'home', roles: 'roles', autocargos: 'roles', boasvindas: 'roles', tickets: 'roles', servers: 'servers' };

  async function api(caminho, opts = {}) {
    const r = await fetch(caminho, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor.' }));
    if (r.status === 401 && S.token) sair(false);
    return j;
  }
  function sair(recarregar = true) { const t = S.token; S.token = null; S.me = null; S.info = null; try { localStorage.removeItem(KT); } catch (e) { /* ok */ } if (recarregar && t) fetch('/api/painel/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }); atualizarCasca(); if (recarregar) mostrar('home'); }
  function mostrar(tela) { if (typeof window.go === 'function') window.go(tela); }

  function atualizarCasca() {
    const u = S.me && S.me.usuario, c = $('pvUserCard');
    if (c) c.innerHTML = u ? `<img class="pv-av" src="${esc(u.avatar)}" alt=""><div><b>${esc(u.nome)}</b><small>Administrador</small></div>` : '<a class="btn primary" href="/auth/discord">🔐 Entrar com Discord</a>';
    const b = $('pvBotCard'), g = S.info, on = !!(S.me && S.me.bot && S.me.bot.online);
    if (b) b.innerHTML = g ? `${R.icone(g)}<div><b>${esc(g.nome)}</b><small><span class="pv-dot ${on ? 'on' : ''}"></span> ${on ? 'Bot online' : 'Bot offline'}</small></div>` : '<small class="muted">Selecione um servidor em <b>Servidores</b>.</small>';
    const top = $('pvTopUser'); if (top) top.innerHTML = u ? `<img class="pv-av sm" src="${esc(u.avatar)}" alt="">` : '';
    const lg = $('pvLogout'); if (lg) lg.style.display = u ? '' : 'none';
    const inv = $('pvInvite'); if (inv && S.config && S.config.conviteGeral) inv.href = S.config.conviteGeral;
  }
  function marcarNav(tela) {
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === NAV[tela]));
    document.querySelectorAll('.pv-side [data-tela]').forEach(b => b.classList.toggle('on', b.dataset.tela === tela));
  }
  const abrirMenu = (on) => { const sd = $('pvSide'), o = $('pvOverlay'); if (sd) sd.classList.toggle('open', on); if (o) o.classList.toggle('open', on); };

  async function carregarMe() { if (!S.token) { S.me = null; return null; } const j = await api('/api/painel/me'); S.me = j.ok ? j : null; return S.me; }
  async function carregarServidor(id) {
    S.guildId = id; try { localStorage.setItem(KG, id); } catch (e) { /* ok */ }
    const [i, p] = await Promise.all([api(`/api/painel/guild/${id}`), api(`/api/painel/guild/${id}/autoroles`)]);
    if (!i.ok) { aviso('❌ ' + (i.error || 'Não foi possível carregar o servidor.')); S.info = null; S.paineis = []; return false; }
    S.info = i.guild; S.paineis = p.ok ? p.paineis : []; atualizarCasca(); return true;
  }
  const carregando = el => { el.innerHTML = '<div class="card"><p>🔄 Carregando...</p></div>'; };

  async function renderTela(tela) {
    const el = $(tela); if (!el) return;
    if (!S.config) S.config = await api('/api/painel/config');
    if (!S.token) { el.innerHTML = R.precisaLogin(S.config.loginDisponivel); return; }
    if (!S.me) { carregando(el); await carregarMe(); if (!S.me) { el.innerHTML = R.precisaLogin(S.config.loginDisponivel); return; } atualizarCasca(); }
    if (tela === 'servers') { el.innerHTML = `<h2>Servidores</h2>${R.servidores(S.me.guilds, S.guildId)}`; return; }
    if (!S.guildId || !S.me.guilds.some(g => g.id === S.guildId && g.botPresente)) { const primeiro = S.me.guilds.find(g => g.botPresente); S.guildId = primeiro ? primeiro.id : null; S.info = null; }
    if (!S.guildId) { el.innerHTML = '<div class="card"><h3>Escolha um servidor</h3><p>Nenhum dos seus servidores tem o bot ainda.</p><button class="btn primary" data-pv="ir" data-tela="servers">Ver servidores</button></div>'; return; }
    if (!S.info || S.info.id !== S.guildId) { carregando(el); if (!await carregarServidor(S.guildId)) { el.innerHTML = '<div class="card"><p>Não foi possível carregar este servidor.</p><button class="btn primary" data-pv="ir" data-tela="servers">Escolher outro</button></div>'; return; } }
    const base = `/api/painel/guild/${S.guildId}`;
    if (tela === 'overview') el.innerHTML = R.dashboard(S.me, S.info, S.me.guilds, S.guildId);
    else if (tela === 'roles') el.innerHTML = `<h2>Funções</h2><p class="muted">Ative e configure as funções do Tenchiko neste servidor.</p>${R.funcoesLista(S.info)}`;
    else if (tela === 'autocargos') el.innerHTML = R.funcoes(S.info, S.paineis, S.info);
    else if (tela === 'boasvindas') { carregando(el); const j = await api(base + '/boasvindas'); el.innerHTML = j.ok ? R.boasvindas(j.config, S.info) : `<div class="card"><p>❌ ${esc(j.error)}</p></div>`; }
    else if (tela === 'tickets') { carregando(el); const j = await api(base + '/tickets'); el.innerHTML = j.ok ? R.tickets(j, S.info) : `<div class="card"><p>❌ ${esc(j.error)}</p></div>`; }
    else if (tela === 'diag') { carregando(el); const j = await api(base + '/diagnostico'); el.innerHTML = j.ok ? R.diag(j, S.info) : `<div class="card"><p>❌ ${esc(j.error)}</p></div>`; }
    else if (tela === 'games') { carregando(el); const j = await api(base + '/jogos'); el.innerHTML = j.ok ? R.jogos(j, S.info) : `<div class="card"><p>❌ ${esc(j.error)}</p></div>`; }
  }
  async function renderHome() {
    const el = $('home'); if (!el) return; if (!S.config) S.config = await api('/api/painel/config');
    el.innerHTML = R.landing(S.config.conviteGeral, !!(S.token && S.me), S.config.loginDisponivel, S.config.botAvatar); atualizarCasca();
  }
  async function onGo(tela) {
    abrirMenu(false); marcarNav(tela);
    if (tela === 'home') return renderHome();
    if (tela === 'commands') { $('commands').innerHTML = R.paginaComandos(); return; }
    if (tela === 'ia') { $('ia').innerHTML = R.paginaIA(); return; }
    if (tela === 'loja') { $('loja').innerHTML = R.loja(); return; }
    if (['overview', 'servers', 'roles', 'autocargos', 'boasvindas', 'tickets', 'diag', 'games'].includes(tela)) await renderTela(tela);
  }

  const val = id => { const e = $(id); return e ? e.value : ''; };
  function coletarForm() {
    return R.payload({ titulo: $('pvTitulo').value, descricao: $('pvDesc').value, canalId: $('pvCanal').value, modo: $('pvModo').value, cor: $('pvCor').value,
      cargos: [...document.querySelectorAll('.pv-role')].map(d => ({ roleId: d.dataset.role, marcado: d.querySelector('input[type=checkbox]').checked, rotulo: d.querySelector('[data-f=rotulo]').value, emoji: d.querySelector('[data-f=emoji]').value, descricao: d.querySelector('[data-f=descricao]').value })) });
  }
  function abrirEditor(p) { fecharEditor(); const d = document.createElement('div'); d.id = 'pvEditor'; d.className = 'pv-modal'; d.innerHTML = R.editor(S.info, p); document.body.append(d); }
  function fecharEditor() { const e = $('pvEditor'); if (e) e.remove(); }
  async function enviar(btn, textoOcupado, fn) { const antes = btn.textContent; btn.disabled = true; btn.textContent = textoOcupado; try { return await fn(); } finally { btn.disabled = false; btn.textContent = antes; } }

  async function acao(btn) {
    const a = btn.dataset.pv, id = btn.dataset.id, base = `/api/painel/guild/${S.guildId}`;
    if (a === 'ir') return mostrar(btn.dataset.tela);
    if (a === 'selecionar') { btn.disabled = true; btn.textContent = '...'; if (await carregarServidor(id)) { aviso('✅ Servidor selecionado.'); renderTela('servers'); } return; }
    if (a === 'novo') { if (!S.info.canais.length) return aviso('❌ O bot não tem canal de texto onde possa enviar mensagens neste servidor.'); return abrirEditor(null); }
    if (a === 'editar') return abrirEditor(S.paineis.find(p => p.id === id));
    if (a === 'fechar') return fecharEditor();
    if (a === 'sair') return sair(true);
    if (a === 'diag-rodar') return renderTela('diag');
    if (a === 'apagar') {
      if (!confirm('Apagar este painel? A mensagem também será apagada do Discord.')) return;
      const j = await api(`${base}/autoroles/${id}`, { method: 'DELETE' }); if (!j.ok) return aviso('❌ ' + (j.error || 'Não foi possível apagar.'));
      aviso('🗑️ Painel apagado.'); await carregarServidor(S.guildId); return renderTela('autocargos');
    }
    if (a === 'salvar') {
      const corpo = coletarForm();
      return enviar(btn, 'Enviando...', async () => {
        const j = await api(id ? `${base}/autoroles/${id}` : `${base}/autoroles`, { method: id ? 'PUT' : 'POST', body: corpo });
        if (!j.ok) return aviso('❌ ' + (j.error || 'Não foi possível salvar.'));
        fecharEditor(); aviso(id ? '✅ Painel atualizado no Discord.' : '✅ Painel publicado no canal!'); await carregarServidor(S.guildId); renderTela('autocargos');
      });
    }
    if (a === 'bv-salvar') return enviar(btn, 'Salvando...', async () => { const j = await api(base + '/boasvindas', { method: 'PUT', body: { ativo: $('bvAtivo').checked, canalId: val('bvCanal'), titulo: val('bvTitulo'), mensagem: val('bvMsg'), cor: val('bvCor') } }); aviso(j.ok ? '✅ Boas-vindas salvas.' : '❌ ' + (j.error || 'Não foi possível salvar.')); if (j.ok) { await carregarServidor(S.guildId); } });
    if (a === 'jg-salvar') return enviar(btn, 'Salvando...', async () => { const canais = {}; $('games').querySelectorAll('select[data-jogo]').forEach(sel => { canais[sel.dataset.jogo] = sel.value || null; }); const j = await api(base + '/jogos', { method: 'PUT', body: { canais } }); aviso(j.ok ? '✅ Canais dos jogos salvos.' : '❌ ' + (j.error || 'Não foi possível salvar.')); if (j.ok) await renderTela('games'); });
    if (a === 'jg-categoria') return enviar(btn, 'Criando...', async () => { const j = await api(base + '/jogos/categoria', { method: 'POST' }); aviso(j.ok ? '✅ Categoria e canais criados.' : '❌ ' + (j.error || 'Não foi possível criar.')); if (j.ok) await renderTela('games'); });
    if (a === 'bv-testar') return enviar(btn, 'Enviando...', async () => { const j = await api(base + '/boasvindas/testar', { method: 'POST' }); aviso(j.ok ? '✅ Teste enviado no canal.' : '❌ ' + (j.error || 'Não foi possível enviar.')); });
    if (a === 'tk-salvar') return enviar(btn, 'Publicando...', async () => { const j = await api(base + '/tickets', { method: 'PUT', body: { canalId: val('tkCanal'), categoriaId: val('tkCat'), cargoStaffId: val('tkStaff'), titulo: val('tkTitulo'), descricao: val('tkDesc') } }); aviso(j.ok ? '✅ Painel de tickets publicado.' : '❌ ' + (j.error || 'Não foi possível salvar.')); if (j.ok) { await carregarServidor(S.guildId); renderTela('tickets'); } });
    if (a === 'tk-desativar') { if (!confirm('Desativar os tickets? O painel será apagado (os tickets abertos continuam).')) return; const j = await api(base + '/tickets', { method: 'DELETE' }); aviso(j.ok ? '🗑️ Tickets desativados.' : '❌ Não foi possível desativar.'); await carregarServidor(S.guildId); return renderTela('tickets'); }
  }

  const IDIOMAS = {
    pt: { label: 'Idioma', home: 'Início', overview: 'Painel de controle', servers: 'Servidores', roles: 'Funções', autocargos: 'Auto Cargos', boasvindas: 'Boas-vindas', tickets: 'Tickets', ia: 'Tenchiko.IA', games: 'Games', loja: 'Loja Tenkhyrons', diag: 'Diagnóstico', commands: 'Comandos', central: 'CENTRAL DE CONTROLE', features: 'RECURSOS DO BOT' },
    en: { label: 'Language', home: 'Home', overview: 'Dashboard', servers: 'Servers', roles: 'Roles', autocargos: 'Auto Roles', boasvindas: 'Welcome', tickets: 'Tickets', ia: 'Tenchiko.AI', games: 'Games', loja: 'Tenkhyron Shop', diag: 'Diagnostics', commands: 'Commands', central: 'CONTROL CENTER', features: 'BOT FEATURES' },
    es: { label: 'Idioma', home: 'Inicio', overview: 'Panel de control', servers: 'Servidores', roles: 'Roles', autocargos: 'Auto Roles', boasvindas: 'Bienvenida', tickets: 'Tickets', ia: 'Tenchiko.IA', games: 'Juegos', loja: 'Tienda Tenkhyron', diag: 'Diagnóstico', commands: 'Comandos', central: 'CENTRO DE CONTROL', features: 'FUNCIONES DEL BOT' }
  };
  function aplicarIdioma(lang) {
    lang = IDIOMAS[lang] ? lang : 'pt';
    try { localStorage.setItem('tenchiko_language', lang); } catch (e) {}
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang === 'en' ? 'en' : 'es';
    const sel = $('pvLanguage'); if (sel && sel.value !== lang) sel.value = lang;
    const d = IDIOMAS[lang];
    document.querySelectorAll('.pv-side [data-tela]').forEach(el => { const k = el.dataset.tela; const span = el.querySelector('span'); const icon = span ? span.outerHTML : ''; if (d[k]) el.innerHTML = icon + esc(d[k]); });
    const labels = document.querySelectorAll('.pv-sec'); if (labels[0]) labels[0].textContent = '◆ ' + d.central; if (labels[1]) labels[1].textContent = '✦ ' + d.features;
    const ll = document.querySelector('.pv-language-label'); if (ll) ll.textContent = d.label;
    const brand = document.querySelector('.pv-brand small'); if (brand) brand.textContent = lang === 'en' ? 'CONTROL PANEL' : lang === 'es' ? 'PANEL DE CONTROL' : 'PAINEL DE CONTROLE';
  }

  function iniciar() {
    const m = String(location.hash).match(/^#login=([a-f0-9]{64})$/);
    if (m) { S.token = m[1]; try { localStorage.setItem(KT, S.token); } catch (e) { /* ok */ } history.replaceState(null, '', location.pathname + location.search); }
    let idiomaInicial = 'pt'; try { idiomaInicial = localStorage.getItem('tenchiko_language') || 'pt'; } catch (e) {}
    aplicarIdioma(idiomaInicial);
    const idiomaSelect = $('pvLanguage'); if (idiomaSelect) idiomaSelect.addEventListener('change', () => aplicarIdioma(idiomaSelect.value));
    document.addEventListener('click', ev => {
      const b = ev.target.closest('[data-pv]'); if (b) { ev.preventDefault(); acao(b); return; }
      const n = ev.target.closest('[data-nav]'); if (n) { ev.preventDefault(); if (n.dataset.nav === 'menu') abrirMenu(true); else if (n.dataset.nav === 'home') mostrar(S.token && S.me ? 'overview' : 'home'); else mostrar(n.dataset.nav); return; }
      const t = ev.target.closest('.pv-side [data-tela]'); if (t) mostrar(t.dataset.tela);
    });
    document.addEventListener('change', async ev => { const sel = ev.target.closest('[data-pv-change="trocar"]'); if (sel) { if (await carregarServidor(sel.value)) renderTela('overview'); } });
    const ham = $('pvHam'); if (ham) ham.addEventListener('click', () => abrirMenu(true)); const ov = $('pvOverlay'); if (ov) ov.addEventListener('click', () => abrirMenu(false)); const fx = $('pvSideClose'); if (fx) fx.addEventListener('click', () => abrirMenu(false));
    const lg = $('pvLogout'); if (lg) lg.addEventListener('click', () => sair(true));
    carregarMe().then(() => { atualizarCasca(); if (m && S.me) mostrar('overview'); else renderHome(); });
    atualizarCasca(); renderHome();
  }
  root.NVBPainel = { onGo, _S: S, _R: R };
  root.NVBPainelRender = R;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(typeof window !== 'undefined' ? window : globalThis);

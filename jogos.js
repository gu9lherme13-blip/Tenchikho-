'use strict';
// =========================================================
// 🎮 Jogos nos canais do Discord
// Cada jogo fica num canal ativado pelo painel (aba Games). O bot lê as mensagens
// desses canais e conduz a partida. Placar e histórico ficam guardados por servidor.
// =========================================================
const R = require('./jogos-regras');

const JOGOS = [
  { id: 'xadrez', nome: 'Xadrez', canal: 'xadrez' },
  { id: 'dama', nome: 'Dama', canal: 'dama' },
  { id: 'ppt', nome: 'Pedra, papel ou tesoura', canal: 'pedra-papel-tesoura' },
  { id: 'forca', nome: 'Adivinhação de palavra', canal: 'adivinhacao-palavra' },
  { id: 'matematica', nome: 'Matemática', canal: 'matematica' }
];
const CATEGORIA = '🎮 Games';
const PALAVRAS = [
  { p: 'CASTELO', d: 'Construção antiga de pedra, cheia de torres' },
  { p: 'MORCEGO', d: 'Animal voador que caça à noite' },
  { p: 'VAMPIRO', d: 'Criatura das trevas que vive de sangue' },
  { p: 'CORUJA', d: 'Ave noturna de olhos grandes' },
  { p: 'SANGUE', d: 'Líquido vermelho que corre nas veias' },
  { p: 'FANTASMA', d: 'Alma que assombra um lugar' },
  { p: 'CEMITERIO', d: 'Lugar onde se enterram os mortos' },
  { p: 'NOITE', d: 'Período do dia sem sol' },
  { p: 'PRAIA', d: 'Areia e mar' },
  { p: 'ESCOLA', d: 'Lugar onde se aprende' },
  { p: 'FLORESTA', d: 'Lugar com muitas árvores' },
  { p: 'CHOCOLATE', d: 'Doce feito de cacau' }
];
const GLYPH_PRETA = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const GLYPH_BRANCA = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' };
const COLUNAS = 'abcdefgh';

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const sq = s => ({ c: COLUNAS.indexOf(s[0]), r: 8 - Number(s[1]) });

function tabuleiroXadrez(b) {
  const linhas = [];
  for (let r = 0; r < 8; r++) {
    let l = `${8 - r} `;
    for (let c = 0; c < 8; c++) { const p = b[r][c]; l += (p ? (p.w ? GLYPH_BRANCA[p.t] : GLYPH_PRETA[p.t]) : '·') + ' '; }
    linhas.push(l.trimEnd());
  }
  linhas.push('  a b c d e f g h');
  return '```\n' + linhas.join('\n') + '\n```';
}
function tabuleiroDama(b) {
  const linhas = [];
  for (let r = 0; r < 8; r++) {
    let l = `${8 - r} `;
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) { const p = b[r][c]; l += p ? (p.k ? '♛' : (p.c === 'w' ? '●' : '○')) + ' ' : '· '; }
      else l += '  ';
    }
    linhas.push(l.trimEnd());
  }
  linhas.push('  a b c d e f g h');
  return '```\n' + linhas.join('\n') + '\n```';
}
// boneco da forca: cada erro tira uma parte (braço E, braço D, perna E, perna D, corpo, cabeça)
function boneco(erros) {
  const h = erros < 6, c = erros < 5, aL = erros < 1, aR = erros < 2, lL = erros < 3, lR = erros < 4;
  return '```\n  ___\n' +
    `  |   ${h ? 'O' : ' '}\n` +
    `  |  ${aL ? '/' : ' '}${c ? '|' : ' '}${aR ? '\\' : ' '}\n` +
    `  |  ${lL ? '/' : ' '} ${lR ? '\\' : ' '}\n` +
    '__|__\n```';
}

module.exports = function iniciarJogos({ client, db, readJson, writeDb }) {
  for (const k of ['jogos_cfg', 'jogos_placar', 'jogos_hist']) {
    if (!db[k] || typeof db[k] !== 'object' || Array.isArray(db[k])) db[k] = readJson(`${k}.json`, {});
  }
  const sessoes = new Map(); // canalId -> partida em andamento (fica só na memória)
  const salvar = k => writeDb(k);
  const nomeDe = a => a.globalName || a.username || String(a.id);

  function cfgDe(guildId) { return (db.jogos_cfg[guildId] && db.jogos_cfg[guildId].canais) || {}; }
  function jogoDoCanal(guildId, canalId) { const c = cfgDe(guildId); return Object.keys(c).find(j => c[j] === canalId) || null; }

  function salvarConfig(guildId, canais) {
    db.jogos_cfg[guildId] = { canais: Object.fromEntries(JOGOS.map(j => [j.id, canais[j.id] || null])) };
    salvar('jogos_cfg');
  }

  // registra partida com resultado por jogador: 'v' vitória, 'd' derrota, 'e' empate
  function registrarPartida({ guildId, jogo, canalId, jogadores, resultados, resumo }) {
    const pl = db.jogos_placar[guildId] || (db.jogos_placar[guildId] = {});
    for (const j of jogadores) {
      const p = pl[j.id] || (pl[j.id] = { nome: j.nome, v: 0, d: 0, e: 0, p: 0 });
      p.nome = j.nome;
      const r = resultados[j.id];
      if (r === 'v') { p.v++; p.p += 10; } else if (r === 'd') p.d++; else if (r === 'e') p.e++;
    }
    const h = db.jogos_hist[guildId] || (db.jogos_hist[guildId] = []);
    h.unshift({ at: new Date().toISOString(), jogo, canalId, jogadores: jogadores.map(j => ({ id: j.id, nome: j.nome })), resultados, resumo });
    h.splice(200);
    salvar('jogos_placar'); salvar('jogos_hist');
  }
  // matemática: soma pontos por acerto
  function registrarPontos({ guildId, jogo, canalId, jogadores, pontos, resumo }) {
    const pl = db.jogos_placar[guildId] || (db.jogos_placar[guildId] = {});
    for (const j of jogadores) {
      const p = pl[j.id] || (pl[j.id] = { nome: j.nome, v: 0, d: 0, e: 0, p: 0 });
      p.nome = j.nome; p.p += pontos[j.id] || 0;
    }
    const h = db.jogos_hist[guildId] || (db.jogos_hist[guildId] = []);
    h.unshift({ at: new Date().toISOString(), jogo, canalId, jogadores: jogadores.map(j => ({ id: j.id, nome: j.nome })), pontos, resumo });
    h.splice(200);
    salvar('jogos_placar'); salvar('jogos_hist');
  }

  // ----- xadrez -----
  async function xadrez(msg, txt, s) {
    const me = { id: msg.author.id, nome: nomeDe(msg.author) }, say = t => msg.channel.send(t);
    if (!s) s = { jogo: 'xadrez', fase: 'espera', brancas: null, pretas: null, b: null, turno: true };
    if (s.fase === 'espera') {
      if (/^jogar$/i.test(txt)) {
        if (!s.brancas) { s.brancas = me; sessoes.set(msg.channel.id, s); return say(`⚪ **${me.nome}** entrou como brancas. Falta um oponente: digite \`jogar\`.`); }
        if (s.brancas.id === me.id) return say('Você já está na partida. Aguarde o oponente.');
        s.pretas = me; s.fase = 'jogo'; s.b = R.xInicio(); s.turno = true;
        return say(`♟️ Partida começou! ⚪ **${s.brancas.nome}** × ⚫ **${s.pretas.nome}**\n${tabuleiroXadrez(s.b)}Vez das brancas. Jogue assim: \`e2 e4\`. Para desistir: \`desistir\`.`);
      }
      return;
    }
    if (/^desistir$/i.test(txt)) {
      if (me.id !== s.brancas.id && me.id !== s.pretas.id) return;
      const venc = me.id === s.brancas.id ? s.pretas : s.brancas, perd = me;
      registrarPartida({ guildId: msg.guild.id, jogo: 'xadrez', canalId: msg.channel.id, jogadores: [s.brancas, s.pretas], resultados: { [venc.id]: 'v', [perd.id]: 'd' }, resumo: `${perd.nome} desistiu` });
      sessoes.delete(msg.channel.id);
      return say(`🏳️ **${perd.nome}** desistiu. **${venc.nome}** venceu a partida!`);
    }
    const m = txt.match(/^([a-h][1-8])\s*[-–]?\s*([a-h][1-8])$/i);
    if (!m) return;
    const atual = s.turno ? s.brancas : s.pretas;
    if (me.id !== atual.id) return say(`Não é sua vez. Aguarde **${atual.nome}**.`);
    const de = sq(m[1].toLowerCase()), para = sq(m[2].toLowerCase());
    const lance = R.xLegais(s.b, s.turno).find(x => x[0] === de.r && x[1] === de.c && x[2] === para.r && x[3] === para.c);
    if (!lance) return say('Lance ilegal. Tente de novo.');
    s.b = R.xAplica(s.b, lance); s.turno = !s.turno;
    const outro = s.turno ? s.brancas : s.pretas;
    if (R.xLegais(s.b, s.turno).length === 0) {
      const fim = R.xEmXeque(s.b, s.turno);
      const resumo = fim ? `Xeque-mate, venceu ${me.nome}` : 'Empate por afogamento';
      registrarPartida({ guildId: msg.guild.id, jogo: 'xadrez', canalId: msg.channel.id, jogadores: [s.brancas, s.pretas], resultados: fim ? { [me.id]: 'v', [outro.id]: 'd' } : { [s.brancas.id]: 'e', [s.pretas.id]: 'e' }, resumo });
      sessoes.delete(msg.channel.id);
      return say(`${tabuleiroXadrez(s.b)}${fim ? `🏆 Xeque-mate! **${me.nome}** venceu.` : '🤝 Empate por afogamento.'}`);
    }
    sessoes.set(msg.channel.id, s);
    const aviso = R.xEmXeque(s.b, s.turno) ? ' ⚠️ **Xeque!**' : '';
    return say(`${tabuleiroXadrez(s.b)}Vez de **${outro.nome}**.${aviso}`);
  }

  // ----- dama -----
  async function dama(msg, txt, s) {
    const me = { id: msg.author.id, nome: nomeDe(msg.author) }, say = t => msg.channel.send(t);
    if (!s) s = { jogo: 'dama', fase: 'espera', w: null, b: null, tab: null, turno: 'w' };
    if (s.fase === 'espera') {
      if (/^jogar$/i.test(txt)) {
        if (!s.w) { s.w = me; sessoes.set(msg.channel.id, s); return say(`🔴 **${me.nome}** entrou com as peças brancas. Falta um oponente: digite \`jogar\`.`); }
        if (s.w.id === me.id) return say('Você já está na partida. Aguarde o oponente.');
        s.bl = me; s.fase = 'jogo'; s.tab = R.dInicio(); s.turno = 'w';
        return say(`⚫ Partida começou! 🔴 **${s.w.nome}** × ⚪ **${s.bl.nome}**\n${tabuleiroDama(s.tab)}Vez de **${s.w.nome}**. Jogue as casas assim: \`c3 d4\` (em capturas, o caminho inteiro: \`c3 e5 g7\`). Para desistir: \`desistir\`.`);
      }
      return;
    }
    const jogadorDe = c => (c === 'w' ? s.w : s.bl);
    if (/^desistir$/i.test(txt)) {
      if (me.id !== s.w.id && me.id !== s.bl.id) return;
      const venc = me.id === s.w.id ? s.bl : s.w;
      registrarPartida({ guildId: msg.guild.id, jogo: 'dama', canalId: msg.channel.id, jogadores: [s.w, s.bl], resultados: { [venc.id]: 'v', [me.id]: 'd' }, resumo: `${me.nome} desistiu` });
      sessoes.delete(msg.channel.id);
      return say(`🏳️ **${me.nome}** desistiu. **${venc.nome}** venceu!`);
    }
    const toks = txt.toLowerCase().split(/[\s-]+/).filter(Boolean);
    if (toks.length < 2 || !toks.every(t => /^[a-h][1-8]$/.test(t))) return;
    const atual = jogadorDe(s.turno);
    if (me.id !== atual.id) return say(`Não é sua vez. Aguarde **${atual.nome}**.`);
    const caminho = toks.map(sq);
    const lance = R.dLances(s.tab, s.turno).find(l => l.caminho.length === caminho.length && l.caminho.every((p, i) => p[0] === caminho[i].r && p[1] === caminho[i].c));
    if (!lance) return say('Lance inválido. Para capturas, digite o caminho completo (ex.: `c3 e5 g7`).');
    s.tab = R.dAplica(s.tab, lance);
    const quem = atual; s.turno = s.turno === 'w' ? 'b' : 'w';
    const prox = jogadorDe(s.turno);
    if (R.dLances(s.tab, s.turno).length === 0) {
      registrarPartida({ guildId: msg.guild.id, jogo: 'dama', canalId: msg.channel.id, jogadores: [s.w, s.bl], resultados: { [quem.id]: 'v', [prox.id]: 'd' }, resumo: `${quem.nome} venceu (adversário sem lances)` });
      sessoes.delete(msg.channel.id);
      return say(`${tabuleiroDama(s.tab)}🏆 **${quem.nome}** venceu! ${prox.nome} não tem mais lances.`);
    }
    sessoes.set(msg.channel.id, s);
    return say(`${tabuleiroDama(s.tab)}Vez de **${prox.nome}**.`);
  }

  // ----- pedra, papel ou tesoura (contra o Tenchiko) -----
  async function ppt(msg, txt) {
    const esc = txt.toLowerCase();
    if (!['pedra', 'papel', 'tesoura'].includes(esc)) return;
    const me = { id: msg.author.id, nome: nomeDe(msg.author) };
    const ops = ['pedra', 'papel', 'tesoura'], cpu = ops[rnd(0, 2)];
    const ganha = { pedra: 'tesoura', papel: 'pedra', tesoura: 'papel' };
    let r, t;
    if (esc === cpu) { r = 'e'; t = '🤝 Empate!'; }
    else if (ganha[esc] === cpu) { r = 'v'; t = `🏆 **${me.nome}** venceu!`; }
    else { r = 'd'; t = '🤖 O Tenchiko venceu esta rodada.'; }
    registrarPartida({ guildId: msg.guild.id, jogo: 'ppt', canalId: msg.channel.id, jogadores: [me], resultados: { [me.id]: r }, resumo: `${esc} × ${cpu}` });
    return msg.channel.send(`Você: **${esc}** · Tenchiko: **${cpu}**\n${t}`);
  }

  // ----- adivinhação de palavra (boneco) -----
  function estadoForca(s) {
    const mostra = [...s.alvo.p].map(x => (s.certas.has(x) || (s.fim && !s.venceu)) ? x : '_').join(' ');
    return `${boneco(s.erros)}Palavra: \`${mostra}\`\nDica: ${s.alvo.d}\nErros: ${s.erros} de 6 · Letras usadas: ${[...s.usadas].join(' ') || '—'}`;
  }
  async function forca(msg, txt, s) {
    const me = { id: msg.author.id, nome: nomeDe(msg.author) }, say = t => msg.channel.send(t);
    if (!s || s.fim) {
      if (!/^jogar$/i.test(txt)) return;
      s = { jogo: 'forca', alvo: PALAVRAS[rnd(0, PALAVRAS.length - 1)], certas: new Set(), usadas: new Set(), erros: 0, fim: false, venceu: false, jogador: me };
      sessoes.set(msg.channel.id, s);
      return say(`🔤 Nova palavra! ${estadoForca(s)}\nDigite uma letra para chutar.`);
    }
    if (!/^[a-zçA-ZÇ]$/.test(txt)) return;
    const l = txt.toUpperCase();
    if (s.usadas.has(l)) return say(`A letra **${l}** já foi usada.`);
    s.usadas.add(l);
    if (s.alvo.p.includes(l)) s.certas.add(l); else s.erros++;
    if (s.erros >= 6) s.fim = true;
    else if ([...s.alvo.p].every(x => s.certas.has(x))) { s.fim = true; s.venceu = true; }
    if (s.fim) {
      registrarPartida({ guildId: msg.guild.id, jogo: 'forca', canalId: msg.channel.id, jogadores: [s.jogador], resultados: { [s.jogador.id]: s.venceu ? 'v' : 'd' }, resumo: `palavra ${s.alvo.p}` });
      sessoes.delete(msg.channel.id);
      return say(`${estadoForca(s)}\n${s.venceu ? `🏆 Acertou! **${s.alvo.p}**` : `💀 Perdeu! A palavra era **${s.alvo.p}**`}`);
    }
    sessoes.set(msg.channel.id, s);
    return say(estadoForca(s));
  }

  // ----- matemática (rodada de 10 contas) -----
  function novaConta() {
    const ops = ['+', '−', '×'], op = ops[rnd(0, 2)];
    let a, b, res;
    if (op === '+') { a = rnd(1, 50); b = rnd(1, 50); res = a + b; }
    else if (op === '−') { a = rnd(1, 50); b = rnd(1, a); res = a - b; }
    else { a = rnd(2, 12); b = rnd(2, 12); res = a * b; }
    return { texto: `${a} ${op} ${b} = ?`, res };
  }
  async function matematica(msg, txt, s) {
    const me = { id: msg.author.id, nome: nomeDe(msg.author) }, say = t => msg.channel.send(t);
    if (!s) {
      if (!/^jogar$/i.test(txt)) return;
      s = { jogo: 'matematica', n: 0, total: 10, conta: novaConta(), pontos: {}, nomes: {} };
      sessoes.set(msg.channel.id, s);
      return say(`➗ Rodada de 10 contas! Responda no chat, o primeiro a acertar ganha o ponto.\n**${s.n + 1}/10** → ${s.conta.texto}`);
    }
    if (!/^-?\d+$/.test(txt)) return;
    if (Number(txt) !== s.conta.res) return;
    s.pontos[me.id] = (s.pontos[me.id] || 0) + 1; s.nomes[me.id] = me.nome;
    s.n++;
    if (s.n < s.total) {
      s.conta = novaConta();
      sessoes.set(msg.channel.id, s);
      return say(`✔ **${me.nome}** acertou! Próxima: **${s.n + 1}/10** → ${s.conta.texto}`);
    }
    const jogadores = Object.keys(s.pontos).map(id => ({ id, nome: s.nomes[id] }));
    const ranking = jogadores.sort((a, b) => s.pontos[b.id] - s.pontos[a.id]).map(j => `${j.nome}: ${s.pontos[j.id]}`).join(' · ') || 'ninguém pontuou';
    if (jogadores.length) registrarPontos({ guildId: msg.guild.id, jogo: 'matematica', canalId: msg.channel.id, jogadores, pontos: s.pontos, resumo: ranking });
    sessoes.delete(msg.channel.id);
    return say(`🏁 Rodada encerrada! ${ranking}`);
  }

  const HANDLERS = { xadrez, dama, ppt, forca, matematica };
  client.on('messageCreate', async msg => {
    try {
      if (!msg.guild || msg.author.bot) return;
      const jogo = jogoDoCanal(msg.guild.id, msg.channel.id);
      if (!jogo) return;
      const txt = String(msg.content || '').trim();
      const s = sessoes.get(msg.channel.id);
      const sessaoDoJogo = s && s.jogo === jogo ? s : undefined;
      await HANDLERS[jogo](msg, txt, sessaoDoJogo);
    } catch (e) { console.error('❌ jogos:', e.message); }
  });

  function resumo(guildId) {
    const pl = db.jogos_placar[guildId] || {};
    const placar = Object.entries(pl).map(([id, p]) => ({ id, nome: p.nome, v: p.v, d: p.d, e: p.e, p: p.p }))
      .sort((a, b) => b.p - a.p || b.v - a.v || a.nome.localeCompare(b.nome));
    return { config: cfgDe(guildId), placar, historico: (db.jogos_hist[guildId] || []).slice(0, 30) };
  }

  return { JOGOS, CATEGORIA, salvarConfig, resumo, cfgDe, jogoDoCanal };
};
module.exports.JOGOS = JOGOS;
module.exports.CATEGORIA = CATEGORIA;

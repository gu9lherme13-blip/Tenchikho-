'use strict';
// =========================================================
// 🌌 NVB • ENTRETENIMENTO — LOTE 2
// /multiverso /interacao /ship /interacao-animal /personagem
// /personagem-anime /animequiz /destino-anime /transformacao-anime
// /poder-anime /batalha-anime /duelo-anime
// =========================================================
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');

const COR = 0x7c3aed;
const NO_PING = { parse: [] };

// ---------- ações (interações) ----------
// [rótulo, emoji, frase com alvo, frase sem alvo (null = exige alvo)]
const ACOES_BASE = [
  ['Abraçar', '🤗', '{p} deu um abraço em {t}!', null],
  ['Cumprimentar', '👋', '{p} cumprimentou {t}!', '{p} cumprimentou todo mundo.'],
  ['Apertar mão', '🤝', '{p} apertou a mão de {t}.', null],
  ['Highfive', '✋', '{p} deu um high five em {t}!', null],
  ['Acenar', '👋', '{p} acenou para {t}.', '{p} acenou para todos.'],
  ['Sorrir', '😊', '{p} sorriu para {t}.', '{p} abriu um sorriso.'],
  ['Agradecer', '🙏', '{p} agradeceu a {t}.', '{p} agradeceu a todos.'],
  ['Elogiar', '🌟', '{p} elogiou {t}!', null],
  ['Apoiar', '💪', '{p} apoiou {t}.', null],
  ['Parabenizar', '🎉', '{p} parabenizou {t}!', '{p} está parabenizando todo mundo!'],
  ['Encorajar', '📣', '{p} encorajou {t}!', null],
  ['Proteger', '🛡️', '{p} protegeu {t}!', null],
  ['Zoar', '😂', '{p} começou a zoar {t}.', null],
  ['Provocar', '😏', '{p} provocou {t}.', null],
  ['Assustar', '😱', '{p} assustou {t}!', null],
  ['Trollar', '🤡', '{p} trollou {t}.', null],
  ['Empurrar', '💥', '{p} empurrou {t}!', null],
  ['Perseguir', '🏃', '{p} está perseguindo {t}!', null],
  ['Atrapalhar', '🙃', '{p} atrapalhou {t}.', null],
  ['Expor', '📢', '{p} contou um segredinho de {t}!', null],
  ['Desafiar', '🔥', '{p} desafiou {t}!', null],
  ['Duelar', '⚔️', '{p} chamou {t} para um duelo!', null],
  ['Atacar', '⚔️', '{p} atacou {t}!', null],
  ['Defender', '🛡️', '{p} defendeu {t}!', '{p} assumiu postura de defesa.'],
  ['Esquivar', '💨', '{p} esquivou do ataque de {t}!', '{p} esquivou com agilidade.'],
  ['Bloquear', '🚧', '{p} bloqueou o golpe de {t}!', '{p} bloqueou o golpe.'],
  ['Contra-atacar', '🔁', '{p} contra-atacou {t}!', null],
  ['Derrotar', '🏆', '{p} derrotou {t}!', null],
  ['Salvar', '🦸', '{p} salvou {t}!', null],
  ['Reviver', '✨', '{p} reviveu {t}!', null],
  ['Curar', '💚', '{p} curou {t}!', '{p} se curou.'],
  ['Buffar', '💫', '{p} deu um buff em {t}!', '{p} se fortaleceu.'],
  ['Morder', '🧛', '{p} mordeu {t}!', null],
  ['Caçar', '🏹', '{p} está caçando {t}!', '{p} saiu para caçar.'],
  ['Amaldiçoar', '☠️', '{p} amaldiçoou {t}!', null],
  ['Abençoar', '🙌', '{p} abençoou {t}.', '{p} abençoou o servidor.'],
  ['Invocar', '🔮', '{p} invocou {t}!', '{p} realizou uma invocação!'],
  ['Hipnotizar', '🌀', '{p} hipnotizou {t}!', null],
  ['Transformar', '⚡', '{p} transformou {t}!', '{p} se transformou!'],
  ['Teleportar', '🌌', '{p} teleportou {t} para outro lugar!', '{p} se teleportou!'],
  ['Selar', '🔒', '{p} selou {t}!', null],
  ['Libertar', '🔓', '{p} libertou {t}!', null],
  ['Convocar', '📯', '{p} convocou {t}!', '{p} convocou a todos!'],
  ['Carinho', '🥰', '{p} fez carinho em {t}.', null],
  ['Cafuné', '😌', '{p} fez cafuné em {t}.', null],
  ['Colo', '🫂', '{p} deu colo para {t}.', null],
  ['Consolar', '🫶', '{p} consolou {t}.', null],
  ['Mimar', '💝', '{p} mimou {t}!', null],
  ['Dar presente', '🎁', '{p} deu um presente para {t}!', null],
  ['Dar flor', '🌹', '{p} deu uma flor para {t}.', null],
  ['Mandar beijo', '😘', '{p} mandou um beijo para {t}.', null],
  ['Dormir com', '😴', '{p} cochilou ao lado de {t}.', null],
  ['Fazer companhia', '🤗', '{p} está fazendo companhia para {t}.', null],
  ['Treinar', '🥋', '{p} está treinando com {t}!', '{p} está treinando.'],
  ['Jogar', '🎮', '{p} está jogando com {t}!', '{p} está jogando.'],
  ['Cozinhar', '🍳', '{p} cozinhou para {t}!', '{p} está cozinhando.'],
  ['Comer', '🍜', '{p} está comendo com {t}.', '{p} está comendo.'],
  ['Estudar', '📚', '{p} está estudando com {t}.', '{p} está estudando.'],
  ['Dormir', '💤', '{p} foi dormir perto de {t}.', '{p} foi dormir.'],
  ['Viajar', '✈️', '{p} viajou com {t}!', '{p} saiu em viagem.'],
  ['Explorar', '🧭', '{p} está explorando com {t}!', '{p} está explorando.'],
  ['Dançar', '💃', '{p} dançou com {t}!', '{p} está dançando.'],
  ['Cantar', '🎤', '{p} cantou para {t}!', '{p} está cantando.'],
  ['Assistir', '📺', '{p} está assistindo com {t}.', '{p} está assistindo algo.'],
  ['Ouvir música', '🎧', '{p} está ouvindo música com {t}.', '{p} está ouvindo música.'],
  ['Passear', '🚶', '{p} saiu para passear com {t}.', '{p} saiu para passear.'],
  ['Rir', '😂', '{p} riu junto com {t}.', '{p} caiu na gargalhada.'],
  ['Chorar', '😢', '{p} chorou no ombro de {t}.', '{p} está chorando.'],
  ['Surpreso', '😲', '{p} levou um susto de surpresa com {t}!', '{p} ficou boquiaberto(a)!'],
  ['Confuso', '😵', '{p} ficou sem entender {t}.', '{p} ficou confuso(a).'],
  ['Feliz', '😄', '{p} ficou radiante com {t}!', '{p} está radiante!'],
  ['Triste', '😞', '{p} ficou de coração apertado por causa de {t}.', '{p} está de coração apertado.'],
  ['Irritar', '😤', '{p} irritou {t}.', '{p} se irritou.'],
  ['Assustado', '😨', '{p} levou um grande susto com {t}!', '{p} levou um grande susto!'],
  ['Encarar', '👀', '{p} encarou {t}.', '{p} ficou encarando o vazio.'],
  ['Ignorar', '🙄', '{p} ignorou {t}.', null],
  ['Aplaudir', '👏', '{p} aplaudiu {t}!', '{p} está aplaudindo!'],
  ['Comemorar', '🥳', '{p} comemorou com {t}!', '{p} está comemorando!']
];
const semAcento = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const ACOES = ACOES_BASE.map(([nome, emoji, comAlvo, solo]) => ({ key: semAcento(nome).replace(/\s+/g, '-'), nome, emoji, comAlvo, solo }));
const ACAO_POR_KEY = new Map(ACOES.map(a => [a.key, a]));

// ---------- universos e personagens (nomes de personagens conhecidos) ----------
const UNIVERSOS = [
  { key: 'anime', nome: 'Anime', emoji: '🎌' }, { key: 'desenhos', nome: 'Desenhos', emoji: '🎨' },
  { key: 'filmes', nome: 'Filmes', emoji: '🎬' }, { key: 'series', nome: 'Séries', emoji: '📺' },
  { key: 'hqs', nome: 'HQs / Comics', emoji: '📚' }, { key: 'jogos', nome: 'Jogos', emoji: '🎮' },
  { key: 'marvel', nome: 'Marvel', emoji: '🦸' }, { key: 'dc', nome: 'DC', emoji: '🦇' }, { key: 'outros', nome: 'Outros', emoji: '🌌' }
];
const PERSONAGENS = {
  desenhos: ['Bob Esponja', 'Patrick Estrela', 'Mickey Mouse', 'Pateta', 'Tom', 'Jerry', 'Scooby-Doo', 'Dexter', 'Homer Simpson', 'Bart Simpson', 'Finn', 'Jake', 'Steven Universo'],
  filmes: ['Shrek', 'Jack Sparrow', 'Harry Potter', 'Gandalf', 'Darth Vader', 'Luke Skywalker', 'Indiana Jones', 'Neo', 'John Wick', 'Rocky Balboa', 'Woody', 'Buzz Lightyear', 'Simba', 'Elsa'],
  series: ['Walter White', 'Eleven', 'Geralt de Rívia', 'Tyrion Lannister', 'Jon Snow', 'Daenerys Targaryen', 'Sherlock Holmes', 'Dexter Morgan', 'Michael Scott'],
  hqs: ['Mônica', 'Cebolinha', 'Cascão', 'Magali', 'Chico Bento', 'Spawn', 'Hellboy', 'Tintim', 'Asterix', 'Garfield', 'Calvin'],
  jogos: ['Mario', 'Luigi', 'Link', 'Zelda', 'Sonic', 'Pikachu', 'Kratos', 'Master Chief', 'Steve', 'Creeper', 'Lara Croft', 'Pac-Man', 'Crash Bandicoot', 'Ezio Auditore'],
  marvel: ['Homem-Aranha', 'Homem de Ferro', 'Capitão América', 'Thor', 'Hulk', 'Viúva Negra', 'Pantera Negra', 'Doutor Estranho', 'Wolverine', 'Deadpool', 'Thanos', 'Loki', 'Capitã Marvel', 'Venom', 'Groot'],
  dc: ['Superman', 'Batman', 'Mulher-Maravilha', 'Flash', 'Aquaman', 'Lanterna Verde', 'Ciborgue', 'Coringa', 'Arlequina', 'Robin', 'Mulher-Gato', 'Lex Luthor', 'Darkseid', 'Shazam', 'Asa Noturna'],
  outros: ['Drácula', 'Lobisomem', 'Frankenstein', 'Saci Pererê', 'Curupira', 'Iara', 'Boitatá', 'Anúbis', 'Zeus', 'Odin']
};

// ---------- animais (a foto e o texto vêm da Wikipédia em português) ----------
const CATEGORIAS_ANIMAIS = [
  { key: 'mamiferos1', nome: 'Mamíferos (1/2)', emoji: '🐾', animais: [['🐶', 'Cachorro', 'Cão'], ['🐱', 'Gato', 'Gato'], ['🦁', 'Leão', 'Leão'], ['🐯', 'Tigre', 'Tigre'], ['🐆', 'Leopardo', 'Leopardo'], ['🐺', 'Lobo', 'Lobo-cinzento'], ['🦊', 'Raposa', 'Raposa'], ['🐻', 'Urso', 'Urso'], ['🐼', 'Panda', 'Panda-gigante'], ['🐨', 'Coala', 'Coala'], ['🐵', 'Macaco', 'Macaco'], ['🦍', 'Gorila', 'Gorila'], ['🦧', 'Orangotango', 'Orangotango'], ['🐘', 'Elefante', 'Elefante'], ['🦏', 'Rinoceronte', 'Rinoceronte'], ['🦛', 'Hipopótamo', 'Hipopótamo'], ['🦒', 'Girafa', 'Girafa'], ['🦓', 'Zebra', 'Zebra'], ['🐴', 'Cavalo', 'Cavalo'], ['🦌', 'Veado', 'Veado'], ['🐗', 'Javali', 'Javali'], ['🐮', 'Vaca', 'Vaca'], ['🐷', 'Porco', 'Porco'], ['🐑', 'Ovelha', 'Ovelha'], ['🐐', 'Cabra', 'Cabra']] },
  { key: 'mamiferos2', nome: 'Mamíferos (2/2)', emoji: '🐾', animais: [['🐇', 'Coelho', 'Coelho'], ['🐿️', 'Esquilo', 'Esquilo'], ['🦔', 'Ouriço', 'Ouriço-cacheiro'], ['🦇', 'Morcego', 'Morcego'], ['🐬', 'Golfinho', 'Golfinho'], ['🐳', 'Baleia', 'Baleia'], ['🦭', 'Foca', 'Foca'], ['🦦', 'Lontra', 'Lontra']] },
  { key: 'aves', nome: 'Aves', emoji: '🦅', animais: [['🦅', 'Águia', 'Águia'], ['🦉', 'Coruja', 'Coruja'], ['🦜', 'Papagaio', 'Papagaio'], ['🦚', 'Pavão', 'Pavão'], ['🦩', 'Flamingo', 'Flamingo'], ['🦢', 'Cisne', 'Cisne'], ['🦆', 'Pato', 'Pato'], ['🐧', 'Pinguim', 'Pinguim'], ['🐔', 'Galinha', 'Galinha'], ['🦃', 'Peru', 'Peru'], ['🐦', 'Pardal', 'Pardal'], ['🐦‍⬛', 'Corvo', 'Corvo']] },
  { key: 'repteis', nome: 'Répteis', emoji: '🐊', animais: [['🐢', 'Tartaruga', 'Tartaruga'], ['🐊', 'Crocodilo', 'Crocodilo'], ['🐊', 'Jacaré', 'Jacaré'], ['🐍', 'Cobra', 'Serpente'], ['🦎', 'Lagarto', 'Lagarto'], ['🦎', 'Camaleão', 'Camaleão'], ['🐉', 'Dragão-de-Komodo', 'Dragão-de-komodo']] },
  { key: 'anfibios', nome: 'Anfíbios', emoji: '🐸', animais: [['🐸', 'Sapo', 'Sapo'], ['🐸', 'Rã', 'Rã'], ['🦎', 'Salamandra', 'Salamandra']] },
  { key: 'marinhos', nome: 'Animais marinhos', emoji: '🌊', animais: [['🦈', 'Tubarão', 'Tubarão'], ['🐙', 'Polvo', 'Polvo'], ['🦑', 'Lula', 'Lula'], ['🦀', 'Caranguejo', 'Caranguejo'], ['🦞', 'Lagosta', 'Lagosta'], ['🦐', 'Camarão', 'Camarão'], ['🪼', 'Água-viva', 'Água-viva'], ['⭐', 'Estrela-do-mar', 'Estrela-do-mar'], ['🐠', 'Peixe', 'Peixe'], ['🐡', 'Baiacu', 'Baiacu'], ['🐚', 'Nautilus', 'Nautilus']] },
  { key: 'insetos', nome: 'Insetos e pequenos animais', emoji: '🐝', animais: [['🦋', 'Borboleta', 'Borboleta'], ['🐝', 'Abelha', 'Abelha'], ['🐞', 'Joaninha', 'Joaninha'], ['🪲', 'Besouro', 'Besouro'], ['🦗', 'Gafanhoto', 'Gafanhoto'], ['🦟', 'Mosquito', 'Mosquito'], ['🪰', 'Mosca', 'Mosca'], ['🕷️', 'Aranha', 'Aranha'], ['🦂', 'Escorpião', 'Escorpião'], ['🐌', 'Caracol', 'Caracol'], ['🪱', 'Minhoca', 'Minhoca']] }
];

// ---------- Wikipédia (foto e resumo reais) ----------
const cacheWiki = new Map();
async function wikiResumo(titulo) {
  if (cacheWiki.has(titulo)) return cacheWiki.get(titulo);
  let r = null;
  try {
    const res = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo.replace(/ /g, '_'))}`, {
      headers: { 'User-Agent': 'QG-NVB-Bot/1.0 (comunidade Discord NVB)', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const j = await res.json();
      if (j.type !== 'disambiguation' && j.extract) r = { titulo: j.title, texto: j.extract, imagem: j.originalimage?.source || j.thumbnail?.source || null, url: j.content_urls?.desktop?.page || null };
    }
  } catch { /* sem rede ou página inexistente: retorna null */ }
  if (r) cacheWiki.set(titulo, r);
  return r;
}
function cortarTexto(t, max = 380) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const corte = s.lastIndexOf('. ', max);
  return corte > max * 0.5 ? s.slice(0, corte + 1) : `${s.slice(0, max - 1).trim()}…`;
}

// ---------- utilidades ----------
function hash(str) { let h = 2166136261; for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; }
const sorteio = arr => arr[Math.floor(Math.random() * arr.length)];
const barra = p => { const c = Math.round(p / 10); return '█'.repeat(c) + '░'.repeat(10 - c); };

module.exports = function iniciarEntretenimento(ctx) {
  const { client, GUILD_ID, ANIME_CHARACTERS = [], ANIME_TRANSFORMS = [], ANIME_DESTINIES = [], ANIME_QUIZ = [], normalizeQG = semAcento } = ctx;
  PERSONAGENS.anime = [...ANIME_CHARACTERS];
  const norm = s => normalizeQG(String(s));

  const COMANDOS = [
    new SlashCommandBuilder().setName('multiverso').setDescription('Escolha um universo, um personagem e uma ação')
      .addStringOption(o => o.setName('universo').setDescription('Universo do personagem').setRequired(true).addChoices(...UNIVERSOS.map(u => ({ name: `${u.emoji} ${u.nome}`, value: u.key }))))
      .addStringOption(o => o.setName('personagem').setDescription('Personagem (digite o nome ou escolha na lista)').setMaxLength(60).setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('acao').setDescription('O que o personagem faz').setRequired(true).setAutocomplete(true))
      .addUserOption(o => o.setName('alvo').setDescription('Membro que recebe a ação (opcional)')),
    new SlashCommandBuilder().setName('interacao').setDescription('Interaja com um membro (ou sozinho)')
      .addStringOption(o => o.setName('acao').setDescription('A ação').setRequired(true).setAutocomplete(true))
      .addUserOption(o => o.setName('alvo').setDescription('Membro que recebe a ação (opcional)')),
    new SlashCommandBuilder().setName('ship').setDescription('Veja a compatibilidade entre duas pessoas')
      .addUserOption(o => o.setName('pessoa1').setDescription('Primeira pessoa').setRequired(true))
      .addUserOption(o => o.setName('pessoa2').setDescription('Segunda pessoa').setRequired(true)),
    new SlashCommandBuilder().setName('interacao-animal').setDescription('Escolha uma categoria e um animal para ver foto e curiosidade'),
    new SlashCommandBuilder().setName('personagem').setDescription('Mostra foto e resumo de um personagem (Wikipédia)')
      .addStringOption(o => o.setName('universo').setDescription('Universo').setRequired(true).addChoices(...UNIVERSOS.map(u => ({ name: `${u.emoji} ${u.nome}`, value: u.key }))))
      .addStringOption(o => o.setName('nome').setDescription('Nome do personagem').setMaxLength(60).setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder().setName('personagem-anime').setDescription('Descubra qual personagem de anime você é hoje')
      .addUserOption(o => o.setName('usuario').setDescription('Membro (padrão: você)')),
    new SlashCommandBuilder().setName('animequiz').setDescription('Responda a uma pergunta de anime'),
    new SlashCommandBuilder().setName('destino-anime').setDescription('Descubra o seu destino de anime')
      .addUserOption(o => o.setName('usuario').setDescription('Membro (padrão: você)')),
    new SlashCommandBuilder().setName('transformacao-anime').setDescription('Sorteia uma transformação')
      .addUserOption(o => o.setName('usuario').setDescription('Membro (padrão: você)')),
    new SlashCommandBuilder().setName('poder-anime').setDescription('Mede o nível de poder de um membro')
      .addUserOption(o => o.setName('usuario').setDescription('Membro (padrão: você)')),
    new SlashCommandBuilder().setName('batalha-anime').setDescription('Batalha entre dois personagens de anime')
      .addStringOption(o => o.setName('personagem1').setDescription('Primeiro personagem').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('personagem2').setDescription('Segundo personagem').setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder().setName('duelo-anime').setDescription('Duelo de anime contra outro membro')
      .addUserOption(o => o.setName('oponente').setDescription('Membro que você desafia').setRequired(true))
  ].map(c => c.setDMPermission(false));
  const NOMES = new Set(COMANDOS.map(c => c.name));

  async function registrar() {
    if (process.env.NVB_REGISTER_COMMANDS === '0') return;
    const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
    if (!guild) { console.warn('⚠️ Entretenimento: nenhum servidor encontrado para registrar.'); return; }
    for (const c of COMANDOS) {
      try { await guild.commands.create(c.toJSON()); }
      catch (e) { console.error(`❌ Entretenimento: falha ao registrar /${c.name}:`, e.message); }
    }
    console.log(`🌌 Entretenimento NVB (lote 2): ${COMANDOS.length} comandos registrados em "${guild.name}".`);
  }

  // ---------- respostas ----------
  async function responder(i, p) {
    const payload = { allowedMentions: NO_PING, ...p };
    try {
      if (i.deferred && !i.replied) return await i.editReply(payload);
      if (i.deferred || i.replied) return await i.followUp(payload);
      return await i.reply(payload);
    } catch (e) { if (e?.code === 10062 || e?.code === 10015) return null; throw e; }
  }
  const efemero = { flags: MessageFlags.Ephemeral };
  const mencao = u => `<@${u.id}>`;

  function montarFrase(acao, nomeP, alvo) {
    if (alvo) return `${acao.emoji} ${acao.comAlvo.replace('{p}', nomeP).replace('{t}', mencao(alvo))}`;
    if (!acao.solo) return null;
    return `${acao.emoji} ${acao.solo.replace('{p}', nomeP)}`;
  }
  const cardAcao = (texto, user) => new EmbedBuilder().setColor(COR).setDescription(texto).setFooter({ text: `NVB • ${user.username}`, iconURL: user.displayAvatarURL?.() });

  // ---------- componentes dos animais ----------
  const menuCategorias = uid => new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`animal_cat:${uid}`).setPlaceholder('🐾 Escolha uma categoria')
      .addOptions(CATEGORIAS_ANIMAIS.map(c => ({ label: c.nome, value: c.key, emoji: { name: c.emoji } }))));
  const menuAnimais = (cat, uid) => new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`animal_pick:${cat.key}:${uid}`).setPlaceholder(`${cat.emoji} ${cat.nome}: escolha o animal`)
      .addOptions(cat.animais.map(([emoji, nome], idx) => ({ label: nome, value: String(idx), emoji: { name: emoji } }))));

  async function tratarComponente(i) {
    const [tipo, a, b] = i.customId.split(':');
    if (tipo === 'animal_cat' || tipo === 'animal_pick') {
      const dono = tipo === 'animal_cat' ? a : b;
      if (i.user.id !== dono) return i.reply({ content: '❌ Use `/interacao-animal` para abrir o seu próprio menu.', ...efemero });
      if (tipo === 'animal_cat') {
        const cat = CATEGORIAS_ANIMAIS.find(c => c.key === i.values[0]);
        if (!cat) return i.reply({ content: '❌ Categoria inválida.', ...efemero });
        return i.update({ content: `🐾 **${cat.nome}** — escolha o animal:`, components: [menuAnimais(cat, dono), menuCategorias(dono)] });
      }
      const cat = CATEGORIAS_ANIMAIS.find(c => c.key === a), animal = cat?.animais[Number(i.values[0])];
      if (!animal) return i.reply({ content: '❌ Animal inválido.', ...efemero });
      await i.deferUpdate();
      const [emoji, nome, titulo] = animal, wiki = await wikiResumo(titulo);
      const e = new EmbedBuilder().setColor(COR).setTitle(`${nome} ${emoji}`)
        .setDescription(wiki ? cortarTexto(wiki.texto) : 'Não consegui carregar a foto e o texto deste animal agora. Tente de novo em instantes.')
        .setFooter({ text: i.member?.displayName || i.user.username, iconURL: i.user.displayAvatarURL?.() });
      if (wiki?.imagem) e.setImage(wiki.imagem);
      return i.editReply({ content: '', embeds: [e], components: [] });
    }
    if (tipo === 'quiz') { // quiz:userId:indicePergunta:indiceResposta
      const [, uid, qi, ai] = i.customId.split(':');
      if (i.user.id !== uid) return i.reply({ content: '❌ Esse quiz é de outro membro. Use `/animequiz`.', ...efemero });
      const q = ANIME_QUIZ[Number(qi)], certo = q?.[2], marcou = Number(ai);
      if (!q) return i.reply({ content: '❌ Pergunta não encontrada.', ...efemero });
      const linhas = new ActionRowBuilder().addComponents(q[1].map((txt, k) => new ButtonBuilder().setCustomId(`quizx:${k}`).setLabel(String(txt).slice(0, 80)).setDisabled(true)
        .setStyle(k === certo ? ButtonStyle.Success : (k === marcou ? ButtonStyle.Danger : ButtonStyle.Secondary))));
      return i.update({ content: `${marcou === certo ? '✅ **Acertou!**' : `❌ **Errou!** A resposta era **${q[1][certo]}**.`}\n❓ ${q[0]}`, components: [linhas] });
    }
  }

  // ---------- comandos ----------
  async function executar(i) {
    const nome = i.commandName, eu = i.member?.displayName || i.user.username;

    if (nome === 'multiverso') {
      const uni = UNIVERSOS.find(u => u.key === i.options.getString('universo', true));
      const personagem = i.options.getString('personagem', true).trim(), acao = ACAO_POR_KEY.get(i.options.getString('acao', true));
      const alvo = i.options.getUser('alvo');
      if (!acao) return responder(i, { content: '❌ Escolha uma ação da lista que aparece ao digitar.', ...efemero });
      if (alvo?.bot) return responder(i, { content: '❌ Escolha um membro, não um bot.', ...efemero });
      const texto = montarFrase(acao, `**${personagem}**`, alvo);
      if (!texto) return responder(i, { content: `❌ A ação **${acao.nome}** precisa de um alvo. Marque um membro em \`alvo\`.`, ...efemero });
      return responder(i, { embeds: [cardAcao(texto, i.user).setAuthor({ name: `${uni.emoji} ${uni.nome} • ${personagem}` })] });
    }

    if (nome === 'interacao') {
      const acao = ACAO_POR_KEY.get(i.options.getString('acao', true)), alvo = i.options.getUser('alvo');
      if (!acao) return responder(i, { content: '❌ Escolha uma ação da lista que aparece ao digitar.', ...efemero });
      if (alvo?.bot) return responder(i, { content: '❌ Escolha um membro, não um bot.', ...efemero });
      if (alvo?.id === i.user.id) return responder(i, { content: '❌ Escolha outra pessoa como alvo (ou deixe vazio para a versão solo).', ...efemero });
      const texto = montarFrase(acao, mencao(i.user), alvo);
      if (!texto) return responder(i, { content: `❌ A ação **${acao.nome}** precisa de um alvo. Marque um membro em \`alvo\`.`, ...efemero });
      return responder(i, { embeds: [cardAcao(texto, i.user)] });
    }

    if (nome === 'ship') {
      const a = i.options.getUser('pessoa1', true), b = i.options.getUser('pessoa2', true);
      if (a.bot || b.bot) return responder(i, { content: '❌ Escolha membros, não bots.', ...efemero });
      if (a.id === b.id) return responder(i, { content: '❌ Escolha duas pessoas diferentes.', ...efemero });
      const pa = hash(`${a.id}>${b.id}|nvb`) % 101, pb = hash(`${b.id}>${a.id}|nvb`) % 101, total = Math.round((pa + pb) / 2);
      const na = a.username, nb = b.username, navio = `${na.slice(0, Math.ceil(na.length / 2))}${nb.slice(Math.floor(nb.length / 2))}`;
      const veredito = total >= 80 ? '💞 Almas gêmeas!' : total >= 60 ? '💖 Combinam muito!' : total >= 40 ? '💛 Tem potencial.' : total >= 20 ? '🧡 Só com muito esforço.' : '💔 Melhor ficarem na amizade.';
      const e = new EmbedBuilder().setColor(0xec4899).setTitle(`💘 Ship: ${navio}`)
        .setDescription(`❤️ ${mencao(a)} — **${pa}%** × **${pb}%** — ${mencao(b)} ❤️\n\n💞 Compatibilidade: **${total}%**\n\`${barra(total)}\`\n${veredito}`);
      return responder(i, { embeds: [e] });
    }

    if (nome === 'interacao-animal') {
      return responder(i, { content: '🐾 **INTERAÇÃO ANIMAL**\nEscolha uma categoria:', components: [menuCategorias(i.user.id)] });
    }

    if (nome === 'personagem') {
      const uni = UNIVERSOS.find(u => u.key === i.options.getString('universo', true)), busca = i.options.getString('nome', true).trim();
      await i.deferReply();
      const wiki = await wikiResumo(busca);
      if (!wiki) return responder(i, { content: `❌ Não encontrei **${busca}** na Wikipédia. Tente o nome completo ou escolha uma sugestão da lista.` });
      const e = new EmbedBuilder().setColor(COR).setTitle(`${uni.emoji} ${wiki.titulo}`).setDescription(cortarTexto(wiki.texto, 500))
        .setFooter({ text: `${uni.nome} • pedido por ${eu}`, iconURL: i.user.displayAvatarURL?.() });
      if (wiki.imagem) e.setImage(wiki.imagem);
      if (wiki.url) e.setURL(wiki.url);
      return responder(i, { embeds: [e] });
    }

    if (nome === 'personagem-anime') {
      const u = i.options.getUser('usuario') || i.user;
      if (!ANIME_CHARACTERS.length) return responder(i, { content: '❌ A lista de personagens de anime está vazia.', ...efemero });
      const dia = new Date().toISOString().slice(0, 10), p = ANIME_CHARACTERS[hash(`${u.id}|${dia}`) % ANIME_CHARACTERS.length];
      return responder(i, { embeds: [cardAcao(`🎌 O personagem de anime de ${mencao(u)} hoje é **${p}**!`, i.user)] });
    }

    if (nome === 'animequiz') {
      if (!ANIME_QUIZ.length) return responder(i, { content: '❌ Não há perguntas cadastradas.', ...efemero });
      const qi = Math.floor(Math.random() * ANIME_QUIZ.length), q = ANIME_QUIZ[qi];
      const linha = new ActionRowBuilder().addComponents(q[1].map((txt, k) => new ButtonBuilder().setCustomId(`quiz:${i.user.id}:${qi}:${k}`).setLabel(String(txt).slice(0, 80)).setStyle(ButtonStyle.Primary)));
      return responder(i, { content: `🎌 **Anime Quiz**\n❓ ${q[0]}`, components: [linha] });
    }

    if (nome === 'destino-anime') {
      const u = i.options.getUser('usuario') || i.user;
      if (!ANIME_DESTINIES.length) return responder(i, { content: '❌ Não há destinos cadastrados.', ...efemero });
      return responder(i, { embeds: [cardAcao(`🔮 **Destino de ${mencao(u)}**\n${sorteio(ANIME_DESTINIES)}`, i.user)] });
    }

    if (nome === 'transformacao-anime') {
      const u = i.options.getUser('usuario') || i.user;
      if (!ANIME_TRANSFORMS.length) return responder(i, { content: '❌ Não há transformações cadastradas.', ...efemero });
      return responder(i, { embeds: [cardAcao(`⚡ ${mencao(u)} despertou a **${sorteio(ANIME_TRANSFORMS)}**!`, i.user)] });
    }

    if (nome === 'poder-anime') {
      const u = i.options.getUser('usuario') || i.user, nivel = Math.floor(Math.random() * 1000000) + 1;
      const classe = nivel > 900000 ? 'Lendário 👑' : nivel > 700000 ? 'Mítico 🔥' : nivel > 400000 ? 'Elite ⚔️' : nivel > 150000 ? 'Veterano 🛡️' : 'Iniciante 🌱';
      return responder(i, { embeds: [cardAcao(`💥 Nível de poder de ${mencao(u)}: **${nivel.toLocaleString('pt-BR')}**\n🏷️ Classe: **${classe}**`, i.user)] });
    }

    if (nome === 'batalha-anime') {
      const p1 = i.options.getString('personagem1', true).trim(), p2 = i.options.getString('personagem2', true).trim();
      if (norm(p1) === norm(p2)) return responder(i, { content: '❌ Escolha dois personagens diferentes.', ...efemero });
      const venc = Math.random() < 0.5 ? p1 : p2, perd = venc === p1 ? p2 : p1;
      return responder(i, { embeds: [cardAcao(`⚔️ **${p1}** × **${p2}**\n\n🏆 **${venc}** venceu a batalha contra **${perd}**!`, i.user)] });
    }

    if (nome === 'duelo-anime') {
      const op = i.options.getUser('oponente', true);
      if (op.bot || op.id === i.user.id) return responder(i, { content: '❌ Escolha outro membro como oponente.', ...efemero });
      if (ANIME_CHARACTERS.length < 2) return responder(i, { content: '❌ A lista de personagens é pequena demais.', ...efemero });
      const c1 = sorteio(ANIME_CHARACTERS); let c2 = sorteio(ANIME_CHARACTERS); while (c2 === c1) c2 = sorteio(ANIME_CHARACTERS);
      const vencedor = Math.random() < 0.5 ? i.user : op, personagem = vencedor.id === i.user.id ? c1 : c2;
      return responder(i, { embeds: [cardAcao(`⚔️ **Duelo de anime!**\n${mencao(i.user)} como **${c1}** × ${mencao(op)} como **${c2}**\n\n🏆 ${mencao(vencedor)} venceu com **${personagem}**!`, i.user)] });
    }
  }

  // ---------- autocomplete ----------
  async function autocompletar(i) {
    const foco = i.options.getFocused(true), f = norm(foco.value || '');
    let lista = [];
    if (foco.name === 'acao') lista = ACOES.filter(a => norm(a.nome).includes(f)).map(a => ({ name: `${a.emoji} ${a.nome}`, value: a.key }));
    else if (i.commandName === 'multiverso' && foco.name === 'personagem') lista = (PERSONAGENS[i.options.getString('universo')] || []).filter(n => norm(n).includes(f)).map(n => ({ name: n, value: n }));
    else if (i.commandName === 'personagem' && foco.name === 'nome') lista = (PERSONAGENS[i.options.getString('universo')] || []).filter(n => norm(n).includes(f)).map(n => ({ name: n, value: n }));
    else if (i.commandName === 'batalha-anime') lista = ANIME_CHARACTERS.filter(n => norm(n).includes(f)).map(n => ({ name: n, value: n }));
    return i.respond(lista.slice(0, 25));
  }

  client.on('interactionCreate', async i => {
    try {
      if (i.isAutocomplete?.()) { if (NOMES.has(i.commandName)) await autocompletar(i); return; }
      if (i.isStringSelectMenu?.() || i.isButton?.()) {
        if (/^(animal_cat|animal_pick|quiz):/.test(i.customId)) await tratarComponente(i);
        return;
      }
      if (!i.isChatInputCommand?.() || !NOMES.has(i.commandName)) return;
      await executar(i);
    } catch (e) {
      console.error(`❌ /${i.commandName || i.customId}:`, e.message);
      if (i.isAutocomplete?.()) return;
      await responder(i, { content: `❌ Não consegui executar isso: ${String(e.message || 'erro inesperado').slice(0, 200)}`, ...(i.deferred || i.replied ? {} : efemero) }).catch(() => {});
    }
  });

  if (client.isReady()) registrar(); else client.once('ready', registrar);
  console.log('🌌 Entretenimento NVB (lote 2) carregado.');
};

module.exports.ACOES = ACOES;
module.exports.CATEGORIAS_ANIMAIS = CATEGORIAS_ANIMAIS;

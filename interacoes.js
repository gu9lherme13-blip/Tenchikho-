const { EmbedBuilder } = require('discord.js');

// Ações com membro: [nome, descrição, categoria nekos.best (ou null), emoji, frase, cor]
const MEMBRO = [
  ['abraco','Abraça um membro','hug','🤗','**{a}** abraçou **{b}** com força, sem querer soltar!'],
  ['carinho','Demonstra carinho','cuddle','💕','**{a}** fez carinho em **{b}** como num episódio de romance.'],
  ['beijo','Dá um beijo','kiss','💋','**{a}** roubou um beijo de **{b}**! Cena de anime confirmada.'],
  ['acenar','Acena para um membro','wave','👋','**{a}** acenou para **{b}** com um sorriso de protagonista.'],
  ['apertar-mao','Aperta a mão','handshake','🤝','**{a}** apertou a mão de **{b}**: início de uma grande rivalidade.'],
  ['cumprimentar','Cumprimenta um membro','wave','😊','**{a}** cumprimentou **{b}** com energia de abertura de anime!'],
  ['elogiar','Elogia um membro','happy','✨','**{a}** elogiou **{b}**: "Você é incrível!" ✨'],
  ['proteger','Protege um membro',null,'🛡️','**{a}** se colocou na frente de **{b}** para proteger do perigo!'],
  ['consolar','Consola um membro','pat','🫂','**{a}** consolou **{b}**: "Calma, você não está sozinho."'],
  ['provocar','Provoca um membro','smug','😏','**{a}** provocou **{b}**: "Você não aguenta nem um duelo, né?"'],
  ['rir-com','Ri com um membro','laugh','😂','**{a}** caiu na gargalhada junto com **{b}**!'],
  ['dancar-com','Dança com um membro','dance','💃','**{a}** dançou com **{b}** como num festival de anime.'],
  ['sentar-com','Senta com um membro',null,'🪑','**{a}** sentou ao lado de **{b}** para um papo de cafeteria.'],
  ['olhar','Olha para um membro','stare','👀','**{a}** ficou olhando para **{b}** com cara de suspeita.'],
  ['encarar','Encara um membro','stare','😐','**{a}** encarou **{b}** em silêncio, aquele olhar de duelo.'],
  ['apoiar','Apoia um membro','highfive','💙','**{a}** apoiou **{b}**: "Você consegue, eu acredito em você!"'],
  ['agradecer','Agradece um membro',null,'🙏','**{a}** agradeceu **{b}** de coração.'],
  ['comemorar-com','Comemora com um membro','happy','🎉','**{a}** comemorou a vitória com **{b}**!'],
  ['festejar-com','Festeja com um membro','dance','🥳','**{a}** festejou com **{b}** como no final de temporada!'],
  ['acenar-tchau','Dá tchau para um membro','wave','👋','**{a}** deu tchau para **{b}**: "Até o próximo episódio!"'],
];

// Ações sozinho: [nome, descrição, categoria nekos.best (ou null), emoji, frase]
const SOZINHO = [
  ['sorrir','Sorri','smile','😊','**{a}** sorriu como se tivesse acabado de vencer o arco.'],
  ['rir','Ri','laugh','😂','**{a}** começou a rir sem motivo aparente.'],
  ['chorar','Chora','cry','😭','**{a}** chorou dramaticamente, com lágrimas em cascata.'],
  ['acenar','Acena','wave','👋','**{a}** acenou para ninguém em particular... mas com estilo.'],
  ['dancar','Dança','dance','💃','**{a}** começou a dançar no meio do canal, sem ninguém pedir!'],
  ['dormir','Dorme','sleep','😴','**{a}** adormeceu de repente, como num episódio de sonho.'],
  ['pensar','Pensa','think','🤔','**{a}** entrou em modo de reflexão profunda.'],
  ['comemorar','Comemora','happy','🎉','**{a}** comemorou como se tivesse vencido o torneio!'],
  ['assustar','Se assusta',null,'😨','**{a}** levou um susto de anime, com os olhos arregalados!'],
  ['confuso','Fica confuso',null,'😵','**{a}** ficou confuso, com cara de espiral nos olhos.'],
  ['entediado','Fica entediado','bored','😐','**{a}** ficou entediado, esperando o próximo episódio.'],
  ['feliz','Fica feliz','happy','😄','**{a}** ficou feliz, com brilho nos olhos!'],
  ['triste','Fica triste','pout','😔','**{a}** ficou triste, com o olhar perdido no horizonte.'],
  ['bravo','Fica bravo','angry','😡','**{a}** ficou bravo, com veias saltando na testa!'],
  ['curioso','Fica curioso',null,'👀','**{a}** ficou curioso e começou a investigar.'],
  ['surpreso','Fica surpreso',null,'😲','**{a}** ficou surpreso, quase caindo para trás!'],
  ['cansado','Fica cansado','sleep','😴','**{a}** ficou cansado, precisando de um tempo de treino.'],
  ['orgulhoso','Fica orgulhoso','smug','😎','**{a}** ficou orgulhoso, com aquela pose de vencedor.'],
  ['nervoso','Fica nervoso',null,'😰','**{a}** ficou nervoso, suando frio.'],
  ['comer','Come','nom','🍜','**{a}** comeu como se fosse o último episódio do arco!'],
];

const COR_MEMBRO = 0x5865f2;
const COR_SOZINHO = 0x7c3aed;

function sub(name, description, needsUser = false) {
  const o = { name, description, type: 1 };
  if (needsUser) o.options = [{ name: 'membro', description: 'Membro da interação', type: 6, required: true }];
  return o;
}

const COMMANDS_INTERACOES = [{
  name: 'interacao',
  description: 'Interações do TENCHIKHO',
  options: [
    { name: 'membro', description: 'Interações com outro membro', type: 2, options: MEMBRO.map(x => sub(x[0], x[1], true)) },
    { name: 'sozinho', description: 'Interações que você faz sozinho', type: 2, options: SOZINHO.map(x => sub(x[0], x[1], false)) },
  ],
}];

// Busca um GIF de anime no nekos.best. Se não houver categoria ou a API falhar, retorna null.
async function buscarGif(categoria) {
  if (!categoria) return null;
  try {
    const r = await fetch(`https://nekos.best/api/v2/${categoria}?amount=1`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = await r.json();
    const item = j.results?.[0];
    if (!item?.url) return null;
    return { url: item.url, anime: item.anime_name || null };
  } catch {
    return null;
  }
}

async function tratarInteracao(i) {
  if (!i.isChatInputCommand() || i.commandName !== 'interacao') return false;
  const grupo = i.options.getSubcommandGroup();
  const acao = i.options.getSubcommand();
  await i.deferReply();

  let definicao, frase, alvo = null, cor;
  if (grupo === 'membro') {
    definicao = MEMBRO.find(x => x[0] === acao);
    alvo = i.options.getUser('membro', true);
    if (alvo.bot) return i.editReply(`${i.user} não pode fazer essa interação com um bot.`).then(() => true);
    if (alvo.id === i.user.id) return i.editReply('Você não pode fazer essa interação consigo mesmo.').then(() => true);
    cor = COR_MEMBRO;
    frase = definicao ? definicao[4] : '**{a}** interagiu com **{b}**!';
  } else {
    definicao = SOZINHO.find(x => x[0] === acao);
    cor = COR_SOZINHO;
    frase = definicao ? definicao[4] : '**{a}** fez uma interação!';
  }

  const categoria = definicao?.[2] ?? null;
  const emoji = definicao?.[3] ?? '✨';
  const gif = await buscarGif(categoria);

  const texto = `${emoji} ${frase.replace('{a}', i.user.username).replace('{b}', alvo?.username || '')}`;
  const embed = new EmbedBuilder()
    .setColor(cor)
    .setAuthor({ name: `${i.user.username} usou /interacao`, iconURL: i.user.displayAvatarURL({ size: 64 }) })
    .setDescription(texto)
    .setFooter({ text: gif?.anime ? `Anime: ${gif.anime}` : 'Tenchikho • interação' });

  if (gif) embed.setImage(gif.url);

  return i.editReply({ embeds: [embed] }).then(() => true);
}

module.exports = { COMMANDS_INTERACOES, tratarInteracao };

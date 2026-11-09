// Interações divertidas do TENCHIKHO.
// Discord exige nomes de slash command em minúsculas e sem acentos.
// Ex.: /abraçar -> /abracar | /dancar -> /dancar

const INTERACOES = [
  ['abracar','🤗',['abraça {b} com carinho','dá um abraço apertado em {b}']],
  ['cafune','🥰',['faz cafuné em {b}','faz um cafuné bem tranquilo em {b}']],
  ['carinho','💗',['demonstra carinho por {b}','manda muito carinho para {b}']],
  ['acolher','🫂',['acolhe {b} com um abraço','recebe {b} com carinho']],
  ['consolar','🥹',['consola {b}','fica ao lado de {b} para dar apoio']],
  ['apoiar','💙',['dá apoio total para {b}','manda força para {b}']],
  ['agradecer','🙏',['agradece a {b}','manda um obrigado especial para {b}']],
  ['elogiar','✨',['faz um elogio para {b}','diz que {b} mandou muito bem']],
  ['cumprimentar','👋',['cumprimenta {b}','dá um oi para {b}']],
  ['acenar','👋',['acena para {b}','manda um aceno para {b}']],
  ['sorrir','😊',['sorri para {b}','dá um sorriso para {b}']],
  ['piscar','😉',['pisca para {b}','manda uma piscadinha para {b}']],
  ['mandar-coracao','❤️',['manda um coração para {b}','envia um coraçãozinho para {b}']],
  ['dar-flor','🌹',['entrega uma flor para {b}','presenteia {b} com uma rosa']],
  ['dar-presente','🎁',['dá um presente para {b}','entrega um presente para {b}']],
  ['dar-estrela','⭐',['dá uma estrela para {b}','entrega uma estrelinha para {b}']],
  ['zoar','😂',['zoa {b} de leve','faz uma zoeira divertida com {b}']],
  ['provocar','😈',['provoca {b} de leve','manda uma provocação divertida para {b}']],
  ['assustar','👻',['assusta {b} de brincadeira','aparece do nada para assustar {b}']],
  ['surpreender','😲',['faz uma surpresa para {b}','surpreende {b} do nada']],
  ['trollar','🤡',['trolla {b} de leve','faz uma pegadinha inocente com {b}']],
  ['imitar','🪞',['imita {b}','copia o jeito de {b}']],
  ['desafiar','🔥',['desafia {b}','lança um desafio para {b}']],
  ['rir','😂',['ri junto com {b}','começa a rir com {b}']],
  ['gritar','📢',['grita o nome de {b}','manda um grito divertido para {b}']],
  ['sussurrar','🤫',['sussurra para {b}','fala baixinho com {b}']],
  ['ignorar','🙄',['ignora {b} com muito estilo','finge que não viu {b}']],
  ['encarar','👀',['encara {b} sem piscar','fica olhando para {b}']],
  ['julgar','🧐',['julga {b} em silêncio','analisa {b} com olhar de juiz']],
  ['suspeitar','🤨',['fica desconfiado de {b}','olha para {b} com suspeita']],
  ['tapa','👋',['dá um tapa fictício em {b}','dá um tapinha de desenho em {b}']],
  ['socar','👊',['dá um soco fictício em {b}','manda um soco de desenho na direção de {b}']],
  ['chutar','🦵',['dá um chute fictício em {b}','chuta uma bola imaginária perto de {b}']],
  ['empurrar','🫷',['empurra {b} de brincadeira','dá um empurrão fictício em {b}']],
  ['derrubar','💥',['derruba {b} numa cena fictícia','faz {b} cair num golpe de desenho']],
  ['prender','⛓️',['prende {b} numa corrente imaginária','algema {b} de brincadeira']],
  ['capturar','🎯',['captura {b} numa missão','pega {b} com uma rede imaginária']],
  ['perseguir','🏃',['começa a perseguir {b}','corre atrás de {b}']],
  ['fugir','💨',['foge de {b}','sai correndo de {b}']],
  ['atacar','⚔️',['faz um ataque fictício contra {b}','ataca {b} com uma espada de madeira']],
  ['defender','🛡️',['defende {b}','assume a defesa de {b}']],
  ['duelar','⚔️',['inicia um duelo fictício com {b}','desafia {b} para um duelo']],
  ['bloquear','🚫',['bloqueia {b} numa brincadeira','coloca uma barreira imaginária diante de {b}']],
  ['jogar-fora','🗑️',['joga {b} na lixeira imaginária','manda {b} para a lixeira da história']],
  ['proteger','🛡️',['protege {b}','fica de guarda para proteger {b}']],
  ['salvar','🦸',['salva {b} no último segundo','aparece como herói e salva {b}']],
  ['resgatar','🚑',['resgata {b}','tira {b} de uma situação fictícia']],
  ['escoltar','🚶',['escolta {b} até um lugar seguro','acompanha {b} como guarda-costas']],
  ['cobrir','🛡️',['cobre {b} e protege a área','fica na frente de {b} para cobrir']],
  ['vigiar','👁️',['vigia {b} de longe','fica de olho em {b}']],
  ['guardar','🔐',['guarda {b} como um tesouro','fica responsável por proteger {b}']],
  ['ajudar','🤝',['ajuda {b}','dá uma mãozinha para {b}']],
  ['reviver','✨',['revive {b} com magia fictícia','traz {b} de volta com um feitiço']],
  ['duelo','⚔️',['{v} venceu {p} em um duelo!']],
  ['batalhar','🥊',['{v} venceu {p} numa batalha!']],
  ['desafio','🔥',['{v} completou o desafio antes de {p}!']],
  ['corrida','🏃',['{v} chegou antes de {p}!']],
  ['queda-de-braco','💪',['{v} venceu {p} na queda de braço!']],
  ['cara-ou-coroa','🪙',['{v} venceu {p} no cara ou coroa!']],
  ['pedra-papel-tesoura','✊',['{v} venceu {p} no pedra, papel ou tesoura!']],
  ['mira','🎯',['{v} acertou o alvo melhor que {p}!']],
  ['reacao','⚡',['{v} reagiu mais rápido que {p}!']],
  ['velocidade','💨',['{v} foi mais veloz que {p}!']],
  ['sorte','🍀',['{v} teve mais sorte que {p}!']],
  ['forca','💪',['{v} mostrou mais força que {p}!']],
  ['inteligencia','🧠',['{v} pensou mais rápido que {p}!']],
  ['resistencia','🛡️',['{v} aguentou mais que {p}!']],
  ['pular','🐇',['pula de alegria perto de {b}','pula em volta de {b}']],
  ['dancar','💃',['dança com {b}','começa a dançar perto de {b}']],
  ['cantar','🎤',['canta para {b}','faz um dueto com {b}']],
  ['sentar','🪑',['senta ao lado de {b}','puxa uma cadeira para {b}']],
  ['dormir','😴',['dorme perto de {b}','tira uma soneca ao lado de {b}']],
  ['acordar','⏰',['acorda {b}','chama {b} para acordar']],
  ['seguir','🚶',['segue {b}','acompanha {b} por aí']],
  ['esconder','🫣',['se esconde de {b}','fica escondido de {b}']],
  ['procurar','🔎',['procura {b} pelo servidor','sai procurando {b}']],
  ['encontrar','📍',['encontra {b}','acha {b} no meio da multidão']],
  ['chamar','📣',['chama {b}','chama {b} para conversar']],
  ['apontar','👉',['aponta para {b}','aponta para {b} e diz "foi ele!"']],
  ['observar','👀',['observa {b}','fica observando {b} em silêncio']],
  ['fugir-de','🏃',['foge de {b}','corre para longe de {b}']],
  ['joinha','👍',['dá um joinha para {b}','aprova {b} com um joinha']],
  ['bater-palmas','👏',['bate palmas para {b}','aplaude {b}']],
  ['highfive','🙌',['dá um high five em {b}','bate um high five com {b}']],
  ['fistbump','👊',['dá um fist bump em {b}','bate um soquinho amigo com {b}']],
  ['reverenciar','🙇',['faz uma reverência para {b}','faz uma reverência diante de {b}']],
];

const MAPA_INTERACOES = Object.fromEntries(INTERACOES.map(x => [x[0], x]));
const COMANDOS_INTERACOES = INTERACOES.map(([nome, emoji]) => ({
  name: nome,
  description: `Interação ${nome}`.slice(0, 100),
  options: [{ name: 'membro', description: 'Membro com quem interagir', type: 6, required: true }],
}));

function escolher(lista) { return lista[Math.floor(Math.random() * lista.length)]; }

async function tratarInteracao(i) {
  await i.deferReply();
  try {
    const entrada = MAPA_INTERACOES[i.commandName];
    if (!entrada) return i.editReply('⚠️ Interação não encontrada.');
    const alvo = i.options.getUser('membro', true);
    if (alvo.bot) return i.editReply('🤖 Não dá para interagir com bots.');
    if (alvo.id === i.user.id) return i.editReply('🙂 Escolha outro membro para essa interação.');
    const [nome, emoji, frases] = entrada;
    const menc = u => `<@${u.id}>`;
    let texto;
    if (['duelo','batalhar','desafio','corrida','queda-de-braco','cara-ou-coroa','pedra-papel-tesoura','mira','reacao','velocidade','sorte','forca','inteligencia','resistencia'].includes(nome)) {
      const vencedor = Math.random() < 0.5 ? i.user : alvo;
      const perdedor = vencedor.id === i.user.id ? alvo : i.user;
      texto = `${emoji} ${escolher(frases).replace('{v}', menc(vencedor)).replace('{p}', menc(perdedor))}`;
    } else {
      texto = `${emoji} **${menc(i.user)}** ${escolher(frases).replace('{a}', menc(i.user)).replace('{b}', menc(alvo))}`;
    }
    return i.editReply({ content: texto, allowedMentions: { users: [i.user.id, alvo.id] } });
  } catch (e) {
    console.error(`Erro em /${i.commandName}:`, e);
    return i.editReply('⚠️ Não consegui executar essa interação agora.').catch(() => {});
  }
}

module.exports = { INTERACOES, MAPA_INTERACOES, COMANDOS_INTERACOES, tratarInteracao };

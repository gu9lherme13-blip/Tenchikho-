// Interações divertidas entre membros.
// Cada grupo vira um comando de barra (ex.: /carinho abracar @membro).
// Entrada: [nome, emoji, [frases]]. Em frases de interação: {a} = quem usa, {b} = alvo.
// Em frases de competição: {v} = vencedor, {p} = perdedor.

const EFEMERA = 64;

const GRUPOS_INTERACOES = {
  carinho: {
    descricao: 'Demonstrações de carinho entre membros',
    acoes: [
      ['acolher', '🫂', ['acolhe {b} com um abraço gostoso', 'diz que {b} tem um lugar seguro aqui']],
      ['apoiar', '💙', ['dá apoio total para {b}', 'manda força para {b}']],
      ['sorrir', '😊', ['sorri para {b}', 'dá um sorriso bem grande para {b}']],
      ['mandar-coracao', '❤️', ['manda um coração para {b}', 'envia um coraçãozinho para {b}']],
      ['dar-flor', '🌹', ['entrega uma rosa para {b}', 'dá uma flor para {b}']],
      ['dar-presente', '🎁', ['dá um presente para {b}', 'entrega um embrulho para {b}']],
      ['dar-estrela', '⭐', ['dá uma estrela para {b}', 'entrega uma estrelinha para {b}']],
      ['joinha', '👍', ['dá um joinha para {b}', 'aprova {b} com um joinha']],
      ['highfive', '🙌', ['dá um high five em {b}', 'bate um high five com {b}']],
      ['fistbump', '👊', ['dá um fist bump em {b}', 'bate um soquinho amigo com {b}']],
      ['bater-palmas', '👏', ['bate palmas para {b}', 'aplaude {b} de pé']],
      ['reverenciar', '🙇', ['faz uma reverência para {b}', 'curva-se diante de {b}']],
    ],
  },
  zoeira: {
    descricao: 'Brincadeiras e zoeiras leves entre membros',
    acoes: [
      ['provocar', '😈', ['provoca {b} de leve', 'manda um desafio provocador para {b}']],
      ['trollar', '🤡', ['trolla {b} com carinho', 'manda uma pegadinha leve para {b}']],
      ['imitar', '🪞', ['imita {b} perfeitamente', 'copia o jeito de {b} sem parar']],
      ['desafiar', '🔥', ['desafia {b} para um duelo de piadas', 'lança um desafio para {b}']],
      ['gritar', '📢', ['grita o nome de {b} pelo servidor', 'manda um "{b}!!!" bem alto']],
      ['sussurrar', '🤫', ['sussurra um segredo para {b}', 'fala baixinho com {b}: "psiu..."']],
      ['ignorar', '🙄', ['ignora {b} com muito estilo', 'finge que {b} não existe']],
      ['encarar', '👀', ['encara {b} sem piscar', 'fica olhando fixamente para {b}']],
      ['julgar', '🧐', ['julga {b} em silêncio', 'avalia {b} com um olhar de juiz']],
      ['suspeitar', '🤨', ['suspeita de {b}', 'olha para {b} desconfiado']],
    ],
  },
  acoes: {
    descricao: 'Ações fictícias e humorísticas entre membros',
    acoes: [
      ['socar', '👊', ['dá um soco fictício em {b}', 'mostra um soco de desenho animado em {b}']],
      ['chutar', '🦵', ['dá um chute fictício em {b}', 'chuta uma bola imaginária na direção de {b}']],
      ['derrubar', '💥', ['derruba {b} em uma ação fictícia', 'faz {b} cair num golpe de desenho']],
      ['prender', '⛓️', ['prende {b} numa corrente imaginária', 'algema {b} de brincadeira']],
      ['capturar', '🎯', ['captura {b} em uma missão secreta', 'lança uma rede e captura {b}']],
      ['atacar', '⚔️', ['ataca {b} com uma espada de madeira', 'lança um ataque fictício contra {b}']],
      ['duelar', '⚔️', ['inicia um duelo fictício com {b}', 'desembainha a espada contra {b}']],
      ['bloquear', '🚫', ['bloqueia {b} em uma brincadeira', 'coloca uma barreira imaginária entre {b} e o resto']],
      ['jogar-fora', '🗑️', ['joga {b} na lixeira imaginária', 'diz que {b} foi para a lixeira da história']],
    ],
  },
  protecao: {
    descricao: 'Proteção e ajuda entre membros',
    acoes: [
      ['salvar', '🦸', ['salva {b} no último segundo', 'surge como herói e salva {b}']],
      ['resgatar', '🚑', ['resgata {b} com a ambulância da brincadeira', 'tira {b} de uma situação difícil']],
      ['escoltar', '🚶', ['escolta {b} até um lugar seguro', 'acompanha {b} como guarda-costas']],
      ['cobrir', '🛡️', ['cobre {b} com um guarda-chuva', 'se põe de guarda diante de {b}']],
      ['vigiar', '👁️', ['vigia {b} de longe', 'fica de olho em {b}']],
      ['guardar', '🔐', ['guarda um segredo de {b}', 'cuida de {b} como um tesouro']],
      ['ajudar', '🤝', ['ajuda {b} com o que precisar', 'dá uma mãozinha para {b}']],
      ['reviver', '✨', ['revive {b} com magia fictícia', 'traz {b} de volta com um feitiço']],
      ['defender', '🛡️', ['defende {b} com bravura', 'assume a defesa de {b}']],
    ],
  },
  competicao: {
    descricao: 'Competições e desafios entre membros (resultado aleatório)',
    acoes: [
      ['duelo', '⚔️', ['**{v}** venceu **{p}** em um duelo épico!']],
      ['batalhar', '🥊', ['**{v}** derrotou **{p}** numa batalha!']],
      ['desafio', '🔥', ['**{v}** completou o desafio antes de **{p}**!']],
      ['corrida', '🏃', ['**{v}** cruzou a linha de chegada na frente de **{p}**!']],
      ['queda-de-braco', '💪', ['**{v}** venceu **{p}** na queda de braço!']],
      ['cara-ou-coroa', '🪙', ['**{v}** acertou o cara ou coroa e ganhou de **{p}**!']],
      ['pedra-papel-tesoura', '✊', ['**{v}** venceu **{p}** no pedra, papel ou tesoura!']],
      ['mira', '🎯', ['**{v}** acertou o alvo melhor que **{p}**!']],
      ['reacao', '⚡', ['**{v}** reagiu mais rápido que **{p}**!']],
      ['velocidade', '💨', ['**{v}** foi mais veloz que **{p}**!']],
      ['sorte', '🍀', ['**{v}** teve mais sorte que **{p}** hoje!']],
      ['forca', '💪', ['**{v}** é mais forte que **{p}**!']],
      ['inteligencia', '🧠', ['**{v}** pensou mais rápido que **{p}**!']],
      ['resistencia', '🛡️', ['**{v}** aguentou mais que **{p}**!']],
    ],
  },
  aleatorias: {
    descricao: 'Ações do dia a dia entre membros',
    acoes: [
      ['pular', '🐇', ['pula de alegria perto de {b}', 'pula em volta de {b}']],
      ['cantar', '🎤', ['canta uma música para {b}', 'faz um dueto com {b}']],
      ['sentar', '🪑', ['senta do lado de {b}', 'puxa uma cadeira para {b}']],
      ['seguir', '🚶', ['segue {b} por onde ele vai', 'começa a seguir {b}']],
      ['procurar', '🔎', ['procura {b} pelo servidor', 'sai em busca de {b}']],
      ['encontrar', '📍', ['encontra {b} escondido', 'acha {b} no meio da multidão']],
      ['chamar', '📣', ['chama {b} para conversar', 'grita para {b} vir até aqui']],
      ['apontar', '👉', ['aponta para {b}', 'diz "foi {b}!" apontando']],
      ['observar', '👀', ['observa {b} de canto de olho', 'fica observando {b} em silêncio']],
    ],
  },
};

function escolher(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

const COMANDOS_INTERACOES = Object.entries(GRUPOS_INTERACOES).map(([nome, grupo]) => ({
  name: nome,
  description: grupo.descricao.slice(0, 100),
  options: grupo.acoes.map(([acao]) => ({
    type: 1, // subcomando
    name: acao,
    description: 'Interagir com um membro',
    options: [{ name: 'membro', description: 'Membro com quem interagir', type: 6, required: true }],
  })),
}));

async function tratarInteracao(i) {
  // Confirma a interação imediatamente para nunca estourar o limite de ~3s do Discord.
  await i.deferReply();

  try {
    const grupo = GRUPOS_INTERACOES[i.commandName];
    if (!grupo) return i.editReply({ content: 'Comando não encontrado.' });

    const acao = i.options.getSubcommand();
    const entrada = grupo.acoes.find(([nome]) => nome === acao);
    if (!entrada) return i.editReply({ content: 'Ação não encontrada.' });

    const alvo = i.options.getUser('membro', true);
    const autor = i.user;
    if (alvo.bot) return i.editReply({ content: 'Não dá para interagir com bots.' });
    if (alvo.id === autor.id) return i.editReply({ content: 'Você não pode interagir consigo mesmo.' });

    const menc = u => `<@${u.id}>`;
    const [, emoji, frases] = entrada;
    const frase = escolher(frases);
    let texto;
    if (i.commandName === 'competicao') {
      const ganhou = Math.random() < 0.5;
      const v = ganhou ? autor : alvo;
      const p = ganhou ? alvo : autor;
      texto = `${emoji} ${frase.replace('{v}', menc(v)).replace('{p}', menc(p))}`;
    } else {
      texto = `${emoji} **${menc(autor)}** ${frase.replace('{b}', menc(alvo)).replace('{a}', menc(autor))}`;
    }
    return i.editReply({ content: texto, allowedMentions: { users: [autor.id, alvo.id] } });
  } catch (e) {
    console.error(`Erro em /${i.commandName}:`, e);
    return i.editReply({ content: '⚠️ Não consegui executar esse comando agora. Tente novamente.' }).catch(() => {});
  }
}

module.exports = { GRUPOS_INTERACOES, COMANDOS_INTERACOES, tratarInteracao };

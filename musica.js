// Módulo de música: /nytheris (conectar, desconectar) e /nvb (music, pausar, retomar, pular, fila).
// Usa @discordjs/voice para o canal de voz e play-dl para buscar o áudio no YouTube.
const {
  joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus,
  VoiceConnectionStatus, NoSubscriberBehavior, entersState, getVoiceConnection,
} = require('@discordjs/voice');
const play = require('play-dl');
const { PermissionFlagsBits } = require('discord.js');

const EFEMERA = 64; // flag de mensagem visível só para quem usou o comando
const IDLE_DISCONNECT_MS = 3 * 60 * 1000;

// Uma fila independente por servidor
const filas = new Map();

const COMMANDS_MUSICA = [
  {
    name: 'nytheris',
    description: 'Conectar e desconectar o bot do canal de voz',
    options: [
      { name: 'conectar', description: 'Faz o bot entrar no seu canal de voz', type: 1 },
      { name: 'desconectar', description: 'Faz o bot sair do canal de voz', type: 1 },
    ],
  },
  {
    name: 'nvb',
    description: 'Comandos de música',
    options: [
      {
        name: 'music', description: 'Adiciona uma música à fila (nome ou link do YouTube)', type: 1,
        options: [{ name: 'busca', description: 'Nome da música ou link do YouTube', type: 3, required: true }],
      },
      {
        name: 'play', description: 'Toca uma melodia em loop infinito até pausar', type: 1,
        options: [{ name: 'busca', description: 'Nome da música ou link do YouTube', type: 3, required: true }],
      },
      { name: 'pausar', description: 'Pausa a música que está tocando', type: 1 },
      { name: 'retomar', description: 'Retoma a música pausada', type: 1 },
      { name: 'pular', description: 'Pula a música que está tocando', type: 1 },
      { name: 'fila', description: 'Mostra a música atual e a fila', type: 1 },
    ],
  },
];

function getFila(guildId) {
  return filas.get(guildId);
}

function criarFila(interaction, voiceChannel) {
  const existente = filas.get(voiceChannel.guild.id);
  if (existente) return existente;

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  connection.subscribe(player);

  const fila = {
    guildId: voiceChannel.guild.id,
    connection,
    player,
    songs: [],
    loop: null,        // música em loop infinito (/nvb play); null quando desligado
    loopFalhas: 0,     // falhas seguidas ao carregar a música em loop
    current: null,
    textChannel: interaction.channel,
    idleTimer: null,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    fila.current = null;
    tocarProxima(fila.guildId);
  });

  player.on('error', (error) => {
    console.error(`[música] erro no player (${fila.guildId}):`, error.message);
    fila.textChannel?.send('⚠️ Erro ao tocar essa música. Pulando para a próxima.').catch(() => {});
    tocarProxima(fila.guildId);
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      destruirFila(fila.guildId);
    }
  });

  filas.set(fila.guildId, fila);
  return fila;
}

// Procura por URL do YouTube ou por texto e devolve { title, url, duration }
async function buscarMusica(query) {
  if (play.yt_validate(query) === 'video') {
    const info = await play.video_basic_info(query);
    const d = info.video_details;
    return { title: d.title, url: d.url, duration: d.durationRaw };
  }

  const [resultado] = await play.search(query, { limit: 1, source: { youtube: 'video' } });
  if (!resultado) return null;
  return { title: resultado.title, url: resultado.url, duration: resultado.durationRaw };
}

function adicionarMusica(fila, musica) {
  fila.songs.push(musica);
  limparTimerOcioso(fila);

  // Adicionar à fila desliga o loop; a música em loop para e a fila começa
  if (fila.loop) {
    fila.loop = null;
    fila.loopFalhas = 0;
    if (fila.current) {
      fila.player.stop(); // dispara Idle e toca a próxima da fila
      return;
    }
  }

  if (fila.player.state.status === AudioPlayerStatus.Idle && !fila.current) {
    tocarProxima(fila.guildId);
  }
}

// Toca uma melodia em loop infinito, substituindo o que estiver tocando
function tocarEmLoop(fila, musica) {
  limparTimerOcioso(fila);
  fila.loop = musica;
  fila.loopFalhas = 0;

  if (fila.current) {
    fila.player.stop(); // Idle dispara tocarProxima, que toca o loop
  } else {
    tocarProxima(fila.guildId);
  }
}

async function tocarProxima(guildId) {
  const fila = filas.get(guildId);
  if (!fila) return;

  // Com loop ativo repete a mesma música; senão pega a próxima da fila
  const musica = fila.loop ?? fila.songs.shift();

  if (!musica) {
    fila.current = null;
    iniciarTimerOcioso(fila);
    return;
  }

  const repetindo = fila.loop && fila.current && fila.current.url === musica.url;

  try {
    const fonte = await play.stream(musica.url);
    const recurso = createAudioResource(fonte.stream, { inputType: fonte.type, inlineVolume: true });
    recurso.volume?.setVolume(0.5);

    fila.current = musica;
    fila.player.play(recurso);
    fila.loopFalhas = 0;

    if (!repetindo) {
      fila.textChannel?.send(`🎶 Tocando agora: **${musica.title}** (${musica.duration ?? '?'})`).catch(() => {});
    }
  } catch (error) {
    console.error(`[música] falha ao carregar "${musica.title}":`, error.message);

    if (fila.loop) {
      fila.loopFalhas += 1;
      if (fila.loopFalhas >= 2) {
        // Duas falhas seguidas: desliga o loop para não ficar tentando sem parar
        fila.loop = null;
        fila.loopFalhas = 0;
        fila.textChannel?.send(`⚠️ Não consegui tocar **${musica.title}** em loop. O loop foi desligado.`).catch(() => {});
      }
    } else {
      fila.textChannel?.send(`⚠️ Não consegui carregar **${musica.title}**. Pulando.`).catch(() => {});
    }
    tocarProxima(guildId);
  }
}

function pularMusica(fila) {
  // Pular sai do loop e segue para a próxima da fila
  fila.loop = null;
  fila.loopFalhas = 0;
  fila.player.stop(); // dispara Idle
}

function iniciarTimerOcioso(fila) {
  limparTimerOcioso(fila);
  fila.idleTimer = setTimeout(() => destruirFila(fila.guildId), IDLE_DISCONNECT_MS);
}

function limparTimerOcioso(fila) {
  if (fila.idleTimer) {
    clearTimeout(fila.idleTimer);
    fila.idleTimer = null;
  }
}

function destruirFila(guildId) {
  const fila = filas.get(guildId);
  if (fila) {
    limparTimerOcioso(fila);
    fila.loop = null;
    fila.player.stop(true);
    filas.delete(guildId);
  }
  getVoiceConnection(guildId)?.destroy();
}

// ---------- handlers dos comandos ----------

async function tratarMusica(i) {
  const grupo = i.commandName;
  const sub = i.options.getSubcommand();

  if (grupo === 'nytheris') {
    if (sub === 'conectar') return conectar(i);
    if (sub === 'desconectar') return desconectar(i);
  }

  if (grupo === 'nvb') {
    if (sub === 'music') return pedirMusica(i, false);
    if (sub === 'play') return pedirMusica(i, true);
    if (sub === 'pausar') return pausar(i);
    if (sub === 'retomar') return retomar(i);
    if (sub === 'pular') return pular(i);
    if (sub === 'fila') return mostrarFila(i);
  }

  return i.reply({ content: 'Comando de música desconhecido.', flags: EFEMERA });
}

function canalDoUsuario(i) {
  const canal = i.member.voice.channel;
  if (!canal) {
    return { erro: '🎧 Entre em um canal de voz antes de usar este comando.' };
  }
  const permissoes = canal.permissionsFor(i.guild.members.me);
  if (!permissoes?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
    return { erro: '🚫 Preciso das permissões **Conectar** e **Falar** nesse canal.' };
  }
  return { canal };
}

async function conectar(i) {
  const { canal, erro } = canalDoUsuario(i);
  if (erro) return i.reply({ content: erro, flags: EFEMERA });

  const existente = getFila(i.guild.id);
  if (existente) {
    if (existente.connection.joinConfig.channelId === canal.id) {
      return i.reply({ content: `✅ Já estou conectado em **${canal.name}**.`, flags: EFEMERA });
    }
    return i.reply({ content: '🔊 Já estou em outro canal de voz deste servidor. Use /nytheris desconectar antes de mudar.', flags: EFEMERA });
  }

  try {
    const fila = criarFila(i, canal);
    iniciarTimerOcioso(fila); // sem música, sai sozinho depois de um tempo
    return i.reply(`🔗 Conectado em **${canal.name}**. Use /nvb music para pedir uma música.`);
  } catch (e) {
    console.error('[/nytheris conectar]', e);
    return i.reply({ content: '⚠️ Não consegui entrar no canal de voz. Tente novamente.', flags: EFEMERA });
  }
}

async function desconectar(i) {
  const fila = getFila(i.guild.id);
  if (!fila) {
    return i.reply({ content: 'Não estou conectado em nenhum canal de voz.', flags: EFEMERA });
  }
  const nomeCanal = i.guild.channels.cache.get(fila.connection.joinConfig.channelId)?.name;
  destruirFila(i.guild.id);
  return i.reply(nomeCanal ? `👋 Saí do canal **${nomeCanal}**.` : '👋 Saí do canal de voz.');
}

async function pedirMusica(i, emLoop) {
  const { canal, erro } = canalDoUsuario(i);
  if (erro) return i.reply({ content: erro, flags: EFEMERA });

  const existente = getFila(i.guild.id);
  if (existente && existente.connection.joinConfig.channelId !== canal.id) {
    return i.reply({ content: '🔊 Já estou tocando em outro canal de voz deste servidor.', flags: EFEMERA });
  }

  await i.deferReply();

  try {
    const busca = i.options.getString('busca', true);
    const musica = await buscarMusica(busca);

    if (!musica) {
      return i.editReply('😕 Não encontrei nenhum resultado para essa busca.');
    }

    const fila = criarFila(i, canal);

    if (emLoop) {
      tocarEmLoop(fila, musica);
      return i.editReply(`🔁 Tocando em loop: **${musica.title}**. Use /nvb pausar para pausar.`);
    }

    adicionarMusica(fila, musica);
    const posicao = fila.songs.length + (fila.current ? 1 : 0);
    return i.editReply(
      fila.current && posicao > 1
        ? `✅ Adicionado à fila (posição ${posicao}): **${musica.title}**`
        : `✅ Preparando: **${musica.title}**`
    );
  } catch (e) {
    console.error('[/nvb]', e);
    return i.editReply('⚠️ Não consegui processar esse pedido. Tente outra busca ou link.');
  }
}

async function pausar(i) {
  const fila = getFila(i.guild.id);
  if (!fila || !fila.current) {
    return i.reply({ content: 'Nada está tocando agora.', flags: EFEMERA });
  }
  if (fila.player.state.status === AudioPlayerStatus.Paused) {
    return i.reply({ content: 'A música já está pausada.', flags: EFEMERA });
  }
  fila.player.pause();
  return i.reply(`⏸️ Música pausada: **${fila.current.title}**`);
}

async function retomar(i) {
  const fila = getFila(i.guild.id);
  if (!fila) {
    return i.reply({ content: 'Não estou conectado em nenhum canal de voz.', flags: EFEMERA });
  }
  if (fila.player.state.status !== AudioPlayerStatus.Paused) {
    return i.reply({ content: 'Nada está pausado.', flags: EFEMERA });
  }
  fila.player.unpause();
  return i.reply(`▶️ Retomando: **${fila.current?.title ?? 'música atual'}**`);
}

async function pular(i) {
  const fila = getFila(i.guild.id);
  if (!fila || !fila.current) {
    return i.reply({ content: 'Nada está tocando agora.', flags: EFEMERA });
  }
  const pulada = fila.current.title;
  pularMusica(fila);
  return i.reply(`⏭️ Pulado: **${pulada}**`);
}

async function mostrarFila(i) {
  const fila = getFila(i.guild.id);
  if (!fila || (!fila.current && fila.songs.length === 0)) {
    return i.reply({ content: 'A fila está vazia.', flags: EFEMERA });
  }

  const linhas = [];
  if (fila.current) linhas.push(`**Tocando agora:** ${fila.current.title}${fila.loop ? ' (loop)' : ''}`);
  if (fila.songs.length > 0) {
    linhas.push('**Próximas:**', ...fila.songs.slice(0, 10).map((m, n) => `${n + 1}. ${m.title}`));
    if (fila.songs.length > 10) linhas.push(`...e mais ${fila.songs.length - 10}`);
  }
  return i.reply(linhas.join('\n'));
}

module.exports = { COMMANDS_MUSICA, tratarMusica };

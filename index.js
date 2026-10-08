const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const config = require('./core/config');
const logger = require('./core/logger');
const trabalho = require('./commands/trabalho');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.once('ready', () => logger.info('bot_ready', { tag: client.user.tag, userId: client.user.id }));

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === 'trabalho') return await trabalho.execute(interaction);
    if (interaction.commandName === 'ping') return await interaction.reply({ content: `🏓 Pong! **${client.ws.ping} ms**`, ephemeral: true });
    if (interaction.commandName === 'ajuda') {
      const embed = new EmbedBuilder().setColor(0x7c3aed).setTitle('🦇 TENCHIKO • Ajuda')
        .setDescription('`/trabalho tarefa:` envia uma solicitação ao agente de IA.\n`/ping` verifica a latência.\n`/botinfo` mostra informações do bot.')
        .addFields({ name: 'Acesso ao /trabalho', value: 'Exclusivo para os cargos Líder e Sub-Líder, validados por ID.' }, { name: 'Nota', value: 'Nesta versão, o TENCHIKO gera respostas e instruções; não altera automaticamente arquivos, sites ou configurações externas.' });
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (interaction.commandName === 'botinfo') {
      const embed = new EmbedBuilder().setColor(0x7c3aed).setTitle('🦇 TENCHIKO BLOODLINE')
        .setDescription('Núcleo de tarefas com agentes especializados e roteamento por IA.')
        .addFields({ name: 'Status', value: 'Online', inline: true }, { name: 'Modelo', value: config.openaiModel(), inline: true });
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch (error) {
    logger.error('interaction_failed', { command: interaction.commandName, userId: interaction.user?.id, error });
    const payload = { content: 'Ocorreu um erro ao processar esse comando.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
});

client.on('error', error => logger.error('discord_client_error', { error }));
process.on('unhandledRejection', error => logger.error('unhandled_rejection', { error }));

try {
  client.login(config.discordToken());
} catch (error) {
  logger.error('startup_failed', { error });
  process.exit(1);
}

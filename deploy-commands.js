const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const config = require('./core__config');
const { data: trabalho } = require('./commands__trabalho');

const commands = [
  new SlashCommandBuilder().setName('ajuda').setDescription('Mostra os comandos disponíveis.'),
  new SlashCommandBuilder().setName('ping').setDescription('Mostra a latência do TENCHIKO.'),
  new SlashCommandBuilder().setName('botinfo').setDescription('Mostra informações do TENCHIKO.'),
  trabalho
].map(command => command.toJSON());

(async () => {
  const rest = new REST({ version: '10' }).setToken(config.discordToken());
  const clientId = config.clientId();
  const guildId = config.guildId();
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`Comandos registrados no servidor ${guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Comandos globais registrados; pode levar algum tempo para aparecerem.');
  }
})().catch(error => { console.error('Falha ao registrar comandos:', error.message); process.exit(1); });

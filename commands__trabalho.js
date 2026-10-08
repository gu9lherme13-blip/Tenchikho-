const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { requireWorkPermission } = require('./core__permissions');
const { runTask } = require('./core__tasks');

const data = new SlashCommandBuilder()
  .setName('trabalho')
  .setDescription('Encaminha uma tarefa para o agente especializado do TENCHIKO.')
  .addStringOption(option => option.setName('tarefa').setDescription('Explique o que você precisa').setMinLength(3).setMaxLength(1800).setRequired(true));

async function execute(interaction) {
  if (!await requireWorkPermission(interaction)) return;
  const task = interaction.options.getString('tarefa', true).trim();
  await interaction.deferReply({ ephemeral: true });
  try {
    const result = await runTask(task, { userId: interaction.user.id, guildId: interaction.guildId });
    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle(`🦇 TENCHIKO • ${result.agent}`)
      .setDescription(result.text.slice(0, 4000))
      .setFooter({ text: `Tarefa ${result.taskId} • Resposta gerada por IA` })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const missingKey = /OPENAI_API_KEY/.test(error.message || '');
    await interaction.editReply({ content: missingKey
      ? '⚠️ A chave OPENAI_API_KEY ainda não está configurada nas variáveis de ambiente do Render.'
      : '⚠️ Não consegui concluir a tarefa agora. Confira os logs do Render e as variáveis de ambiente; tente novamente depois.' });
  }
}
module.exports = { data, execute };

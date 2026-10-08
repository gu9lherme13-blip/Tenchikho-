const config = require('./config');
const logger = require('./logger');

function canUseWorkCommand(member) {
  if (!member?.roles?.cache) return false;
  const allowed = new Set([config.leaderRoleId(), config.subleaderRoleId()]);
  return member.roles.cache.some(role => allowed.has(role.id));
}

async function requireWorkPermission(interaction) {
  const allowed = canUseWorkCommand(interaction.member);
  if (!allowed) {
    logger.warn('permission_denied', {
      command: interaction.commandName,
      userId: interaction.user?.id,
      guildId: interaction.guildId
    });
    await interaction.reply({ content: '🔒 Este comando é exclusivo para os cargos Líder e Sub-Líder.', ephemeral: true });
  }
  return allowed;
}
module.exports = { canUseWorkCommand, requireWorkPermission };

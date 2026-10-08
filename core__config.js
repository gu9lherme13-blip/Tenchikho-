require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value.trim();
}

module.exports = {
  discordToken: () => required('DISCORD_TOKEN'),
  clientId: () => required('CLIENT_ID'),
  guildId: () => process.env.GUILD_ID?.trim() || null,
  openaiApiKey: () => required('OPENAI_API_KEY'),
  openaiModel: () => process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
  leaderRoleId: () => process.env.LEADER_ROLE_ID?.trim() || '1554983934775922819',
  subleaderRoleId: () => process.env.SUBLEADER_ROLE_ID?.trim() || '1551318428747305020'
};

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || "1462814574691750113";

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ Faltam DISCORD_TOKEN ou CLIENT_ID nas Environment Variables.");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName("ajuda").setDescription("Mostra os comandos do Tenchiko Bloodline."),
  new SlashCommandBuilder().setName("ping").setDescription("Verifica a latência do bot."),
  new SlashCommandBuilder().setName("avatar").setDescription("Mostra o avatar de um usuário.").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(false)),
  new SlashCommandBuilder().setName("userinfo").setDescription("Mostra informações de um usuário.").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(false)),
  new SlashCommandBuilder().setName("serverinfo").setDescription("Mostra informações do servidor."),
  new SlashCommandBuilder().setName("botinfo").setDescription("Mostra informações do Tenchiko Bloodline."),
  new SlashCommandBuilder().setName("ban").setDescription("Bane um usuário.").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addStringOption(o => o.setName("motivo").setDescription("Motivo").setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName("kick").setDescription("Expulsa um usuário.").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addStringOption(o => o.setName("motivo").setDescription("Motivo").setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName("timeout").setDescription("Coloca um usuário em timeout.").addUserOption(o => o.setName("usuario").setDescription("Usuário").setRequired(true)).addIntegerOption(o => o.setName("minutos").setDescription("Duração em minutos").setRequired(true).setMinValue(1).setMaxValue(40320)).addStringOption(o => o.setName("motivo").setDescription("Motivo").setRequired(false)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName("clear").setDescription("Apaga mensagens do canal.").addIntegerOption(o => o.setName("quantidade").setDescription("Quantidade").setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName("say").setDescription("Faz o bot enviar uma mensagem.").addStringOption(o => o.setName("mensagem").setDescription("Mensagem").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName("embed").setDescription("Cria um embed simples.").addStringOption(o => o.setName("titulo").setDescription("Título").setRequired(true)).addStringOption(o => o.setName("descricao").setDescription("Descrição").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
].map(c => c.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages] });

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log(`✅ ${commands.length} comandos Tenchiko registrados no servidor ${GUILD_ID}.`);
}

client.once("ready", async () => {
  console.log(`🩸 Tenchiko Bloodline online: ${client.user.tag}`);
  try { await registerCommands(); } catch (err) { console.error("❌ Erro ao registrar comandos:", err); }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const user = interaction.options.getUser("usuario") || interaction.user;
  try {
    if (interaction.commandName === "ajuda") return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🩸 Tenchiko Bloodline").setDescription("Comandos: /ajuda /ping /avatar /userinfo /serverinfo /botinfo /ban /kick /timeout /clear /say /embed")] });
    if (interaction.commandName === "ping") return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
    if (interaction.commandName === "avatar") return interaction.reply(user.displayAvatarURL({ size: 1024 }));
    if (interaction.commandName === "userinfo") {
      const member = interaction.guild?.members.cache.get(user.id);
      const e = new EmbedBuilder().setTitle(`👤 ${user.username}`).setThumbnail(user.displayAvatarURL({ size: 256 })).addFields({name:"ID",value:user.id,inline:true},{name:"Conta criada",value:`<t:${Math.floor(user.createdTimestamp/1000)}:F>`});
      if (member) e.addFields({name:"Entrou no servidor",value:`<t:${Math.floor(member.joinedTimestamp/1000)}:F>`});
      return interaction.reply({ embeds: [e] });
    }
    if (interaction.commandName === "serverinfo") {
      const g = interaction.guild;
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏰 ${g.name}`).addFields({name:"ID",value:g.id,inline:true},{name:"Membros",value:String(g.memberCount),inline:true},{name:"Dono",value:`<@${g.ownerId}>`,inline:true})] });
    }
    if (interaction.commandName === "botinfo") return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🩸 Tenchiko Bloodline").setDescription("Bot independente do QG NVB.").addFields({name:"Versão",value:"1.0.0",inline:true},{name:"Comandos",value:String(commands.length),inline:true})] });
    if (interaction.commandName === "ban") {
      const m = await interaction.guild.members.fetch(user.id).catch(()=>null); const motivo=interaction.options.getString("motivo")||"Sem motivo informado";
      if (!m) return interaction.reply({content:"❌ Usuário não encontrado.",ephemeral:true}); await m.ban({reason:motivo}); return interaction.reply(`🔨 ${user} foi banido.\n**Motivo:** ${motivo}`);
    }
    if (interaction.commandName === "kick") {
      const m = await interaction.guild.members.fetch(user.id).catch(()=>null); const motivo=interaction.options.getString("motivo")||"Sem motivo informado";
      if (!m) return interaction.reply({content:"❌ Usuário não encontrado.",ephemeral:true}); await m.kick(motivo); return interaction.reply(`👢 ${user} foi expulso.\n**Motivo:** ${motivo}`);
    }
    if (interaction.commandName === "timeout") {
      const m = await interaction.guild.members.fetch(user.id).catch(()=>null); const minutos=interaction.options.getInteger("minutos"); const motivo=interaction.options.getString("motivo")||"Sem motivo informado";
      if (!m) return interaction.reply({content:"❌ Usuário não encontrado.",ephemeral:true}); await m.timeout(minutos*60000,motivo); return interaction.reply(`⏳ ${user} recebeu timeout por **${minutos} minutos**.`);
    }
    if (interaction.commandName === "clear") {
      const q=interaction.options.getInteger("quantidade"); const deleted=await interaction.channel.bulkDelete(q,true); return interaction.reply({content:`🧹 ${deleted.size} mensagens apagadas.`,ephemeral:true});
    }
    if (interaction.commandName === "say") {
      const msg=interaction.options.getString("mensagem"); await interaction.reply({content:"✅ Mensagem enviada.",ephemeral:true}); return interaction.channel.send(msg);
    }
    if (interaction.commandName === "embed") {
      const t=interaction.options.getString("titulo"), d=interaction.options.getString("descricao"); await interaction.reply({content:"✅ Embed enviado.",ephemeral:true}); return interaction.channel.send({embeds:[new EmbedBuilder().setTitle(t).setDescription(d)]});
    }
  } catch (err) {
    console.error(err);
    const msg="❌ Não foi possível executar esse comando.";
    if (interaction.replied) await interaction.followUp({content:msg,ephemeral:true}); else await interaction.reply({content:msg,ephemeral:true});
  }
});

client.login(TOKEN);

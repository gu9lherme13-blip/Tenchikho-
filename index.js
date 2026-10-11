require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
let sharp = null; try { sharp = require('sharp'); } catch (e) { /* sem sharp: cartão de boas-vindas indisponível */ }
const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || '';
const PORT = Number(process.env.PORT || 10000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const MAIN_INVITE = process.env.MAIN_DISCORD_INVITE || 'https://discord.gg/bdxXc8p5t';
const QG_PUBLIC_URL = process.env.QG_PUBLIC_URL || 'https://qg-nvb.onrender.com';
const NVB_BUILD = 'MUSIC-LINKS-PLAYLIST-YTDLP-2026-10-06';
const RECRUIT_INVITE = process.env.RECRUIT_DISCORD_INVITE || 'https://discord.gg/X3eDn2wye';
const WELCOME_BG = path.join(__dirname, 'nvb-welcome-bg.png');

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ DISCORD_TOKEN e CLIENT_ID são obrigatórios no Render.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});


// (O antigo bloco de música foi retirado: não tinha comandos ligados. O sistema de música novo será um módulo à parte.)
function extrairParticipantesGravacao(texto){const ids=[],raw=String(texto||''),re=/<@!?(\d{15,22})>/g;let m;while((m=re.exec(raw)))if(!ids.includes(m[1]))ids.push(m[1]);for(const token of raw.split(/[\s,;]+/)){const id=token.replace(/[^0-9]/g,'');if(/^\d{15,22}$/.test(id)&&!ids.includes(id))ids.push(id);}return ids.slice(0,20);}
function videoInfoGravacao(url){const value=String(url||'').trim();let m=value.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);if(m)return {thumbnail:`https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`,provider:'YouTube'};m=value.match(/vimeo\.com\/(?:video\/)?(\d+)/i);if(m)return {provider:'Vimeo'};return {provider:null};}
function gravacaoEmbed(rec){const info=videoInfoGravacao(rec.link),participantes=rec.participantes?.length?rec.participantes.map(id=>`<@${id}>`).join(' '):'Nenhum participante informado';const e=new EmbedBuilder().setColor(0x7c3aed).setTitle('🎥 GRAVAÇÃO NVB').setDescription('🩸 **Nytheris Vampyre Bloodline**').addFields({name:'👥 Participantes',value:participantes,inline:false},{name:'💬 Comentários',value:String(rec.comentarios||'Sem comentários').slice(0,1024),inline:false},{name:'🎬 VÍDEO',value:info.thumbnail?`Prévia/miniatura disponível • ${info.provider}`:'Prévia não disponível para este site. Use **▶️ ASSISTIR VÍDEO** para abrir o vídeo original.',inline:false}).setFooter({text:'🩸 Nytheris Vampyre Bloodline'}).setTimestamp(new Date(rec.criadoEm||Date.now()));if(info.thumbnail)e.setImage(info.thumbnail);return e;}
function gravacaoPainelEmbed(){return new EmbedBuilder().setColor(0x7c3aed).setTitle('🎥 CENTRAL DE GRAVAÇÕES NVB').setDescription('Publique as gravações das jogatinas, resenhas e eventos da NVB.\n\n📝 **Nova gravação:** informe participantes, comentários e o link do vídeo.\n🎬 **Publicação:** o bot cria a publicação com prévia quando disponível.\n▶️ **Assistir:** abre o link original do vídeo.').addFields({name:'📚 Gravações publicadas',value:`**${db.gravacoes.length}**`,inline:true},{name:'🩸 NVB',value:'Nytheris Vampyre Bloodline',inline:true}).setFooter({text:'Use os botões abaixo para publicar ou consultar gravações.'});}
function gravacaoPainelBotoes(){return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gravacao_nova').setLabel('🎥 Nova gravação').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('gravacao_lista').setLabel('📚 Ver gravações').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('gravacao_atualizar').setLabel('🔄 Atualizar painel').setStyle(ButtonStyle.Secondary))];}

// =========================
// BANCO JSON
// =========================
// Arquivos JSON ficam na raiz do projeto. Para manter os dados entre deploys no Render,
// crie um Disco Persistente e defina a variável DATA_DIR com o caminho do disco (ex.: /var/data).
const DB_DIR = process.env.DATA_DIR || __dirname;
try { require('fs').mkdirSync(DB_DIR, { recursive: true }); } catch (e) { console.error('Erro criando DATA_DIR:', e.message); }

function readJson(file, fallback) {
  try {
    const p = path.join(DB_DIR, file);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;
  } catch (e) {
    console.error(`Erro lendo ${file}:`, e.message);
    return fallback;
  }
}
function writeJson(file, value) {
  try { fs.writeFileSync(path.join(DB_DIR, file), JSON.stringify(value, null, 2)); }
  catch (e) { console.error(`Erro salvando ${file}:`, e.message); }
}

const db = {
  pontos: readJson('pontos.json', {}),
  xp: readJson('xp.json', {}),
  roblox: readJson('roblox.json', {}),
  conquistas: readJson('conquistas.json', {}),
  recrutamentos: readJson('recrutamentos.json', []),
  avisos: readJson('avisos.json', {}),
  config: readJson('config.json', {}),
  logs: readJson('logs.json', []),
  presenca: readJson('presenca.json', {}),
  presencaHistorico: readJson('presencaHistorico.json', []),
  recompensas: readJson('recompensas.json', []),
  historico: readJson('historico.json', {}),
  codes: readJson('codes.json', {}),
  chamadas: readJson('chamadas.json', {}),
  atividades: readJson('atividades.json', {}),
  suportes: readJson('suportes.json', []),
  gravacoes: readJson('gravacoes.json', [])
};

function writeDb(name) { writeJson(`${name}.json`, db[name]); }
function presenceCount(userId) {
  const hist=Array.isArray(db.presencaHistorico)?db.presencaHistorico:[];
  const old=Object.values(db.presenca||{}).filter(x=>x?.userId===userId);
  return hist.filter(x=>x?.userId===userId).length + old.filter(x=>!hist.some(h=>h.userId===userId && h.callId===x.callId)).length;
}
function participationCounts(userId){
  const logs=Array.isArray(db.logs)?db.logs:[];
  const count=t=>logs.filter(x=>x.userId===userId&&x.type===t).length;
  return {presencas:presenceCount(userId),jogatinas:count('jogatina'),resenhas:count('resenha'),eventos:count('evento')};
}
function logAction(type, userId, details = {}) {
  db.logs.push({ type, userId, details, at: new Date().toISOString() });
  if (db.logs.length > 1000) db.logs.shift();
  writeDb('logs');
}
function addPoints(id, amount, reason = '') {
  db.pontos[id] = Math.max(0, Number(db.pontos[id] || 0) + Number(amount));
  db.xp[id] = Math.max(0, Number(db.xp[id] || 0) + Math.max(0, Number(amount)));
  writeDb('pontos'); writeDb('xp');
  logAction('pontos', id, { amount, reason });
  return db.pontos[id];
}
function removePoints(id, amount, reason = '') {
  const current = Number(db.pontos[id] || 0);
  if (current < Number(amount)) return false;
  db.pontos[id] = current - Number(amount);
  writeDb('pontos');
  logAction('pontos_remove', id, { amount, reason });
  return true;
}
function level(xp) { return Math.max(1, Math.floor(Number(xp || 0) / 100) + 1); }
function normalizeQG(v) { return String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '); }

// =========================
// ROLES / PERMISSÕES
// =========================
const roleIds = {
  LDR: process.env.ROLE_LDR || '', 'SB-LDR': process.env.ROLE_SB_LDR || '', ADM: process.env.ROLE_ADM || '',
  CMDT: process.env.ROLE_CMDT || '', MOD: process.env.ROLE_MOD || '', SUP: process.env.ROLE_SUP || '',
  ORG: process.env.ROLE_ORG || '', REC: process.env.ROLE_REC || '', TRN_STAFF: process.env.ROLE_TRN_STAFF || '',
  INF: process.env.ROLE_INF || '', ART: process.env.ROLE_ART || '', BSTR: process.env.ROLE_BSTR || '',
  PCR: process.env.ROLE_PCR || '', MBRS: process.env.ROLE_MBRS || '', NVT: process.env.ROLE_NVT || ''
};
const roleNames = {
  LDR: 'Imperador Vampírico 👑',
  'SB-LDR': 'Príncipe Vampírico 🍷',
  ADM: 'Ancião Vampírico 🏛️',
  CMDT: 'Lorde Vampírico',
  MOD: 'Guardião Vampírico 🛡️',
  SUP: 'Curador Vampírico 🩸',
  ORG: 'Regente Vampírico 📋',
  REC: 'Caçador Vampírico',
  TRN_STAFF: 'Aprendiz Vampírico 🌱',
  INF: 'Arauto Vampírico 📢',
  ART: 'Artífice Vampírico 🎨',
  BSTR: 'Benfeitor Vampírico 🚀',
  PCR: 'Vampiro Aliado 🤝',
  MBRS: 'Vampiros 🦇',
  NVT: 'Neófito'
};
const roleAliases = {
  EDT:'ART', ORG:'ORG', REC:'REC', BSTR:'BSTR', PCR:'PCR', MBRS:'MBRS',
  TRN_STAFF:'TRN_STAFF', INF:'INF', MOD:'MOD', SUP:'SUP', CMDT:'CMDT', ADM:'ADM', 'SB-LDR':'SB-LDR', LDR:'LDR', NVT:'NVT', ART:'ART'
};
function roleKey(value){ return roleAliases[String(value||'').trim()] || String(value||'').trim(); }
function roleMatches(role, key){
  const limpo=v=>normalizeQG(v||'').replace(/\[[^\]]*\]/g,' ').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
  const semSufixo=v=>v.replace(/\s+vampirico$/,'').trim();
  const alvo=limpo(roleNames[key]), nome=limpo(role?.name);
  if(!alvo||!nome) return false;
  return nome===alvo || semSufixo(nome)===semSufixo(alvo);
}
function findNvbRole(guild,key){
  key=roleKey(key);
  const configured=(db.config&&db.config.roleIds&&db.config.roleIds[key])||roleIds[key];
  if(configured){const r=guild?.roles?.cache?.get(configured);if(r)return r;}
  return guild?.roles?.cache?.find(r=>roleMatches(r,key)) || null;
}
const allowed = {
  recrutamento: ['REC','SUP','MOD','CMDT','ADM','SB-LDR','LDR'],
  aprovar: ['REC','CMDT','ADM','SB-LDR','LDR'],
  recusar: ['REC','CMDT','ADM','SB-LDR','LDR'], moderacao: ['MOD','CMDT','ADM','SB-LDR','LDR'],
  expulsar: ['CMDT','ADM','SB-LDR','LDR'], banir: ['ADM','SB-LDR','LDR'], admin: ['ADM','SB-LDR','LDR'],
  comunidade: ['ORG','CMDT','ADM'], chamada: ['ORG','REC','CMDT','ADM'], pontosAdd: ['ORG','REC','CMDT','ADM'],
  pontosRemove: ['CMDT','ADM','SB-LDR','LDR'], recompensa: ['ADM','CMDT','SB-LDR','LDR'], conquista: ['ORG','CMDT','ADM'],
  automacao: ['ADM','SB-LDR','LDR']
};
function hasRole(member, names) { return names.some(n => { const r=findNvbRole(member?.guild,n); return !!(r && member?.roles?.cache?.has(r.id)); }); }
function can(i, group) { return i.memberPermissions?.has(PermissionFlagsBits.Administrator) || hasRole(i.member, allowed[group] || []); }
async function guard(i, group) {
  if (can(i, group)) return true;
  await safeReply(i, { content: '❌ Você não possui o cargo necessário para usar este comando.', ephemeral: true });
  return false;
}
async function safeReply(i, payload) {
  try {
    if (i.replied) return await i.followUp(payload);
    if (i.deferred) return await i.editReply(payload);
    return await i.reply(payload);
  } catch (e) {
    if (e?.code === 10062 || e?.code === 10015) { console.warn(`⚠️ Interação expirada: /${i.commandName || i.customId}`); return null; }
    throw e;
  }
}
async function safeDefer(i, options = {}) {
  try { if (!i.replied && !i.deferred) await i.deferReply(options); return true; }
  catch (e) { if (e?.code === 10062) return false; throw e; }
}
function optionUser(name='usuario', description='Membro do servidor', required=true) {
  return o => o.setName(name).setDescription(description).setRequired(required);
}

// =========================
// 38 ESTILOS OFICIAIS
// =========================
const STYLE_LIST = [
  ['Original',0],['Dark',10],['Dark Neon',15],['Dark Roxo',10],['Vampírico NVB',25],['Anime',25],['Gótico',15],['Cinemático',20],
  ['Neon Dark',15],['Neon Rosa Choque',15],['Neon Azul Elétrico',15],['Neon Roxo NVB',15],['Cyberpunk',25],['Noite Vampírica',20],
  ['Anjo Dark',20],['Flamejante',15],['Gelado',15],['Natureza',10],['Sombrio',15],['Luz',15],['Inferno',20],['Céu',15],
  ['Espaço',20],['Deserto',15],['Cidade',15],['Mar',15],['Floresta Sombria',20],['Vulcão',20],['Arco-Íris',15],['Preto e Branco',10],
  ['Metálico',20],['Pixel',15],['Samurai',20],['Caçador',15],['Palhaço Sombrio',15],['Halloween',15],['Natal',15],['Escondido',25]
];
const STYLE_NAMES = STYLE_LIST.map(x => x[0]);
function styleChoices() { return STYLE_LIST.slice(0,25).map(([name])=>({name,value:name})); }
function stylePrompt(style) {
  const secondary = {
    Dark:'floresta sombria, árvores altas, neblina e lua entre os galhos', 'Dark Neon':'cidade gótica noturna com neon', 'Dark Roxo':'castelo escuro com névoa roxa',
    'Vampírico NVB':'castelo vampírico, morcegos e lua cheia', Anime:'cidade noturna com iluminação de anime', Gótico:'catedral gótica e neblina', Cinemático:'castelo cinematográfico com luz volumétrica',
    'Neon Dark':'becos escuros com neon', 'Neon Rosa Choque':'cidade noturna com neon rosa', 'Neon Azul Elétrico':'cidade noturna com neon azul', 'Neon Roxo NVB':'castelo futurista roxo',
    Cyberpunk:'cidade cyberpunk chuvosa', 'Noite Vampírica':'noite de lua cheia e morcegos', 'Anjo Dark':'céu escuro com asas e ruínas', Flamejante:'ruínas com fogo', Gelado:'palácio de gelo', Natureza:'floresta viva', Sombrio:'floresta quase sem luz', Luz:'santuário luminoso', Inferno:'paisagem infernal', Céu:'céu celestial', Espaço:'espaço profundo', Deserto:'deserto ao entardecer', Cidade:'cidade moderna', Mar:'oceano noturno', 'Floresta Sombria':'floresta densa com neblina', Vulcão:'vulcão em erupção', 'Arco-Íris':'céu colorido', 'Preto e Branco':'cenário monocromático', Metálico:'cidade industrial', Pixel:'mundo pixelado', Samurai:'templo japonês', Caçador:'floresta de caça', 'Palhaço Sombrio':'circo abandonado', Halloween:'cidade de Halloween', Natal:'cidade natalina', Escondido:'ruínas secretas'
  };
  return `estilo ${style}; cenário secundário: ${secondary[style] || 'cenário dark elegante'}; estética NVB, morcegos discretos, azul/roxo/verde, corpo inteiro da cabeça aos pés, sem corte, sem texto.`;
}

// =========================
// ROBLOX / IA
// =========================
async function robloxUser(username) {
  const r = await fetch('https://users.roblox.com/v1/usernames/users', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({usernames:[username], excludeBannedUsers:false}) });
  if (!r.ok) throw new Error('Não foi possível consultar o Roblox.');
  const data = await r.json();
  const u = data.data?.[0];
  if (!u) throw new Error('Usuário Roblox não encontrado.');
  const t = await fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${u.id}&size=720x720&format=Png&isCircular=false`);
  const tj = await t.json();
  let profile={};try{const pr=await fetch(`https://users.roblox.com/v1/users/${u.id}`);if(pr.ok)profile=await pr.json();}catch(e){}return { id:u.id, username:u.name, displayName:u.displayName, avatarUrl:tj.data?.[0]?.imageUrl || '', description:profile.description||'', created:profile.created||null, hasVerifiedBadge:Boolean(u.hasVerifiedBadge||profile.hasVerifiedBadge) };
}
async function openAIImage(prompt, inputBuffer=null) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não está configurada no Render.');
  if (inputBuffer) {
    const form = new FormData();
    form.append('model', OPENAI_IMAGE_MODEL);
    form.append('prompt', prompt);
    form.append('size', '1024x1536');
    form.append('quality', 'high');
    form.append('image[]', new Blob([inputBuffer], {type:'image/png'}), 'avatar.png');
    const r = await fetch('https://api.openai.com/v1/images/edits', {method:'POST', headers:{Authorization:`Bearer ${OPENAI_API_KEY}`}, body:form});
    const j = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(j.error?.message || `Falha na IA (${r.status}).`);
    const b64=j.data?.[0]?.b64_json; if (!b64) throw new Error('A IA não retornou a imagem.');
    return Buffer.from(b64,'base64');
  }
  const r = await fetch('https://api.openai.com/v1/images/generations', {method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${OPENAI_API_KEY}`}, body:JSON.stringify({model:OPENAI_IMAGE_MODEL,prompt,size:'1024x1536',quality:'high'})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error?.message || `Falha na IA (${r.status}).`);
  const b64=j.data?.[0]?.b64_json; if(!b64) throw new Error('A IA não retornou a imagem.');
  return Buffer.from(b64,'base64');
}
async function fetchBuffer(url) { const r=await fetch(url); if(!r.ok) throw new Error('Não foi possível baixar a imagem.'); return Buffer.from(await r.arrayBuffer()); }

// =========================
// WELCOME CARD
// =========================
async function getMemberRoblox(member) {
  const stored=db.roblox[member.id];
  if(stored?.username) return stored;
  const rec=[...db.recrutamentos].reverse().find(x=>{if(!x.roblox)return false;const id=String(x.discordId||x.userId||'');if(id&&id===member.id)return true;const d=normalizeQG(x.discord||x.discordNick||x.nickDiscord||'').replace(/^@/,'');return d===normalizeQG(member.user.username)||d===normalizeQG(member.user.tag)||d===normalizeQG(member.displayName||'');});
  if(rec?.roblox) { const r=await robloxUser(String(rec.roblox).replace(/^@/,'' )).catch(()=>null); if(r){ db.roblox[member.id]=r; writeDb('roblox'); return r; } }
  return null;
}
async function makeWelcomeCard(member, roblox) {
  // A arte é a mesma da NVB, mas os dados do membro são renderizados
  // automaticamente pelo bot: avatar real do Discord, nome, @username e data/hora.
  if (!fs.existsSync(WELCOME_BG)) return null;
  const base = await fs.promises.readFile(WELCOME_BG);
  let avatar = null;
  try {
    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true });
    avatar = await fetchBuffer(avatarUrl);
  } catch (_) {}

  const displayName = String(member.displayName || member.user.globalName || member.user.username || 'Membro NVB').slice(0, 24);
  const username = `@${String(member.user.username || 'usuario').slice(0, 28)}`;
  const now = new Date();
  const date = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const time = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

  const layers = [];
  // Cobre somente a área variável da arte original, preservando todo o cenário NVB.
  layers.push(Buffer.from(`<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="blur"><feGaussianBlur stdDeviation="14"/></filter>
      <clipPath id="bgclip"><circle cx="510" cy="600" r="205"/></clipPath>
      <clipPath id="avatarclip"><circle cx="300" cy="675" r="112"/></clipPath>
    </defs>
    <rect x="132" y="390" width="760" height="430" rx="36" fill="#05000f" fill-opacity="0.55"/>
    <rect x="150" y="560" width="730" height="220" rx="28" fill="#05000f" fill-opacity="0.82" stroke="#9d4edd" stroke-opacity="0.85" stroke-width="3"/>
    <rect x="150" y="400" width="730" height="170" rx="28" fill="#05000f" fill-opacity="0.45"/>
    <text x="505" y="455" text-anchor="middle" fill="#d8b4fe" font-family="Arial, sans-serif" font-size="21" letter-spacing="3">NOVO MEMBRO • NVB</text>
  </svg>`));

  if (avatar) {
    const big = await sharp(avatar).resize(430, 430, { fit: 'cover' }).png().toBuffer();
    const small = await sharp(avatar).resize(224, 224, { fit: 'cover' }).png().toBuffer();
    // Avatar grande e discreto no fundo.
    layers.push({ input: big, left: 297, top: 385, blend: 'over' });
    layers.push(Buffer.from(`<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg"><circle cx="512" cy="600" r="215" fill="#05000f" fill-opacity="0.72"/><circle cx="300" cy="675" r="123" fill="#120022" stroke="#a855f7" stroke-width="8"/></svg>`));
    layers.push({ input: small, left: 188, top: 563, blend: 'over' });
  } else {
    layers.push(Buffer.from(`<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg"><circle cx="300" cy="675" r="123" fill="#120022" stroke="#a855f7" stroke-width="8"/></svg>`));
  }

  layers.push(Buffer.from(`<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg">
    <rect x="410" y="580" width="430" height="145" rx="22" fill="#05000f" fill-opacity="0.78"/>
    <text x="455" y="625" fill="#ffffff" font-family="Arial, sans-serif" font-weight="700" font-size="34">${escapeXml(displayName)}</text>
    <text x="455" y="666" fill="#c084fc" font-family="Arial, sans-serif" font-size="22">${escapeXml(username)}</text>
    <circle cx="435" cy="696" r="16" fill="#7c3aed"/>
    <text x="435" y="704" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="17">✓</text>
    <text x="462" y="704" fill="#e9d5ff" font-family="Arial, sans-serif" font-size="18">Discord</text>
    <rect x="318" y="1128" width="400" height="82" rx="22" fill="#05000f" fill-opacity="0.84"/>
    <text x="518" y="1160" text-anchor="middle" fill="#c4b5fd" font-family="Arial, sans-serif" font-size="15" letter-spacing="1.5">VOCÊ ENTROU EM NOSSA LINHAGEM EM:</text>
    <text x="518" y="1193" text-anchor="middle" fill="#a855f7" font-family="Arial, sans-serif" font-size="24" font-weight="700">${escapeXml(date)} • ${escapeXml(time)}</text>
  </svg>`));

  return await sharp(base).composite(layers).png().toBuffer();
}
function escapeXml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}

// =========================
// CHAMADAS
// =========================
function callsChannelId(guild) { const configured='1554292112206336040'; if(configured)return configured; const found=guild?.channels?.cache?.find(c=>c.isTextBased() && /chamada|chamadas/i.test(c.name||'')); return found?.id || ''; }
function activeCall(guildId) { const c=db.chamadas[guildId]; return c && c.status==='aberta' ? c : null; }
function brazilClock(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=k=>parts.find(p=>p.type===k)?.value||'';
  return {hour:Number(get('hour')),minute:Number(get('minute')),date:`${get('year')}-${get('month')}-${get('day')}`};
}
function callWindowOpen(){ const c=brazilClock(); return c.hour>=5; }
async function closeCall(call, reason='Chamada encerrada automaticamente às 00:00') {
  if(!call || call.status!=='aberta') return false;
  call.status='encerrada'; call.encerradaEm=new Date().toISOString(); call.encerradaMotivo=reason; writeDb('chamadas');
  await updateCallMessage(call);
  const ch=await client.channels.fetch(call.channelId).catch(()=>null);
  if(ch?.isTextBased()) await ch.send({embeds:[new EmbedBuilder().setColor(0x22c55e).setTitle('🔒 CHAMADA ENCERRADA').setDescription(`**${call.titulo}**\n\n👥 **Presentes:** ${Object.keys(call.presencas||{}).length}\n\n${Object.values(call.presencas||{}).map((p,i)=>`${i+1}. <@${p.userId}> — ${p.resposta}`).join('\n')||'Nenhuma presença registrada.'}`).setFooter({text:`NVB • ${reason}`})]}).catch(()=>{});
  return true;
}
async function closeExpiredCallAtMidnight(){
  const guild=qgGuild(); if(!guild) return;
  const current=db.chamadas[guild.id];
  if(!current || current.status!=='aberta') return;
  const now=brazilClock();
  const created=new Date(current.criadaEm||Date.now());
  const createdLocal=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(created);
  // A chamada é criada SOMENTE pelo /chamada. Ela termina na virada para 00:00, mesmo se o tick atrasar alguns minutos.
  if(now.date!==createdLocal || now.hour===0) await closeCall(current,'Chamada encerrada automaticamente às 00:00');
}
async function callScheduleTick(){
  try{ await closeExpiredCallAtMidnight(); }
  catch(e){ console.error('❌ Erro ao encerrar chamada:',e.message); }
}
async function updateCallMessage(call) {
  if(!call?.channelId || !call.messageId) return;
  const ch=await client.channels.fetch(call.channelId).catch(()=>null); if(!ch?.isTextBased()) return;
  const msg=await ch.messages.fetch(call.messageId).catch(()=>null); if(!msg) return;
  const list=Object.values(call.presencas||{});
  const desc=list.length ? list.map((p,i)=>`${i+1}. <@${p.userId}> — ${p.resposta}`).join('\n') : 'Ainda não há presenças confirmadas.';
  const e=new EmbedBuilder().setColor(call.status==='aberta'?0x7c3aed:0x22c55e).setTitle(`📢 ${call.titulo}`).addFields(
    {name:'🎯 Tema',value:call.tema,inline:true},{name:'🕖 Horário',value:call.horario,inline:true},{name:'📝 Descrição',value:call.descricao},
    {name:`👥 Presenças (${list.length})`,value:desc.slice(0,1024)}
  ).setFooter({text:call.status==='aberta'?'Clique em Presença ou use /presenca.':'Chamada encerrada • lista final salva'});
  const row=call.status==='aberta'?new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`call_presence_${call.id}`).setLabel('🟢 Responder presença').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`call_close_${call.id}`).setLabel('🔒 Encerrar chamada').setStyle(ButtonStyle.Danger)):null;
  await msg.edit({embeds:[e],components:row?[row]:[]}).catch(()=>{});
}
function presenceModal(callId){ return new ModalBuilder().setCustomId(`presence_modal_${callId}`).setTitle('🟢 Responder chamada').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('resposta').setLabel('Resposta à chamada').setPlaceholder('Ex.: Estou presente e posso participar.').setStyle(TextInputStyle.Paragraph).setMaxLength(300).setRequired(true))); }
function activityModal(kind){
  const title=kind==='jogatina'?'🎮 Nova Jogatina NVB':kind==='resenha'?'💬 Nova Resenha NVB':'🦇 Novo Evento NVB';
  const titleId=kind==='evento'?'nome':'titulo';
  return new ModalBuilder().setCustomId(`${kind}_modal`).setTitle(title).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(titleId).setLabel(kind==='evento'?'Nome do evento':'Título').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setMaxLength(900).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('imagem').setLabel('Foto PNG (URL opcional)').setPlaceholder('Cole o link direto da imagem PNG/JPG').setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('data_horario_duracao').setLabel('Data • Horário • Duração').setPlaceholder('Ex.: 05/10/2026 • 20:00 • 2 horas').setStyle(TextInputStyle.Short).setMaxLength(150).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('local_tipo').setLabel(kind==='evento'?'Local • Tipo de evento':'Tema • Local (opcional)').setPlaceholder(kind==='evento'?'Ex.: Roblox • Competição':'Ex.: Futebol • Roblox').setStyle(TextInputStyle.Short).setMaxLength(150).setRequired(false))
  );
}
function jogatinaModal(){ return activityModal('jogatina'); }
function resenhaModal(){ return activityModal('resenha'); }
function eventoModal(){ return activityModal('evento'); }
function chamadaModal(){ return new ModalBuilder().setCustomId('chamada_modal').setTitle('📢 Nova Chamada NVB').addComponents(
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tema').setLabel('Tema').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setMaxLength(900).setRequired(true))
 ); }

// =========================
// COMANDOS ATUAIS
// =========================
const ANIME_ACTION_CHOICES = [
  {name:'Comer',value:'comer'},{name:'Abraçar',value:'abracar'},{name:'Beijar',value:'beijar'},
  {name:'Proteger',value:'proteger'},{name:'Atacar',value:'atacar'},{name:'Conversar',value:'conversar'},
  {name:'Ajudar',value:'ajudar'},{name:'Dormir',value:'dormir'},{name:'Rir',value:'rir'},
  {name:'Desafiar',value:'desafiar'},{name:'Treinar',value:'treinar'},{name:'Parabenizar',value:'parabenizar'}
];
async function sendToChannel(envName,payload){
  const id=process.env[envName]; if(!id)return false;
  return sendToChannelId(id,payload);
}
async function sendToChannelId(id,payload){
  if(!id)return false;
  const ch=await client.channels.fetch(String(id)).catch(()=>null);
  if(!ch?.isTextBased() || !ch?.isSendable?.()) return false;
  try { await ch.send(payload); return true; }
  catch(e){ console.error(`❌ Falha enviando para canal ${id}:`, e.message); return false; }
}
function qgGuild(){ return client.guilds.cache.get(GUILD_ID)||client.guilds.cache.first(); }
async function modHistory(userId,action,details){db.historico[userId] ||= [];db.historico[userId].push({action,details,at:new Date().toISOString()});writeDb('historico');}
function nvRoles(member){ return member?.roles?.cache?.filter(r=>r.id!==member.guild.id && Object.keys(roleNames).some(k=>roleMatches(r,k))).sort((a,b)=>b.position-a.position).map(r=>r.name) || []; }
function rankPosition(userId){const arr=Object.entries(db.pontos).sort((a,b)=>Number(b[1])-Number(a[1]));const i=arr.findIndex(x=>x[0]===userId);return i<0?'—':String(i+1);}
function recruitmentFor(userId){return [...db.recrutamentos].reverse().find(x=>String(x.discordId||x.userId)===String(userId)) || null;}
function memberRoleLabel(member){const r=nvRoles(member);return r.length?r.join(', '):'🦇 Vampiros';}

function activityButtons(kind,id){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`activity_accept_${kind}_${id}`).setLabel('✅ Aceitar').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`activity_decline_${kind}_${id}`).setLabel('❌ Recusar').setStyle(ButtonStyle.Danger));}
function activityEmbed(kind,item){const emoji=kind==='evento'?'🎪':kind==='jogatina'?'🎮':'💬';const fields=(item.fields||[]).map(f=>({...f,name:String(f.name).slice(0,256),value:String(f.value||'—').slice(0,1024)}));const e=new EmbedBuilder().setColor(0x7c3aed).setTitle(`${emoji} ${String(item.titulo||'Atividade NVB').slice(0,256)}`).addFields(...fields,{name:`👥 Participantes (${(item.accept||[]).length})`,value:`${(item.accept||[]).length} aceitaram • ${(item.decline||[]).length} recusaram`}).setFooter({text:`NVB • ${kind.toUpperCase()}`}).setTimestamp();if(/^https?:\/\//i.test(String(item.imagem||'')))e.setImage(String(item.imagem).trim());return e;}
// =========================
// SISTEMA DE DIVERSÃO • ANIME NVB
// =========================
const ANIME_CHARACTERS = [
  'Monkey D. Luffy','Roronoa Zoro','Sanji','Nami','Nico Robin','Portgas D. Ace','Trafalgar Law','Shanks','Kaido',
  'Son Goku','Vegeta','Gohan','Piccolo','Broly','Trunks','Frieza',
  'Saitama','Genos','Tatsumaki','Garou',
  'Gojo Satoru','Ryomen Sukuna','Yuji Itadori','Megumi Fushiguro','Nobara Kugisaki','Toji Fushiguro','Yuta Okkotsu',
  'Naruto Uzumaki','Sasuke Uchiha','Sakura Haruno','Kakashi Hatake','Itachi Uchiha','Madara Uchiha','Hinata Hyuga',
  'Tanjiro Kamado','Nezuko Kamado','Zenitsu Agatsuma','Inosuke Hashibira','Muzan Kibutsuji',
  'Ichigo Kurosaki','Rukia Kuchiki','Aizen Sosuke','Orihime Inoue',
  'Rimuru Tempest','Milim Nava','Diablo','Benimaru','Shion',
  'Subaru Natsuki','Emilia','Rem','Ram','Reinhard van Astrea',
  'Naofumi Iwatani','Raphtalia','Filo',
  'Vanitas','Noe Archiviste','Jeanne',
  'Iruma Suzuki','Clara Valac','Ameri Azazel','Alice Asmodeus',
  'Levi Ackerman','Mikasa Ackerman','Eren Yeager','Armin Arlert',
  'Killua Zoldyck','Gon Freecss','Hisoka','Kurapika',
  'Dazai Osamu','Atsushi Nakajima','Chuuya Nakahara','Akutagawa',
  'Ainz Ooal Gown','Albedo','Shalltear Bloodfallen',
  'Sung Jin-Woo','Cha Hae-In',
  'Anos Voldigoad','Shinra Kusakabe','Guts','Alucard','Light Yagami','L','Edward Elric','Roy Mustang','Denji','Power','Makima','Eren Yeager'
];const ANIME_POWERS = ['Manipulação das Sombras','Expansão de Domínio','Regeneração Vampírica','Controle do Tempo','Olhos Amaldiçoados','Teleporte','Espada Demoníaca','Manipulação de Gelo','Manipulação de Fogo','Energia Espiritual','Barreira Absoluta','Velocidade Sobrenatural','Invocação de Espíritos','Roubo de Habilidades','Controle da Lua'];
const ANIME_TRANSFORMS = ['Forma Vampírica','Modo Berserker','Forma Demoníaca','Modo Divino','Ascensão Sombria','Despertar Supremo','Forma Celestial','Modo Caçador','Estado Amaldiçoado','Forma do Abismo'];
const ANIME_DESTINIES = ['Você será o protagonista de uma guerra sobrenatural.','Seu destino é proteger alguém importante.','Você despertará um poder escondido.','Você será escolhido por uma antiga linhagem.','Seu maior rival se tornará seu aliado.','Você encontrará uma relíquia lendária.','Você dominará uma técnica proibida.','Você será o guardião de um reino sombrio.','Você entrará para uma organização secreta.','Seu nome será lembrado como uma lenda.'];
const ANIME_QUIZ = [
  ['Qual personagem é conhecido pelos Seis Olhos?',['Gojo','Naruto','Rimuru','Levi'],0],
  ['Quem é o protagonista de Re:Zero?',['Subaru','Vanitas','Ainz','Tanjiro'],0],
  ['Qual personagem pertence a Tensei Shitara Slime?',['Rimuru','Gojo','Dazai','Itachi'],0],
  ['Quem usa uma espada em Demon Slayer?',['Tanjiro','Subaru','Anos','Ainz'],0],
  ['Qual personagem é de No Game No Life?',['Sora','Levi','Megumi','Sasuke'],0]
];
function pick(arr){return arr[Math.floor(Math.random()*arr.length)];}
function animePoints(userId, amount, reason){ return addPoints(userId, amount, reason); }
function interactionEmbed(title, description, color=0x7c3aed){
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({text:'NVB • Anime Interactions 🦇'}).setTimestamp();
}
function memberMention(user){ return `<@${user.id}>`; }
function animeInteraction(kind, actor, target){
  const a=memberMention(actor), t=memberMention(target);
  const data={
    abraçar:[`🤗 ${a} abraçou ${t} como uma cena de anime!`,`💜 Um abraço digno do episódio final.`],
    beijar:[`💋 ${a} deu um beijo em ${t}!`,`✨ O romance acaba de ganhar um novo arco.`],
    morder:[`🩸 ${a} mordeu ${t}!`,`🦇 A linhagem vampírica da NVB ficou mais forte.`],
    proteger:[`🛡️ ${a} protegeu ${t}!`,`⚔️ Ninguém passa pelo guardião da cena.`],
    atacar:[`⚔️ ${a} lançou um ataque contra ${t}!`,`💥 O combate começou. Esquiva ou contra-ataca!`],
    curar:[`✨ ${a} curou ${t}!`,`🌟 A energia vital foi restaurada.`],
    rival:[`🔥 ${a} declarou ${t} como seu rival!`,`⚡ Nasce uma rivalidade digna de anime.`]
  }[kind];
  return interactionEmbed(data[0],data[1]);
}

// =========================
// INTERAÇÕES
// =========================
// =========================

// Servidor mínimo só para o Render manter o serviço vivo (o site agora é outro projeto).
const app=express();
app.get('/',(req,res)=>res.send('🤖 Tenchiko NVB online'));
app.get('/health',(req,res)=>res.json({ok:true,bot:client.user?.tag||null,online:client.isReady()}));
app.listen(PORT,()=>console.log(`🤖 Tenchiko na porta ${PORT}`));

client.once('ready',async()=>{console.log(`🤖 Tenchiko conectado ao Discord: ${client.user.tag}`);});
// 🤖 Módulo de IA (comandos /ia, /imagem etc. e resposta ao ser mencionado) — ver ia.js
try{require('./ia')({client,GUILD_ID,OPENAI_API_KEY,openAIImage,fetchBuffer,getMemberRoblox,STYLE_NAMES,stylePrompt,roleNames,can,hasRole,allowed,normalizeQG});}
catch(e){console.error('❌ Módulo de IA não carregou:',e.message);}
// 🦇 Comandos NVB — lote 1 (membros, pontos, ranking, conquistas, recompensas, cargos) — ver comandos.js
try{require('./comandos')({client,GUILD_ID,db,writeDb,addPoints,removePoints,logAction,modHistory,level,rankPosition,participationCounts,memberRoleLabel,roleNames,findNvbRole,guard,can,safeReply,safeDefer,robloxUser});}
catch(e){console.error('❌ Módulo de comandos não carregou:',e.message);}
// 🌌 Entretenimento NVB — lote 2 (multiverso, interacao, ship, animais, anime) — ver entretenimento.js
try{require('./entretenimento')({client,GUILD_ID,ANIME_CHARACTERS,ANIME_TRANSFORMS,ANIME_DESTINIES,ANIME_QUIZ,normalizeQG,db,readJson,writeDb});}
catch(e){console.error('❌ Módulo de entretenimento não carregou:',e.message);}
// 📋 Sistemas NVB — lote 3 (resenha, jogatina, recrutamento) — ver sistemas.js
try{require('./sistemas')({client,GUILD_ID,db,readJson,writeDb,can,logAction,normalizeQG,modulos:{atividades:true,recrutamento:false}});}
catch(e){console.error('❌ Módulo de sistemas não carregou:',e.message);}
client.login(TOKEN).catch(e=>console.error('❌ Falha na conexão do Discord:',e.message));

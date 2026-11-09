const { EmbedBuilder } = require('discord.js');

const COM_MEMBER = [
 ['abraco','Abraça um membro 🤗'],['carinho','Demonstra carinho 💕'],['beijo','Dá um beijo 💋'],['acenar','Acena para um membro 👋'],['apertar-mao','Aperta a mão 🤝'],['cumprimentar','Cumprimenta um membro 😊'],['elogiar','Elogia um membro ✨'],['proteger','Protege um membro 🛡️'],['consolar','Consola um membro 🫂'],['provocar','Provoca um membro 😏'],['rir-com','Ri com um membro 😂'],['dancar-com','Dança com um membro 💃'],['sentar-com','Senta com um membro 🪑'],['olhar','Olha para um membro 👀'],['encarar','Encarar um membro 😐'],['apoiar','Apoia um membro 💙'],['agradecer','Agradece um membro 🙏'],['comemorar-com','Comemora com um membro 🎉'],['festejar-com','Festeja com um membro 🥳'],['acenar-tchau','Dá tchau para um membro 👋']
];
const COM_SOLO = [
 ['sorrir','Sorri 😊'],['rir','Ri 😂'],['chorar','Chora 😭'],['acenar','Acena 👋'],['dancar','Dança 💃'],['dormir','Dorme 😴'],['pensar','Pensa 🤔'],['comemorar','Comemora 🎉'],['assustar','Se assusta 😨'],['confuso','Fica confuso 😵'],['entediado','Fica entediado 😐'],['feliz','Fica feliz 😄'],['triste','Fica triste 😔'],['bravo','Fica bravo 😡'],['curioso','Fica curioso 👀'],['surpreso','Fica surpreso 😲'],['cansado','Fica cansado 😴'],['orgulhoso','Fica orgulhoso 😎'],['nervoso','Fica nervoso 😰'],['comer','Come 🍜']
];

function sub(name, description, needsUser=false){
 const o={name,description,type:1};
 if(needsUser)o.options=[{name:'membro',description:'Membro da interação',type:6,required:true}];
 return o;
}
const COMMANDS_INTERACOES=[{name:'interacao',description:'Interações do TENCHIKHO',options:[
 {name:'membro',description:'Interações com outro membro',type:2,options:COM_MEMBER.map(x=>sub(x[0],x[1],true))},
 {name:'sozinho',description:'Interações que você faz sozinho',type:2,options:COM_SOLO.map(x=>sub(x[0],x[1],false))}
]}];

const MEMBER_TEXT={
 abraco:'abraçou',carinho:'demonstrou carinho por',beijo:'deu um beijo em',acenar:'acenou para', 'apertar-mao':'apertou a mão de',cumprimentar:'cumprimentou',elogiar:'elogiou',proteger:'protegeu',consolar:'consolou',provocar:'provocou','rir-com':'riu com','dancar-com':'dançou com','sentar-com':'sentou com',olhar:'olhou para',encarar:'encarou',apoiar:'apoiou',agradecer:'agradeceu a','comemorar-com':'comemorou com','festejar-com':'festejou com','acenar-tchau':'deu tchau para'
};
const SOLO_TEXT={sorrir:'sorriu',rir:'riu',chorar:'chorou',acenar:'acenou',dancar:'dançou',dormir:'dormiu',pensar:'pensou',comemorar:'comemorou',assustar:'se assustou',confuso:'ficou confuso',entediado:'ficou entediado',feliz:'ficou feliz',triste:'ficou triste',bravo:'ficou bravo',curioso:'ficou curioso',surpreso:'ficou surpreso',cansado:'ficou cansado',orgulhoso:'ficou orgulhoso',nervoso:'ficou nervoso',comer:'comeu'};
const EMOJI={abraco:'🤗',carinho:'💕',beijo:'💋',acenar:'👋','apertar-mao':'🤝',cumprimentar:'😊',elogiar:'✨',proteger:'🛡️',consolar:'🫂',provocar:'😏','rir-com':'😂','dancar-com':'💃','sentar-com':'🪑',olhar:'👀',encarar:'😐',apoiar:'💙',agradecer:'🙏','comemorar-com':'🎉','festejar-com':'🥳','acenar-tchau':'👋',sorrir:'😊',rir:'😂',chorar:'😭',dancar:'💃',dormir:'😴',pensar:'🤔',comemorar:'🎉',assustar:'😨',confuso:'😵',entediado:'😐',feliz:'😄',triste:'😔',bravo:'😡',curioso:'👀',surpreso:'😲',cansado:'😴',orgulhoso:'😎',nervoso:'😰',comer:'🍜'};

async function tratarInteracao(i){
 if(!i.isChatInputCommand() || i.commandName!=='interacao') return false;
 const grupo=i.options.getSubcommandGroup();
 const acao=i.options.getSubcommand();
 const emoji=EMOJI[acao]||'✨';
 await i.deferReply();
 if(grupo==='membro'){
   const membro=i.options.getUser('membro',true);
   if(membro.bot)return i.editReply(`${emoji} ${i.user} não pode fazer essa interação com um bot.`).then(()=>true);
   const verbo=MEMBER_TEXT[acao]||'interagiu com';
   return i.editReply(`${emoji} **${i.user.username}** ${verbo} **${membro.username}**!`).then(()=>true);
 }
 const verbo=SOLO_TEXT[acao]||'fez uma interação';
 return i.editReply(`${emoji} **${i.user.username}** ${verbo}!`).then(()=>true);
}
module.exports={COMMANDS_INTERACOES,tratarInteracao};

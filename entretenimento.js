const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CARD_FILE = path.join(DATA_DIR, 'cards.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const LIVROS = [
'One Piece','Naruto','Naruto Shippuden','Boruto','Dragon Ball','Dragon Ball Z','Dragon Ball Super','Bleach','Hunter x Hunter','My Hero Academia','Jujutsu Kaisen','Demon Slayer','Attack on Titan','Solo Leveling','Chainsaw Man','Black Clover','Fairy Tail','Fullmetal Alchemist: Brotherhood','Death Note','Code Geass',"JoJo's Bizarre Adventure",'One Punch Man','Mob Psycho 100','Tokyo Ghoul','Sword Art Online','Re:Zero','That Time I Got Reincarnated as a Slime','The Rising of the Shield Hero','Mushoku Tensei','Overlord','KonoSuba','No Game No Life','The Eminence in Shadow','Arifureta','The Misfit of Demon King Academy','The Seven Deadly Sins','Fire Force','Dr. Stone','Haikyuu!!','Blue Lock',"Kuroko's Basketball",'Slam Dunk','Inazuma Eleven','Yu Yu Hakusho','Rurouni Kenshin','Inuyasha','Fairy Tail: 100 Years Quest','Black Lagoon','Bungou Stray Dogs','Noragami','Tokyo Revengers','Wind Breaker','Hell’s Paradise','Kaiju No. 8','Dandadan','Mashle','Undead Unluck','Frieren','Delicious in Dungeon','Made in Abyss','Violet Evergarden','Your Lie in April','Anohana','Toradora!','Kaguya-sama: Love Is War','Horimiya','Oshi no Ko','Rascal Does Not Dream of Bunny Girl Senpai','The Quintessential Quintuplets',"Komi Can't Communicate",'Classroom of the Elite','Assassination Classroom','Erased','Steins;Gate','Psycho-Pass','Parasyte: The Maxim','Akame ga Kill!','Future Diary','The Promised Neverland','Black Butler','The Case Study of Vanitas','Blue Exorcist','Seraph of the End','Soul Eater','D.Gray-man','Welcome to Demon School! Iruma-kun','Magi: The Labyrinth of Magic','Magi: The Kingdom of Magic','Record of Ragnarok','Baki','Hajime no Ippo','Drifters','Samurai Champloo','Vinland Saga','Dororo','Trigun','Cowboy Bebop','Gintama','Zom 100','The Apothecary Diaries'
];
const RARIDADES = [
  ['Comum','⚪',55],['Incomum','🟢',25],['Raro','🔵',12],['Épico','🟣',5],['Lendário','🟡',2],['Mítico','🔴',0.8],['Secreto','🌈',0.2]
];
const QUIZ = [
 ['De qual anime é o personagem Monkey D. Luffy?',['Naruto','One Piece','Bleach','Dragon Ball'],1],
 ['Qual é o nome do protagonista de Re:Zero?',['Subaru Natsuki','Kazuma Satou','Kirito','Tanjiro'],0],
 ['Quem usa a Respiração da Água em Demon Slayer?',['Gojo','Tanjiro','Asta','Ichigo'],1],
 ['De qual anime é Satoru Gojo?',['Jujutsu Kaisen','Bleach','Black Clover','Naruto'],0],
 ['Qual é o nome do protagonista de Solo Leveling?',['Sung Jin-Woo','Saitama','Eren Yeager','Denji'],0],
 ['De qual anime é Rimuru Tempest?',['Overlord','Slime','Re:Zero','Mushoku Tensei'],1],
 ['Quem é o protagonista de Death Note?',['Light Yagami','Lelouch','Edward','Kaneki'],0],
 ['De qual anime é Vanitas?',['The Case Study of Vanitas','Blue Exorcist','Black Butler','Noragami'],0]
];
const FRASES = [
 ['"Eu vou me tornar o Rei dos Piratas!"','One Piece','Monkey D. Luffy'],
 ['"Eu nunca volto atrás na minha palavra."','Naruto','Naruto Uzumaki'],
 ['"Se você não lutar, não poderá vencer."','Attack on Titan','Eren Yeager'],
 ['"Eu sou o mais forte."','Jujutsu Kaisen','Satoru Gojo'],
 ['"Eu vou salvar todos."','My Hero Academia','Izuku Midoriya']
];

function lerDados(){ try{return JSON.parse(fs.readFileSync(CARD_FILE,'utf8'));}catch{return {users:{},quiz:{}};} }
function salvarDados(d){ const t=CARD_FILE+'.tmp'; fs.writeFileSync(t,JSON.stringify(d,null,2)); fs.renameSync(t,CARD_FILE); }
function userData(d,id){ return d.users[id] ||= {cards:[],daily:{date:'',count:0},quiz:0,interacoes:0}; }
function hoje(){ return new Date().toISOString().slice(0,10); }
function resetDaily(u){ if(u.daily.date!==hoje()){u.daily={date:hoje(),count:0};} }
function raridade(){ const n=Math.random()*100; let s=0; for(const r of RARIDADES){s+=r[2];if(n<=s)return r;} return RARIDADES[0]; }
function cardKey(book,card){return `${book}:${card}`;}
function pick(arr){return arr[Math.floor(Math.random()*arr.length)];}

async function api(url){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),6500);
  try{ const r=await fetch(url,{headers:{'User-Agent':'Tenchikho/1.0'}}); if(!r.ok) return null; return await r.json(); }
  catch{return null} finally{clearTimeout(t);}
}
function esc(s){return String(s||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();}

const COMMANDS = [
 {name:'anime',description:'Pesquisa um anime',options:[{name:'nome',description:'Nome do anime',type:3,required:true}]},
 {name:'personagem',description:'Pesquisa um personagem de anime',options:[{name:'nome',description:'Nome do personagem',type:3,required:true}]},
 {name:'quiz-anime',description:'Responda um quiz de anime'},
 {name:'casal-anime',description:'Mostra um casal de anime aleatório'},
 {name:'frase-anime',description:'Mostra uma frase de anime'},
 {name:'ship',description:'Calcula uma compatibilidade divertida',options:[{name:'membro',description:'Membro',type:6,required:true}]},
 {name:'animal',description:'Pesquisa um animal',options:[{name:'nome',description:'Nome do animal',type:3,required:true}]},
 {name:'perfil',description:'Mostra seu perfil no TENCHIKHO'},
 {name:'livros',description:'Mostra os 100 livros da coleção'},
 {name:'livro',description:'Abre um livro da coleção',options:[{name:'anime',description:'Nome do anime/livro',type:3,required:true}]},
 {name:'card',description:'Tenta obter um card de anime (limite de 5 por dia)'},
 {name:'ranking',description:'Ranking de colecionadores de cards'},
];

function commandEmbed(title,color=0x7c3aed){return new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();}

async function anime(i){
 await i.deferReply(); const nome=i.options.getString('nome',true); const d=await api(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(nome)}&limit=1`);
 const a=d?.data?.[0]; if(!a)return i.editReply('🍥 Não encontrei esse anime. Tente outro nome.');
 const e=commandEmbed(`🍥 ${a.title}`); if(a.images?.jpg?.large_image_url)e.setImage(a.images.jpg.large_image_url);
 e.setDescription(esc(a.synopsis)||'Sinopse não disponível.').addFields(
 {name:'🏷️ Gêneros',value:(a.genres||[]).map(x=>x.name).join(', ')||'Não informado',inline:true},
 {name:'📺 Episódios',value:String(a.episodes??'N/A'),inline:true},
 {name:'📅 Lançamento',value:a.aired?.from?new Date(a.aired.from).toLocaleDateString('pt-BR'):'N/A',inline:true},
 {name:'📊 Status',value:a.status||'N/A',inline:true},
 {name:'🎬 Temporadas',value:String(a.season?`${a.season} ${a.year||''}`:'N/A'),inline:true},
 {name:'⭐ Avaliação',value:String(a.score??'N/A'),inline:true},
 {name:'👥 Personagens',value:'Use /personagem <nome> para pesquisar.',inline:false},
 {name:'💡 Curiosidade',value:a.rank?`Ranking aproximado: #${a.rank}`:'Consulte os detalhes do anime.',inline:false}
 ); return i.editReply({embeds:[e]});
}

async function personagem(i){
 await i.deferReply(); const nome=i.options.getString('nome',true); const d=await api(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(nome)}&limit=1`); const c=d?.data?.[0]; if(!c)return i.editReply('👤 Não encontrei esse personagem.');
 const e=commandEmbed(`👤 ${c.name}`); if(c.images?.jpg?.image_url)e.setThumbnail(c.images.jpg.image_url); e.addFields({name:'🍥 Anime',value:'Consulte a obra associada no resultado da pesquisa.',inline:false},{name:'📖 Descrição',value:'A API de personagens não fornece uma biografia completa para todos os personagens.',inline:false},{name:'💡 Curiosidade',value:'A ficha é atualizada conforme a disponibilidade da fonte.',inline:false}); return i.editReply({embeds:[e]});
}

async function quiz(i){
 await i.deferReply(); const q=pick(QUIZ); const letters=['A','B','C','D']; const e=commandEmbed('🧠 QUIZ DE ANIME',0x2563eb).setDescription(`**${q[0]}**\n\n${q[1].map((x,n)=>`${letters[n]}) ${x}`).join('\n')}`);
 const row=new ActionRowBuilder().addComponents(q[1].map((x,n)=>new ButtonBuilder().setCustomId(`quiz:${i.user.id}:${n}:${q[2]}`).setLabel(letters[n]).setStyle(ButtonStyle.Primary)));
 return i.editReply({embeds:[e],components:[row]});
}
async function casal(i){
 await i.deferReply(); const pares=[['Naruto Uzumaki','Hinata Hyuga','Naruto'],['Kirito','Asuna','Sword Art Online'],['Loid Forger','Yor Forger','Spy x Family'],['Hori','Miyamura','Horimiya'],['Sasuke','Sakura','Naruto']]; const p=pick(pares); const pct=Math.floor(Math.random()*41)+60; const e=commandEmbed('💕 CASAL DE ANIME',0xec4899).setDescription(`**${p[0]} + ${p[1]}**\n🍥 ${p[2]}\n\n❤️ Compatibilidade: **${pct}%**\n💬 ${pct>85?'O destino está conspirando!':pct>70?'Tem química aí!':'Uma dupla improvável!'}`); return i.editReply({embeds:[e]});
}
async function frase(i){await i.deferReply();const f=pick(FRASES);return i.editReply({embeds:[commandEmbed('💬 FRASE DE ANIME',0xf59e0b).setDescription(f[0]).addFields({name:'🍥 Anime',value:f[1],inline:true},{name:'👤 Personagem',value:f[2],inline:true})]});}
async function ship(i){await i.deferReply();const b=i.options.getUser('membro',true);if(b.bot||b.id===i.user.id)return i.editReply('💘 Escolha outro membro para calcular o ship.');const pct=Math.floor(Math.random()*101);const msg=pct>=90?'Destino absoluto!':pct>=70?'Tem química!':pct>=40?'Talvez role alguma coisa!':'Só amizade por enquanto 😅';return i.editReply({embeds:[commandEmbed('💘 SHIP',0xec4899).setDescription(`👤 ${i.user} + 👤 ${b}\n\n❤️ Compatibilidade: **${pct}%**\n💬 ${msg}`)]});}
async function animal(i){await i.deferReply();const nome=i.options.getString('nome',true);const d=await api(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(nome.replace(/ /g,'_'))}`);if(!d||d.type==='https://mediawiki.org/wiki/HyperSwitch/errors/not_found')return i.editReply('🐾 Não encontrei esse animal.');const e=commandEmbed(`🐾 ${d.title}`,0x16a34a).setDescription(esc(d.extract)||'Descrição não disponível.').addFields({name:'🔬 Nome científico',value:'Não informado pela fonte.',inline:true},{name:'🌎 Habitat',value:'Consulte a descrição da espécie.',inline:true},{name:'🍖 Alimentação',value:'Não informado.',inline:true},{name:'📏 Tamanho',value:'Não informado.',inline:true},{name:'⚖️ Peso',value:'Não informado.',inline:true},{name:'⏳ Expectativa de vida',value:'Não informado.',inline:true},{name:'🛡️ Conservação',value:'Não informado.',inline:true},{name:'💡 Curiosidade',value:'Dados detalhados dependem da fonte consultada.',inline:false});if(d.thumbnail?.source)e.setImage(d.thumbnail.source);return i.editReply({embeds:[e]});}

function cardInfo(userCard){const [book,number]=userCard.split(':').map(Number); const nome=LIVROS[book-1]; const r=RARIDADES.find((_,idx)=>idx===0)||RARIDADES[0]; return {book,number,nome,raridade:r};}
function gerarCard(){const book=Math.floor(Math.random()*100)+1;const number=Math.floor(Math.random()*50)+1;const r=raridade();return {id:cardKey(book,number),book,number,anime:LIVROS[book-1],personagem:`Personagem #${number}`,raridade:r[0],emoji:r[1],obtidoEm:new Date().toISOString()};}
async function card(i){await i.deferReply();const d=lerDados(),u=userData(d,i.user.id);resetDaily(u);if(u.daily.count>=5)return i.editReply('🔒 **LIMITE DIÁRIO ATINGIDO**\n\nVocê já coletou **5/5 cards** hoje.\n🎴 Seu próximo card estará disponível amanhã.');let novo;for(let n=0;n<30;n++){const c=gerarCard();if(!u.cards.some(x=>x.id===c.id)){novo=c;break;}}if(!novo)return i.editReply('🎴 Você já possui muitos cards diferentes. Tente novamente.');u.cards.push(novo);u.daily.count++;salvarDados(d);const e=commandEmbed('🎴 NOVO CARD!',0xf59e0b).setDescription(`📕 **${novo.anime}**\n👤 ${novo.personagem}\n🎴 Card #${String(novo.number).padStart(3,'0')}\n${novo.emoji} **${novo.raridade}**`).addFields({name:'📊 Hoje',value:`${u.daily.count}/5`,inline:true},{name:'🎴 Total',value:String(u.cards.length),inline:true});return i.editReply({embeds:[e]});}
async function livros(i){await i.deferReply();const d=lerDados(),u=userData(d,i.user.id);const linhas=LIVROS.map((n,idx)=>{const qtd=u.cards.filter(c=>c.book===idx+1).length;return `**${String(idx+1).padStart(2,'0')}. ${n}** — 🎴 ${qtd}/50`});const e=commandEmbed('📚 LIVROS DA COLEÇÃO',0x8b5cf6).setDescription(linhas.join('\n'));return i.editReply({embeds:[e]});}
async function livro(i){await i.deferReply();const busca=i.options.getString('anime',true).toLowerCase();const idx=LIVROS.findIndex(x=>x.toLowerCase()===busca||x.toLowerCase().includes(busca));if(idx<0)return i.editReply('📕 Não encontrei esse livro. Use /livros para ver os 100 disponíveis.');const d=lerDados(),u=userData(d,i.user.id),cards=u.cards.filter(c=>c.book===idx+1);const e=commandEmbed(`📕 LIVRO ${String(idx+1).padStart(2,'0')} — ${LIVROS[idx].toUpperCase()}`,0x8b5cf6).setDescription(`🎴 50 cards\n📊 Progresso: **${cards.length}/50**\n\n${cards.length?cards.map(c=>`${c.emoji} #${String(c.number).padStart(3,'0')} — ${c.personagem} (${c.raridade})`).join('\n'):'🔒 Nenhum card coletado ainda.'}`);return i.editReply({embeds:[e]});}
async function ranking(i){await i.deferReply();const d=lerDados();const lista=Object.entries(d.users||{}).map(([id,u])=>({id,n:u.cards?.length||0,raros:(u.cards||[]).filter(c=>['Raro','Épico','Lendário','Mítico','Secreto'].includes(c.raridade)).length,livros:new Set((u.cards||[]).filter(c=>c.book).map(c=>c.book)).size})).sort((a,b)=>b.n-a.n);const top=lista.slice(0,10);const medal=['🥇','🥈','🥉'];const desc=top.length?top.map((x,n)=>`${medal[n]||`**${n+1}º**`} <@${x.id}>\n🎴 ${x.n} cards • ⭐ ${x.raros} raros • 📚 ${x.livros}/100 livros`).join('\n\n'):'Nenhum colecionador ainda.';const me=lista.findIndex(x=>x.id===i.user.id);const mine=me>=0?lista[me]:{n:0,raros:0,livros:0};const e=commandEmbed('🏆 RANKING DE COLECIONADORES',0xf59e0b).setDescription(desc).addFields({name:'📊 Seu progresso',value:`**${me>=0?me+1:'—'}º** • 🎴 ${mine.n}/5.000 • ⭐ ${mine.raros} raros • 📚 ${mine.livros}/100 completos`});return i.editReply({embeds:[e]});}

async function perfil(i){await i.deferReply();const d=lerDados(),u=userData(d,i.user.id);resetDaily(u);const livros=new Set((u.cards||[]).map(c=>c.book)).size;const raros=(u.cards||[]).filter(c=>['Raro','Épico','Lendário','Mítico','Secreto'].includes(c.raridade)).length;const lista=Object.entries(d.users||{}).sort((a,b)=>(b[1].cards?.length||0)-(a[1].cards?.length||0));const pos=Math.max(1,lista.findIndex(([id])=>id===i.user.id)+1);const e=commandEmbed(`👤 Perfil — ${i.user.username}`,0x7c3aed).setThumbnail(i.user.displayAvatarURL({size:256})).addFields({name:'👤 Usuário',value:`${i.user}`,inline:true},{name:'🎴 Coleção',value:`${u.cards.length}/5.000 cards\n📚 ${livros}/100 livros completos\n🎴 Hoje: ${u.daily.count}/5`,inline:true},{name:'🏆 Ranking',value:`${pos}º lugar\n⭐ ${raros} cards raros`,inline:true},{name:'🧠 Anime',value:`Quiz: ${u.quiz||0} pontos`,inline:true},{name:'💰 Economia',value:'Integração disponível quando a economia Tenchi estiver ativa.',inline:true});return i.editReply({embeds:[e]});}

async function tratarEntretenimento(i){
 if(i.commandName==='anime')return anime(i); if(i.commandName==='personagem')return personagem(i); if(i.commandName==='quiz-anime')return quiz(i); if(i.commandName==='casal-anime')return casal(i); if(i.commandName==='frase-anime')return frase(i); if(i.commandName==='ship')return ship(i); if(i.commandName==='animal')return animal(i); if(i.commandName==='perfil')return perfil(i); if(i.commandName==='livros')return livros(i); if(i.commandName==='livro')return livro(i); if(i.commandName==='card')return card(i); if(i.commandName==='ranking')return ranking(i);
}
async function tratarBotaoEntretenimento(i){
 if(!i.customId.startsWith('quiz:'))return false; const [,uid,op,correta]=i.customId.split(':'); if(i.user.id!==uid)return i.reply({content:'🧠 Esse quiz foi iniciado por outro usuário.',flags:64}); await i.deferUpdate(); const d=lerDados(),u=userData(d,i.user.id); if(Number(op)===Number(correta)){u.quiz=(u.quiz||0)+1;salvarDados(d);return i.editReply({content:`✅ **Acertou!** +1 ponto.\n🧠 Sua pontuação: **${u.quiz}**`,embeds:[],components:[]});}return i.editReply({content:`❌ **Errou!** A resposta correta era **${['A','B','C','D'][Number(correta)]}**.`,embeds:[],components:[]});
}
module.exports={LIVROS,COMMANDS,tratarEntretenimento,tratarBotaoEntretenimento};

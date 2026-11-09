const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

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

let JIKAN_ULTIMA_CHAMADA = 0;
let JIKAN_FILA = Promise.resolve();
async function api(url){
 const tarefa = async () => {
  for(let tentativa=0; tentativa<4; tentativa++){
   const espera=Math.max(0,900-(Date.now()-JIKAN_ULTIMA_CHAMADA));
   if(espera) await new Promise(r=>setTimeout(r,espera));
   const c=new AbortController(); const t=setTimeout(()=>c.abort(),10000);
   try{
    JIKAN_ULTIMA_CHAMADA=Date.now();
    const r=await fetch(url,{headers:{'User-Agent':'Tenchikho/1.0 (Discord bot)'}});
    if(r.ok) return await r.json();
    if(r.status===429){const retry=Number(r.headers.get('retry-after'))||1.5;await new Promise(r=>setTimeout(r,Math.min(5000,retry*1000)));continue;}
    if(r.status>=500){await new Promise(r=>setTimeout(r,700*(tentativa+1)));continue;}
    return null;
   }catch{if(tentativa===3)return null;await new Promise(r=>setTimeout(r,700*(tentativa+1)));}
   finally{clearTimeout(t);}
  }
  return null;
 };
 JIKAN_FILA=JIKAN_FILA.then(tarefa,tarefa);
 return JIKAN_FILA;
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

async function carregarImagem(url){
 try{ if(!url) return null; return await loadImage(url); }catch{return null;}
}
function textoCurto(v,max=360){
 const t=esc(v||'').replace(/\n+/g,' ').trim();
 return t.length>max ? t.slice(0,max-1)+'…' : t;
}
function desenharTexto(ctx,text,x,y,maxWidth,lineHeight,maxLines=3){
 const words=String(text||'').split(/\s+/); let line='',lines=0;
 for(const word of words){
   const test=line?line+' '+word:word;
   if(ctx.measureText(test).width>maxWidth && line){
     ctx.fillText(line,x,y); y+=lineHeight; lines++; line=word;
     if(lines>=maxLines) break;
   }else line=test;
 }
 if(lines<maxLines && line)ctx.fillText(line,x,y);
}
async function renderAnimeImagem(a){
 const W=1200,H=700,canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
 const bg=ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,'#171824');bg.addColorStop(1,'#25283a');
 ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#292c3b';ctx.fillRect(35,35,W-70,H-70);ctx.fillStyle='#5865f2';ctx.fillRect(35,35,12,H-70);
 ctx.textAlign='left';ctx.fillStyle='#8f98ff';ctx.font='bold 42px Sans';ctx.fillText(textoCurto(a.title,34),75,95);
 const tipo=a.type||'Anime',ano=a.year||(a.aired?.from?new Date(a.aired.from).getFullYear():'N/A');
 ctx.fillStyle='#e2e2ea';ctx.font='bold 25px Sans';ctx.fillText(`${tipo} • ${ano}`,75,137);
 const img=await carregarImagem(a.images?.jpg?.large_image_url||a.images?.jpg?.image_url);
 if(img){ctx.save();ctx.beginPath();ctx.roundRect(855,75,285,320,20);ctx.clip();ctx.drawImage(img,855,75,285,320);ctx.restore();}
 else{ctx.fillStyle='#383b4b';ctx.fillRect(855,75,285,320);ctx.fillStyle='#aaa';ctx.font='22px Sans';ctx.fillText('Imagem indisponível',885,240);}
 ctx.fillStyle='#3a3d4d';[[75,190,350,105],[450,190,350,105],[75,315,350,105],[450,315,350,105]].forEach(([x,y,w,h])=>ctx.fillRect(x,y,w,h));
 ctx.fillStyle='#bfc2cc';ctx.font='bold 22px Sans';
 ctx.fillText('Episódios',95,225);ctx.fillText('Status',470,225);ctx.fillText('Nota',95,350);ctx.fillText('Gêneros',470,350);
 ctx.fillStyle='#fff';ctx.font='bold 27px Sans';
 ctx.fillText(String(a.episodes??'N/A'),95,265);ctx.fillText(textoCurto(a.status||'N/A',18),470,265);ctx.fillText(`⭐ ${a.score??'N/A'}`,95,390);ctx.fillText(textoCurto((a.genres||[]).map(x=>x.name).join(' • ')||'Não informado',24),470,390);
 ctx.fillStyle='#3a3d4d';ctx.fillRect(75,440,1065,155);ctx.fillStyle='#bfc2cc';ctx.font='bold 22px Sans';ctx.fillText('Sinopse',95,475);
 ctx.fillStyle='#f1f1f4';ctx.font='20px Sans';desenharTexto(ctx,textoCurto(a.synopsis||'Sinopse não disponível.',500),95,515,1010,29,3);
 ctx.fillStyle='#8f98ff';ctx.font='18px Sans';ctx.fillText(`🍥 ${textoCurto(a.title,45)} • ${a.studios?.[0]?.name||'Estúdio não informado'} • Ranking ${a.rank?`#${a.rank}`:'N/A'}`,75,640);
 return canvas.toBuffer('image/png');
}
async function anime(i){
 await i.deferReply();const nome=i.options.getString('nome',true).trim();
 const d=await api(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(nome)}&limit=5&sfw=true`),a=d?.data?.[0];
 if(!a)return i.editReply(`🍥 Não encontrei **${nome}**. Tente o nome completo do anime.`);
 try{const file=new AttachmentBuilder(await renderAnimeImagem(a),{name:'anime.png'});return i.editReply({files:[file],embeds:[new EmbedBuilder().setColor(0x5865f2).setImage('attachment://anime.png').setFooter({text:`🍥 ${a.title} • Informações do anime`}).setTimestamp()]});}
 catch(err){console.error('Erro ao renderizar /anime:',err);return i.editReply({embeds:[commandEmbed(`🍥 ${a.title}`,0x5865f2).setDescription(esc(a.synopsis)||'Sinopse não disponível.').setImage(a.images?.jpg?.large_image_url||null).addFields({name:'🏷️ Gêneros',value:(a.genres||[]).map(x=>x.name).join(', ')||'Não informado',inline:true},{name:'📺 Episódios',value:String(a.episodes??'N/A'),inline:true},{name:'📊 Status',value:a.status||'N/A',inline:true},{name:'⭐ Nota',value:String(a.score??'N/A'),inline:true})]});}
}
async function personagem(i){
 await i.deferReply();const nome=i.options.getString('nome',true).trim();
 const d=await api(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(nome)}&limit=5`),c=d?.data?.[0];
 if(!c)return i.editReply(`👤 Não encontrei **${nome}**. Tente o nome completo do personagem.`);
 let animeNome='Não informado',descricao='Informações disponíveis na fonte.',favoritos='N/A';
 if(c.mal_id){const full=await api(`https://api.jikan.moe/v4/characters/${c.mal_id}/full`);const obra=full?.data?.anime?.[0]?.anime;if(obra?.title)animeNome=obra.title;descricao=esc(full?.data?.about)||descricao;favoritos=String(full?.data?.favorites??c.favorites??'N/A');}
 const W=1200,H=700,canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
 const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#171824');bg.addColorStop(1,'#25283a');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#292c3b';ctx.fillRect(35,35,W-70,H-70);ctx.fillStyle='#7c6cff';ctx.fillRect(35,35,12,H-70);
 ctx.fillStyle='#f2f2f6';ctx.font='bold 43px Sans';ctx.fillText(textoCurto(c.name,34),75,95);
 ctx.fillStyle='#bfc2cc';ctx.font='20px Sans';ctx.fillText(`${animeNome} • Personagem`,75,130);
 const img=await carregarImagem(c.images?.jpg?.large_image_url||c.images?.jpg?.image_url);
 if(img){ctx.save();ctx.beginPath();ctx.roundRect(855,75,285,360,20);ctx.clip();ctx.drawImage(img,855,75,285,360);ctx.restore();}
 else{ctx.fillStyle='#383b4b';ctx.fillRect(855,75,285,360);ctx.fillStyle='#aaa';ctx.font='22px Sans';ctx.fillText('Imagem indisponível',885,255);}
 ctx.fillStyle='#3a3d4d';[[75,180,350,105],[450,180,350,105],[75,305,725,105]].forEach(([x,y,w,h])=>ctx.fillRect(x,y,w,h));
 ctx.fillStyle='#d2d4dc';ctx.font='bold 21px Sans';ctx.fillText('Anime',95,215);ctx.fillText('Favoritos',470,215);ctx.fillText('ID',95,340);
 ctx.fillStyle='#fff';ctx.font='bold 26px Sans';ctx.fillText(textoCurto(animeNome,25),95,255);ctx.fillText(favoritos,470,255);ctx.fillText(String(c.mal_id||'N/A'),95,380);
 ctx.fillStyle='#3a3d4d';ctx.fillRect(75,435,1065,170);ctx.fillStyle='#d2d4dc';ctx.font='bold 21px Sans';ctx.fillText('Descrição',95,470);ctx.fillStyle='#f1f1f4';ctx.font='20px Sans';desenharTexto(ctx,textoCurto(descricao,520),95,510,1000,29,3);
 ctx.fillStyle='#9b91ff';ctx.font='18px Sans';ctx.fillText(`👤 ${textoCurto(c.name,45)} • Personagem de ${textoCurto(animeNome,45)}`,75,640);
 try{const file=new AttachmentBuilder(canvas.toBuffer('image/png'),{name:'personagem.png'});return i.editReply({files:[file],embeds:[new EmbedBuilder().setColor(0x7c6cff).setImage('attachment://personagem.png').setFooter({text:`👤 ${c.name} • ID ${c.mal_id||'N/A'}`}).setTimestamp()]});}
 catch(err){console.error('Erro ao renderizar /personagem:',err);return i.editReply({embeds:[commandEmbed(`👤 ${c.name}`,0x7c6cff).setDescription(descricao).setImage(c.images?.jpg?.large_image_url||null).addFields({name:'🍥 Anime',value:animeNome,inline:true},{name:'⭐ Favoritos',value:favoritos,inline:true},{name:'🆔 ID',value:String(c.mal_id||'N/A'),inline:true})]});}
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
async function ship(i){
 await i.deferReply();
 const b=i.options.getUser('membro',true);
 if(b.bot||b.id===i.user.id)return i.editReply('💘 Escolha outro membro para calcular o ship.');

 const pct=Math.floor(Math.random()*101);
 const msg=pct>=90?'Vocês combinam perfeitamente!':pct>=70?'Tem muita química entre vocês!':pct>=40?'Pode rolar alguma coisa!':'Só amizade por enquanto 😅';

 try{
   const W=1200,H=650;
   const canvas=createCanvas(W,H);
   const ctx=canvas.getContext('2d');

   // Fundo em degradê
   const bg=ctx.createLinearGradient(0,0,W,H);
   bg.addColorStop(0,'#171522'); bg.addColorStop(1,'#262036');
   ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

   // Cartão central
   ctx.fillStyle='#211d30';
   ctx.strokeStyle='#ec72c8';
   ctx.lineWidth=5;
   const rx=35, ry=35, rw=W-70, rh=H-70;
   ctx.beginPath(); ctx.roundRect(rx,ry,rw,rh,24); ctx.fill(); ctx.stroke();

   // Título
   ctx.textAlign='center';
   ctx.fillStyle='#f38bd4';
   ctx.font='bold 42px Sans';
   ctx.fillText('💘 SHIP MATCH 💘',W/2,105);

   // Avatares
   const leftX=300, rightX=900, avatarY=245, radius=105;
   const avatarA=i.user.displayAvatarURL({extension:'png',size:256});
   const avatarB=b.displayAvatarURL({extension:'png',size:256});

   async function drawAvatar(url,x,y){
     const img=await loadImage(url);
     ctx.save();
     ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.closePath(); ctx.clip();
     ctx.drawImage(img,x-radius,y-radius,radius*2,radius*2);
     ctx.restore();
     ctx.strokeStyle='#f38bd4'; ctx.lineWidth=7;
     ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.stroke();
   }

   await drawAvatar(avatarA,leftX,avatarY);
   await drawAvatar(avatarB,rightX,avatarY);

   // Linha e coração
   ctx.strokeStyle='#d77ab7'; ctx.lineWidth=4;
   ctx.beginPath(); ctx.moveTo(leftX+radius,avatarY); ctx.lineTo(rightX-radius,avatarY); ctx.stroke();
   ctx.fillStyle='#f47fc8'; ctx.font='58px Sans';
   ctx.fillText('♥',W/2,avatarY+22);

   // Nomes
   ctx.fillStyle='#e8e4f0'; ctx.font='bold 27px Sans';
   ctx.fillText(i.user.username,leftX,390);
   ctx.fillText(b.username,rightX,390);

   // Porcentagem
   ctx.fillStyle='#ef78cf'; ctx.font='bold 92px Sans';
   ctx.fillText(`${pct}%`,W/2,500);

   ctx.fillStyle='#d9d5e2'; ctx.font='32px Sans';
   ctx.fillText(msg,W/2,555);

   ctx.fillStyle='#aaa4b7'; ctx.font='22px Sans';
   ctx.fillText(`Compatibilidade calculada • ${i.user.username} + ${b.username}`,W/2,605);

   const attachment=new AttachmentBuilder(canvas.toBuffer('image/png'),{name:'ship-match.png'});
   return i.editReply({files:[attachment],embeds:[
     new EmbedBuilder()
       .setColor(0xec72c8)
       .setImage('attachment://ship-match.png')
       .setFooter({text:'Use /ship @membro para calcular novamente'})
       .setTimestamp()
   ]});
 }catch(err){
   console.error('Erro no /ship:',err);
   return i.editReply({embeds:[commandEmbed('💘 SHIP',0xec4899).setDescription(`👤 ${i.user} + 👤 ${b}\n\n❤️ Compatibilidade: **${pct}%**\n💬 ${msg}`)]});
 }
}
function wikiLimpar(v){
 return esc(String(v||'').replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g,'$1').replace(/\{\{[^{}]*\}\}/g,'').replace(/<ref[^>]*>.*?<\/ref>/gis,'').replace(/<ref[^>]*\/>/gi,'')).replace(/\s+/g,' ').trim();
}
function extrairInfobox(wikitext){
 const out={};
 const start=wikitext.search(/\{\{\s*(?:Info\/Taxonomia|Info\/animal|Taxobox|InfoBox\s*animal)/i);
 if(start<0)return out;
 let depth=0,end=-1;
 for(let p=start;p<wikitext.length-1;p++){
   if(wikitext.slice(p,p+2)==='{{'){depth++;p++;}
   else if(wikitext.slice(p,p+2)==='}}'){depth--;p++;if(depth===0){end=p+1;break;}}
 }
 if(end<0)return out;
 const block=wikitext.slice(start,end);
 for(const line of block.split(/\r?\n/)){
   const m=line.match(/^\s*\|\s*([^=]+?)\s*=\s*(.*?)\s*$/);
   if(!m)continue;
   const k=m[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
   const v=wikiLimpar(m[2]);
   if(v && !out[k])out[k]=v;
 }
 return out;
}
function primeiro(obj,keys){for(const k of keys){if(obj[k])return obj[k];}return null;}
async function wikiAnimal(nome){
 const busca=await api(`https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(nome)}&srnamespace=0&srlimit=3&format=json&origin=*`);
 const titulo=busca?.query?.search?.[0]?.title || nome;
 const d=await api(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo.replace(/ /g,'_'))}`);
 if(!d || d.type==='https://mediawiki.org/wiki/HyperSwitch/errors/not_found')return null;
 const raw=await api(`https://pt.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(titulo)}&format=json&origin=*`);
 let wt='';
 const pages=raw?.query?.pages||{};
 const page=Object.values(pages)[0];
 wt=page?.revisions?.[0]?.slots?.main?.['*']||'';
 return {d,box:extrairInfobox(wt)};
}
async function animal(i){
 await i.deferReply();
 const nome=i.options.getString('nome',true).trim();
 const r=await wikiAnimal(nome);
 if(!r)return i.editReply(`🐾 Não encontrei **${nome}**. Tente outro nome.`);
 const {d,box}=r;
 const desc=esc(d.extract)||'Descrição não disponível.';
 const cientifico=primeiro(box,['nome cientifico','nome científico','binomial','especie','especie tipo','nome']);
 const habitat=primeiro(box,['habitat','distribuicao','distribuição','area de distribuicao','area de distribuição']);
 const alimentacao=primeiro(box,['alimentacao','alimentação','dieta']);
 const tamanho=primeiro(box,['comprimento','comprimento do corpo','altura','comprimento total','tamanho']);
 const peso=primeiro(box,['peso','massa']);
 const vida=primeiro(box,['expectativa de vida','longevidade','vida']);
 const conservacao=primeiro(box,['estado de conservacao','estado de conservação','conservacao','conservação','estatuto']);
 const e=commandEmbed(`🐾 ${d.title}`,0x16a34a).setDescription(desc.slice(0,4090)).addFields(
  {name:'🔬 Nome científico',value:(cientifico||'Não informado na fonte.').slice(0,1024),inline:true},
  {name:'🌎 Habitat',value:(habitat||'Consulte a descrição da espécie.').slice(0,1024),inline:true},
  {name:'🍖 Alimentação',value:(alimentacao||'Não informado na fonte.').slice(0,1024),inline:true},
  {name:'📏 Tamanho',value:(tamanho||'Não informado na fonte.').slice(0,1024),inline:true},
  {name:'⚖️ Peso',value:(peso||'Não informado na fonte.').slice(0,1024),inline:true},
  {name:'⏳ Expectativa de vida',value:(vida||'Não informado na fonte.').slice(0,1024),inline:true},
  {name:'🛡️ Conservação',value:(conservacao||'Não informado na fonte.').slice(0,1024),inline:true},
  {name:'💡 Curiosidade',value:`Fonte: Wikipédia • Artigo: ${d.title}`.slice(0,1024),inline:false}
 );
 if(d.thumbnail?.source)e.setThumbnail(d.thumbnail.source);
 if(d.originalimage?.source)e.setImage(d.originalimage.source);
 return i.editReply({embeds:[e]});
}

function cardInfo(userCard){
 const [book,number]=userCard.split(':').map(Number);
 const nome=LIVROS[book-1];
 return {book,number,nome};
}
function gerarCard(){
 const book=Math.floor(Math.random()*100)+1;
 const number=Math.floor(Math.random()*50)+1;
 const r=raridade();
 return {id:cardKey(book,number),book,number,anime:LIVROS[book-1],personagem:`Personagem #${number}`,raridade:r[0],emoji:r[1],obtidoEm:new Date().toISOString()};
}

const CHAR_CACHE=new Map();
async function personagensDoLivro(book){
 if(CHAR_CACHE.has(book)) return CHAR_CACHE.get(book);
 const nome=LIVROS[book-1];
 const a=await api(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(nome)}&limit=1`);
 const anime=a?.data?.[0];
 if(!anime?.mal_id) return [];
 const d=await api(`https://api.jikan.moe/v4/anime/${anime.mal_id}/characters?limit=100`);
 const chars=(d?.data||[]).filter(x=>x?.character?.name);
 CHAR_CACHE.set(book,chars);
 return chars;
}
async function enriquecerCard(c){
 const chars=await personagensDoLivro(c.book);
 if(!chars.length) return {...c, personagem:`Personagem #${c.number}`, imagem:null};
 const item=chars[(c.number-1)%chars.length]?.character;
 return {...c, personagem:item?.name||`Personagem #${c.number}`, imagem:item?.images?.jpg?.image_url||null};
}
function cardButtons(uid,book){
 return new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId(`cardbook:${uid}:${Math.max(1,book-1)}`).setLabel('◀ Livro anterior').setStyle(ButtonStyle.Secondary).setDisabled(book<=1),
   new ButtonBuilder().setCustomId(`cardbook:${uid}:${Math.min(LIVROS.length,book+1)}`).setLabel('Próximo livro ▶').setStyle(ButtonStyle.Primary).setDisabled(book>=LIVROS.length)
 );
}
async function renderCardImage(i,c,footer=''){
 const x=await enriquecerCard(c);
 const W=1536,H=1024;
 const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
 const bg=ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,'#171a21'); bg.addColorStop(1,'#252a33');
 ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
 // faixa lateral da raridade
 const rarityColors={Comum:'#e5e7eb',Incomum:'#22c55e',Raro:'#3b82f6',Épico:'#a855f7',Lendário:'#f59e0b',Mítico:'#ef4444',Secreto:'#ec4899'};
 const accent=rarityColors[x.raridade]||'#8b5cf6';
 ctx.fillStyle=accent; ctx.fillRect(0,0,20,H);
 // moldura interna
 ctx.strokeStyle='#3a414d'; ctx.lineWidth=2; ctx.strokeRect(24,24,W-48,H-48);
 // cabeçalho
 ctx.fillStyle='#f4f4f5'; ctx.font='bold 46px sans-serif';
 const titulo=`${x.anime.toUpperCase()} • CARD #${String(x.number).padStart(3,'0')}`;
 const nome=x.personagem.toUpperCase();
 ctx.fillText(titulo,60,100);
 ctx.font='bold 52px sans-serif'; ctx.fillText(`— ${nome}`,60,165);
 ctx.fillStyle='#9fb8e8'; ctx.font='bold 28px sans-serif';
 ctx.fillText(`Personagem #${x.number} • Livro ${x.book}/100 • Raridade: ${x.raridade}`,60,220);
 // imagem do personagem à direita
 const ix=900,iy=70,iw=560,ih=820;
 ctx.save();
 ctx.beginPath(); ctx.roundRect(ix,iy,iw,ih,28); ctx.clip();
 ctx.fillStyle='#11151b'; ctx.fillRect(ix,iy,iw,ih);
 if(x.imagem){
   try{
     const img=await loadImage(x.imagem);
     const scale=Math.max(iw/img.width,ih/img.height);
     const dw=img.width*scale,dh=img.height*scale;
     ctx.drawImage(img,ix+(iw-dw)/2,iy+(ih-dh)/2,dw,dh);
   }catch{}
 }
 ctx.restore();
 ctx.strokeStyle='#4a5260'; ctx.lineWidth=3; ctx.beginPath(); ctx.roundRect(ix,iy,iw,ih,28); ctx.stroke();
 // painel de informações à esquerda
 ctx.fillStyle='#d9dde5'; ctx.font='bold 34px sans-serif';
 ctx.fillText('👤  PERSONAGEM',60,330);
 ctx.fillStyle='#f4f4f5'; ctx.font='bold 42px sans-serif';
 ctx.fillText(x.personagem,60,385);
 ctx.fillStyle='#d9dde5'; ctx.font='bold 34px sans-serif';
 ctx.fillText('🎴  RARIDADE',60,470);
 ctx.fillStyle=accent; ctx.font='bold 42px sans-serif';
 ctx.fillText(`${x.emoji} ${x.raridade}`,60,525);
 ctx.fillStyle='#d9dde5'; ctx.font='bold 34px sans-serif';
 ctx.fillText('📊  COLEÇÃO',60,610);
 ctx.fillStyle='#f4f4f5'; ctx.font='bold 40px sans-serif';
 const d=lerDados(),u=userData(d,i.user.id); resetDaily(u);
 ctx.fillText(`Hoje: ${u.daily.count}/5 • Total: ${u.cards.length}/5.000`,60,665);
 ctx.fillStyle='#aeb5c2'; ctx.font='30px sans-serif';
 ctx.fillText(`📕 ${x.anime} • Livro ${x.book}/100 • Card ${String(x.number).padStart(3,'0')}/050`,60,745);
 ctx.fillText(footer||`Obtido hoje • ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`,60,810);
 // rodapé
 ctx.fillStyle='#8e96a5'; ctx.font='24px sans-serif';
 ctx.fillText(`TENCHIKHO • COLEÇÃO DE ANIMES`,60,950);
 return canvas.encode('png');
}

async function renderCard(i,c,footer=''){
 const x=await enriquecerCard(c);
 const e=commandEmbed(`🎴 ${x.anime} • CARD #${String(x.number).padStart(3,'0')}`,0xf59e0b);
 const png=await renderCardImage(i,x,footer);
 const file=new AttachmentBuilder(png,{name:'card.png'});
 e.setImage('attachment://card.png');
 return {embed:e,file};
}
async function card(i){
 await i.deferReply();
 const d=lerDados(),u=userData(d,i.user.id); resetDaily(u);
 if(u.daily.count>=5)return i.editReply('🔒 **LIMITE DIÁRIO ATINGIDO**\n\nVocê já coletou **5/5 cards** hoje.\n🎴 Seu próximo card estará disponível amanhã.');
 let novo;
 for(let n=0;n<30;n++){const c=gerarCard();if(!u.cards.some(x=>x.id===c.id)){novo=c;break;}}
 if(!novo)return i.editReply('🎴 Você já possui muitos cards diferentes. Tente novamente.');
 u.cards.push(novo);u.daily.count++;salvarDados(d);
 const rendered=await renderCard(i,novo,`Hoje: ${u.daily.count}/5 • Total: ${u.cards.length}/5.000`);
 return i.editReply({embeds:[rendered.embed],files:[rendered.file],components:[cardButtons(i.user.id,novo.book)]});
}
async function livros(i){await i.deferReply();return enviarPaginaLivros(i,0);}
async function enviarPaginaLivros(i,pagina){
 const d=lerDados(),u=userData(d,i.user.id); const totalPaginas=Math.ceil(LIVROS.length/25);
 pagina=Math.max(0,Math.min(pagina,totalPaginas-1)); const inicio=pagina*25; const fim=Math.min(inicio+25,LIVROS.length);
 const linhas=LIVROS.slice(inicio,fim).map((n,offset)=>{const idx=inicio+offset;const qtd=u.cards.filter(c=>c.book===idx+1).length;return `**${String(idx+1).padStart(2,'0')}. ${n}** — 🎴 ${qtd}/50`});
 const e=commandEmbed(`📚 LIVROS DA COLEÇÃO • ${pagina+1}/${totalPaginas}`,0x8b5cf6).setDescription(linhas.join('\n')).setFooter({text:`Mostrando ${inicio+1}–${fim} de ${LIVROS.length} livros`});
 const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`livros:${i.user.id}:${pagina-1}`).setLabel('◀ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(pagina===0),new ButtonBuilder().setCustomId(`livros:${i.user.id}:${pagina+1}`).setLabel('Próxima ▶').setStyle(ButtonStyle.Primary).setDisabled(pagina===totalPaginas-1));
 return i.editReply({embeds:[e],components:[row]});
}
async function livro(i){
 await i.deferReply();
 const busca=i.options.getString('anime',true).toLowerCase();
 const idx=LIVROS.findIndex(x=>x.toLowerCase()===busca||x.toLowerCase().includes(busca));
 if(idx<0)return i.editReply('📕 Não encontrei esse livro. Use /livros para ver os 100 disponíveis.');
 return renderLivroPagina(i,idx,0);
}

async function renderLivroPagina(i,idx,pagina){
 const d=lerDados(),u=userData(d,i.user.id);
 const todas=u.cards.filter(c=>c.book===idx+1);
 const porPagina=8, totalPaginas=Math.ceil(50/porPagina);
 pagina=Math.max(0,Math.min(Number(pagina)||0,totalPaginas-1));
 const inicio=pagina*porPagina;
 const mapa=new Map(todas.map(c=>[c.number,c]));
 const slots=[];
 for(let n=1;n<=porPagina;n++){
   const number=inicio+n;
   if(number>50) break;
   const c=mapa.get(number);
   slots.push(c ? await enriquecerCard(c) : {number,personagem:null,imagem:null,raridade:null,emoji:null});
 }
 const png=await renderLivroImage(i,idx,pagina,slots,todas.length);
 const file=new AttachmentBuilder(png,{name:'livro.png'});
 const e=commandEmbed(`📕 LIVRO ${String(idx+1).padStart(2,'0')} — ${LIVROS[idx].toUpperCase()}`,0x8b5cf6).setImage('attachment://livro.png');
 const row=new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId(`livropage:${i.user.id}:${idx}:${pagina-1}`).setLabel('◀ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(pagina===0),
   new ButtonBuilder().setCustomId(`livropage:${i.user.id}:${idx}:${pagina+1}`).setLabel('Próxima ▶').setStyle(ButtonStyle.Primary).setDisabled(pagina===totalPaginas-1)
 );
 return i.editReply({embeds:[e],files:[file],components:[row]});
}

async function renderLivroImage(i,idx,pagina,slots,obtidos){
 const W=1536,H=864;
 const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');
 const bg=ctx.createLinearGradient(0,0,W,H); bg.addColorStop(0,'#171a21'); bg.addColorStop(1,'#252a33');
 ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#8b5cf6';ctx.fillRect(0,0,18,H);
 ctx.strokeStyle='#3d4450';ctx.lineWidth=2;ctx.strokeRect(28,28,W-56,H-56);
 ctx.fillStyle='#f4f4f5';ctx.font='bold 48px sans-serif';
 ctx.fillText(`LIVRO ${String(idx+1).padStart(2,'0')} — ${LIVROS[idx].toUpperCase()}`,70,92);
 ctx.fillStyle='#a78bfa';ctx.font='bold 30px sans-serif';
 ctx.fillText(`Coleção • 50 cartas • Progresso: ${obtidos}/50`,70,140);
 ctx.strokeStyle='#454b57';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(70,175);ctx.lineTo(W-70,175);ctx.stroke();
 ctx.fillStyle='#a78bfa';ctx.font='bold 34px sans-serif';ctx.fillText('COLEÇÃO ATUAL',70,225);
 const cols=8, cardW=158, cardH=230, gap=25, startX=70, startY=255;
 for(let k=0;k<slots.length;k++){
   const s=slots[k],x=startX+k*(cardW+gap),y=startY;
   ctx.fillStyle=s.imagem?'#454b57':'#303641';
   ctx.beginPath();ctx.roundRect(x,y,cardW,cardH,12);ctx.fill();
   ctx.strokeStyle=s.imagem?'#667085':'#87909f';ctx.lineWidth=2;ctx.setLineDash(s.imagem?[]:[8,7]);ctx.stroke();ctx.setLineDash([]);
   if(s.imagem){
     try{
       const img=await loadImage(s.imagem);
       const iw=cardW-10,ih=cardH-52;
       const scale=Math.max(iw/img.width,ih/img.height);
       const dw=img.width*scale,dh=img.height*scale;
       ctx.save();ctx.beginPath();ctx.roundRect(x+5,y+5,iw,ih,9);ctx.clip();
       ctx.drawImage(img,x+5+(iw-dw)/2,y+5+(ih-dh)/2,dw,dh);ctx.restore();
     }catch{}
     ctx.fillStyle='#e5e7eb';ctx.font='bold 18px sans-serif';
     ctx.fillText(`#${String(s.number).padStart(3,'0')}`,x+12,y+cardH-17);
   }else{
     ctx.fillStyle='#aeb5c2';ctx.font='bold 42px sans-serif';ctx.textAlign='center';ctx.fillText('+',x+cardW/2,y+105);ctx.font='bold 20px sans-serif';ctx.fillText(`#${String(s.number).padStart(3,'0')}`,x+cardW/2,y+195);ctx.textAlign='left';
   }
 }
 ctx.strokeStyle='#454b57';ctx.beginPath();ctx.moveTo(70,510);ctx.lineTo(W-70,510);ctx.stroke();
 ctx.fillStyle='#65d391';ctx.font='bold 30px sans-serif';ctx.fillText(`Obtidos: ${obtidos} card${obtidos===1?'':'s'}`,70,560);
 ctx.fillStyle='#a78bfa';ctx.font='bold 30px sans-serif';ctx.fillText(`Completude: ${(obtidos/50*100).toFixed(1).replace('.',',')}%`,800,560);
 ctx.fillStyle='#d1d5db';ctx.font='bold 28px sans-serif';ctx.fillText(`Restantes: ${50-obtidos} cartas`,70,610);
 const raros=todasRaridades(lerDados(),i.user.id,idx+1);
 ctx.fillText(`Raridade obtida: ${raros}`,800,610);
 ctx.fillStyle='#8e96a5';ctx.font='24px sans-serif';ctx.fillText(`${LIVROS[idx]} • Livro ${idx+1} • Página ${pagina+1} de 7`,70,760);
 ctx.fillText(`Mostrando ${pagina*8+1}-${Math.min((pagina+1)*8,50)} de 50`,70,805);
 return canvas.encode('png');
}

function todasRaridades(d,uid,book){
 const cards=(d.users?.[uid]?.cards||[]).filter(c=>c.book===book);
 if(!cards.length) return 'Nenhuma';
 const counts={}; for(const c of cards) counts[c.raridade]=(counts[c.raridade]||0)+1;
 return Object.entries(counts).map(([k,v])=>`${k} ×${v}`).join(' • ');
}

async function renderLivroCard(i,idx,pos,cardsOverride){
 const d=lerDados(),u=userData(d,i.user.id); const cards=cardsOverride||u.cards.filter(c=>c.book===idx+1); pos=Math.max(0,Math.min(pos,cards.length-1)); const c=cards[pos];
 const rendered=await renderCard(i,c,`Card ${pos+1} de ${cards.length} coletados • Livro ${idx+1}/100`);
 const row=new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId(`livrocard:${i.user.id}:${idx}:${pos-1}`).setLabel('◀ Card anterior').setStyle(ButtonStyle.Secondary).setDisabled(pos===0),
   new ButtonBuilder().setCustomId(`livrocard:${i.user.id}:${idx}:${pos+1}`).setLabel('Próximo card ▶').setStyle(ButtonStyle.Primary).setDisabled(pos===cards.length-1)
 );
 return i.editReply({embeds:[rendered.embed],files:[rendered.file],components:[row]});
}
async function ranking(i){await i.deferReply();const d=lerDados();const lista=Object.entries(d.users||{}).map(([id,u])=>({id,n:u.cards?.length||0,raros:(u.cards||[]).filter(c=>['Raro','Épico','Lendário','Mítico','Secreto'].includes(c.raridade)).length,livros:new Set((u.cards||[]).filter(c=>c.book).map(c=>c.book)).size})).sort((a,b)=>b.n-a.n);const top=lista.slice(0,10);const medal=['🥇','🥈','🥉'];const desc=top.length?top.map((x,n)=>`${medal[n]||`**${n+1}º**`} <@${x.id}>\n🎴 ${x.n} cards • ⭐ ${x.raros} raros • 📚 ${x.livros}/100 livros`).join('\n\n'):'Nenhum colecionador ainda.';const me=lista.findIndex(x=>x.id===i.user.id);const mine=me>=0?lista[me]:{n:0,raros:0,livros:0};const e=commandEmbed('🏆 RANKING DE COLECIONADORES',0xf59e0b).setDescription(desc).addFields({name:'📊 Seu progresso',value:`**${me>=0?me+1:'—'}º** • 🎴 ${mine.n}/5.000 • ⭐ ${mine.raros} raros • 📚 ${mine.livros}/100 completos`});return i.editReply({embeds:[e]});}

async function perfil(i){await i.deferReply();const d=lerDados(),u=userData(d,i.user.id);resetDaily(u);const livros=new Set((u.cards||[]).map(c=>c.book)).size;const raros=(u.cards||[]).filter(c=>['Raro','Épico','Lendário','Mítico','Secreto'].includes(c.raridade)).length;const lista=Object.entries(d.users||{}).sort((a,b)=>(b[1].cards?.length||0)-(a[1].cards?.length||0));const pos=Math.max(1,lista.findIndex(([id])=>id===i.user.id)+1);const e=commandEmbed(`👤 Perfil — ${i.user.username}`,0x7c3aed).setThumbnail(i.user.displayAvatarURL({size:256})).addFields({name:'👤 Usuário',value:`${i.user}`,inline:true},{name:'🎴 Coleção',value:`${u.cards.length}/5.000 cards\n📚 ${livros}/100 livros completos\n🎴 Hoje: ${u.daily.count}/5`,inline:true},{name:'🏆 Ranking',value:`${pos}º lugar\n⭐ ${raros} cards raros`,inline:true},{name:'🧠 Anime',value:`Quiz: ${u.quiz||0} pontos`,inline:true},{name:'💰 Economia',value:'Integração disponível quando a economia Tenchi estiver ativa.',inline:true});return i.editReply({embeds:[e]});}

async function tratarEntretenimento(i){
 if(i.commandName==='anime')return anime(i); if(i.commandName==='personagem')return personagem(i); if(i.commandName==='quiz-anime')return quiz(i); if(i.commandName==='casal-anime')return casal(i); if(i.commandName==='frase-anime')return frase(i); if(i.commandName==='ship')return ship(i); if(i.commandName==='animal')return animal(i); if(i.commandName==='perfil')return perfil(i); if(i.commandName==='livros')return livros(i); if(i.commandName==='livro')return livro(i); if(i.commandName==='card')return card(i); if(i.commandName==='ranking')return ranking(i);
}
async function tratarBotaoEntretenimento(i){
 if(i.customId.startsWith('livropage:')){const [,uid,idx,pagina]=i.customId.split(':');if(i.user.id!==uid)return i.reply({content:'📕 Esse livro foi aberto por outro usuário.',flags:64});await i.deferUpdate();return renderLivroPagina(i,Number(idx),Number(pagina));}
 if(i.customId.startsWith('livros:')){const [,uid,pagina]=i.customId.split(':');if(i.user.id!==uid)return i.reply({content:'📚 Esse painel foi aberto por outro usuário.',flags:64});await i.deferUpdate();return enviarPaginaLivros(i,Number(pagina));}
 if(i.customId.startsWith('cardbook:')){const [,uid,book]=i.customId.split(':');if(i.user.id!==uid)return i.reply({content:'🎴 Esse card foi aberto por outro usuário.',flags:64});await i.deferUpdate();const c={id:`${book}:1`,book:Number(book),number:1,anime:LIVROS[Number(book)-1],personagem:'Personagem #1',raridade:'Comum',emoji:'⚪'};const rendered=await renderCard(i,c,`Livro ${book}/100`);return i.editReply({embeds:[rendered.embed],files:[rendered.file],components:[cardButtons(i.user.id,Number(book))]});}
 if(i.customId.startsWith('livrocard:')){const [,uid,idx,pos]=i.customId.split(':');if(i.user.id!==uid)return i.reply({content:'📕 Esse livro foi aberto por outro usuário.',flags:64});await i.deferUpdate();const d=lerDados(),u=userData(d,i.user.id),cards=u.cards.filter(c=>c.book===Number(idx)+1);if(!cards.length)return i.editReply({content:'🔒 Você não possui cards deste livro.',embeds:[],components:[]});return renderLivroCard(i,Number(idx),Number(pos),cards);}
 if(!i.customId.startsWith('quiz:'))return false; const [,uid,op,correta]=i.customId.split(':'); if(i.user.id!==uid)return i.reply({content:'🧠 Esse quiz foi iniciado por outro usuário.',flags:64}); await i.deferUpdate(); const d=lerDados(),u=userData(d,i.user.id); if(Number(op)===Number(correta)){u.quiz=(u.quiz||0)+1;salvarDados(d);return i.editReply({content:`✅ **Acertou!** +1 ponto.\n🧠 Sua pontuação: **${u.quiz}**`,embeds:[],components:[]});}return i.editReply({content:`❌ **Errou!** A resposta correta era **${['A','B','C','D'][Number(correta)]}**.`,embeds:[],components:[]});
}
module.exports={LIVROS,COMMANDS,tratarEntretenimento,tratarBotaoEntretenimento};

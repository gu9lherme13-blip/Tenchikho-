const EventEmitter = require('events');
function builder(){ const t={name:null}; const p=new Proxy(function(){},{
  get(_,k){ if(k==='setName') return n=>{t.name=n;return p;}; if(k==='name') return t.name;
    if(k==='toJSON') return ()=>({name:t.name}); if(k===Symbol.toPrimitive) return ()=>'stub'; if(k==='then') return undefined;
    return ()=>p; }, apply(){return p;} }); return p; }
const B = class { constructor(){ return builder(); } };
const enumLike = () => new Proxy({}, { get:(_,k)=> typeof k==='string' ? 1 : undefined });
class Client extends EventEmitter {
  constructor(){ super(); this.user={tag:'stub#0001'}; this._ready=false; this.guilds={cache:new Map()}; this.channels={fetch:async()=>null}; }
  isReady(){return this._ready;} login(){return Promise.resolve('ok');} }
module.exports = { Client, REST:B, Routes:{}, SlashCommandBuilder:B, EmbedBuilder:B, ActionRowBuilder:B, ButtonBuilder:B, ModalBuilder:B,
  TextInputBuilder:B, StringSelectMenuBuilder:B, StringSelectMenuOptionBuilder:B, AttachmentBuilder:B,
  GatewayIntentBits:enumLike(), Partials:enumLike(), PermissionFlagsBits:enumLike(), ButtonStyle:enumLike(), TextInputStyle:enumLike(), MessageFlags:enumLike() };

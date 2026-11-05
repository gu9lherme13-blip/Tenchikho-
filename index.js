require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, ChannelType, EmbedBuilder, PermissionFlagsBits,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder,
} = require('discord.js');
const EFEMERA = 64; // flag de resposta visível só para quem clicou

const { DISCORD_TOKEN, CLIENT_ID, DISCORD_CLIENT_SECRET, PUBLIC_URL } = process.env;
for (const [nome, valor] of Object.entries({ DISCORD_TOKEN, CLIENT_ID, DISCORD_CLIENT_SECRET, PUBLIC_URL })) {
  if (!valor) { console.error(`Defina ${nome} nas variáveis de ambiente.`); process.exit(1); }
}

const BASE = PUBLIC_URL.replace(/\/+$/, '');
const REDIRECT_URI = `${BASE}/auth/callback`;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Funções exibidas no painel. "implementada" indica se já tem comportamento no bot.
const FUNCOES = [
  { chave: 'chamada', nome: 'Chamada', implementada: false },
  { chave: 'canais', nome: 'Gerenciamento de Canais', implementada: false },
  { chave: 'avisos', nome: 'Avisos', implementada: true },
  { chave: 'ticket', nome: 'Tickets', implementada: true },
  { chave: 'moderacao', nome: 'Moderação', implementada: false },
  { chave: 'boasvindas', nome: 'Boas-vindas', implementada: true },
  { chave: 'aniversario', nome: 'Aniversário', implementada: false },
  { chave: 'saida', nome: 'Saída', implementada: false },
  { chave: 'autocargo', nome: 'Auto Cargo', implementada: true },
  { chave: 'moeda', nome: 'Moeda Tenchikho', implementada: false },
  { chave: 'games', nome: 'Games', implementada: false },
  { chave: 'ia', nome: 'Tenchikho IA', implementada: false },
  { chave: 'automacao', nome: 'Automação', implementada: false },
  { chave: 'recrutamento', nome: 'Recrutamento', implementada: false },
  { chave: 'roblox', nome: 'Roblox', implementada: false },
];
    

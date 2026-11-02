'use strict';
// Faz o index.js carregar stubs no lugar de discord.js/express/dotenv, mesmo que existam em node_modules.
const Module = require('module'), path = require('path');
const map = { 'discord.js': 'discord.js', express: 'express.js', dotenv: 'dotenv.js' };
const orig = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(map, request)) return orig.call(this, path.join(__dirname, map[request]), parent, isMain);
  return orig.apply(this, arguments);
};

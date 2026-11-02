#!/usr/bin/env node
'use strict';
// Uso:
//   node tools/migrate-to-guilds.js plan     --dir <DATA_DIR> [--legacy-guild <ID>]
//   node tools/migrate-to-guilds.js apply    --dir <DATA_DIR>  --legacy-guild <ID> --confirm-offline-backup
//   node tools/migrate-to-guilds.js verify   --dir <DATA_DIR>
//   node tools/migrate-to-guilds.js rollback --dir <DATA_DIR> [--restore-flat]
// "plan" e "verify" só leem. Os arquivos antigos nunca são alterados. Pare o bot antes do "apply".
const migration = require('../migration');

const [cmd, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) continue;
  const k = rest[i].slice(2);
  const next = rest[i + 1];
  if (next === undefined || next.startsWith('--')) args[k] = true; else { args[k] = next; i++; }
}
const fail = msg => { console.error(`❌ ${msg}`); process.exit(2); };
if (!['plan', 'apply', 'verify', 'rollback'].includes(cmd)) fail('Comando inválido. Use: plan | apply | verify | rollback');
if (!args.dir || args.dir === true) fail('Informe --dir <pasta dos dados>.');
const out = r => console.log(JSON.stringify(r, null, 2));

(async () => {
  if (cmd === 'plan') { const r = migration.plan(args.dir, { legacyGuildId: args['legacy-guild'] }); out(r.ok ? migration.publicPlan(r) : r); process.exit(r.ok ? 0 : 1); }
  if (cmd === 'verify') { const r = migration.verify(args.dir); out(r); process.exit(r.ok ? 0 : 1); }
  if (cmd === 'rollback') { const r = migration.rollback(args.dir, { restoreFlat: !!args['restore-flat'] }); out(r); process.exit(r.ok ? 0 : 1); }
  if (cmd === 'apply') {
    if (!args['confirm-offline-backup']) fail('Confirme com --confirm-offline-backup que você guardou uma cópia dos arquivos de produção FORA do servidor e que o bot está parado.');
    const r = await migration.apply(args.dir, { legacyGuildId: args['legacy-guild'], allowEmpty: !!args['allow-empty'] });
    out(r.ok ? migration.publicPlan(r) : r); process.exit(r.ok ? 0 : 1);
  }
})().catch(e => fail(e.stack || e.message));

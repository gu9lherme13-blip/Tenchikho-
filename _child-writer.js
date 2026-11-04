'use strict';
// processo filho usado no teste de queda (SIGKILL no meio das gravações)
const { createStore } = require('../storage');
const store = createStore({ dir: process.argv[2], logger: { log() {}, warn() {}, error() {} } });
(async () => {
  const payload = 'x'.repeat(300000);
  for (let n = 1; ; n++) {
    await store.save('estado.json', { n, payload, check: n * 7 });
    if (n === 1) process.stdout.write('ready\n');
  }
})();

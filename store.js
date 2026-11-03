const fs = require("node:fs");
const path = require("node:path");

const dataDir = path.resolve(process.env.DATA_DIR || "./data");
const file = path.join(dataDir, "chamadas.json");
const vazio = () => ({ calls: [], history: [] });

// Gravação atômica: escreve em .tmp e troca pelo arquivo final.
function write(data) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function ensure() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) write(vazio());
}

// Se o arquivo estiver corrompido, guarda uma cópia e falha em vez de sobrescrever o histórico.
function read() {
  ensure();
  const raw = fs.readFileSync(file, "utf8");
  try {
    const d = JSON.parse(raw);
    return { calls: Array.isArray(d.calls) ? d.calls : [], history: Array.isArray(d.history) ? d.history : [] };
  } catch {
    fs.copyFileSync(file, `${file}.corrompido-${Date.now()}`);
    throw new Error("chamadas.json corrompido; cópia salva antes de qualquer gravação.");
  }
}

module.exports = { read, write };

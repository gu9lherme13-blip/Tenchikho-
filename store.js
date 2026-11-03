const fs = require("node:fs");
const path = require("node:path");

const dataDir = path.resolve(process.env.DATA_DIR || "./data");
const file = path.join(dataDir, "chamadas.json");

function ensure() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ calls: [], history: [] }, null, 2));
}
function read() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { calls: [], history: [] };
  }
}
function write(data) {
  ensure();
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
module.exports = { read, write };
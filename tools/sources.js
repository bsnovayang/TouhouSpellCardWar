/* 無頭測試用的腳本載入清單（順序要與 index.html 一致） */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

const FILES = [
  'js/config.js', 'js/engine.js', 'js/carddb.js', 'js/keywords.js', 'js/heroes.js',
  'js/cards/common.js', 'js/cards/eosd.js', 'js/cards/pcb.js', 'js/cards/in.js',
  'js/decks.js', 'js/ai.js'
];

function loadGame() {
  const src = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join(String.fromCharCode(10));
  const ctx = vm.createContext({ console, JSON, Math, Object, Array, String, Number });
  vm.runInContext(src, ctx);
  return ctx;
}

module.exports = { FILES, ROOT, loadGame };

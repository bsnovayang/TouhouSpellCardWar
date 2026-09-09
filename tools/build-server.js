/* 把遊戲邏輯打包成一個 ES module，給 Cloudflare Worker / Durable Object 用。

   為什麼需要這一步：瀏覽器用 <script> 逐檔載入、共用同一個全域範圍，
   但 Worker 只吃 ES module。與其把 11 個檔案改寫成 module
   （那會動到每一處函式定義，而且瀏覽器端也得跟著改），
   不如照 tools/sources.js 的作法把它們串起來，再補一行 export。

   這樣做的好處是**伺服器跑的就是同一份程式碼**——
   規則不可能因為「客戶端和伺服器實作不一致」而分岔。 */
const fs = require('fs');
const path = require('path');
const { FILES, ROOT } = require('./sources');

/* 伺服器只需要規則，不需要 AI 與連線層 */
const SERVER_FILES = FILES.filter(f => f !== 'js/ai.js' && f !== 'js/net.js');

/* 伺服器端要用到的東西。applyAction 原本在 ai.js 裡，
   但它是「玩家動作的唯一入口」而不是 AI 專屬，所以這裡自己補一份。 */
const EXPORTS = [
  'CARDS', 'HEROES', 'HERO_ORDER', 'KEYWORDS', 'TRIBES',
  'newGame', 'doMulligan', 'endTurn', 'playCard', 'doAttack',
  'useHeroPower', 'resolveChoice', 'canPlay', 'canHeroPower',
  'validateDeck', 'presetDeck', 'presetBgm',
  'foe', 'def', 'unitsOf', 'logMsg', 'heroName',
  'DECK_SIZE', 'MAX_COPIES', 'TURN_SECONDS', 'DISCONNECT_GRACE',
  'applyAction', 'redactState'
];

const APPLY_ACTION = `
/* 玩家在一個回合裡能做的所有事，全部走這一個入口。
   與瀏覽器端 js/ai.js 裡的那一份保持一致 —— 兩邊都靠它解讀動作訊息。 */
function applyAction(s, pi, a) {
  if (a.k === 'choose') return resolveChoice(s, a.defId);
  if (a.k === 'play') return playCard(s, pi, a.uid, a.t);
  if (a.k === 'power') return useHeroPower(s, pi, a.t);
  if (a.k === 'atk') return doAttack(s, a.uid, a.t);
  if (a.k === 'mull') {
    if (!s.pendingMulligan[pi]) return '你已經調度過了';
    doMulligan(s, pi, a.toss || []);
    return null;
  }
  if (a.k === 'end') {
    if (s.active !== pi) return '不是你的回合';
    return endTurn(s) || null;
  }
  if (a.k === 'concede') {
    if (s.winner != null) return '對局已結束';
    s.winner = foe(pi);
    s.phase = 'over';
    logMsg(s, heroName(s.players[pi]) + ' 投降');
    return null;
  }
  return '未知動作';
}

/* 遮蔽視野。與 js/net.js 的 redact() 同一套規則 ——
   對手的手牌與雙方的牌庫換成同長度的佔位物，探尋選項只有當事人看得到。 */
function redactState(state, forPi) {
  var s = JSON.parse(JSON.stringify(state));
  var foePi = 1 - forPi;
  s.players[foePi].hand = s.players[foePi].hand.map(function () {
    return { uid: 0, defId: '?', costMod: 0, tempCostMod: 0 };
  });
  s.players[foePi].bgmCard = null;
  [0, 1].forEach(function (i) {
    s.players[i].deck = s.players[i].deck.map(function () { return { uid: 0, defId: '?' }; });
  });
  if (s.pendingChoice && s.pendingChoice.pi !== forPi) {
    s.pendingChoice = { pi: s.pendingChoice.pi, options: [], label: s.pendingChoice.label };
  }
  s.log = (s.log || []).slice(-60);
  return s;
}
`;

const header = `/* 自動產生 —— 不要直接編輯。
   來源：${SERVER_FILES.join(', ')}
   重新產生：npm run build:server */
`;

const body = SERVER_FILES
  .map(f => '/* ===== ' + f + ' ===== */\n' + fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n');

const out = header + body + APPLY_ACTION +
  '\nexport {\n  ' + EXPORTS.join(',\n  ') + '\n};\n';

const dest = path.join(ROOT, 'server', 'src', 'game.js');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);

console.log('已產生 server/src/game.js（' + (out.length / 1024).toFixed(0) + ' KB，' +
  SERVER_FILES.length + ' 個來源檔）');

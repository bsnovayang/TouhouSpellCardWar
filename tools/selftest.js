/* 無頭自我測試：AI vs AI 跑多場，抓執行期錯誤與規則異常 */
const g = require('./sources').loadGame();

const REPS = parseInt(process.argv[2] || '2', 10);   // 每組對戰重複場次
let firstWins = 0, secondWins = 0, draws = 0, turns = [], errs = [];
const heroWin = {}, heroPlay = {};

/* 完整循環賽：每一對英雄、雙方各先手一次 */
const pairs = [];
g.HERO_ORDER.forEach((a, i) => g.HERO_ORDER.forEach((b, j) => {
  if (i !== j) pairs.push([a, b]);
}));
let games = [];
for (let r = 0; r < REPS; r++) pairs.forEach(([a, b]) => games.push([a, b, r % 2]));

/* 循環賽的場數隨英雄數呈平方成長 —— 24 位就是 2208 場，跑一次十幾分鐘。
   npm test 只需要「有沒有執行期錯誤 ＋ 先手勝率大概對不對」，不需要每位英雄的精確勝率，
   所以吃一個 --max 上限，用固定種子抽樣。
   要精確的每位英雄勝率請用 npm run balance（完整循環賽，不抽樣）。 */
const capArg = process.argv.indexOf('--max');
const CAP = capArg > 0 ? parseInt(process.argv[capArg + 1], 10) : 0;
let sampled = false;
if (CAP > 0 && games.length > CAP) {
  let seed = 20260101;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
  for (let i = games.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = games[i]; games[i] = games[j]; games[j] = t;
  }
  games = games.slice(0, CAP);
  sampled = true;
}
const N = games.length;

for (let n = 0; n < N; n++) {
  const [h0, h1, fp] = games[n];
  let s;
  try {
    s = g.newGame({
      seed: 1000 + n * 7717,
      p0: { heroId: h0, deck: g.presetDeck(h0), bgm: g.presetBgm(h0) },
      p1: { heroId: h1, deck: g.presetDeck(h1), bgm: g.presetBgm(h1) },
      firstPlayer: fp
    });
    g.doMulligan(s, 0, g.aiMulligan(s, 0));
    g.doMulligan(s, 1, g.aiMulligan(s, 1));

    let guard = 0;
    while (s.winner == null && guard++ < 400) {
      const pi = s.active;
      let steps = 0, a;
      while ((a = g.aiNextAction(s, pi)) && steps++ < 40) {
        const e = g.applyAction(s, pi, a);
        if (e) { errs.push('動作失敗: ' + JSON.stringify(a) + ' -> ' + e); break; }
      }
      if (s.winner != null) break;
      g.endTurn(s);
    }
    if (guard >= 400) errs.push('第 ' + n + ' 局未在 400 回合內結束');
  } catch (e) {
    errs.push('第 ' + n + ' 局例外: ' + e.message + ' @ ' + String(e.stack || '').split(String.fromCharCode(10))[1]);
    continue;
  }

  turns.push(s.turn);
  heroPlay[h0] = (heroPlay[h0] || 0) + 1; heroPlay[h1] = (heroPlay[h1] || 0) + 1;
  if (s.winner === -1) draws++;
  else {
    heroWin[s.players[s.winner].heroId] = (heroWin[s.players[s.winner].heroId] || 0) + 1;
    if (s.winner === s.first) firstWins++; else secondWins++;
  }
}

const avg = turns.reduce((a, b) => a + b, 0) / (turns.length || 1);
console.log('=== ' + N + ' 場 AI vs AI' + (sampled ? '（抽樣，每位英雄的勝率僅供參考）' : '') + ' ===');
console.log('先手勝 ' + firstWins + ' / 後手勝 ' + secondWins + ' / 平手 ' + draws);
console.log('先手勝率 ' + (firstWins / Math.max(1, firstWins + secondWins) * 100).toFixed(1) + '%');
console.log('平均回合數 ' + avg.toFixed(1) + '（最短 ' + Math.min(...turns) + ' / 最長 ' + Math.max(...turns) + '）');
console.log('--- 各英雄勝率 ---');
g.HERO_ORDER.forEach(h => {
  const p = heroPlay[h] || 0, w = heroWin[h] || 0;
  console.log('  ' + g.HEROES[h].name.padEnd(12) + ' ' + w + '/' + p +
    '  ' + (p ? (w / p * 100).toFixed(0) + '%' : '—'));
});
if (errs.length) {
  console.log('--- 問題 (' + errs.length + ') ---');
  [...new Set(errs)].slice(0, 12).forEach(e => console.log('  ' + e));
  process.exit(1);
} else console.log('無執行期錯誤 ✓');

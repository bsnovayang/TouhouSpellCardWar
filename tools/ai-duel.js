/* 困難 AI vs 簡單 AI：驗證難度差異是真的，順便量規劃耗時。
   用法：node tools/ai-duel.js [每組重複場次]

   雙方牌組完全相同、先後手各半，所以勝率差距只可能來自 AI 本身。 */
const g = require('./sources').loadGame();

const REPS = parseInt(process.argv[2] || '2', 10);
let hardWin = 0, easyWin = 0, draws = 0;
const errs = [], plan = { n: 0, ms: 0, max: 0 };
const byHero = {};

/* 讓兩邊各自跑自己的難度：state 上的 aiLevel 只有一個，
   所以每次輪到誰行動就先把 aiLevel 換成那一方的設定。 */
function run(hardSide, heroId, seed, firstPlayer) {
  const s = g.newGame({
    seed,
    p0: { heroId, deck: g.presetDeck(heroId), bgm: g.presetBgm(heroId) },
    p1: { heroId, deck: g.presetDeck(heroId), bgm: g.presetBgm(heroId) },
    firstPlayer
  });
  g.doMulligan(s, 0, g.aiMulligan(s, 0));
  g.doMulligan(s, 1, g.aiMulligan(s, 1));

  let guard = 0;
  while (s.winner == null && guard++ < 400) {
    const pi = s.active;
    s.aiLevel = (pi === hardSide) ? 'hard' : 'easy';
    s._aiPlan = null;                       // 換難度就不能沿用上一方的計畫
    let steps = 0, a;
    while (steps++ < 40) {
      // 要在呼叫「之前」判斷有沒有現成計畫 —— 呼叫後 _aiPlan 的狀態代表的是
      // 「計畫還有沒有剩」，拿它當條件只會統計到單動作的便宜回合。
      const hadPlan = !!s._aiPlan;
      const t0 = Date.now();
      a = g.aiNextAction(s, pi);
      if (pi === hardSide && !hadPlan && a) {
        const dt = Date.now() - t0;
        plan.n++; plan.ms += dt; plan.max = Math.max(plan.max, dt);
      }
      if (!a) break;
      const e = g.applyAction(s, pi, a);
      if (e) { errs.push('動作失敗 ' + JSON.stringify(a) + ' → ' + e); break; }
    }
    if (s.winner != null) break;
    g.endTurn(s);
  }
  if (guard >= 400) errs.push('未在 400 回合內結束');
  return s.winner;
}

const t0 = Date.now();
g.HERO_ORDER.forEach(heroId => {
  let hw = 0, tot = 0;
  for (let r = 0; r < REPS; r++) {
    for (const hardSide of [0, 1]) {
      for (const fp of [0, 1]) {
        const w = run(hardSide, heroId, 2000 + r * 6151 + heroId.length * 97 + fp, fp);
        tot++;
        if (w === -1) draws++;
        else if (w === hardSide) { hardWin++; hw++; }
        else easyWin++;
      }
    }
  }
  byHero[heroId] = [hw, tot];
});

const total = hardWin + easyWin;
console.log('=== 困難 vs 簡單（同英雄同牌組，先後手各半）===');
console.log((total + draws) + ' 場：困難勝 ' + hardWin + ' / 簡單勝 ' + easyWin + ' / 平手 ' + draws);
console.log('困難勝率 ' + (hardWin / Math.max(1, total) * 100).toFixed(1) + '%');
console.log('規劃耗時：平均 ' + (plan.ms / Math.max(1, plan.n)).toFixed(1) +
  ' ms，最久 ' + plan.max + ' ms（共 ' + plan.n + ' 次）');
console.log('總耗時 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');

console.log('--- 各英雄（困難方勝率）---');
g.HERO_ORDER.forEach(h => {
  const [w, t] = byHero[h];
  console.log('  ' + g.HEROES[h].name.padEnd(18) + w + '/' + t + '　' + Math.round(w / t * 100) + '%');
});
console.log(errs.length ? '錯誤：' + errs.slice(0, 5).join(' | ') : '無執行期錯誤 ✓');

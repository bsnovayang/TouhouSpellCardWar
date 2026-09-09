/* 卡片「完全上位互換」檢查。

   起因：冰之妖精（琪露諾專屬 2 費 2/2「登場：冰結一個敵方角色」）
   被中立的琪露諾（2 費 2/3、同樣效果）完全壓過 —— 專屬卡沒有存在的理由。
   卡池會長到 380 張，這種事只會愈來愈難用眼睛看出來。

   判定：同型別、A 的費用 ≤ B、數值都 ≥、關鍵字是超集、而且「效果完全相同」，
   那 B 就沒有理由被放進牌組。效果是否相同用函式原始碼比對 ——
   不完美，但抓得到「複製貼上改個數值」這種最常見的重複。 */
const fs = require('fs');
const path = require('path');
const { FILES, ROOT } = require('./sources');
const g = require('./sources').loadGame();

let problems = 0;
function report(title, list, hint) {
  console.log(title + '：' + (list.length ? '' : '無'));
  list.forEach(x => console.log('  ✗ ' + x));
  if (list.length) { problems += list.length; if (hint) console.log('  → ' + hint); }
}

/* ---------- 1. C() 在載入時記下的定義錯誤 ---------- */
report('卡片定義檢查', g.CARD_PROBLEMS || [],
  '這些是 js/carddb.js 的 C() 抓到的 —— id 重複、欄位打錯、族群或關鍵字不存在。');

/* ---------- 2. 卡片有沒有放在它所屬補充包的檔案裡 ---------- */
const PACK_OF = {
  'js/cards/common.js': null,          // 通用檔不限制
  'js/cards/eosd.js': '紅',
  'js/cards/pcb.js': '妖',
  'js/cards/in.js': '永'
};
const fileOf = {};
const misplaced = [];
Object.keys(PACK_OF).forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  [...src.matchAll(/id:\s*'([a-z0-9_]+)'/g)].map(m => m[1]).forEach(id => {
    fileOf[id] = f;
    const d = g.CARDS[id];
    if (d && PACK_OF[f] && d.src !== PACK_OF[f]) {
      misplaced.push('「' + d.name + '」的 src 是「' + d.src + '」卻放在 ' + f);
    }
  });
});
report('卡片放的檔案 vs 它的補充包', misplaced,
  '一張卡應該放在它出處那一包的檔案裡，否則之後找不到人。');

/* ---------- 3. 指向不存在卡片的參照 ---------- */
/* summon(...,'id') 與 tutor:'id' 打錯字的話，只有那張卡實際被打出來時才會爆，
   平衡跑一萬場也不保證踩得到。 */
const allSrc = Object.keys(PACK_OF).map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join(String.fromCharCode(10));
const refs = [...allSrc.matchAll(/summon\([^,]+,[^,]+,\s*'([a-z0-9_]+)'/g)].map(m => m[1])
  .concat([...allSrc.matchAll(/tutor:\s*'([a-z0-9_]+)'/g)].map(m => m[1]));
report('指向不存在卡片的參照',
  [...new Set(refs)].filter(id => !g.CARDS[id]).map(id => '找不到「' + id + '」'),
  '這種錯只有那張卡被打出來時才會爆，測試不一定踩得到。');

/* ---------- 4. 兩份載入清單有沒有同步 ---------- */
/* index.html 給瀏覽器、tools/sources.js 給測試。只改其中一份的話，
   測試會安靜地跳過新卡然後回報「一切正常」—— 最難發現的那種失敗。 */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const htmlCards = [...html.matchAll(/src="(js\/cards\/[a-z0-9_]+\.js)"/g)].map(m => m[1]);
const nodeCards = FILES.filter(f => f.indexOf('js/cards/') === 0);
const sync = [];
htmlCards.forEach(f => { if (nodeCards.indexOf(f) < 0) sync.push(f + ' 只在 index.html，測試讀不到'); });
nodeCards.forEach(f => { if (htmlCards.indexOf(f) < 0) sync.push(f + ' 只在 tools/sources.js，遊戲載不到'); });
report('index.html 與 tools/sources.js 的卡表清單', sync,
  '兩份清單必須一致，否則測試與實際遊戲看到的卡池不同。');

/* ---------- 5. 以下是原本的上位互換檢查 ---------- */

const HOOKS = ['onPlay', 'onDeath', 'onTurnStart', 'onTurnEnd', 'onDamaged',
  'onAllySpell', 'onAllyDeath', 'onAllySummon', 'onHeroHurt', 'onExtraAttack',
  'aura', 'unitAura', 'selfAura', 'costMod', 'dmgReduce', 'grantKw'];

/* 一張卡的「效果指紋」：所有鉤子的原始碼串起來，空白正規化 */
function fingerprint(d) {
  return HOOKS.map(h => d[h] ? h + ':' + String(d[h]).replace(/\s+/g, ' ') : '').join('|');
}

function kwSet(d) { return new Set(d.kw || []); }
function superset(a, b) { for (const x of b) if (!a.has(x)) return false; return true; }

/* A 是否完全取代 B */
function dominates(a, b) {
  if (a.id === b.id) return false;
  if (a.type !== b.type) return false;
  if (a.token || b.token) return false;              // 衍生物不進牌組，不比
  if (fingerprint(a) !== fingerprint(b)) return false;
  if (a.cost > b.cost) return false;
  if (a.type === 'unit') {
    if ((a.atk || 0) < (b.atk || 0)) return false;
    if ((a.hp || 0) < (b.hp || 0)) return false;
  }
  if (!superset(kwSet(a), kwSet(b))) return false;
  // 中立卡誰都能放，專屬卡只有一位英雄能放 —— 所以中立壓過專屬特別嚴重，
  // 反過來（專屬壓過中立）就還好，那位英雄本來就該有更好的選擇。
  if (a.cls !== 'neutral' && a.cls !== b.cls) return false;
  // 至少要有一項嚴格更好，否則只是兩張等價的卡
  const better = a.cost < b.cost ||
    (a.type === 'unit' && ((a.atk || 0) > (b.atk || 0) || (a.hp || 0) > (b.hp || 0))) ||
    kwSet(a).size > kwSet(b).size;
  return better;
}

const ids = Object.keys(g.CARDS);
const hits = [];
ids.forEach(x => ids.forEach(y => {
  if (dominates(g.CARDS[x], g.CARDS[y])) hits.push([g.CARDS[x], g.CARDS[y]]);
}));

const label = d => (d.cls === 'neutral' ? '中立' : (g.HEROES[d.cls] ? g.HEROES[d.cls].name.slice(0, 4) : d.cls));
const line = d => d.cost + '費 ' +
  (d.type === 'unit' ? (d.atk + '/' + d.hp) : d.type) + ' 「' + d.name + '」（' + label(d) + '）';

console.log('=== 卡片上位互換檢查（' + ids.length + ' 張）===');
if (!hits.length) {
  console.log('沒有任何卡片被完全取代 ✓');
} else {
  console.log('--- 發現 ' + hits.length + ' 組 ---');
  hits.forEach(([a, b]) => {
    console.log('  ✗ ' + line(a));
    console.log('    完全取代 ' + line(b));
  });
  console.log('→ 效果相同、費用不高、數值不低的話，被壓過的那張就沒有理由被放進牌組。');
}

/* 自我迴歸：把一張已知會被壓過的卡餵進去，確認這支 lint 真的抓得到。
   （沒有這一段的話，lint 壞掉時會安靜地一直回報「通過」。） */
const probe = {
  strong: { id: '_a', type: 'unit', cls: 'neutral', cost: 2, atk: 2, hp: 3, kw: [], onPlay: function (s, c) { return 1; } },
  weak: { id: '_b', type: 'unit', cls: 'cirno', cost: 2, atk: 2, hp: 2, kw: [], onPlay: function (s, c) { return 1; } }
};
if (!dominates(probe.strong, probe.weak)) {
  console.log('\n✗ 自我迴歸失敗：連刻意造出來的上位互換都抓不到，這支 lint 是壞的');
  process.exit(1);
}
if (dominates(probe.weak, probe.strong)) {
  console.log('\n✗ 自我迴歸失敗：把較差的那張也判成上位互換');
  process.exit(1);
}
console.log('（自我迴歸測試通過）');
process.exit((hits.length + problems) ? 1 : 0);

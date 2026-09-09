/* 英雄技能「完全上位互換」檢查
   若 A 在每一項收益上都 >= B、每一項代價上都 <= B、血量也不低於 B，
   而且至少有一項嚴格更好，那 B 就沒有任何存在理由 —— 這是設計缺陷，必須擋下來。
   每位英雄的 profile 寫在 js/heroes.js。 */
const g = require('./sources').loadGame();

/* 收益欄位：越大越好 */
const GAIN = ['dmgUnit', 'faceDmg', 'heal', 'draw', 'summon', 'extraAttack', 'buffAtk', 'buffHp'];
/* 代價欄位：越小越好 */
const COST = ['selfDmg', 'sacrifice'];

const LABEL = {
  hp: '血量', dmgUnit: '對角色傷害', faceDmg: '對英雄傷害', heal: '治療', draw: '抽牌',
  summon: '召喚', extraAttack: '再攻擊', buffAtk: '強化攻擊', buffHp: '強化生命',
  selfDmg: '自傷', sacrifice: '獻祭我方角色', scope: '可指定範圍', spCost: '技能費用'
};

function norm(h) {
  const p = Object.assign({}, h.profile);
  // 技能費用先前完全沒被算進來 —— 「同樣效果但更貴」會被判成合法。
  // 紅妖兩包幾乎都是靈 2 所以沒出事，但永夜抄開始出現靈 3 的技能。
  if (h.id) {
    p.spCost = g.heroPowerCost(h.id);
    p.costType = g.heroPowerCostType(h.id);
  } else {
    p.spCost = p.spCost || 0;
    p.costType = p.costType || 'sp';
  }
  if (p.buff) { p.buffAtk = p.buff[0]; p.buffHp = p.buff[1]; delete p.buff; }
  GAIN.concat(COST).forEach(k => { p[k] = p[k] || 0; });
  p.scope = p.scope || 'none';
  p.special = p.special || 'none';
  return p;
}

/* 可指定範圍：any 涵蓋 enemy 與 ally；enemy 與 ally 互不涵蓋 */
function scopeCovers(a, b) {
  if (b === 'none') return true;
  if (a === b) return true;
  return a === 'any';
}

/* a 是否完全取代 b */
function dominates(a, b) {
  if (b.special !== 'none' && b.special !== a.special) return false;  // b 有 a 沒有的獨特效果
  // 花靈力和花血量是兩種資源，不能互比，兩邊都當成無法比較
  if (a.costType !== b.costType) return false;
  if (a.spCost > b.spCost) return false;   // a 比較貴就談不上取代
  if (a.hp < b.hp) return false;
  if (!scopeCovers(a.scope, b.scope)) return false;
  if (!GAIN.every(k => a[k] >= b[k])) return false;
  if (!COST.every(k => a[k] <= b[k])) return false;
  return true;
}

/* 檢查器自身的迴歸測試：舊版蕾米（1傷+回1）確實應該被判定為取代舊版靈夢（1傷） */
(function selfCheck() {
  const oldRemilia = norm({ profile: { hp: 30, dmgUnit: 1, scope: 'any', heal: 1 } });
  const oldReimu = norm({ profile: { hp: 30, dmgUnit: 1, scope: 'any' } });
  if (!dominates(oldRemilia, oldReimu)) {
    console.error('檢查器本身失效：已知的上位互換案例沒有被抓出來');
    process.exit(2);
  }
  if (dominates(oldReimu, oldRemilia)) {
    console.error('檢查器本身失效：反向不該成立');
    process.exit(2);
  }

  // 技能費用：完全一樣的效果，便宜的那個取代貴的；反過來不成立。
  const cheap = norm({ profile: { hp: 30, draw: 1, spCost: 2, costType: 'sp' } });
  const pricey = norm({ profile: { hp: 30, draw: 1, spCost: 3, costType: 'sp' } });
  if (!dominates(cheap, pricey)) {
    console.error('檢查器本身失效：沒有把技能費用算進去');
    process.exit(2);
  }
  if (dominates(pricey, cheap)) {
    console.error('檢查器本身失效：貴的反而被判成取代便宜的');
    process.exit(2);
  }
  // 花血量與花靈力是兩種資源，不能互比
  const byHp = norm({ profile: { hp: 30, draw: 1, spCost: 1, costType: 'hp' } });
  if (dominates(byHp, cheap) || dominates(cheap, byHp)) {
    console.error('檢查器本身失效：把血量費用和靈力費用拿來互比了');
    process.exit(2);
  }
})();

const ids = g.HERO_ORDER;
const problems = [];

for (const A of ids) for (const B of ids) {
  if (A === B) continue;
  const a = norm(g.HEROES[A]), b = norm(g.HEROES[B]);
  if (!dominates(a, b)) continue;

  const better = [];
  if (a.hp > b.hp) better.push(LABEL.hp + ' ' + b.hp + '→' + a.hp);
  GAIN.forEach(k => { if (a[k] > b[k]) better.push(LABEL[k] + ' ' + b[k] + '→' + a[k]); });
  COST.forEach(k => { if (a[k] < b[k]) better.push(LABEL[k] + ' ' + b[k] + '→' + a[k]); });
  if (a.scope !== b.scope) better.push(LABEL.scope + ' ' + b.scope + '→' + a.scope);
  if (!better.length) better.push('完全相同');

  problems.push({ A, B, better });
}

console.log('=== 英雄技能支配關係檢查 ===');
ids.forEach(id => {
  const h = g.HEROES[id], p = norm(h);
  const bits = [];
  GAIN.forEach(k => { if (p[k]) bits.push(LABEL[k] + ' ' + p[k]); });
  COST.forEach(k => { if (p[k]) bits.push('（代價）' + LABEL[k] + ' ' + p[k]); });
  if (p.scope !== 'none') bits.push('範圍 ' + p.scope);
  if (p.special !== 'none') bits.push('特殊 ' + p.special);
  console.log('  ' + h.name.padEnd(12) + ' HP' + p.hp + '  ' + (bits.join('、') || '—'));
});

if (problems.length) {
  console.log('--- 發現完全上位互換 (' + problems.length + ') ---');
  problems.forEach(p => {
    console.log('  ✗ 【' + g.HEROES[p.A].name + '】完全取代【' + g.HEROES[p.B].name + '】：' + p.better.join('、'));
  });
  console.log('  → 請調整技能或血量，讓兩者落在不同軸線上。');
  process.exit(1);
}
console.log('沒有任何英雄被完全取代 ✓');

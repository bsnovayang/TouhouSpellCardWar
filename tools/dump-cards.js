/* 依補充包產生卡表 markdown → docs/卡表-現況.md
   卡片改動後重跑 `npm run cards` 就會同步。 */
const fs = require('fs'), path = require('path');
const g = require('./sources').loadGame();

const TYPE = { unit: '角色', spell: '符卡', ward: '結界', field: '場地', bgm: 'BGM' };
const ORDER = ['基', '紅', '妖', '永'];
const out = [];

out.push('# 卡表・現況');
out.push('');
out.push('> 由 `npm run cards` 自動產生，請勿手改。設計規劃見 [卡表-規劃.md](卡表-規劃.md)。');
out.push('');

const all = Object.keys(g.CARDS);
const total = all.length;
const bySet = {};
all.forEach(id => {
  const k = g.setOf(g.CARDS[id]);
  (bySet[k] = bySet[k] || []).push(id);
});

out.push('## 總覽');
out.push('');
out.push('| 補充包 | 卡數 | 角色 | 符卡 | 結界 | 場地 | BGM | 英雄 |');
out.push('|---|---|---|---|---|---|---|---|');
ORDER.forEach(k => {
  const ids = bySet[k] || [];
  const t = {};
  ids.forEach(id => { const d = g.CARDS[id]; t[d.type] = (t[d.type] || 0) + 1; });
  const heroes = g.HERO_ORDER.filter(h =>
    ids.some(id => g.CARDS[id].cls === h)).map(h => g.HEROES[h].name);
  out.push('| ' + (g.SET_NAMES[k] || k) + ' | ' + ids.length + ' | ' +
    (t.unit || 0) + ' | ' + (t.spell || 0) + ' | ' + (t.ward || 0) + ' | ' +
    (t.field || 0) + ' | ' + (t.bgm || 0) + ' | ' +
    (heroes.length ? heroes.length + '（' + heroes.join('、') + '）' : '—') + ' |');
});
out.push('| **合計** | **' + total + '** | | | | | | **' + g.HERO_ORDER.length + '** |');
out.push('');

function row(id) {
  const d = g.CARDS[id];
  const stats = d.type === 'unit' ? d.atk + '/' + d.hp : '—';
  const kw = (d.kw || []).join(' ') || '—';
  const tribe = (d.tribe || []).join('／') || '—';
  const flags = [];
  if (d.token) flags.push('衍生');
  if (d.unique) flags.push('專屬');
  if (d.set && d.set !== d.src) flags.push('出處:' + (g.SRC_FULL[d.src] || d.src));
  return '| ' + d.cost + ' | ' + d.name + ' | ' + TYPE[d.type] + ' | ' + stats + ' | ' +
    tribe + ' | ' + kw + ' | ' + (d.text || '').replace(/\|/g, '\\|') +
    (flags.length ? ' `' + flags.join(' ') + '`' : '') + ' |';
}
const HEAD = '| 費 | 名稱 | 種類 | 攻/生 | 族群 | 關鍵字 | 效果 |\n|---|---|---|---|---|---|---|';

ORDER.forEach(k => {
  const ids = (bySet[k] || []).slice().sort((a, b) =>
    g.CARDS[a].cost - g.CARDS[b].cost || g.CARDS[a].name.localeCompare(g.CARDS[b].name));
  if (!ids.length) return;
  out.push('---');
  out.push('');
  out.push('## ' + (g.SET_NAMES[k] || k) + '（' + ids.length + ' 張）');
  out.push('');

  const neutral = ids.filter(id => g.CARDS[id].cls === 'neutral');
  if (neutral.length) {
    out.push('### 中立（' + neutral.length + '）');
    out.push('');
    out.push(HEAD);
    neutral.forEach(id => out.push(row(id)));
    out.push('');
  }
  g.HERO_ORDER.forEach(h => {
    const mine = ids.filter(id => g.CARDS[id].cls === h);
    if (!mine.length) return;
    const hero = g.HEROES[h];
    out.push('### ' + hero.name + '「' + (g.BUILD_NAMES[h] || '—') + '』（' + mine.length + '）');
    out.push('');
    out.push('技能：**' + hero.power + '**（' + g.HERO_POWER_COST + '）' + hero.powerText + '　血量 ' + hero.hp);
    out.push('');
    out.push(HEAD);
    mine.forEach(id => out.push(row(id)));
    out.push('');
  });
});

const file = path.join(g.ROOT || path.join(__dirname, '..'), 'docs', '卡表-現況.md');
fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log('已寫入 docs/卡表-現況.md（' + total + ' 張，' + ORDER.length + ' 包）');

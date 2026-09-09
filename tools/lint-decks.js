/* 預設牌組檢查：卡片存在、剛好 40 張、不超過同名上限、只放中立與自己的職業卡。
   順便印出每副牌組的職業／中立比與費用曲線，方便肉眼確認流派感。 */
const g = require('./sources').loadGame();

let bad = 0;
console.log('=== 預設牌組檢查 ===');

g.HERO_ORDER.forEach(h => {
  const hero = g.HEROES[h];
  const entry = g.PRESET_DECKS[h] || {};
  const entries = entry.cards || [];
  const errs = [];
  const warns = [];
  const cnt = {};
  let total = 0;

  entries.forEach(([id, n]) => {
    const d = g.CARDS[id];
    if (!d) { errs.push('卡片不存在：' + id); return; }
    if (d.token) errs.push('衍生物不可放入牌組：' + d.name);
    if (d.cls !== 'neutral' && d.cls !== h) errs.push('「' + d.name + '」不屬於此英雄（' + d.cls + '）');
    cnt[id] = (cnt[id] || 0) + n;
    total += n;
  });
  Object.keys(cnt).forEach(id => {
    if (cnt[id] > g.MAX_COPIES) errs.push('「' + g.CARDS[id].name + '」放了 ' + cnt[id] + ' 張，超過 ' + g.MAX_COPIES);
  });
  // 沒有手寫牌表的英雄會走自動補牌 —— 那是合法的，只是還沒設計專屬牌組
  const handwritten = entries.length > 0;
  if (handwritten && total !== g.DECK_SIZE) errs.push('主牌組共 ' + total + ' 張，應為 ' + g.DECK_SIZE);
  const bgm = entry.bgm;
  if (bgm && (!g.CARDS[bgm] || g.CARDS[bgm].type !== 'bgm')) errs.push('BGM 欄不是 BGM 卡：' + bgm);
  if (entries.some(([id]) => g.CARDS[id] && g.CARDS[id].type === 'bgm')) errs.push('BGM 卡不該出現在主牌組');
  if (handwritten && !bgm) warns.push('沒有設定 BGM 欄');
  if (!handwritten) warns.push('尚無專屬牌表，使用自動補牌');
  const usedBgm = g.presetBgm(h);
  if (!bgm && usedBgm) warns.push('借用「' + g.CARDS[usedBgm].name + '」當 BGM（尚無專屬主題曲）');
  if (g.presetDeck(h).some(id => g.CARDS[id].type === 'bgm')) errs.push('主牌組混進了 BGM 卡');

  // 實際產生的牌組（會經過 autoFill 兜底）也要合法
  const built = g.presetDeck(h);
  if (built.length !== g.DECK_SIZE) errs.push('presetDeck() 產出 ' + built.length + ' 張');

  let cls = 0, neu = 0;
  const curve = [0, 0, 0, 0, 0, 0, 0, 0];
  built.forEach(id => {
    const d = g.CARDS[id];
    (d.cls === 'neutral' ? (neu++) : (cls++));
    curve[Math.min(7, d.cost)]++;
  });

  const label = (g.BUILD_NAMES[h] || '—');
  console.log('  ' + hero.name.padEnd(12) + '「' + label + '」 職業 ' + String(cls).padStart(2) +
    ' / 中立 ' + String(neu).padStart(2) + '　♪ ' + (usedBgm ? g.CARDS[usedBgm].name : '（無）'));
  warns.forEach(w => console.log('     · ' + w));
  if (errs.length) { bad++; errs.forEach(e => console.log('     ✗ ' + e)); }
});

if (bad) { console.log('--- ' + bad + ' 副牌組有問題 ---'); process.exit(1); }
console.log('所有預設牌組合法 ✓');

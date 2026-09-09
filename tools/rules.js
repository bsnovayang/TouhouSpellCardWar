/* 引擎規則的回歸測試：直接擺盤面、呼叫引擎函式、檢查結果。
   跟 selftest 不同 —— 那個是統計，這個是「這條規則到底對不對」。 */
const g = require('./sources').loadGame();

let fail = 0;
function check(name, got, want) {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + '　得到「' + got + '」' + (ok ? '' : '，應為「' + want + '」'));
}

function fresh() {
  const s = g.newGame({
    seed: 11,
    p0: { heroId: 'reimu', deck: g.presetDeck('reimu'), bgm: null },
    p1: { heroId: 'yukari', deck: g.presetDeck('yukari'), bgm: null },
    firstPlayer: 0
  });
  g.doMulligan(s, 0, []); g.doMulligan(s, 1, []);
  s.players[0].sp = s.players[0].spMax = 10;
  s.players[1].sp = s.players[1].spMax = 10;
  return s;
}
const board = (s, pi) => g.unitsOf(s, pi).map(u => g.CARDS[u.defId].name).join('、') || '（空）';

/* ============================================================
   破壞 vs 神隱
   破壞 → 進墓地、觸發「死去」、可被回收
   神隱 → 什麼都不留下
   ============================================================ */
console.log('破壞與神隱的差別');
{
  // 破壞不死的妹紅 → 她會原樣回來
  let s = fresh();
  let m = g.summon(s, 1, 'n_mokou_immortal', {}); g.recalc(s);
  g.destroyUnit(s, m); g.cleanupDeaths(s);
  check('破壞不死妹紅 → 她回來了', board(s, 1), '藤原妹紅（不死）');
  check('　　　　　　　→ 有進墓地', s.players[1].grave.length, 1);

  // 神隱 → 場上清空，墓地與 fallen 都不增加
  s = fresh();
  m = g.summon(s, 1, 'n_mokou_immortal', {}); g.recalc(s);
  g.banishUnit(s, m); g.cleanupDeaths(s);
  check('神隱不死妹紅 → 場上清空', board(s, 1), '（空）');
  check('　　　　　　　→ 沒進墓地', s.players[1].grave.length, 0);
  check('　　　　　　　→ 沒進 fallen', s.players[1].fallen.length, 0);

  // 封印也擋得住 —— cleanupDeaths 是 if (d.onDeath && !u.silenced)
  s = fresh();
  m = g.summon(s, 1, 'n_mokou_immortal', {}); g.recalc(s);
  g.silence(s, m); g.destroyUnit(s, m); g.cleanupDeaths(s);
  check('封印後破壞 → 不會復活', board(s, 1), '（空）');
  check('　　　　　 → 但仍進墓地', s.players[1].grave.length, 1);

  // 反覆破壞不能把引擎打進無限迴圈
  s = fresh();
  g.summon(s, 1, 'n_mokou_immortal', {}); g.recalc(s);
  for (let i = 0; i < 5; i++) {
    const cur = g.unitsOf(s, 1)[0];
    if (cur) { g.destroyUnit(s, cur); g.cleanupDeaths(s); }
  }
  check('連破 5 次 → 她還在（且沒卡死）', board(s, 1), '藤原妹紅（不死）');

  // 神隱不觸發任何「死去」效果
  s = fresh();
  let p = g.summon(s, 1, 'n_mokou', {}); g.recalc(s);   // 死去：召喚不死鳥
  g.destroyUnit(s, p); g.cleanupDeaths(s);
  check('破壞中階妹紅 → 死去有發動', board(s, 1), '不死鳥');
  s = fresh();
  p = g.summon(s, 1, 'n_mokou', {}); g.recalc(s);
  g.banishUnit(s, p); g.cleanupDeaths(s);
  check('神隱中階妹紅 → 死去沒發動', board(s, 1), '（空）');

  // 被神隱的不會進 fallen，反魂蝶撈不到
  s = fresh();
  const a = g.summon(s, 1, 'n_ran', {}), b = g.summon(s, 1, 'n_chen', {}); g.recalc(s);
  g.destroyUnit(s, a); g.banishUnit(s, b); g.cleanupDeaths(s);
  check('一破壞一神隱 → fallen 只留被破壞的',
    s.players[1].fallen.map(i => g.CARDS[i].name).join('、'), '八雲藍');
}

/* ---------- 蓬萊的兩位不死者：死去的附帶效果 ---------- */
console.log('蓬萊不死者的死去效果');
{
  // 妹紅：對手每次處理她都要吃 3 點
  let s = fresh();
  let m = g.summon(s, 1, 'n_mokou_immortal', {}); g.recalc(s);
  let hp = s.players[0].hp;
  g.destroyUnit(s, m); g.cleanupDeaths(s);
  check('破壞妹紅 → 敵方英雄受傷', hp - s.players[0].hp, 3);
  check('　　　　 → 她回來了', board(s, 1), '藤原妹紅（不死）');

  // 輝夜：對手每次處理她都在幫你回血
  s = fresh();
  let k = g.summon(s, 1, 'n_kaguya_immortal', {}); g.recalc(s);
  s.players[1].hp = 20;
  g.destroyUnit(s, k); g.cleanupDeaths(s);
  check('破壞輝夜 → 她的主人回血', s.players[1].hp, 23);
  check('　　　　 → 她回來了', board(s, 1), '蓬萊山輝夜（不死）');

  // 回血不會超過上限
  s = fresh();
  k = g.summon(s, 1, 'n_kaguya_immortal', {}); g.recalc(s);
  const mx = s.players[1].maxHp;
  s.players[1].hp = mx;
  g.destroyUnit(s, k); g.cleanupDeaths(s);
  check('滿血時破壞輝夜 → 不會超過上限', s.players[1].hp, mx);

  // 神隱連附帶效果一起擋掉
  s = fresh();
  m = g.summon(s, 1, 'n_mokou_immortal', {}); g.recalc(s);
  hp = s.players[0].hp;
  g.banishUnit(s, m); g.cleanupDeaths(s);
  check('神隱妹紅 → 傷害也不會發動', hp - s.players[0].hp, 0);

  // 封印同理
  s = fresh();
  m = g.summon(s, 1, 'n_mokou_immortal', {}); g.recalc(s);
  hp = s.players[0].hp;
  g.silence(s, m); g.destroyUnit(s, m); g.cleanupDeaths(s);
  check('封印後破壞妹紅 → 傷害也不會發動', hp - s.players[0].hp, 0);

  // 全體破壞對她們是反效果
  s = fresh();
  g.summon(s, 1, 'n_mokou_immortal', {}); g.summon(s, 1, 'n_kaguya_immortal', {});
  s.players[1].hp = 20; g.recalc(s);
  hp = s.players[0].hp;
  g.unitsOf(s, 1).forEach(u => g.destroyUnit(s, u));
  g.cleanupDeaths(s);
  check('全體破壞 → 兩個都回來', g.unitsOf(s, 1).length, 2);
  check('　　　　 → 對手還吃了 3 傷', hp - s.players[0].hp, 3);
  check('　　　　 → 主人還回了 3 血', s.players[1].hp, 23);
}

/* ---------- 神隱卡實際打得出來 ---------- */
console.log('神隱符卡');
{
  [['n_sp_kamikakushi', '神隱'], ['k_kamikakushi', '神隱之主犯']].forEach(([id, nm]) => {
    const s = fresh();
    const m = g.summon(s, 1, 'n_mokou_immortal', {}); g.recalc(s);
    s.players[0].hand.push(g.makeCard(id));
    const c = s.players[0].hand[s.players[0].hand.length - 1];
    const err = g.playCard(s, 0, c.uid, { t: 'unit', uid: m.uid });
    check('「' + nm + '」打出後對手場上', err ? '失敗:' + err : board(s, 1), '（空）');
  });
  // 主犯對 5 費以上會多抽一張
  const s = fresh();
  const m = g.summon(s, 1, 'n_mokou_immortal', {}); g.recalc(s);   // 8 費
  const before = s.players[0].hand.length;
  s.players[0].hand.push(g.makeCard('k_kamikakushi'));
  const c = s.players[0].hand[s.players[0].hand.length - 1];
  g.playCard(s, 0, c.uid, { t: 'unit', uid: m.uid });
  check('主犯神隱 8 費目標 → 有補抽', s.players[0].hand.length, before + 1);
}

/* ---------- 慧音：代價前置，一個人打出來也不虧 ---------- */
console.log('上白澤慧音的登場');
{
  const A = u => g.atkOf(u) + '/' + g.hpOf(u);
  function play(s) {
    s.players[0].hand.push(g.makeCard('n_keine'));
    const c = s.players[0].hand[s.players[0].hand.length - 1];
    g.playCard(s, 0, c.uid, null);
    g.recalc(s);
    return g.unitsOf(s, 0).find(u => u.defId === 'n_keine');
  }

  // 一個人打出來 = 3/5，跟她原本的數值一樣，所以永遠不會變成爛卡
  let s = fresh();
  check('單獨打出 → 等同原本的 3/5', A(play(s)), '3/5');

  // 妹紅在場：兩個都長大
  s = fresh();
  const m = g.summon(s, 0, 'n_mokou', {}); g.recalc(s);
  const k = play(s);
  check('妹紅在場 → 妹紅也 +1/+1', A(m), '5/5');
  check('　　　　 → 慧音自己也吃得到', A(k), '3/5');

  // 非人類不吃
  s = fresh();
  const f = g.summon(s, 0, 'n_fairy', {}); g.recalc(s);
  play(s);
  check('妖精不吃「人類」加成', A(f), '1/2');
}

/* ---------- 幽幽子的獻祭流派不能被這次改動弄壞 ---------- */
console.log('獻祭仍然進墓地（亡者輪迴沒壞）');
{
  const s = fresh();
  const y = g.summon(s, 0, 'n_ghost', {}); g.recalc(s);
  g.destroyUnit(s, y); g.cleanupDeaths(s);
  check('我方角色被破壞 → 進 fallen 可被反魂蝶撈回',
    s.players[0].fallen.map(i => g.CARDS[i].name).join('、'), '亡靈');
}

/* ---------- 英雄形態：通用機制，莉莉白是第一個用的 ---------- */
console.log('英雄形態切換');
{
  const s = g.newGame({
    seed: 5,
    p0: { heroId: 'lily', deck: g.presetDeck('lily'), bgm: null },
    p1: { heroId: 'reimu', deck: g.presetDeck('reimu'), bgm: null },
    firstPlayer: 0
  });
  g.doMulligan(s, 0, []); g.doMulligan(s, 1, []);
  const mine = g.summon(s, 0, 'n_fairy', {});          // 1/2
  const foeU = g.summon(s, 1, 'n_meiling', {});        // 2/5
  g.recalc(s);

  check('起始形態', g.heroFormOf('lily', s, 0).name, '莉莉白');

  s.players[0].sp = 10; s.players[0].heroPowerUsed = false;
  g.useHeroPower(s, 0, null);
  check('白之技能 → 我方角色生命 +2', g.hpOf(mine), 4);
  check('用完後轉為', g.heroFormOf('lily', s, 0).name, '莉莉黑');

  s.players[0].sp = 10; s.players[0].heroPowerUsed = false;
  g.useHeroPower(s, 0, null);
  check('黑之技能 → 敵方角色受 2 傷', g.hpOf(foeU), 3);
  check('再用完後轉回', g.heroFormOf('lily', s, 0).name, '莉莉白');

  // 沒有對局狀態時（牌組編輯、英雄選擇）一律顯示第一形態
  check('無狀態時顯示第一形態', g.heroFormOf('lily').name, '莉莉白');
  check('無形態的英雄不受影響', g.heroFormOf('reimu').power, '夢想封印');

  // 形態存在玩家狀態上，所以存檔與 AI 模擬都會帶著走
  const clone = g.cloneState(s);
  check('形態會跟著 cloneState 複製',
    clone.players[0].heroForm, s.players[0].heroForm);
}

/* ---------- 人妖組：永夜抄的新系統 ---------- */
console.log('人妖組（官方四組）');
{
  const A = u => g.atkOf(u) + '/' + g.hpOf(u);
  const PAIRS = [
    ['c_reimu', 'c_yukari', '幻想結界組'],
    ['c_marisa', 'c_alice', '禁咒詠唱組'],
    ['c_sakuya', 'c_remilia', '夢幻紅魔組'],
    ['c_youmu', 'c_yuyuko', '幽冥住人組']
  ];
  PAIRS.forEach(([a, b, nm]) => {
    const s = fresh();
    const ua = g.summon(s, 0, a, {}); g.recalc(s);
    const solo = A(ua);
    g.summon(s, 0, b, {}); g.recalc(s);
    check(nm + ' 湊齊後有變化', A(ua) !== solo || g.CARDS[a].onAllySpell != null, true);
  });

  // 搭檔被封印就不算數 —— 封印的定義是「卡面文字全部失效」
  const s = fresh();
  const r = g.summon(s, 0, 'c_reimu', {});
  const y = g.summon(s, 0, 'c_yukari', {}); g.recalc(s);
  check('湊齊時靈夢', A(r), '5/6');
  g.silence(s, y); g.recalc(s);
  check('搭檔被封印後靈夢回到基礎值', A(r), '4/5');

  // 只有一張時不該有任何加成
  const s2 = fresh();
  const solo = g.summon(s2, 0, 'c_sakuya', {}); g.recalc(s2);
  check('單獨一張沒有加成', A(solo), '4/4');

  // 妖夢：回合結束打臉
  const s3 = fresh();
  g.summon(s3, 0, 'c_youmu', {}); g.summon(s3, 0, 'c_yuyuko', {}); g.recalc(s3);
  const before = s3.players[1].hp;
  g.endTurn(s3);
  check('幽冥住人組 回合結束對敵方英雄 2 傷', before - s3.players[1].hp, 2);

  check('「人妖組」有進關鍵字辭典', !!g.KEYWORDS['人妖組'], true);
}

/* ---------- 用詞一致性 ---------- */
console.log('用詞');
{
  const bad = Object.keys(g.CARDS).filter(i => (g.CARDS[i].text || '').indexOf('消滅') >= 0);
  check('沒有卡片還寫著「消滅」（爐石繁中的用詞）', bad.length, 0);
  check('「破壞」有進關鍵字辭典', !!g.KEYWORDS['破壞'], true);
  check('「神隱」有進關鍵字辭典', !!g.KEYWORDS['神隱'], true);
}

console.log(fail ? '\n' + fail + ' 項不符預期' : '\n引擎規則測試通過 ✓');
process.exit(fail ? 1 : 0);

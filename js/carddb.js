/* ============================================================
   東方符卡大戰 — 卡表基礎設施
   所有卡片檔（js/cards/*.js）都靠這裡的 C() 註冊到 CARDS。
   載入順序：engine.js → carddb.js → heroes.js → cards/*.js → decks.js
   ============================================================ */
'use strict';

/* 指定目標的規格：side 指陣營、kind 指可否指定英雄 */
var T = {
  eUnit: { side: 'enemy', kind: 'unit' },   // 敵方角色
  aUnit: { side: 'ally', kind: 'unit' },   // 我方角色
  anyUnit: { side: 'any', kind: 'unit' },   // 任一角色
  anyChar: { side: 'any', kind: 'char' },   // 任一角色或英雄
  eChar: { side: 'enemy', kind: 'char' }    // 敵方角色或英雄
};

var CARDS = {};

/* 註冊一張卡。欄位：
   id / name / src(紅妖永通) / cls(neutral 或英雄 id) / type(unit|spell|ward|field)
   cost / atk / hp / kw[] / text / token
   時機：onPlay onDeath onTurnStart onTurnEnd onDamaged onAllySpell onAllyDeath
        onAllySummon(s, owner, unit) — 我方召喚角色時（依作品發放增益的結界用）
        onHeroHurt(s, owner, n)      — 我方英雄受到傷害時
   持續：aura(結界場地) unitAura(角色) costMod dmgReduce spellDmg grantKw
   其他：barrier(起始森羅結界層數) pair(人妖組搭檔 id) unique(牌組限 1 張)

   依作品觸發：用 srcOf(unit) 取得角色出自哪一作（'紅' '妖' '永' '通'）。
   注意 src 是「原作出處」，set 是「收錄補充包」，兩者可能不同。 */
/* 卡片定義的守門人。
   原本這裡只有一行 CARDS[o.id] = o —— 完全沒有檢查，代價是：
     · id 打重複會「靜默覆蓋」，前一張卡直接消失，不會有任何錯誤
     · 欄位名打錯（tribes / kws）會被安靜忽略，卡片行為就是不對
     · 族群或關鍵字打錯字永遠比對不到，一樣沒有訊息
   卡池要長到 380 張，這些都只會愈來愈難用眼睛看出來。

   問題收進 CARD_PROBLEMS 而不是直接 throw：一張卡寫壞不該讓整個遊戲開不起來，
   但 npm run lint 會把它列出來並讓測試失敗。 */
var CARD_PROBLEMS = [];

var CARD_FIELDS = {
  id: 1, name: 1, text: 1, cost: 1, type: 1, cls: 1, src: 1, set: 1, atk: 1, hp: 1,
  kw: 1, tribe: 1, works: 1, token: 1, unique: 1, pair: 1, target: 1, barrier: 1,
  tutor: 1, playable: 1, spellDmg: 1, nandai: 1,
  onPlay: 1, onDeath: 1, onTurnStart: 1, onTurnEnd: 1, onDamaged: 1, onAllySpell: 1,
  onAllyDeath: 1, onAllySummon: 1, onHeroHurt: 1, onExtraAttack: 1,
  aura: 1, unitAura: 1, selfAura: 1, costMod: 1, dmgReduce: 1, grantKw: 1
};

var CARD_TYPES = { unit: 1, spell: 1, ward: 1, field: 1, bgm: 1 };

function C(o) {
  function bad(msg) { CARD_PROBLEMS.push((o.name || o.id || '(無名卡)') + '：' + msg); }

  if (!o.id) bad('沒有 id');
  else if (CARDS[o.id]) bad('id「' + o.id + '」重複，蓋掉了「' + CARDS[o.id].name + '」');
  if (!o.name) bad('沒有 name');
  if (!o.text) bad('沒有 text（卡面會是空白）');
  if (o.cost == null) bad('沒有 cost');
  if (!CARD_TYPES[o.type]) bad('type 不合法：' + o.type);
  if (o.type === 'unit' && (o.atk == null || o.hp == null)) bad('是角色卡卻沒有 atk / hp');
  if (o.type !== 'unit' && (o.atk != null || o.hp != null)) bad('不是角色卡卻有 atk / hp');
  if (o.cls !== 'neutral' && !HEROES[o.cls]) bad('cls 不是有效的英雄：' + o.cls);
  if (o.target && !o.onPlay) bad('宣告了 target 卻沒有 onPlay，目標選了也沒作用');

  (o.tribe || []).forEach(function (t) {
    if (TRIBES.indexOf(t) < 0) bad('族群「' + t + '」不在清單裡，永遠比對不到');
  });
  (o.kw || []).forEach(function (k) {
    if (!KEYWORDS[k]) bad('關鍵字「' + k + '」不在辭典裡，不會有 TAG 說明');
  });
  Object.keys(o).forEach(function (f) {
    if (!CARD_FIELDS[f]) bad('欄位「' + f + '」不存在（打錯字的話會被安靜忽略）');
  });

  CARDS[o.id] = o;
  return o;
}

/* 符卡傷害加成（魔法之森等） */
function spellBonus(s, pi) {
  if (pi == null) return 0;
  var b = 0;
  permanentsOf(s, pi).forEach(function (perm) {
    var d = def(perm.defId);
    if (d.spellDmg) b += d.spellDmg;
  });
  return b;
}

/* 某位英雄能放進牌組的卡（中立 + 自己的職業卡，排除衍生物） */
function cardsForHero(heroId) {
  return Object.keys(CARDS).filter(function (id) {
    var d = CARDS[id];
    if (d.token) return false;
    return d.cls === 'neutral' || d.cls === heroId;
  });
}

/* ============================================================
   作品出處 src ／ 收錄補充包 set
   src = 這張卡的原作出處，只影響卡面風味標示
   set = 屬於哪一個補充包，決定收錄範圍與卡表分檔
   判定原則：職業卡跟著英雄走，中立卡跟著原作走。
   set 沒寫時預設等於 src。
   ============================================================ */
var SET_NAMES = { 基: '基本包', 紅: '東方紅魔鄉', 妖: '東方妖妖夢', 永: '東方永夜抄' };
var SRC_FULL = { 紅: '東方紅魔鄉', 妖: '東方妖妖夢', 永: '東方永夜抄', 通: '通用' };

function setOf(d) { return d.set || d.src; }

/* ============================================================
   works ＝ 這個角色「有收錄在哪些作品」（不是出自哪一作）
   靈夢、魔理沙、咲夜三作皆有登場，所以能同時吃到三種作品結界；
   代價是這類角色很少，牌組會很窄。這是組牌階段的取捨。
   沒寫 works 時，預設只登場於自己的 src。
   基本包的泛用雜魚（妖精、亡靈等）刻意設成 works: []，不屬於任何一作 ——
   否則玩家可以用一堆 1 費雜魚吃滿所有作品結界，「牌組角色太少」的代價就被繞過了。
   ============================================================ */
function worksOf(d) { return d.works || [d.src]; }
function appearsIn(d, w) { return worksOf(d).indexOf(w) >= 0; }
/* 角色是否登場於某作（給依作品觸發的結界使用） */
function unitAppearsIn(u, w) { return appearsIn(def(u.defId), w); }
function cardsOfSet(setKey) {
  return Object.keys(CARDS).filter(function (id) { return setOf(CARDS[id]) === setKey; });
}
function cardsOfSrc(src) {
  return Object.keys(CARDS).filter(function (id) { return CARDS[id].src === src; });
}

/* ============================================================
   族群（tribe）
   依原作設定分類，讓卡片能互相連動
   （例如大妖精強化「妖精」、永夜抄的「人妖組」需要人類＋妖怪配對）。
   一張卡可以有多個族群，例如魂魄妖夢是「人類・亡靈」。
   ============================================================ */
var TRIBES = [
  '人類',     // 靈夢、魔理沙、咲夜、慧音、妹紅、妖夢（半人）
  '妖精',     // 琪露諾、大妖精、莉莉白、妖精
  '妖怪',     // 露米婭、蕾迪、米斯蒂婭、莉格露、紫（泛用的妖怪標籤）
  '亡靈',     // 幽幽子、亡靈、幽靈樂團、妖夢的半靈
  '騷靈',     // 露娜薩、梅露蘭、莉莉卡（三人同時在場時互相強化）
  '魔法使',   // 魔理沙、帕秋莉、愛麗絲
  '人偶',     // 上海人偶、蓬萊人形、霍夫曼
  '吸血鬼',   // 蕾米莉亞、芙蘭朵露
  '式神',     // 八雲藍、橙
  '月人',     // 輝夜、永琳、鈴仙
  '惡魔',     // 小惡魔
  '妖獸'      // 橙（化貓）、犬走椛等獸型
];

function tribesOf(d) { return d.tribe || []; }
function hasTribe(d, t) { return tribesOf(d).indexOf(t) >= 0; }
/* 場上某位玩家有幾個指定族群的角色 */
function countTribe(s, pi, t) {
  return unitsOf(s, pi).filter(function (u) { return hasTribe(def(u.defId), t); }).length;
}

/* 牌組合法性檢查。放在這裡而不是 storage.js —— 它是規則不是存檔功能，
   而且伺服器必須用它驗證客戶端送來的牌組（storage.js 依賴 localStorage，
   沒辦法在 Worker 裡跑）。 */
/* ---------- 牌組合法性 ---------- */
function validateDeck(deck) {
  var errs = [];
  if (deck.cards.length !== DECK_SIZE) errs.push('牌組必須剛好 ' + DECK_SIZE + ' 張（目前 ' + deck.cards.length + '）');
  var cnt = {};
  deck.cards.forEach(function (c) { cnt[c] = (cnt[c] || 0) + 1; });
  Object.keys(cnt).forEach(function (c) {
    var d = CARDS[c];
    if (!d) { errs.push('未知的卡片：' + c); return; }
    var cap = d.unique ? 1 : MAX_COPIES;
    if (cnt[c] > cap) {
      errs.push('「' + d.name + '」' + (d.unique ? '是專屬卡，只能放 1 張' : '超過 ' + MAX_COPIES + ' 張'));
    }
    if (d.cls !== 'neutral' && d.cls !== deck.heroId) errs.push('「' + d.name + '」不屬於此英雄');
    if (d.token) errs.push('「' + d.name + '」無法放入牌組');
    if (d.type === 'bgm') errs.push('BGM 卡要放在 BGM 欄，不能放進主牌組');
  });
  // BGM 欄
  if (deck.bgm) {
    var bd = CARDS[deck.bgm];
    if (!bd || bd.type !== 'bgm') errs.push('BGM 欄放了不是 BGM 的卡');
    else if (bd.cls !== 'neutral' && bd.cls !== deck.heroId) errs.push('「' + bd.name + '」不屬於此英雄');
  }
  return errs;
}

/* ============================================================
   東方符卡大戰 — 英雄
   選角以「自機組」為主（紅魔鄉～永夜抄）。

   設計守則：每位英雄的技能必須落在**不同的軸線**上，
   不可以出現「A 的技能在所有情況下都不比 B 差、血量還不低於 B」的完全上位互換。
   每位英雄都帶一份 profile，tools/lint-heroes.js 會自動檢查支配關係，
   改動技能或血量後請跑 `npm run lint`。

   軸線分佈：
     靈夢   封印・解場            魔理沙 符卡引擎
     咲夜   節奏／再攻擊          妖夢   永久強化
     紫     數值轉換              愛麗絲 鋪場防守
     蕾米   移除＋續航            幽幽子 犧牲換牌
   ============================================================ */
'use strict';

var HEROES = {

  reimu: {
    id: 'reimu', set: '紅', name: '博麗靈夢', title: '樂園的美麗巫女', hp: 30, color: '#e05a6d',
    power: '夢想封印', powerText: '封印一個角色',
    target: T.anyUnit,
    use: function (s, c) { if (c.target && c.target.unit) silence(s, c.target.unit); },
    profile: { hp: 30, special: 'seal' }
  },

  marisa: {
    id: 'marisa', set: '紅', name: '霧雨魔理沙', title: '普通的魔法使', hp: 30, color: '#e0c14a',
    power: '星塵幻想', powerText: '抽 1 張，該張卡本回合費用 -1',
    use: function (s, c) {
      var p = s.players[c.pi], before = p.hand.length;
      draw(s, c.pi, 1);
      if (p.hand.length > before) p.hand[p.hand.length - 1].tempCostMod -= 1;
    },
    profile: { hp: 30, draw: 1, special: 'discount' }
  },

  sakuya: {
    id: 'sakuya', set: '紅', name: '十六夜咲夜', title: '完全瀟灑的從者', hp: 28, color: '#7fb8e8',
    power: '時符', powerText: '我方一個角色本回合可再攻擊一次',
    target: T.aUnit,
    use: function (s, c) { if (c.target && c.target.unit) c.target.unit.attacksLeft++; },
    profile: { hp: 28, extraAttack: 1 }
  },

  youmu: {
    id: 'youmu', set: '妖', name: '魂魄妖夢', title: '半人半靈的庭師', hp: 28, color: '#8fd6a8',
    power: '二刀之構', powerText: '我方一個角色 +1/+1；沒有角色時改為召喚一個 1/2「半靈」',
    use: function (s, c) {
      var us = unitsOf(s, c.pi);
      if (!us.length) { summon(s, c.pi, 'y_hansho', {}); return; }
      var best = us[0];
      us.forEach(function (u) {
        var v = atkOf(u) + hpOf(u) + (hasKw(u, '守護') ? 3 : 0);
        var bv = atkOf(best) + hpOf(best) + (hasKw(best, '守護') ? 3 : 0);
        if (v > bv) best = u;
      });
      buffUnit(best, 1, 1);
    },
    profile: { hp: 28, buff: [1, 1], special: 'buff_or_summon' }
  },

  yukari: {
    id: 'yukari', set: '妖', name: '八雲紫', title: '境界的妖怪', hp: 28, color: '#c39ae0',
    power: '境界操作', powerText: '交換一個角色的攻擊力與生命上限',
    target: T.anyUnit,
    use: function (s, c) {
      var u = c.target && c.target.unit; if (!u) return;
      var a = atkOf(u), h = maxHpOf(u);
      u.buffAtk = h - u.baseAtk - (u.auraAtk || 0) - (u.tempAtk || 0);
      u.buffHp = a - u.baseHp - (u.auraHp || 0);
      u.dmg = 0;
    },
    profile: { hp: 28, special: 'swap' }
  },

  alice: {
    id: 'alice', set: '妖', name: '愛麗絲·瑪格特羅依德', title: '七色的人偶使', hp: 28, color: '#f0a6c0',
    power: '人偶製作', powerText: '召喚一個 1/1 守護「上海人偶」',
    use: function (s, c) { summon(s, c.pi, 'n_shanghai', {}); },
    profile: { hp: 28, summon: 1, special: 'summon_taunt' }
  },

  remilia: {
    id: 'remilia', set: '紅', name: '蕾米莉亞·斯卡蕾特', title: '永遠緋紅的幼月', hp: 28, color: '#d1476a',
    power: '吸血', powerText: '對一個敵方角色造成 1 點傷害，我方英雄回復 1',
    target: T.eUnit,
    use: function (s, c) {
      if (!c.target || !c.target.unit) return;
      dmgUnit(s, c.target.unit, 1);
      healHero(s, c.pi, 1);
    },
    profile: { hp: 28, dmgUnit: 1, scope: 'enemy', heal: 1 }
  },

  yuyuko: {
    id: 'yuyuko', set: '妖', name: '西行寺幽幽子', title: '幽冥樓閣的亡靈少女', hp: 30, color: '#b9a7e0',
    power: '亡我', powerText: '破壞我方一個角色，抽 2 張',
    target: T.aUnit,
    use: function (s, c) {
      if (!c.target || !c.target.unit) return;
      destroyUnit(s, c.target.unit);
      cleanupDeaths(s);
      draw(s, c.pi, 2);
    },
    profile: { hp: 30, draw: 2, sacrifice: 1 }
  }
};

var HERO_ORDER = ['reimu', 'marisa', 'sakuya', 'youmu', 'yukari', 'alice', 'remilia', 'yuyuko'];

/* ============================================================
   東方紅魔鄉補完：道中與 BOSS 全員
   技能取自 docs/各作英雄參考.md。費用不再統一是 2 ——
   帕秋莉用血量、芙蘭要 5 靈力，這是刻意的角色差異。
   ============================================================ */

HEROES.rumia = {
  id: 'rumia', set: '紅', name: '露米婭', title: '宵闇的妖怪', hp: 28, color: '#4a4470',
  power: '闇符', powerText: '我方一個角色獲得隱行，並在本回合 +1/+0', target: T.aUnit,
  // 只給隱行的話純粹是防禦，沒有任何節奏 —— 附一點本回合攻擊力，
  // 才對得上「從暗處撲上來」而不是「躲起來不動」。
  use: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    u.stealth = true;
    buffUnit(u, 1, 0, true);
  },
  profile: { hp: 28, buffAtk: 1, special: 'grant_stealth' }
};

HEROES.cirno = {
  id: 'cirno', set: '紅', name: '琪露諾', title: '湖上的冰精', hp: 28, color: '#7fd8f0',
  power: '凍符', powerText: '使一個敵方角色冰結；若它已被冰結，改為使其生命 -1',
  target: T.eUnit,
  use: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    if (isFrozen(u)) { buffUnit(u, 0, -1); logMsg(s, '已被冰結 — 生命 -1'); }
    else freeze(s, u);
  },
  profile: { hp: 28, special: 'freeze' }
};

HEROES.daiyousei = {
  id: 'daiyousei', set: '紅', name: '大妖精', title: '大好きな妖精', hp: 28, color: '#8fd6a8',
  power: '妖精之輪', powerText: '隨機使我方「妖精」角色 +1/+1，共 2 次',
  use: function (s, c) {
    for (var i = 0; i < 2; i++) {
      var pool = unitsOf(s, c.pi).filter(function (u) { return hasTribe(def(u.defId), '妖精'); });
      var t = pick(s, pool);
      if (t) buffUnit(t, 1, 1);
    }
  },
  profile: { hp: 28, buff: [2, 2], special: 'tribe_fairy' }
};

HEROES.meiling = {
  id: 'meiling', set: '紅', name: '紅美鈴', title: '華人小姑娘', hp: 32, color: '#4fb08a',
  power: '氣符', powerText: '我方一個角色獲得守護；若它已有守護，改為生命 +1',
  target: T.aUnit,
  use: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    if (hasKw(u, '守護')) buffUnit(u, 0, 1);
    else addKw(u, '守護');
  },
  profile: { hp: 32, special: 'grant_taunt' }
};

HEROES.koakuma = {
  id: 'koakuma', set: '紅', name: '小惡魔', title: '小小的惡魔', hp: 28, color: '#c0506a',
  power: '蒐集', powerText: '隨機生成一張卡加入手牌，其費用 -2',
  use: function (s, c) {
    // c.pi 是玩家索引，不是英雄 id —— 要拿 heroId 來比，否則永遠只生成中立卡
    var pool = cardsForHero(s.players[c.pi].heroId).filter(function (id) {
      return CARDS[id].type !== 'bgm';
    });
    var id = pick(s, pool);
    if (!id) return;
    var p = s.players[c.pi];
    if (p.hand.length >= HAND_MAX) { logMsg(s, '手牌已滿'); return; }
    var card = makeCard(id);
    card.costMod -= 2;
    p.hand.push(card);
    logMsg(s, '生成了「' + CARDS[id].name + '」（費用 -2）');
  },
  profile: { hp: 28, special: 'generate' }
};

HEROES.patchouli = {
  id: 'patchouli', set: '紅', name: '帕秋莉·諾蕾姬', title: '不動的大圖書館', hp: 26,
  color: '#a98fd0', cost: 2, costType: 'hp',
  power: '知識之代價', powerText: '抽 1 張（代價是血量而不是靈力）',
  use: function (s, c) { draw(s, c.pi, 1); },
  profile: { hp: 26, draw: 1, special: 'hp_cost' }
};

HEROES.flandre = {
  id: 'flandre', set: '紅', name: '芙蘭朵露·斯卡蕾特', title: '惡魔之妹', hp: 26,
  color: '#e0c14a', cost: 5, selfDmg: 2,
  // 無條件破壞是全場最強的效果 —— 量測過關掉技能她只剩 30%，不設代價則到 75%。
  // 代價放在技能而不是卡上，才對得上「破壞連自己一起」的角色設定。
  power: 'きゅっとしてドカーン', powerText: '破壞一個敵方角色、結界或場地',
  target: T.eUnit,
  use: function (s, c) {
    if (c.target && c.target.unit) { destroyUnit(s, c.target.unit); return; }
    var o = s.players[foe(c.pi)];
    if (o.field) { o.grave.push({ defId: o.field.defId }); logMsg(s, '場地被破壞'); o.field = null; return; }
    for (var i = 0; i < o.wards.length; i++) {
      if (o.wards[i]) { o.grave.push({ defId: o.wards[i].defId }); logMsg(s, '結界被破壞'); o.wards[i] = null; return; }
    }
  },
  profile: { hp: 26, selfDmg: 2, special: 'destroy' }
};

HERO_ORDER.push('rumia', 'cirno', 'daiyousei', 'meiling', 'koakuma', 'patchouli', 'flandre');


/* ============================================================
   東方永夜抄（第一位）
   「捨身」這個關鍵字從靈夢移交到妹紅 ——
   靈夢改走封印之後，她沒有每回合都能按的自傷來源了；
   妹紅的「死なない程度の能力」才是捨身真正的歸屬。
   ============================================================ */

HEROES.mokou = {
  id: 'mokou', set: '永', name: '藤原妹紅', title: '蓬萊人形', hp: 32, color: '#d96a4a',
  cost: 0, selfDmg: 2,   // 自傷交給框架處理，技能費用列才會顯示「靈0＋自傷2」
  power: '不死', powerText: '我方英雄受到 2 點傷害，我方一個角色本回合 +2/+0',
  target: T.aUnit,
  use: function (s, c) {
    if (c.target && c.target.unit) buffUnit(c.target.unit, 2, 0, true);
  },
  profile: { hp: 32, buffAtk: 2, selfDmg: 2, special: 'sacrifice_self' }
};

HERO_ORDER.push('mokou');


/* ============================================================
   東方妖妖夢 — 莉莉白
   全場唯一的「形態」英雄：技能用完就黑白互換。
   白之莉莉給我方生命、黑之莉莉給敵方傷害，兩邊都是隨機指定 ——
   期望值不錯，但你控制不了打在誰身上。
   （原作的莉莉黑出自花映塚，不是原創。）
   ============================================================ */

HEROES.lily = {
  id: 'lily', set: '妖', name: '莉莉白', title: '春告精', hp: 30, color: '#e8e2f0',
  forms: [
    {
      name: '莉莉白', color: '#e8e2f0',
      power: '春告', powerText: '隨機一個我方角色 +0/+2，然後轉為莉莉黑',
      use: function (s, c) {
        var t = pick(s, unitsOf(s, c.pi));
        if (t) buffUnit(t, 0, 2); else logMsg(s, '場上沒有角色，春告落空');
      }
    },
    {
      name: '莉莉黑', color: '#5a5068',
      power: '凶兆', powerText: '隨機一個敵方角色受到 2 點傷害，然後轉為莉莉白',
      use: function (s, c) {
        var t = pick(s, unitsOf(s, foe(c.pi)));
        if (t) dmgUnit(s, t, 2); else logMsg(s, '對方沒有角色，凶兆落空');
      }
    }
  ],
  profile: { hp: 30, buffHp: 2, dmgUnit: 2, scope: 'none', special: 'form_toggle' }
};

HERO_ORDER.push('lily');


/* ============================================================
   東方妖妖夢 — 騷靈三姊妹
   你的決定：一位英雄，三張角色卡（不是三位英雄）。

   技能是探尋(3)「騷靈」—— 騷靈族群本來就只有三姊妹，
   所以每次探尋等於「把你缺的那一位補上」，
   這正是「合奏」流派需要的：湊齊三位不同的騷靈才會開花。
   ============================================================ */

HEROES.prismriver = {
  id: 'prismriver', set: '妖', name: '騷靈三姊妹', title: '幻想的樂團', hp: 30, color: '#b08fd0',power: '幻奏', powerText: '探尋(3)：從「騷靈」卡中選 1 張加入手牌',
  use: function (s, c) { discoverTribe(s, c.pi, '騷靈', 3); },
  profile: { hp: 30, draw: 1, special: 'discover_tribe' }
};

HERO_ORDER.push('prismriver');


/* ============================================================
   東方妖妖夢 — 最後三位
   ============================================================ */

/* 蕾迪的參考技能是「冰結；已冰結則攻擊 -2」，
   但那跟琪露諾的「冰結；已冰結則生命 -1」只差一個欄位，
   會變成同一個機制的兩個版本。改成寒氣「擴散」：
     琪露諾 —— 凍住一個，然後把它解決掉（精準點殺）
     蕾迪　 —— 凍住一個，然後讓寒冷蔓延到旁邊（範圍控場）
   兩人都用冰結，但一個往深、一個往廣。 */
HEROES.letty = {
  id: 'letty', set: '妖', name: '蕾迪·懷特洛克', title: '冬之妖怪', hp: 30, color: '#8fb8d8',
  power: '冬來', powerText: '使一個敵方角色冰結；若它已被冰結，改為使其左右相鄰的角色也冰結',
  target: T.eUnit,
  use: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    if (!isFrozen(u)) { freeze(s, u); return; }
    var arr = s.players[u.owner].units;
    var i = arr.indexOf(u);
    var hit = 0;
    [i - 1, i + 1].forEach(function (j) {
      if (j >= 0 && j < SLOTS && arr[j]) { freeze(s, arr[j]); hit++; }
    });
    logMsg(s, hit ? '寒氣蔓延到旁邊 ' + hit + ' 個角色' : '旁邊沒有角色，寒氣無處可去');
  },
  profile: { hp: 30, special: 'freeze_spread' }
};

/* 橙：召喚出來的貓活不過這個回合 —— 純粹的一次性衝擊，
   場面留不下東西，所以她必須在幾個回合內把傷害打完。 */
HEROES.chen = {
  id: 'chen', set: '妖', name: '橙', title: '式神之式神', hp: 28, color: '#e0a060',
  power: '飛翔', powerText: '召喚一個 1/1 且有疾走的「貓」，在你的回合結束時死去',
  use: function (s, c) { summon(s, c.pi, 'ch_neko', {}); },
  profile: { hp: 28, summon: 1, special: 'temp_summon' }
};

/* 八雲藍：不直接影響場面，改成壓縮手牌費用。
   收益慢但持續，是典型會被 1-ply AI 低估的鋪設型技能。 */
HEROES.ran = {
  id: 'ran', set: '妖', name: '八雲藍', title: '賢者的式神', hp: 30, color: '#d8c060',
  power: '式神使役', powerText: '手牌最左與最右的卡各 -1 費',
  use: function (s, c) {
    var h = s.players[c.pi].hand;
    if (!h.length) { logMsg(s, '手牌是空的'); return; }
    h[0].costMod -= 1;
    if (h.length > 1) h[h.length - 1].costMod -= 1;
    logMsg(s, '手牌兩端的卡各降 1 費');
  },
  profile: { hp: 30, special: 'cost_reduce' }
};

HERO_ORDER.push('letty', 'chen', 'ran');


/* ============================================================
   東方永夜抄 — 第二階段（不需要新引擎能力的三位）
   ============================================================ */

/* 慧音：唯一把「森羅結界」當技能發的英雄。
   靈 3 比別人貴，因為每回合白給一層護盾是很硬的續航。 */
HEROES.keine = {
  id: 'keine', set: '永', name: '上白澤慧音', title: '半獸的歷史編纂者', hp: 30, color: '#7fa8d8',
  cost: 3,
  power: '創史', powerText: '我方一個角色 +1/+1 並獲得一層森羅結界',
  target: T.aUnit,
  use: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 1, 1);
    addBarrier(s, u, 1);
  },
  profile: { hp: 30, buff: [1, 1], special: 'grant_barrier' }
};

/* 莉格露：每回合兩隻會飛的小蟲。
   飛行無視守護，所以她的壓迫來自「擋不住」而不是「打得大」。 */
HEROES.wriggle = {
  id: 'wriggle', set: '永', name: '莉格露·奈特巴格', title: '蟲之王', hp: 28, color: '#8fc060',
  power: '蟲群', powerText: '召喚兩隻 1/1 且有飛行的「螢火蟲」',
  use: function (s, c) {
    summon(s, c.pi, 'wr_firefly', {});
    summon(s, c.pi, 'wr_firefly', {});
  },
  profile: { hp: 28, summon: 2, special: 'summon_swarm' }
};

/* 米斯蒂婭：夜盲。
   原本規劃是「無法攻擊且不能被指定」，但「不能被指定」對使用者其實是扣分 ——
   你自己也打不到它。改成純粹的削弱：這回合動不了，而且永久變弱一點。 */
HEROES.mystia = {
  id: 'mystia', set: '永', name: '米斯蒂婭·蘿蕾拉', title: '夜雀', hp: 28, color: '#d88fb0',
  power: '夜盲', powerText: '使一個敵方角色本回合無法攻擊，且其攻擊力永久 -1',
  target: T.eUnit,
  use: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    u.cantAttack = true;
    buffUnit(u, -1, 0);
  },
  profile: { hp: 28, special: 'nightblind' }
};

HERO_ORDER.push('keine', 'wriggle', 'mystia');

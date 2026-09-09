/* ============================================================
   東方符卡大戰 — 遊戲引擎
   規則：不碰 DOM。整局 = 一個可序列化的 state 物件。
   ============================================================ */
'use strict';

/* 規則數值全部定義在 js/config.js */

/* ---------- 工具 ---------- */
function foe(pi) { return 1 - pi; }
function def(id) { return CARDS[id]; }
function rngInt(s, n) { // 可重現亂數 (mulberry32)
  s.seed |= 0; s.seed = (s.seed + 0x6D2B79F5) | 0;
  var t = Math.imul(s.seed ^ (s.seed >>> 15), 1 | s.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296 * n) | 0;
}
function pick(s, arr) { return arr.length ? arr[rngInt(s, arr.length)] : null; }
function shuffle(s, arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = rngInt(s, i + 1);
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/* ---------- 建立 ---------- */
var _uid = 1;
function bumpUid(n) { if (n > _uid) _uid = n; }
function makeCard(defId) {
  var d = def(defId);
  return {
    uid: _uid++, defId: defId, type: d.type,
    costMod: 0,          // 永久費用調整（如魔理沙技能）
    tempCostMod: 0       // 本回合費用調整
  };
}

function makePlayer(pi, heroId, decklist, bgmId) {
  var h = HEROES[heroId];
  var deck = [];
  decklist.forEach(function (id) { deck.push(makeCard(id)); });
  return {
    idx: pi, heroId: heroId,
    hp: h.hp, maxHp: h.hp,
    sp: 0, spMax: 0,
    deck: deck, hand: [], grave: [], heroForm: 0,
    units: new Array(SLOTS).fill(null),
    wards: new Array(WARD_SLOTS).fill(null),
    field: null,
    heroPowerUsed: false,
    fatigue: 0,
    hurtThisTurn: false,    // 捨身：本回合我方英雄是否受過傷害
    spellsThisTurn: 0,      // 連奏：本回合已發動的符卡數
    deathsThisTurn: 0,      // 本回合我方死去的角色數
    fallen: [],             // 本局死去過的角色（非衍生物），供「反魂蝶」取用
    goSen: [],            // 後之先：待觸發的靈力上限節點
    turnsTaken: 0,
    bgmCard: bgmId ? makeCard(bgmId) : null,  // BGM 欄（獨立於主牌組，不會被抽到）
    bgmLock: 0            // 還有幾個自己的回合不能發動 BGM
  };
}

function newGame(cfg) {
  var s = {
    seed: cfg.seed || (Math.random() * 1e9) | 0,
    turn: 0,
    active: 0,
    first: 0,
    winner: null,
    log: [],
    phase: 'mulligan',
    players: [
      makePlayer(0, cfg.p0.heroId, cfg.p0.deck, cfg.p0.bgm),
      makePlayer(1, cfg.p1.heroId, cfg.p1.deck, cfg.p1.bgm)
    ],
    bgm: null,          // 全場唯一的 BGM 播放器 {defId, owner}
    pendingChoice: null,   // 探尋中：{ pi, options:[defId], label }。有值時遊戲暫停等待選擇
    pendingMulligan: [true, true]
  };
  shuffle(s, s.players[0].deck);
  shuffle(s, s.players[1].deck);

  // 先後手補償
  s.first = cfg.firstPlayer != null ? cfg.firstPlayer : rngInt(s, 2);
  var f = s.players[s.first], b = s.players[foe(s.first)];
  b.goSen = SECOND_GOSEN.slice();
  b.maxHp += SECOND_EXTRA_HP; b.hp += SECOND_EXTRA_HP;

  drawRaw(s, f, START_HAND);
  drawRaw(s, b, START_HAND + SECOND_EXTRA_CARDS);
  logMsg(s, '【' + HEROES[f.heroId].name + '】先手（優勢來自行動順序：前兩回合每一步都領先）');
  logMsg(s, '【' + HEROES[b.heroId].name + '】後手（起手+' + SECOND_EXTRA_CARDS +
    '張／血量+' + SECOND_EXTRA_HP + '／後之先：靈力上限達 ' + SECOND_GOSEN.join('・') + ' 時各抽1）');
  return s;
}

/* 起手不觸發疲勞 */
function drawRaw(s, p, n) {
  for (var i = 0; i < n; i++) {
    if (!p.deck.length) break;
    p.hand.push(p.deck.pop());
  }
}

/* ---------- 調度（mulligan） ---------- */
function doMulligan(s, pi, uids) {
  var p = s.players[pi];
  if (!s.pendingMulligan[pi]) return;
  var back = [];
  p.hand = p.hand.filter(function (c) {
    if (uids.indexOf(c.uid) >= 0) { back.push(c); return false; }
    return true;
  });
  drawRaw(s, p, back.length);
  back.forEach(function (c) { p.deck.push(c); });
  shuffle(s, p.deck);
  s.pendingMulligan[pi] = false;
  if (!s.pendingMulligan[0] && !s.pendingMulligan[1]) startGame(s);
}

function startGame(s) {
  s.phase = 'play';
  s.turn = 0;
  s.active = foe(s.first); // beginTurn 會切回
  beginTurn(s);
}

/* ---------- 回合 ---------- */
function beginTurn(s) {
  if (s.winner != null) return;
  s.active = foe(s.active);
  s.turn++;
  var p = s.players[s.active];
  p.turnsTaken++;

  if (p.spMax < SP_MAX) {
    p.spMax++;
    // 後之先
    while (p.goSen.length && p.goSen[0] <= p.spMax) {
      p.goSen.shift();
      logMsg(s, '『後之先』發動 — 抽 1 張');
      draw(s, p.idx, 1);
    }
  }
  p.sp = p.spMax;
  p.heroPowerUsed = false;
  p.hurtThisTurn = false;                       // 捨身
  p.spellsLastTurn = p.spellsThisTurn || 0;     // 給「霧雨魔法店」查詢
  p.spellsThisTurn = 0;                         // 連奏
  p.deathsThisTurn = 0;      // 「本回合有我方角色死去」

  // 角色重置
  unitsOf(s, p.idx).forEach(function (u) {
    u.summoned = false;
    u.attacksMade = 0;       // 追擊
    u.attacksLeft = 1 + (u.extraAttackPerTurn || 0) + (hasKw(u, '連舞') ? 1 : 0);
    u.cantAttack = false;
  });

  // 場地／結界 回合開始
  eachPermanent(s, p.idx, function (card, d) {
    if (d.onTurnStart) d.onTurnStart(s, p.idx, card);
  });
  eachUnitTrigger(s, p.idx, 'onTurnStart');

  draw(s, p.idx, 1);

  // BGM 欄的卡在指定回合自動進手（獨立於主牌組，所以不會起手就抽到）
  if (p.turnsTaken === BGM_AUTO_TURN) {
    if (p.bgmCard) {
      if (p.hand.length < HAND_MAX) {
        p.hand.push(p.bgmCard);
        logMsg(s, '♪ 第 ' + BGM_AUTO_TURN + ' 回合 — BGM 欄的「' + def(p.bgmCard.defId).name + '」進入手牌');
      } else {
        p.grave.push({ defId: p.bgmCard.defId });
        logMsg(s, '手牌已滿，BGM 卡被燒毀');
      }
      p.bgmCard = null;
    } else {
      logMsg(s, '第 ' + BGM_AUTO_TURN + ' 回合 — BGM 欄是空的');
    }
  }

  recalc(s);
  checkWin(s);
}

function endTurn(s) {
  if (s.winner != null) return;
  if (s.pendingChoice) return '請先完成探尋';
  var p = s.players[s.active];

  eachPermanent(s, p.idx, function (card, d) {
    if (d.onTurnEnd) d.onTurnEnd(s, p.idx, card);
  });
  eachUnitTrigger(s, p.idx, 'onTurnEnd');
  cleanupDeaths(s);

  if (p.bgmLock > 0) p.bgmLock--;   // BGM 鎖定倒數（回合結束才扣，N 就是實際被擋的回合數）
  unitsOf(s, p.idx).forEach(function (u) { if (u.frozen > 0) u.frozen--; });   // 冰結解除

  // 清除本回合暫時效果
  [0, 1].forEach(function (i) {
    unitsOf(s, i).forEach(function (u) { u.tempAtk = 0; u.cantAttack = false; u.kwTemp = []; });
    s.players[i].hand.forEach(function (c) { c.tempCostMod = 0; });
  });

  recalc(s);
  checkWin(s);
  if (s.winner == null) beginTurn(s);
}

function eachUnitTrigger(s, pi, hook) {
  unitsOf(s, pi).slice().forEach(function (u) {
    if (u.silenced) return;
    var d = def(u.defId);
    if (d[hook]) d[hook](s, u);
  });
  cleanupDeaths(s);
}

function eachPermanent(s, pi, fn) {
  var p = s.players[pi];
  p.wards.forEach(function (w) { if (w) fn(w, def(w.defId)); });
  if (p.field) fn(p.field, def(p.field.defId));
  if (s.bgm && s.bgm.owner === pi) fn(s.bgm, def(s.bgm.defId));
}
/* 某位玩家目前的持續效果來源（結界 + 場地 + 自己的 BGM） */
function permanentsOf(s, pi) {
  var p = s.players[pi];
  var list = p.wards.filter(Boolean);
  if (p.field) list.push(p.field);
  if (s.bgm && s.bgm.owner === pi) list.push(s.bgm);
  return list;
}

/* ---------- 抽牌 ---------- */
function draw(s, pi, n) {
  var p = s.players[pi];
  for (var i = 0; i < n; i++) {
    if (!p.deck.length) {
      p.fatigue++;
      logMsg(s, '【疲勞】' + heroName(p) + ' 受到 ' + p.fatigue + ' 點傷害');
      dmgHero(s, pi, p.fatigue);
      continue;
    }
    var c = p.deck.pop();
    if (p.hand.length >= HAND_MAX) {
      p.grave.push(c);
      logMsg(s, '手牌已滿，「' + def(c.defId).name + '」被燒毀');
    } else p.hand.push(c);
  }
}

/* 從牌庫檢索符合條件的第一張 */
function tutor(s, pi, predicate) {
  var p = s.players[pi];
  for (var i = p.deck.length - 1; i >= 0; i--) {
    if (predicate(def(p.deck[i].defId))) {
      var c = p.deck.splice(i, 1)[0];
      if (p.hand.length < HAND_MAX) p.hand.push(c); else p.grave.push(c);
      logMsg(s, '檢索到「' + def(c.defId).name + '」');
      shuffle(s, p.deck);
      return c;
    }
  }
  shuffle(s, p.deck);
  return null;
}

/* ---------- 費用 ---------- */
function costOf(s, pi, card) {
  var d = def(card.defId);
  var c = d.cost + (card.costMod || 0) + (card.tempCostMod || 0);
  var p = s.players[pi], o = s.players[foe(pi)];
  function apply(perm, ownerIdx) {
    if (!perm) return;
    var pd = def(perm.defId);
    if (pd.costMod) c += pd.costMod(s, ownerIdx, d, pi);
  }
  permanentsOf(s, pi).forEach(function (w) { apply(w, pi); });
  permanentsOf(s, foe(pi)).forEach(function (w) { apply(w, foe(pi)); });
  return Math.max(0, c);
}

/* ---------- 光環重算 ---------- */
function recalc(s) {
  [0, 1].forEach(function (pi) {
    unitsOf(s, pi).forEach(function (u) { u.auraAtk = 0; u.auraHp = 0; u.kwAura = []; });
  });
  // 結界／場地授予的關鍵字（例如「紅霧異變」讓我方角色獲得吸血）
  [0, 1].forEach(function (pi) {
    var p = s.players[pi];
    permanentsOf(s, pi).forEach(function (perm) {
      var d = def(perm.defId);
      if (!d.grantKw) return;
      [0, 1].forEach(function (ti) {
        unitsOf(s, ti).forEach(function (u) {
          var k = d.grantKw(s, pi, u);
          if (k && u.kwAura.indexOf(k) < 0) u.kwAura.push(k);
        });
      });
    });
  });
  [0, 1].forEach(function (pi) {
    var p = s.players[pi];
    permanentsOf(s, pi).forEach(function (perm) {
      var d = def(perm.defId);
      if (!d.aura) return;
      [0, 1].forEach(function (ti) {
        unitsOf(s, ti).forEach(function (u) {
          var r = d.aura(s, pi, u);
          if (r) { u.auraAtk += r[0] || 0; u.auraHp += r[1] || 0; }
        });
      });
    });
    // 角色自己的條件式加成（例如合奏：湊齊三姊妹時自己 +2/+2）
    unitsOf(s, pi).forEach(function (u) {
      if (u.silenced) return;
      var sd = def(u.defId);
      if (!sd.selfAura) return;
      var sr = sd.selfAura(s, u);
      if (sr) { u.auraAtk += sr[0] || 0; u.auraHp += sr[1] || 0; }
    });
    // 角色自身提供的光環
    unitsOf(s, pi).forEach(function (src) {
      if (src.silenced) return;
      var d = def(src.defId);
      if (!d.unitAura) return;
      unitsOf(s, pi).forEach(function (u) {
        if (u === src) return;
        var r = d.unitAura(s, src, u);
        if (r) { u.auraAtk += r[0] || 0; u.auraHp += r[1] || 0; }
      });
    });
  });
  // 生命上限變動後修正
  [0, 1].forEach(function (pi) {
    unitsOf(s, pi).forEach(function (u) {
      var mx = maxHpOf(u);
      if (u.dmg > mx) u.dmg = mx;
    });
  });
}

function atkOf(u) {
  if (u.atkZero) return 0;   // 夢幻泡影：攻擊力永久變為 0
  return Math.max(0, u.baseAtk + (u.buffAtk || 0) + (u.auraAtk || 0) + (u.tempAtk || 0));
}
function maxHpOf(u) {
  return Math.max(1, u.baseHp + (u.buffHp || 0) + (u.auraHp || 0));
}
function hpOf(u) { return maxHpOf(u) - (u.dmg || 0); }

/* ---------- 場上查詢 ---------- */
function unitsOf(s, pi) { return s.players[pi].units.filter(Boolean); }
function allUnits(s) { return unitsOf(s, 0).concat(unitsOf(s, 1)); }
function hasKw(u, k) {
  if (u.silenced) return false;                           // 封印：卡面文字全部失效
  if (k === '森羅結界') return (u.barrier || 0) > 0;       // 由層數決定，不看關鍵字列
  if (u.kwAdd && u.kwAdd.indexOf(k) >= 0) return true;    // 永久附加
  if (u.kwTemp && u.kwTemp.indexOf(k) >= 0) return true;  // 本回合附加
  if (u.kwAura && u.kwAura.indexOf(k) >= 0) return true;  // 結界／場地授予
  var d = def(u.defId);
  return !!(d.kw && d.kw.indexOf(k) >= 0);
}
/* 給角色附加關鍵字。temp = 只到本回合結束 */
function addKw(u, k, temp) {
  if (!u) return;
  var arr = temp ? (u.kwTemp = u.kwTemp || []) : (u.kwAdd = u.kwAdd || []);
  if (arr.indexOf(k) < 0) arr.push(k);
}
function emptySlot(s, pi) { return s.players[pi].units.indexOf(null); }
function boardFull(s, pi) { return emptySlot(s, pi) < 0; }
function heroName(p) {
  var h = HEROES[p.heroId];
  if (h.forms) {
    var f = h.forms[(p.heroForm || 0) % h.forms.length];
    if (f.name) return f.name;
  }
  return h.name;
}
/* 這個角色出自哪一作（'紅' '妖' '永' '通'），給依作品觸發的卡使用 */
function srcOf(u) { return def(u.defId).src; }

/* ---------- 召喚 ---------- */
function makeUnit(s, pi, defId, opts) {
  var d = def(defId);
  opts = opts || {};
  return {
    uid: _uid++, defId: defId, owner: pi,
    baseAtk: opts.atk != null ? opts.atk : d.atk,
    baseHp: opts.hp != null ? opts.hp : d.hp,
    buffAtk: 0, buffHp: 0, auraAtk: 0, auraHp: 0, tempAtk: 0,
    dmg: 0,
    summoned: true,
    attacksLeft: 0,
    cantAttack: false,
    stealth: !!(d.kw && d.kw.indexOf('隱行') >= 0),
    kwAdd: [], kwTemp: [], kwAura: [],
    // 森羅結界的層數。與爐石聖盾不同，這裡是可疊加的計數器
    frozen: 0,
    silenced: false,
    barrier: (opts.barrier != null ? opts.barrier
              : (d.barrier || ((d.kw && d.kw.indexOf('森羅結界') >= 0) ? 1 : 0))),
    atkZero: false,
    attacksMade: 0,
    extraAttackPerTurn: 0,
    dead: false
  };
}

function summon(s, pi, defId, opts) {
  if (boardFull(s, pi)) { logMsg(s, '場上已滿，召喚失敗'); return null; }
  var u = makeUnit(s, pi, defId, opts);
  var slot = (opts && opts.pos != null && s.players[pi].units[opts.pos] == null)
    ? opts.pos : emptySlot(s, pi);
  s.players[pi].units[slot] = u;
  if (hasKw(u, '疾走')) u.attacksLeft = 1;
  logMsg(s, heroName(s.players[pi]) + ' 召喚「' + def(defId).name + '」');
  // 結界／場地／BGM 的「我方召喚角色時」觸發
  eachPermanent(s, pi, function (card, pd) {
    if (pd.onAllySummon) pd.onAllySummon(s, pi, u);
  });
  recalc(s);
  return u;
}

/* ---------- 傷害 / 治療 / 破壞 ----------
   src 是造成傷害的來源角色（可省略），用來結算「吸血」。 */
function dmgUnit(s, u, n, src) {
  if (!u || u.dead || n <= 0) return 0;
  if (s._spellCast) n += spellBonus(s, s._spellCastPi);   // 符卡傷害加成

  // 森羅結界：整次傷害被吸收，消耗一層（不管那一次是 1 點還是 10 點）
  if ((u.barrier || 0) > 0) {
    u.barrier--;
    logMsg(s, '『森羅結界』擋下「' + def(u.defId).name + '」受到的傷害' +
      (u.barrier > 0 ? '（剩 ' + u.barrier + ' 層）' : '（已耗盡）'));
    return 0;   // 沒有造成傷害 → 不觸發吸血、不產生貫通溢出
  }

  u.dmg += n;
  lifesteal(s, src, n);
  var d = def(u.defId);
  if (d.onDamaged) d.onDamaged(s, u, n);
  if (hpOf(u) <= 0) u.dead = true;
  return n;
}

/* 疊加森羅結界。可疊加是刻意的設計：再給一次就能多擋一次。 */
function addBarrier(s, u, n) {
  if (!u || u.dead) return;
  u.barrier = (u.barrier || 0) + (n == null ? 1 : n);
}
function dmgHero(s, pi, n, src) {
  if (n <= 0) return;
  if (s._spellCast && pi !== s._spellCastPi) n += spellBonus(s, s._spellCastPi);
  var p = s.players[pi];
  // 減傷結界
  var red = 0;
  eachPermanent(s, pi, function (c, d) { if (d.dmgReduce) red += d.dmgReduce(s, pi); });
  n = Math.max(0, n - red);
  p.hp -= n;
  if (n > 0) {
    p.hurtThisTurn = true;   // 捨身的觸發條件
    eachPermanent(s, pi, function (card, d) { if (d.onHeroHurt) d.onHeroHurt(s, pi, n); });
  }
  lifesteal(s, src, n);
  checkWin(s);
}
/* 吸血：此角色造成傷害時，其擁有者的英雄回復同量 */
function lifesteal(s, src, n) {
  if (!src || n <= 0 || !hasKw(src, '吸血')) return;
  healHero(s, src.owner, n);
}
function healHero(s, pi, n) {
  var p = s.players[pi];
  p.hp = Math.min(p.maxHp, p.hp + n);
}
function healUnit(s, u, n) { if (u && !u.dead) u.dmg = Math.max(0, u.dmg - n); }
/* 破壞：進墓地、觸發「死去」，之後還撈得回來。 */
function destroyUnit(s, u) { if (u && !u.dead) { u.dead = true; } }

/* 神隱：送出場外。不進墓地、不計入 fallen、不觸發任何「死去」效果。
   這是對付「死去就復活」那類角色唯一的硬解。 */
function banishUnit(s, u) { if (u && !u.dead) { u.dead = true; u.banished = true; } }

function buffUnit(u, a, h, temp) {
  if (!u || u.dead) return;
  if (temp) { u.tempAtk = (u.tempAtk || 0) + a; }
  else { u.buffAtk = (u.buffAtk || 0) + a; u.buffHp = (u.buffHp || 0) + h; }
}

/* 冰結：持續到該角色的擁有者結束下一個自己的回合。
   （以前用 cantAttack，但那個在「我的回合結束」就被清掉，
     等於冰結敵方角色完全沒有效果 —— 這是個實際存在的 bug） */
function freeze(s, u, n) {
  if (!u || u.dead) return;
  u.frozen = Math.max(u.frozen || 0, n == null ? 1 : n);
  logMsg(s, '「' + def(u.defId).name + '」被冰結');
}
function isFrozen(u) { return (u.frozen || 0) > 0; }

/* 封印：移除這個角色自己的所有關鍵字、強化與觸發效果。
   結界／場地給的外部光環不受影響（只封印角色本身的卡面文字）。 */
function silence(s, u) {
  if (!u || u.dead) return;
  u.silenced = true;
  u.kwAdd = []; u.kwTemp = []; u.kwAura = [];
  u.buffAtk = 0; u.buffHp = 0;
  u.barrier = 0;
  u.stealth = false;
  u.atkZero = false;
  u.extraAttackPerTurn = 0;
  logMsg(s, '「' + def(u.defId).name + '」被封印');
  recalc(s);
  cleanupDeaths(s);
}

/* 把場上的角色移回擁有者手上（不觸發死去） */
function bounceUnit(s, u) {
  if (!u || u.dead) return false;
  var p = s.players[u.owner];
  var i = p.units.indexOf(u);
  if (i < 0) return false;
  p.units[i] = null;
  var d = def(u.defId);
  if (d.token) { logMsg(s, '衍生物「' + d.name + '」消散'); }
  else if (p.hand.length >= HAND_MAX) { p.grave.push({ defId: u.defId }); logMsg(s, '手牌已滿，「' + d.name + '」被燒毀'); }
  else { p.hand.push(makeCard(u.defId)); logMsg(s, '「' + d.name + '」被移回手上'); }
  recalc(s);
  return true;
}

/* ---------- 探尋 ----------
   從符合條件的卡池隨機取 n 張，讓玩家選 1 張加入手牌。
   有 pendingChoice 時整場暫停 —— 出牌、攻擊、結束回合都會被擋下。
   AI 的模擬盤面設 autoResolveChoice，直接取第一個選項，避免模擬卡住。 */
function discoverPool(s, predicate, n) {
  var pool = Object.keys(CARDS).filter(function (id) {
    var d = CARDS[id];
    return !d.token && d.type !== 'bgm' && predicate(d);
  });
  var out = [];
  for (var i = 0; i < n && pool.length; i++) {
    out.push(pool.splice(rngInt(s, pool.length), 1)[0]);
  }
  return out;
}

function startChoice(s, pi, options, label) {
  if (!options || !options.length) { logMsg(s, '『探尋』找不到符合的卡'); return; }
  if (s.autoResolveChoice) { grantChoice(s, pi, options[0]); return; }
  s.pendingChoice = { pi: pi, options: options, label: label || '探尋' };
}

function grantChoice(s, pi, defId) {
  var p = s.players[pi];
  if (p.hand.length < HAND_MAX) p.hand.push(makeCard(defId));
  else p.grave.push({ defId: defId });
  logMsg(s, '『探尋』取得「' + def(defId).name + '」');
}

function resolveChoice(s, defId) {
  if (!s.pendingChoice) return '目前沒有待選的探尋';
  if (s.pendingChoice.options.indexOf(defId) < 0) return '不在探尋的選項中';
  var pi = s.pendingChoice.pi;
  s.pendingChoice = null;
  grantChoice(s, pi, defId);
  recalc(s);
  cleanupDeaths(s);
  return null;
}

/* 探尋一張「騷靈」卡 */
function discoverTribe(s, pi, tribe, n) {
  startChoice(s, pi, discoverPool(s, function (d) {
    return hasTribe(d, tribe);
  }, n || 3), '探尋「' + tribe + '」');
}

/* ---------- 合奏 ----------
   我方場上同時有三位不同的「騷靈」角色 */
/* 人妖組：卡片上寫死搭檔的 id，雙方同時在我方場上時成立。
   不用族群判定 —— 否則會變成「隨便一個人類配一個妖怪都算」，
   而原作的四組是固定的四對人，寫死才對得上。 */
function paired(s, u) {
  if (!u || u.silenced) return false;
  var partner = def(u.defId).pair;
  if (!partner) return false;
  return unitsOf(s, u.owner).some(function (x) {
    return x !== u && x.defId === partner && !x.silenced;
  });
}

function ensemble(s, pi) {
  var seen = {};
  unitsOf(s, pi).forEach(function (u) {
    if (hasTribe(def(u.defId), '騷靈')) seen[u.defId] = true;
  });
  return Object.keys(seen).length >= 3;
}

/* 條件輔助（給卡片效果用，讓卡表讀起來就是規則文字） */
function sutemi(s, pi) { return !!s.players[pi].hurtThisTurn; }              // 捨身
function rensou(s, pi, n) { return (s.players[pi].spellsThisTurn || 0) >= n; } // 連奏 N

function cleanupDeaths(s) {
  var loop = 0;
  while (loop++ < 8) {
    var any = false;
    [0, 1].forEach(function (pi) {
      var arr = s.players[pi].units;
      for (var i = 0; i < arr.length; i++) {
        var u = arr[i];
        if (u && (u.dead || hpOf(u) <= 0)) {
          arr[i] = null; any = true;
          var d = def(u.defId);
          // 神隱的角色什麼都不留下 —— 這正是它跟破壞的差別，
          // 也是「死去就復活」那類角色唯一擋得住的方式。
          if (u.banished) {
            logMsg(s, '「' + d.name + '」被神隱');
            continue;
          }
          logMsg(s, '「' + d.name + '」被擊破');
          s.players[pi].grave.push({ defId: u.defId });
          s.players[pi].deathsThisTurn = (s.players[pi].deathsThisTurn || 0) + 1;
          if (!d.token) s.players[pi].fallen = (s.players[pi].fallen || []).concat([u.defId]);
          if (d.onDeath && !u.silenced) d.onDeath(s, pi, u);
          // 場地 / 結界 的「我方角色死去」觸發
          eachPermanent(s, pi, function (c, pd) {
            if (pd.onAllyDeath) pd.onAllyDeath(s, pi, u);
          });
        }
      }
    });
    recalc(s);
    if (!any) break;
  }
  checkWin(s);
}

function checkWin(s) {
  if (s.winner != null) return;
  var d0 = s.players[0].hp <= 0, d1 = s.players[1].hp <= 0;
  if (d0 && d1) s.winner = -1;
  else if (d1) s.winner = 0;
  else if (d0) s.winner = 1;
  if (s.winner != null) s.phase = 'over';
}

/* ---------- 目標合法性 ---------- */
function canTargetUnit(s, byPi, u) {
  if (!u || u.dead) return false;
  if (u.owner !== byPi && u.stealth) return false;
  return true;
}

function legalTargets(s, pi, spec) {
  // spec: {side:'enemy'|'ally'|'any', kind:'unit'|'char'|'hero'}
  var out = [];
  var sides = spec.side === 'any' ? [0, 1] : (spec.side === 'ally' ? [pi] : [foe(pi)]);
  sides.forEach(function (ti) {
    if (spec.kind !== 'hero') {
      unitsOf(s, ti).forEach(function (u) {
        if (canTargetUnit(s, pi, u)) out.push({ t: 'unit', uid: u.uid });
      });
    }
    if (spec.kind === 'char' || spec.kind === 'hero') out.push({ t: 'hero', pi: ti });
  });
  return out;
}

function resolveTarget(s, tgt) {
  if (!tgt) return null;
  if (tgt.t === 'hero') return { hero: true, pi: tgt.pi };
  var u = findUnit(s, tgt.uid);
  return u ? { hero: false, unit: u } : null;
}
function findUnit(s, uid) {
  var r = null;
  [0, 1].forEach(function (pi) {
    s.players[pi].units.forEach(function (u) { if (u && u.uid === uid) r = u; });
  });
  return r;
}
function findCardInHand(s, pi, uid) {
  return s.players[pi].hand.filter(function (c) { return c.uid === uid; })[0] || null;
}

/* ---------- 出牌 ---------- */
function canPlay(s, pi, card, tgt, slot) {
  if (s.phase !== 'play' || s.active !== pi) return '不是你的回合';
  if (s.pendingChoice) return '請先完成探尋';
  var d = def(card.defId);
  if (costOf(s, pi, card) > s.players[pi].sp) return '靈力不足';
  if (d.type === 'unit' && boardFull(s, pi)) return '角色列已滿';
  if (d.type === 'ward' && s.players[pi].wards.indexOf(null) < 0) return '結界列已滿';
  if (d.type === 'bgm' && s.players[pi].bgmLock > 0) {
    return '對手剛切換過 BGM，還要等 ' + s.players[pi].bgmLock + ' 個回合';
  }
  if (d.playable && !d.playable(s, pi)) return '無法發動';
  if (d.target) {
    var lt = legalTargets(s, pi, d.target);
    // 角色的「登場」目標是選擇性的：沒有合法目標時照樣能召喚，效果落空就好。
    // 否則一張 2 費身材會因為對手空場就變成廢牌。
    // 符卡不同 —— 沒有目標的移除卡不該被浪費，維持不能發動。
    if (!lt.length) return d.type === 'unit' ? null : '沒有合法目標';
    if (!tgt) return 'NEED_TARGET';
    var ok = lt.some(function (x) {
      return (x.t === 'hero' && tgt.t === 'hero' && x.pi === tgt.pi) ||
        (x.t === 'unit' && tgt.t === 'unit' && x.uid === tgt.uid);
    });
    if (!ok) return '目標不合法';
  }
  return null;
}

function playCard(s, pi, uid, tgt, slot) {
  var card = findCardInHand(s, pi, uid);
  if (!card) return '找不到卡片';
  var err = canPlay(s, pi, card, tgt, slot);
  if (err) return err;

  var p = s.players[pi], d = def(card.defId);
  p.sp -= costOf(s, pi, card);
  p.hand = p.hand.filter(function (c) { return c !== card; });
  logMsg(s, heroName(p) + ' 使用「' + d.name + '」');

  var ctx = { target: resolveTarget(s, tgt), card: card, pi: pi };

  if (d.type === 'unit') {
    var u = summon(s, pi, card.defId, { pos: slot });
    if (u) {
      ctx.self = u;
      if (d.onPlay) d.onPlay(s, ctx);
    }
  } else if (d.type === 'spell') {
    // 連奏：先計數再結算，所以「本回合第 N 張符卡」在效果內就查得到
    p.spellsThisTurn = (p.spellsThisTurn || 0) + 1;
    s._spellCast = true; s._spellCastPi = pi;
    if (d.onPlay) d.onPlay(s, ctx);
    s._spellCast = false; s._spellCastPi = null;
    p.grave.push({ defId: card.defId });
    // 符卡使
    // 第三個參數 d 是剛剛發動的那張符卡 —— 讓「你發動○○的符卡時」這類條件寫得出來。
    unitsOf(s, pi).forEach(function (u2) {
      if (u2.silenced) return;
      var d2 = def(u2.defId);
      if (d2.onAllySpell) d2.onAllySpell(s, u2, d);
    });
    eachPermanent(s, pi, function (c, pd) { if (pd.onAllySpell) pd.onAllySpell(s, pi, d); });
  } else if (d.type === 'ward') {
    var ws = p.wards.indexOf(null);
    p.wards[ws] = card;
    if (d.onPlay) d.onPlay(s, ctx);
  } else if (d.type === 'bgm') {
    if (s.bgm) {
      var oldOwner = s.players[s.bgm.owner];
      logMsg(s, 'BGM「' + def(s.bgm.defId).name + '」被蓋過');
      if (BGM_RETURN_ON_OVERWRITE && oldOwner.hand.length < HAND_MAX) {
        oldOwner.hand.push(makeCard(s.bgm.defId));
        logMsg(s, '　被蓋過的 BGM 回到 ' + heroName(oldOwner) + ' 手上');
      } else {
        oldOwner.grave.push({ defId: s.bgm.defId });
      }
    }
    s.bgm = { uid: card.uid, defId: card.defId, owner: pi };
    logMsg(s, '♪ BGM 切換為「' + d.name + '」');
    s.players[foe(pi)].bgmLock = BGM_LOCK_TURNS;
    if (d.tutor) {
      var want = d.tutor;
      tutor(s, pi, function (cd) { return cd.id === want; });
    }
    if (d.onPlay) d.onPlay(s, ctx);
  } else if (d.type === 'field') {
    if (p.field) { p.grave.push({ defId: p.field.defId }); logMsg(s, '舊場地「' + def(p.field.defId).name + '」被替換'); }
    p.field = card;
    if (d.onPlay) d.onPlay(s, ctx);
  }

  recalc(s);
  cleanupDeaths(s);
  return null;
}

/* ---------- 攻擊 ---------- */
function tauntUnits(s, pi) {
  return unitsOf(s, pi).filter(function (u) { return hasKw(u, '守護') && !u.stealth; });
}
function canAttack(s, u) {
  if (!u || u.dead) return false;
  if (u.owner !== s.active) return false;
  if (u.cantAttack || isFrozen(u)) return false;
  if (u.attacksLeft <= 0) return false;
  if (atkOf(u) <= 0) return false;
  return true;
}
function attackTargets(s, u) {
  var e = foe(u.owner);
  var taunts = tauntUnits(s, e);
  var out = [];
  if (taunts.length && !hasKw(u, '飛行')) {
    taunts.forEach(function (t) { out.push({ t: 'unit', uid: t.uid }); });
    return out;
  }
  unitsOf(s, e).forEach(function (t) {
    if (canTargetUnit(s, u.owner, t)) out.push({ t: 'unit', uid: t.uid });
  });
  out.push({ t: 'hero', pi: e });
  return out;
}

function doAttack(s, attUid, tgt) {
  if (s.pendingChoice) return '請先完成探尋';
  var a = findUnit(s, attUid);
  if (!canAttack(s, a)) return '此角色無法攻擊';
  var legal = attackTargets(s, a);
  var ok = legal.some(function (x) {
    return (x.t === 'hero' && tgt.t === 'hero' && x.pi === tgt.pi) ||
      (x.t === 'unit' && tgt.t === 'unit' && x.uid === tgt.uid);
  });
  if (!ok) return '必須先攻擊「守護」角色';

  a.attacksLeft--;
  a.attacksMade = (a.attacksMade || 0) + 1;   // 追擊：這是本回合第幾次攻擊
  if (a.stealth) a.stealth = false;
  var ad = atkOf(a);

  if (tgt.t === 'hero') {
    logMsg(s, '「' + def(a.defId).name + '」攻擊 ' + heroName(s.players[tgt.pi]) + ' — ' + ad);
    dmgHero(s, tgt.pi, ad, a);
  } else {
    var t = findUnit(s, tgt.uid);
    if (!t) return '目標不存在';
    logMsg(s, '「' + def(a.defId).name + '」攻擊「' + def(t.defId).name + '」');
    var td = atkOf(t);
    // 彈幕：濺射相鄰
    if (hasKw(a, '彈幕')) {
      var arr = s.players[t.owner].units;
      var i = arr.indexOf(t);
      [i - 1, i + 1].forEach(function (j) {
        if (j >= 0 && j < SLOTS && arr[j]) dmgUnit(s, arr[j], ad, a);
      });
    }
    // 先記下目標的生命，傷害實際落地後才算貫通的溢出
    var hpBefore = hpOf(t);
    var dealt = dmgUnit(s, t, ad, a);
    if (hasKw(a, '貫通') && dealt > 0) {
      var over = dealt - hpBefore;
      if (over > 0) {
        logMsg(s, '『貫通』— 溢出 ' + over + ' 點打向 ' + heroName(s.players[t.owner]));
        dmgHero(s, t.owner, over, a);
      }
    }
    dmgUnit(s, a, td, t);
  }
  // 追擊：此角色本回合第二次以後的攻擊
  var ad2 = def(a.defId);
  if (ad2.onExtraAttack && a.attacksMade >= 2) ad2.onExtraAttack(s, a);
  recalc(s);
  cleanupDeaths(s);
  return null;
}

/* ---------- 英雄技能 ---------- */
/* 每位英雄各自的技能費用與代價類型。
   cost：數字，沒寫就用 config 的 HERO_POWER_COST
   costType：'sp' 靈力（預設）／'hp' 血量
   selfDmg：發動後額外對自己英雄造成的傷害（妹紅那種 0 費自傷型） */
/* ---------- 英雄形態 ----------
   有些英雄的技能會在使用後切換到另一個形態（例如莉莉白 ⇄ 莉莉黑）。
   形態只覆寫「技能」相關的欄位，名字之外的本體資料（血量、顏色）沿用英雄本身。

   沒有對局狀態時（牌組編輯、英雄選擇畫面）一律顯示第一形態，
   因為那些畫面問的是「這個英雄是什麼」，不是「他現在是什麼狀態」。 */
function heroFormOf(heroId, s, pi) {
  var h = HEROES[heroId];
  if (!h || !h.forms) return h;
  var i = (s && pi != null && s.players[pi]) ? (s.players[pi].heroForm || 0) : 0;
  i = i % h.forms.length;
  var f = h.forms[i];
  return {
    id: h.id, set: h.set, name: f.name || h.name, title: h.title,
    hp: h.hp, color: f.color || h.color,
    cost: f.cost != null ? f.cost : h.cost,
    costType: f.costType || h.costType,
    selfDmg: f.selfDmg != null ? f.selfDmg : h.selfDmg,
    power: f.power, powerText: f.powerText, target: f.target, use: f.use,
    profile: h.profile, forms: h.forms, formIndex: i
  };
}

function heroPowerCost(heroId, s, pi) {
  var h = heroFormOf(heroId, s, pi);
  return (h && h.cost != null) ? h.cost : HERO_POWER_COST;
}
function heroPowerCostType(heroId, s, pi) {
  var h = heroFormOf(heroId, s, pi);
  return (h && h.costType) || 'sp';
}
/* 技能費用的顯示字串，介面直接用 */
function heroPowerCostLabel(heroId, s, pi) {
  var c = heroPowerCost(heroId, s, pi), t = heroPowerCostType(heroId, s, pi);
  var h = heroFormOf(heroId, s, pi);
  var str = (t === 'hp' ? '血' : '靈') + c;
  if (h && h.selfDmg) str += '＋自傷' + h.selfDmg;
  return str;
}
function canHeroPower(s, pi, tgt) {
  var p = s.players[pi], h = heroFormOf(p.heroId, s, pi);
  if (s.phase !== 'play' || s.active !== pi) return '不是你的回合';
  if (s.pendingChoice) return '請先完成探尋';
  if (p.heroPowerUsed) return '本回合已使用';
  var cost = heroPowerCost(p.heroId, s, pi), ctype = heroPowerCostType(p.heroId, s, pi);
  if (ctype === 'hp') {
    if (p.hp <= cost + (h.selfDmg || 0)) return '血量不足';
  } else if (p.sp < cost) return '靈力不足';
  // 靈力費的技能若帶自傷（妹紅 0 費自傷 2），一樣不能把自己按死
  if (ctype !== 'hp' && h.selfDmg && p.hp <= h.selfDmg) return '血量不足';
  if (h.target) {
    var lt = legalTargets(s, pi, h.target);
    if (!lt.length) return '沒有合法目標';
    if (!tgt) return 'NEED_TARGET';
    var ok = lt.some(function (x) {
      return (x.t === 'hero' && tgt.t === 'hero' && x.pi === tgt.pi) ||
        (x.t === 'unit' && tgt.t === 'unit' && x.uid === tgt.uid);
    });
    if (!ok) return '目標不合法';
  }
  return null;
}
function useHeroPower(s, pi, tgt) {
  var err = canHeroPower(s, pi, tgt);
  if (err) return err;
  var p = s.players[pi], h = heroFormOf(p.heroId, s, pi);
  var cost = heroPowerCost(p.heroId, s, pi);
  if (heroPowerCostType(p.heroId, s, pi) === 'hp') dmgHero(s, pi, cost);
  else p.sp -= cost;
  p.heroPowerUsed = true;
  logMsg(s, heroName(p) + ' 發動英雄技能「' + h.power + '」');
  h.use(s, { pi: pi, target: resolveTarget(s, tgt) });
  if (h.selfDmg) dmgHero(s, pi, h.selfDmg);
  // 用完就換形態。放在效果之後，所以卡面寫的「然後轉為○○」是照字面發生的。
  if (h.forms) {
    p.heroForm = ((p.heroForm || 0) + 1) % h.forms.length;
    logMsg(s, '　形態轉換為「' + heroName(p) + '」');
  }
  recalc(s);
  cleanupDeaths(s);
  return null;
}

/* ---------- 記錄 ---------- */
function logMsg(s, t) {
  s.log.push({ turn: s.turn, text: t });
  if (s.log.length > 300) s.log.shift();
}

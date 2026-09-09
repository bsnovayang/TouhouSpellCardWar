/* 自動產生 —— 不要直接編輯。
   來源：js/config.js, js/engine.js, js/carddb.js, js/keywords.js, js/heroes.js, js/cards/common.js, js/cards/eosd.js, js/cards/pcb.js, js/cards/in.js, js/decks.js
   重新產生：npm run build:server */
/* ===== js/config.js ===== */
/* ============================================================
   東方符卡大戰 — 規則設定
   所有可調的規則數值都集中在這裡。改完跑 `npm run balance` 看影響。
   （必須是第一個載入的腳本）
   ============================================================ */
'use strict';

/* ---------- 場地 ---------- */
var SLOTS = 5;            // 前排角色格
var WARD_SLOTS = 5;       // 後排結界格

/* ---------- 資源 ---------- */
var SP_MAX = 10;          // 靈力上限
var HAND_MAX = 10;        // 手牌上限，超過會燒毀
var HERO_POWER_COST = 2;  // 英雄技能費用

/* ---------- 牌組 ---------- */
var DECK_SIZE = 40;       // 主牌組張數（不含 BGM）
var MAX_COPIES = 4;       // 同名卡上限
var START_HAND = 3;       // 先手起手張數

/* ---------- 後手補償 ----------
   先手的優勢來自「先動」本身；後手用卡差與耐久補回來。
   目標：AI 循環賽的先手勝率落在 50% ± 5%。 */
var SECOND_EXTRA_CARDS = 1;        // 後手起手多抽幾張
var SECOND_EXTRA_HP = 4;           // 後手英雄血量加成
var SECOND_GOSEN = [2, 4, 6];      // 「後之先」：靈力上限達這些數字時各抽 1 張

/* ---------- BGM ----------
   BGM 放在獨立的「BGM 欄」，不會混進主牌組，所以不會起手就抽到。
   到 BGM_AUTO_TURN 這個回合會自動進手，之後就是要不要花費用發動的判斷。 */
var BGM_SLOT = 1;         // BGM 欄可以放幾張
var BGM_AUTO_TURN = 4;    // 自己的第幾個回合，BGM 自動進手
var BGM_LOCK_TURNS = 2;   // 發動後，對手接下來幾個回合不能發動 BGM
var BGM_RETURN_ON_OVERWRITE = true;
/* ↑ 被對手蓋過時，BGM 是否回到擁有者手上。
   設 false 的話 BGM 進棄牌區 —— 但因為一副牌只有一張，
   會變成「誰晚發動誰永久贏得播放器」，先發動的人完全沒有反制手段。 */

/* ---------- AI 難度 ----------
   兩種難度共用同一份程式，差別只有這裡的參數：
   beam=1、depth=1 在數學上就完全等同於原本的單步貪心，
   所以「簡單」不是另外維護的一套邏輯，不會跟「困難」分岔。 */
var AI_LEVELS = {
  easy: { beam: 1, depth: 1, foresee: false, label: '簡單' },
  hard: { beam: 12, depth: 10, foresee: true, label: '困難' }
};

/* foresee：2-ply 前瞻。把最好的幾個候選結局各往前推一個回合，
   看對手回擊之後盤面變成什麼樣，再回頭決定這回合怎麼打。
     topN 幾個候選要前瞻／beam 模擬對手時的束寬
   對手**只模擬攻擊**：場面是公開資訊，模擬他出牌就得讀他的手牌，那是作弊。 */
var AI_FORESEE = { topN: 3, beam: 4 };
var AI_DEFAULT_LEVEL = 'easy';


/* ---------- 連線對戰 ----------
   回合時限是 PvP 的必需品而不是加分項：對手關掉網頁的話，
   沒有時限的話另一方會永遠等下去。
   斷線寬限要涵蓋重整、切到背景、進電梯這些「會回來」的情況 —— 
   伺服器分不出「暫時斷線」和「不玩了」，只能給一段時間再判定。 */
var TURN_SECONDS = 90;        // 每回合思考時限，到時自動結束回合
var DISCONNECT_GRACE = 60;    // 斷線後保留對局的秒數，逾時判對手獲勝

/* ===== js/engine.js ===== */
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
  // uid 計數器每一局重來。它原本是模組層全域、跨局累加，
  // 所以同一個種子在不同客戶端會配出不同的 uid ——
  // 而動作訊息正是靠 uid 指定目標，連線對戰會因此對不上。
  _uid = 1;
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
    revive: 0,        // 反魂：死去時以 1 生命回到場上的剩餘次數
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
  var tweak = s._discoverTweak;
  s._discoverTweak = null;
  if (p.hand.length < HAND_MAX) {
    var card = makeCard(defId);
    if (tweak) tweak(s, pi, card);
    p.hand.push(card);
  } else {
    p.grave.push({ defId: defId });
  }
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
/* 條件式探尋：把判斷式交給呼叫端，任何「探尋符合 X 的卡」都能用這個。
   discover 出來的卡可以再加工（例如因幡帝把費用降到 0）。 */
function discoverWhere(s, pi, predicate, n, label, tweak) {
  var opts = discoverPool(s, predicate, n || 3);
  if (!opts.length) { logMsg(s, '『探尋』找不到符合的卡'); return; }
  s._discoverTweak = tweak || null;
  startChoice(s, pi, opts, label || '探尋');
}

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
          // 反魂：以 1 生命回到場上。放在墓地與「死去」之前 ——
          // 她根本沒有真的死掉，所以不進墓地、也不觸發任何死去效果。
          // 被神隱時上面已經 continue 了，所以藥救不回被神隱的角色，這是刻意的。
          if ((u.revive || 0) > 0 && !u.silenced) {
            u.revive--;
            u.dead = false;
            u.dmg = Math.max(0, maxHpOf(u) - 1);
            arr[i] = u;
            logMsg(s, '『反魂』—「' + d.name + '」以 1 點生命回到場上');
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

/* 強制交戰：讓 a 攻擊 b，雙方互相結算傷害。
   不能走 doAttack —— 那裡的 canAttack 規定「只有行動方能攻擊」，
   而這是在我方回合強迫對手的兩個角色打起來。
   關鍵字（彈幕、貫通、吸血）刻意不套用：這不是那個角色自己選的攻擊，
   只是被逼著揮出去，套上全部效果會讓一張卡的結算複雜到看不懂。 */
function forceClash(s, a, b) {
  if (!a || !b || a === b || a.dead || b.dead) return;
  logMsg(s, '『狂氣』—「' + def(a.defId).name + '」被迫攻擊「' + def(b.defId).name + '」');
  // 不傳「傷害來源」—— dmgUnit 會用它結算吸血，
  // 傳了的話「逼吸血鬼互打」反而變成幫對手回血，跟上面說的不套用關鍵字互相矛盾。
  var ad = atkOf(a), bd = atkOf(b);
  if (ad > 0) dmgUnit(s, b, ad);
  if (bd > 0) dmgUnit(s, a, bd);
  cleanupDeaths(s);
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

/* ===== js/carddb.js ===== */
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

/* ===== js/keywords.js ===== */
/* ============================================================
   東方符卡大戰 — 關鍵字（TAG）辭典
   卡面與提示框會自動偵測這些詞並附上說明，玩家不需要背。
   新增關鍵字時只要在這裡加一筆，卡面提示與規則說明頁會自動跟上。
   ============================================================ */
'use strict';

var KEYWORDS = {
  /* --- 角色關鍵字 --- */
  '疾走': '登場的那個回合就可以攻擊。',
  '守護': '對手必須先攻擊有「守護」的角色。',
  '飛行': '此角色攻擊時無視對手的「守護」。',
  '隱行': '在此角色自己攻擊之前，不能被指定為目標。',
  '彈幕': '攻擊角色時，對目標左右相鄰的角色造成同等傷害。',
  '貫通': '攻擊角色時，超出目標剩餘生命的傷害轉向敵方英雄。',
  '吸血': '此角色造成傷害時，我方英雄回復同等數量的生命。',
  '森羅結界': '受到傷害時改為不受傷害，並消耗一層。可以疊加 —— 有幾層就能擋幾次。',

  /* --- 條件關鍵字 --- */
  '捨身': '本回合我方英雄受過傷害時，效果增強。',
  '連奏': '本回合這是你第 N 張（含）之後的符卡時，效果增強。',
  '追擊': '此角色本回合第二次以後的攻擊時觸發。',
  '符卡使': '你每發動一張符卡，此角色就永久獲得強化。',

  /* --- 時機關鍵字 --- */
  '登場': '此卡從手上打出時觸發一次。',
  '死去': '此角色被擊破時觸發。',
  '破壞': '角色被移除並進入墓地 —— 會觸發「死去」，之後也還撈得回來。',
  '神隱': '角色被送出場外：不進墓地、不觸發任何「死去」效果，也無法被復活或回收。',
  '獻祭': '破壞我方一個角色作為發動的代價。',
  '探尋': '從 3 張卡中選 1 張加入手牌。',
  '合奏': '我方場上同時有三位不同的「騷靈」角色時，效果啟動。',
  '反魂': '此角色死去時改為以 1 點生命回到場上。不進墓地，也不觸發任何「死去」效果。',
  '人妖組': '卡面指定的搭檔也在我方場上時，效果啟動 —— 對應原作永夜抄的雙人自機組。',
  '封印': '移除該角色自身的所有關鍵字、強化與效果（結界與場地給的加成不受影響）。',
  '冰結': '無法攻擊，直到其擁有者結束下一個自己的回合。',
  '連舞': '此角色每回合可以攻擊兩次。'
};

/* 卡片文字／關鍵字列裡出現的所有關鍵字（依辭典順序，不重複） */
function keywordsOn(d) {
  var found = [], text = (d.text || '') + ' ' + ((d.kw || []).join(' '));
  Object.keys(KEYWORDS).forEach(function (k) {
    if (text.indexOf(k) >= 0) found.push(k);
  });
  return found;
}

/* ===== js/heroes.js ===== */
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


/* ============================================================
   東方永夜抄 — 第三階段（需要新引擎能力的四位）
   ============================================================ */

/* 永琳：藥師。給角色一次「死不了」，對手的移除就得多花一次。 */
HEROES.eirin = {
  id: 'eirin', set: '永', name: '八意永琳', title: '月之頭腦', hp: 30, color: '#c8b8e0',
  power: '藥師', powerText: '我方一個角色獲得反魂（死去時改為以 1 生命回到場上）',
  target: T.aUnit,
  use: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    u.revive = (u.revive || 0) + 1;
    logMsg(s, '「' + def(u.defId).name + '」獲得反魂');
  },
  profile: { hp: 30, special: 'grant_revive' }
};

/* 鈴仙：狂氣。不自己出手，讓對手的角色互相殘殺 ——
   對手場面愈大，她的技能愈痛，這是全場唯一「對手鋪場反而危險」的能力。 */
HEROES.reisen = {
  id: 'reisen', set: '永', name: '鈴仙·優曇華院·因幡', title: '狂氣的月兔', hp: 30,
  // 靈 3 時她 70%：每回合一次「逼兩個敵人互相殘殺」等於可重複的雙向移除。
  color: '#b088c8', cost: 4,
  power: '狂氣', powerText: '使一個敵方角色攻擊另一個隨機的敵方角色',
  target: T.eUnit,
  use: function (s, c) {
    var a = c.target && c.target.unit; if (!a) return;
    var others = unitsOf(s, foe(c.pi)).filter(function (x) { return x !== a; });
    var b = pick(s, others);
    if (!b) { logMsg(s, '對方只有一個角色，狂氣沒有對象'); return; }
    forceClash(s, a, b);
  },
  profile: { hp: 30, special: 'force_clash' }
};

/* 因幡帝：幸運。探尋一張便宜的卡並讓它免費 ——
   跟騷靈三姊妹的探尋差別在：她們是「找特定族群」，帝是「把找到的變成 0 費」。 */
HEROES.tewi = {
  id: 'tewi', set: '永', name: '因幡帝', title: '幸運的白兔', hp: 28, color: '#e8c8d0',
  power: '幸運', powerText: '探尋(3)：從費用 2 以下的卡中選 1 張，其費用變為 0',
  use: function (s, c) {
    discoverWhere(s, c.pi,
      function (d) { return d.cost <= 2 && d.type !== 'bgm'; },
      3, '探尋「幸運」',
      function (s2, pi, card) { card.costMod -= 99; });
  },
  profile: { hp: 28, draw: 1, special: 'discover_free' }
};

/* 輝夜：五個難題。技能把難題洗進手裡，難題本身是她的五張專屬大招。 */
HEROES.kaguya = {
  id: 'kaguya', set: '永', name: '蓬萊山輝夜', title: '永遠與須臾', hp: 30,
  // 靈 3 時她 70%：每回合白拿一張 4～7 費的大招，價值在「拿得到」而不是折扣，
  // 所以先前把折扣從 -2 改成 -1 完全沒有效果，得直接讓她少按幾次。
  color: '#d0a8d8', cost: 4,
  // 每回合白拿一張大招已經很強，折扣再給 -2 就過頭了。
  // BGM「竹取飛翔」另外還會 -1，兩者疊起來才回到 -2。
  power: '五個難題', powerText: '隨機獲得一張「難題」，其費用 -1',
  use: function (s, c) {
    var pool = Object.keys(CARDS).filter(function (id) { return CARDS[id].nandai; });
    var id = pick(s, pool);
    var p = s.players[c.pi];
    if (!id || p.hand.length >= HAND_MAX) { logMsg(s, '手牌已滿'); return; }
    var card = makeCard(id);
    card.costMod -= 1;
    p.hand.push(card);
    logMsg(s, '出了難題「' + CARDS[id].name + '」（費用 -1）');
  },
  profile: { hp: 30, special: 'generate_nandai' }
};

HERO_ORDER.push('eirin', 'reisen', 'tewi', 'kaguya');

/* ===== js/cards/common.js ===== */
/* ============================================================
   東方符卡大戰 — 卡表：通用卡
   不屬於特定作品的泛用卡：抽濾、通用移除、結界破壞
   共 3 張。要新增這一彈的卡，直接在本檔加 C({...})。
   ============================================================ */
'use strict';

C({
  id: 'n_sp_omamori', set: '基', name: '御守', src: '通', cls: 'neutral', type: 'spell', cost: 0,
  text: '抽 1 張。', onPlay: function (s, c) { draw(s, c.pi, 1); }
});

C({
  id: 'n_sp_danmaku', set: '基',  name: '彈幕勝負', src: '通', cls: 'neutral', type: 'spell', cost: 4,
  text: '對所有敵方角色造成 2 點傷害。',
  onPlay: function (s, c) { unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, 2); }); }
});

C({
  id: 'n_sp_break', set: '基',  name: '結界破', src: '通', cls: 'neutral', type: 'spell', cost: 1,
  text: '破壞一個敵方結界或場地（優先場地）。',
  playable: function (s, pi) {
    var o = s.players[foe(pi)];
    return !!(o.field || o.wards.some(Boolean));
  },
  onPlay: function (s, c) {
    var o = s.players[foe(c.pi)];
    if (o.field) { logMsg(s, '場地「' + def(o.field.defId).name + '」被破壞'); o.grave.push({ defId: o.field.defId }); o.field = null; return; }
    for (var i = 0; i < o.wards.length; i++) {
      if (o.wards[i]) { logMsg(s, '結界「' + def(o.wards[i].defId).name + '」被破壞'); o.grave.push({ defId: o.wards[i].defId }); o.wards[i] = null; return; }
    }
  }
});

/* ===== js/cards/eosd.js ===== */
/* ============================================================
   東方符卡大戰 — 卡表：第六彈・東方紅魔鄉 (TH06 EoSD)
   紅魔館一系的角色與符卡
   共 49 張。要新增這一彈的卡，直接在本檔加 C({...})。
   ============================================================ */
'use strict';

C({ id: 'n_fairy', works: [], set: '基', tribe: ['妖精'], name: '妖精', src: '紅', cls: 'neutral', type: 'unit', cost: 1, atk: 1, hp: 2, text: '幻想鄉隨處可見的雜魚。' });

C({
  id: 'n_rumia', tribe: ['妖怪'], name: '露米婭', src: '紅', cls: 'neutral', type: 'unit', cost: 1, atk: 2, hp: 1, kw: ['隱行'],
  text: '隱行。宵闇的妖怪，那個是可以吃的嗎？'
});

C({ id: 'n_maid', tribe: ['妖精'], name: '紅魔館的女僕', src: '紅', cls: 'neutral', type: 'unit', cost: 1, atk: 1, hp: 2, text: '被咲夜使喚的普通妖精女僕。' });

C({
  id: 'n_koakuma', tribe: ['惡魔'], name: '小惡魔', src: '紅', cls: 'neutral', type: 'unit', cost: 2, atk: 2, hp: 2,
  text: '登場：抽 1 張。', onPlay: function (s, c) { draw(s, c.pi, 1); }
});

C({
  id: 'n_cirno', tribe: ['妖精'], name: '琪露諾', src: '紅', cls: 'neutral', type: 'unit', cost: 2, atk: 2, hp: 3,
  text: '登場：使一個敵方角色冰結。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) freeze(s, c.target.unit); }
});

C({
  id: 'n_daiyousei', tribe: ['妖精'], name: '大妖精', src: '紅', cls: 'neutral', type: 'unit', cost: 2, atk: 1, hp: 4,
  text: '登場：我方一個角色 +0/+2。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, 0, 2); }
});

C({ id: 'n_meiling', tribe: ['妖怪'], name: '紅美鈴', src: '紅', cls: 'neutral', type: 'unit', cost: 3, atk: 2, hp: 5, kw: ['守護'], text: '守護。中國，你在打瞌睡吧。' });

C({
  id: 'n_patchouli', tribe: ['魔法使'], name: '帕秋莉·諾蕾姬', src: '紅', cls: 'neutral', type: 'unit', cost: 4, atk: 3, hp: 4,
  text: '符卡使 1：你每發動一張符卡，此角色永久 +1/+0。',
  onAllySpell: function (s, u) { buffUnit(u, 1, 0); }
});

C({
  id: 'n_sp_barrier', name: '博麗大結界', src: '紅', cls: 'neutral', type: 'spell', cost: 3,
  text: '抽 2 張。', onPlay: function (s, c) { draw(s, c.pi, 2); }
});

C({
  id: 'n_sp_seal', name: '靈符「夢想封印」', src: '紅', cls: 'neutral', type: 'spell', cost: 2,
  text: '對一個角色造成 3 點傷害。', target: T.anyUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 3); }
});

C({
  id: 'n_wd_shimenawa', set: '基',  name: '注連繩結界', src: '紅', cls: 'neutral', type: 'ward', cost: 2,
  text: '我方角色 +0/+1。',
  aura: function (s, owner, u) { return u.owner === owner ? [0, 1] : null; }
});

C({
  id: 'n_wd_fuma', name: '夢符「封魔陣」', src: '紅', cls: 'neutral', type: 'ward', cost: 3,
  text: '你的回合開始時，對隨機一個敵方角色造成 1 點傷害。',
  onTurnStart: function (s, owner) {
    var t = pick(s, unitsOf(s, foe(owner)));
    if (t) { logMsg(s, '「封魔陣」對「' + def(t.defId).name + '」造成 1'); dmgUnit(s, t, 1); }
  }
});

C({
  id: 'n_fd_shrine', name: '博麗神社', src: '紅', cls: 'neutral', type: 'field', cost: 4,
  text: '你的回合開始時多抽 1 張。',
  onTurnStart: function (s, owner) { logMsg(s, '「博麗神社」— 多抽 1 張'); draw(s, owner, 1); }
});

C({
  id: 'n_fd_scarlet', name: '紅魔館', src: '紅', cls: 'neutral', type: 'field', cost: 3,
  text: '我方角色 +1/+0。',
  aura: function (s, owner, u) { return u.owner === owner ? [1, 0] : null; }
});

C({
  id: 'r_musou', name: '靈符「夢想封印·散」', src: '紅', cls: 'reimu', type: 'spell', cost: 3,
  text: '對一個敵方角色造成 4 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 4); }
});

C({
  id: 'r_taiji', name: '妖怪退治', src: '紅', cls: 'reimu', type: 'spell', cost: 3,
  text: '對一個敵方角色造成 2 點傷害，抽 1 張。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 2); draw(s, c.pi, 1); }
});

C({
  id: 'r_nijuu', name: '二重結界', src: '紅', cls: 'reimu', type: 'ward', cost: 3,
  text: '對手的符卡費用 +1。',
  costMod: function (s, owner, d, casterPi) { return (casterPi !== owner && d.type === 'spell') ? 1 : 0; }
});

C({
  id: 'm_hijou', name: '戀符「非常識彈」', src: '紅', cls: 'marisa', type: 'spell', cost: 2,
  text: '對一個敵方目標（角色或英雄）造成 3 點傷害。', target: T.eChar,
  onPlay: function (s, c) {
    if (!c.target) return;
    if (c.target.hero) dmgHero(s, c.target.pi, 3); else dmgUnit(s, c.target.unit, 3);
  }
});

C({
  id: 'm_mushroom', tribe: ['妖怪'], name: '魔法之森的妖怪', src: '紅', cls: 'marisa', type: 'unit', cost: 2, atk: 2, hp: 2,
  text: '死去：抽 1 張。',
  onDeath: function (s, pi, u) { draw(s, pi, 1); }
});

C({
  id: 'm_spark', name: '魔砲「Final Spark」', src: '紅', cls: 'marisa', type: 'spell', cost: 4,
  text: '對一個目標造成 6 點傷害。', target: T.eChar,
  onPlay: function (s, c) {
    if (!c.target) return;
    if (c.target.hero) dmgHero(s, c.target.pi, 6); else dmgUnit(s, c.target.unit, 6);
  }
});

C({
  id: 'm_hakkero', name: '迷你八卦爐', src: '紅', cls: 'marisa', type: 'ward', cost: 3,
  text: '你每回合的第一張符卡費用 -1。',
  costMod: function (s, owner, d, casterPi) {
    if (casterPi !== owner || d.type !== 'spell') return 0;
    return (s.players[owner].spellsThisTurn || 0) === 0 ? -1 : 0;
  }
});

C({
  id: 'm_forest', name: '魔法之森', src: '紅', cls: 'marisa', type: 'field', cost: 3,
  text: '你的符卡造成的傷害 +1。', spellDmg: 1
});

C({
  id: 's_knife', name: '銀符「彈幕刃」', src: '紅', cls: 'sakuya', type: 'spell', cost: 1,
  text: '對一個敵方角色造成 2 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 2); }
});

C({
  id: 's_doll', tribe: ['人偶'], name: '殺人人偶', src: '紅', cls: 'sakuya', type: 'unit', cost: 3, atk: 3, hp: 2, kw: ['疾走'],
  text: '疾走。'
});

C({
  id: 's_sakuyaworld', name: '幻在「清晰的世界」', src: '紅', cls: 'sakuya', type: 'spell', cost: 5,
  text: '我方所有角色本回合可再攻擊一次。',
  onPlay: function (s, c) { unitsOf(s, c.pi).forEach(function (u) { if (!u.summoned || hasKw(u, '疾走')) u.attacksLeft++; }); }
});

C({
  id: 'e_fuyajou', name: '紅符「不夜城紅」', src: '紅', cls: 'remilia', type: 'spell', cost: 3,
  text: '對一個敵方角色造成 3 點傷害，我方英雄回復 3。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 3); healHero(s, c.pi, 3); }
});

C({
  id: 'e_gungnir', name: '神槍「Spear the Gungnir」', src: '紅', cls: 'remilia', type: 'spell', cost: 4,
  text: '破壞一個敵方角色，並對我方英雄造成 3 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) { destroyUnit(s, c.target.unit); dmgHero(s, c.pi, 3); } }
});

C({
  id: 'e_scarletmoon', name: '命運的紅月', src: '紅', cls: 'remilia', type: 'spell', cost: 5,
  text: '對敵方英雄造成 4 點傷害，我方英雄回復 4 點。',
  onPlay: function (s, c) { dmgHero(s, foe(c.pi), 4); healHero(s, c.pi, 4); }
});

C({
  id: 'e_flandre', tribe: ['吸血鬼'], name: '芙蘭朵露·斯卡蕾特', src: '紅', cls: 'remilia', type: 'unit', cost: 6, atk: 7, hp: 5, kw: ['彈幕'],
  text: '彈幕（攻擊時對目標兩側的角色造成同等傷害）。'
});

/* ========== 博麗靈夢：捨身巫女 ========== */
C({
  id: 'r_watashi', name: '厄符「擺渡人」', src: '紅', cls: 'reimu', type: 'spell', cost: 1,
  text: '我方英雄受到 2 點傷害，抽 2 張。',
  onPlay: function (s, c) { dmgHero(s, c.pi, 2); draw(s, c.pi, 2); }
});
C({
  id: 'r_sekima', name: '靈符「斥魔陣」', src: '紅', cls: 'reimu', type: 'spell', cost: 2,
  text: '對一個敵方角色造成 2 點傷害；若它已被封印，改為 4 點。', target: T.eUnit,
  onPlay: function (s, c) {
    if (!c.target || !c.target.unit) return;
    var n = c.target.unit.silenced ? 4 : 2;
    if (n === 4) logMsg(s, '目標已被封印 — 傷害提升為 4');
    dmgUnit(s, c.target.unit, n);
  }
});
C({
  id: 'r_inori', name: '巫女的祈禱', src: '紅', cls: 'reimu', type: 'spell', cost: 3,
  text: '封印一個角色，抽 1 張。', target: T.anyUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) silence(s, c.target.unit);
    draw(s, c.pi, 1);
  }
});
C({
  id: 'r_onmyo', name: '寶符「陰陽寶玉」', src: '紅', cls: 'reimu', type: 'spell', cost: 4,
  text: '封印一個敵方角色，並對它造成 2 點傷害。', target: T.eUnit,
  onPlay: function (s, c) {
    if (!c.target || !c.target.unit) return;
    silence(s, c.target.unit);
    dmgUnit(s, c.target.unit, 2);
  }
});

C({
  id: 'm_madan', name: '符卡「魔彈」', src: '紅', cls: 'marisa', type: 'spell', cost: 1,
  text: '對一個敵方目標造成 1 點傷害；連奏 2：改為 3 點。', target: T.eChar,
  onPlay: function (s, c) {
    if (!c.target) return;
    var n = rensou(s, c.pi, 2) ? 3 : 1;
    if (n === 3) logMsg(s, '『連奏 2』發動 — 傷害提升為 3');
    if (c.target.hero) dmgHero(s, c.target.pi, n); else dmgUnit(s, c.target.unit, n);
  }
});
C({
  id: 'm_raikan', name: '光符「破魔的雷管」', src: '紅', cls: 'marisa', type: 'spell', cost: 2,
  text: '對一個敵方角色造成 2 點傷害；連奏 2：同時對敵方英雄造成 2 點傷害。', target: T.eUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 2);
    if (rensou(s, c.pi, 2)) { logMsg(s, '『連奏 2』發動 — 額外燒臉 2'); dmgHero(s, foe(c.pi), 2); }
  }
});
C({
  id: 'm_shop', name: '霧雨魔法店', src: '紅', cls: 'marisa', type: 'ward', cost: 3,
  text: '你的回合開始時，若你上個回合發動過 2 張以上符卡，抽 1 張。',
  onTurnStart: function (s, owner) {
    if ((s.players[owner].spellsLastTurn || 0) >= 2) {
      logMsg(s, '「霧雨魔法店」— 上回合連奏達標，抽 1 張');
      draw(s, owner, 1);
    }
  }
});
C({
  id: 'm_hat', name: '魔法使的帽子', src: '紅', cls: 'marisa', type: 'ward', cost: 4,
  text: '本回合已發動 2 張以上符卡時，你的符卡費用 -1。',
  costMod: function (s, owner, d, casterPi) {
    if (casterPi !== owner || d.type !== 'spell') return 0;
    return (s.players[owner].spellsThisTurn || 0) >= 2 ? -1 : 0;
  }
});

C({
  id: 'm_masterspark', name: '恋符「Master Spark」', src: '紅', cls: 'marisa', type: 'spell', cost: 5,
  text: '對敵方英雄造成 5 點傷害。',
  onPlay: function (s, c) { dmgHero(s, foe(c.pi), 5); }
});

/* ========== 十六夜咲夜：時間停止 ========== */
C({
  id: 's_maid2', tribe: ['妖精'], name: '紅魔館的侍女', src: '紅', cls: 'sakuya', type: 'unit', cost: 2, atk: 2, hp: 2, kw: ['疾走'],
  text: '疾走。被咲夜訓練過的妖精女僕。'
});
C({
  id: 's_inscribe', name: '傷符「幻痛」', src: '紅', cls: 'sakuya', type: 'spell', cost: 3,
  text: '我方一個角色本回合可再攻擊一次，並抽 1 張。', target: T.aUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) c.target.unit.attacksLeft++;
    draw(s, c.pi, 1);
  }
});

C({
  id: 's_clock', name: '幻在「クロックコープス」', src: '紅', cls: 'sakuya', type: 'spell', cost: 6,
  text: '我方一個角色本回合可以再攻擊三次。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.attacksLeft += 3; }
});

C({
  id: 'e_shoot', name: '紅符「Scarlet Shoot」', src: '紅', cls: 'remilia', type: 'spell', cost: 2,
  text: '對一個敵方角色造成 2 點傷害，我方英雄回復 2 點。', target: T.eUnit,
  onPlay: function (s, c) {
    if (!c.target || !c.target.unit) return;
    dmgUnit(s, c.target.unit, 2); healHero(s, c.pi, 2);
  }
});
C({
  id: 'e_night', tribe: ['妖獸'], name: '小蝙蝠', src: '紅', cls: 'remilia', type: 'unit', cost: 2, atk: 1, hp: 3, kw: ['吸血'],
  text: '吸血。'
});
C({
  id: 'e_vampire', tribe: ['妖獸'], name: '紅魔館的蝙蝠', src: '紅', cls: 'remilia', type: 'unit', cost: 4, atk: 3, hp: 3, kw: ['吸血'],
  text: '吸血。'
});
C({
  id: 'e_redmagic', name: '「Red Magic」', src: '紅', cls: 'remilia', type: 'spell', cost: 5,
  text: '對所有敵方角色造成 2 點傷害，我方英雄回復同等的總傷害量。',
  onPlay: function (s, c) {
    var total = 0;
    var bonus = spellBonus(s, c.pi);
    unitsOf(s, foe(c.pi)).forEach(function (u) {
      total += Math.min(2 + bonus, hpOf(u));
      dmgUnit(s, u, 2);
    });
    if (total > 0) { logMsg(s, '「Red Magic」回復 ' + total + ' 點'); healHero(s, c.pi, total); }
  }
});
C({
  id: 'e_mist', name: '紅霧異變', src: '紅', cls: 'remilia', type: 'field', cost: 6,
  text: '我方角色獲得吸血。',
  grantKw: function (s, owner, u) { return u.owner === owner ? '吸血' : null; }
});
C({
  id: 'c_reimu', tribe: ['人類'], name: '博麗靈夢', src: '紅', cls: 'neutral', type: 'unit',
  cost: 5, atk: 4, hp: 5, kw: ['飛行'], pair: 'c_yukari',
  text: '飛行。登場：對一個敵方角色造成 2 點傷害。人妖組（八雲紫）：此角色 +1/+1。',
  target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 2); },
  selfAura: function (s, u) { return paired(s, u) ? [1, 1] : null; }
});
C({
  id: 'c_marisa', tribe: ['人類', '魔法使'], name: '霧雨魔理沙', src: '紅', cls: 'neutral',
  type: 'unit', cost: 5, atk: 5, hp: 4, pair: 'c_alice',
  text: '登場：對敵方英雄造成 3 點傷害。人妖組（愛麗絲·瑪格特羅依德）：你每發動一張符卡，此角色 +1/+0。',
  onPlay: function (s, c) { dmgHero(s, foe(c.pi), 3); },
  onAllySpell: function (s, u) { if (paired(s, u)) buffUnit(u, 1, 0); }
});
C({
  id: 'c_sakuya', tribe: ['人類'], name: '十六夜咲夜', src: '紅', cls: 'neutral', type: 'unit',
  cost: 5, atk: 4, hp: 4, pair: 'c_remilia',
  text: '登場：我方一個角色本回合可再攻擊一次。人妖組（蕾米莉亞·斯卡蕾特）：此角色 +2/+1。',
  target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.attacksLeft++; },
  selfAura: function (s, u) { return paired(s, u) ? [2, 1] : null; }
});
C({
  id: 'c_remilia', tribe: ['吸血鬼'], name: '蕾米莉亞·斯卡蕾特', src: '紅', cls: 'neutral',
  type: 'unit', cost: 5, atk: 4, hp: 4, kw: ['吸血'], pair: 'c_sakuya',
  text: '吸血。登場：對一個敵方角色造成 2 點傷害。人妖組（十六夜咲夜）：此角色 +2/+1。',
  target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 2); },
  selfAura: function (s, u) { return paired(s, u) ? [2, 1] : null; }
});

/* ========== BGM 卡 ==========
   全場只有一個 BGM 播放器，新的會蓋過舊的（包含對手的）。
   牌組只能放 1 張；發動後檢索敘述指定的角色，並讓對手下回合不能發動 BGM。
   自己的第 4 回合，牌組裡的 BGM 卡會自動上手。 */
C({
  id: 'bgm_reimu', name: '少女綺想曲 ～ Dream Battle', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_reimu',
  text: '發動：從牌庫檢索「博麗靈夢」。我方「守護」角色 +0/+2。',
  aura: function (s, owner, u) { return (u.owner === owner && hasKw(u, '守護')) ? [0, 2] : null; }
});
C({
  id: 'bgm_marisa', name: '恋色マスタースパーク', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_marisa',
  text: '發動：從牌庫檢索「霧雨魔理沙」。你的符卡造成的傷害 +1。',
  spellDmg: 1
});
C({
  id: 'bgm_sakuya', name: 'メイドと血の懐中時計', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_sakuya',
  text: '發動：從牌庫檢索「十六夜咲夜」。我方「疾走」角色 +1/+1。',
  aura: function (s, owner, u) { return (u.owner === owner && hasKw(u, '疾走')) ? [1, 1] : null; }
});
C({
  id: 'bgm_remilia', name: '亡き王女の為のセプテット', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_remilia',
  text: '發動：從牌庫檢索「蕾米莉亞·斯卡蕾特」。我方「吸血」角色 +1/+0。',
  aura: function (s, owner, u) { return (u.owner === owner && hasKw(u, '吸血')) ? [1, 0] : null; }
});

/* ========== 霧雨魔理沙：符卡引擎（連奏魔女） ==========
   技能每回合抽 1 張並降 1 費 → 一回合能連打多張便宜符卡
   → 觸發連奏、把「符卡使」角色養大 → 用隨機多段與全體傷害清場 → Spark 收頭。 */
C({
  id: 'm_grimoire', name: '魔導書', src: '紅', cls: 'marisa', type: 'ward', cost: 2,
  text: '你發動符卡時，隨機一個我方角色 +1/+0。',
  onAllySpell: function (s, owner) {
    var t = pick(s, unitsOf(s, owner));
    if (t) buffUnit(t, 1, 0);
  }
});

C({
  id: 'm_milkyway', name: '魔符「ミルキーウェイ」', src: '紅', cls: 'marisa', type: 'spell', cost: 2,
  text: '對隨機的敵方角色造成 1 點傷害 3 次（沒有敵方角色時改為打敵方英雄）。',
  onPlay: function (s, c) {
    for (var i = 0; i < 3; i++) {
      var foes = unitsOf(s, foe(c.pi)).filter(function (u) { return canTargetUnit(s, c.pi, u); });
      if (foes.length) dmgUnit(s, pick(s, foes), 1);
      else dmgHero(s, foe(c.pi), 1);
      cleanupDeaths(s);
    }
  }
});
C({
  id: 'm_blazing', name: '彗星「ブレイジングスター」', src: '紅', cls: 'marisa', type: 'spell', cost: 5,
  text: '對所有敵方角色造成 3 點傷害。',
  onPlay: function (s, c) { unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, 3); }); }
});

/* ========== 依作品觸發的結界（每包一張） ========== */
C({
  id: 'e_wd_eosd', name: '紅魔館結界', src: '紅', cls: 'neutral', type: 'ward', cost: 3,
  text: '你召喚有收錄於「東方紅魔鄉」的角色時，該角色 +1/+0。',
  onAllySummon: function (s, owner, u) {
    if (!unitAppearsIn(u, '紅')) return;
    buffUnit(u, 1, 0);
    logMsg(s, '「紅魔館結界」— 「' + def(u.defId).name + '」+1/+0');
  }
});

/* ############################################################
   紅魔館七人的職業卡
   每一組都對著該英雄的技能設計，符卡名以原作實際出現的為主。
   ############################################################ */

/* ========== 露米婭：宵闇（全體隱行） ==========
   技能每回合給一個角色隱行。隱行在本作是「不能被指定、不算守護、
   攻擊後解除」—— 所以她的玩法是鋪場 → 全體隱行躲過點殺 → 一次總攻。
   下面的卡負責把「隱行」從保命手段變成主動的傷害來源。 */

C({
  id: 'ru_nightbird', name: '夜符「ナイトバード」', src: '紅', cls: 'rumia', type: 'spell', cost: 4,
  text: '我方所有角色獲得隱行，並在本回合 +1/+0。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { u.stealth = true; buffUnit(u, 1, 0, true); });
    logMsg(s, '宵闇降臨 — 我方全體進入隱行');
  }
});

C({
  id: 'ru_dimarcation', name: '闇符「ディマーケイション」', src: '紅', cls: 'rumia', type: 'spell', cost: 3,
  text: '我方一個角色 +2/+2 並獲得隱行。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 2, 2);
    u.stealth = true;
  }
});

C({
  id: 'ru_moonlight', name: '月符「ムーンライトレイ」', src: '紅', cls: 'rumia', type: 'spell', cost: 2,
  text: '對一個敵方角色造成 3 點傷害；若我方有隱行的角色，抽 1 張。', target: T.eUnit,
  onPlay: function (s, c) {
    if (!c.target || !c.target.unit) return;
    dmgUnit(s, c.target.unit, 3);
    var hid = unitsOf(s, c.pi).some(function (u) { return u.stealth; });
    if (hid) { logMsg(s, '暗處有伏兵 — 抽 1 張'); draw(s, c.pi, 1); }
  }
});

C({
  id: 'ru_yamiyousei', tribe: ['妖精'], name: '闇之妖精', src: '紅', cls: 'rumia', type: 'unit',
  cost: 2, atk: 3, hp: 1, kw: ['隱行'], works: ['紅'],
  text: '隱行。躲在宵闇裡的妖精，數量比看得見的多。'
});

C({
  id: 'ru_kurayami', tribe: ['妖怪'], name: '闇中的妖怪', src: '紅', cls: 'rumia', type: 'unit',
  cost: 4, atk: 3, hp: 4, kw: ['隱行'], works: ['紅'],
  text: '隱行。其他我方隱行的角色 +2/+0。',
  // 攻擊會解除隱行，但 doAttack 算傷害時還沒重算光環 ——
  // 所以從暗處打出的那一擊帶得走加成，之後才現形。這正是想要的行為。
  unitAura: function (s, self, u) { return u.stealth ? [2, 0] : null; }
});

C({
  id: 'ru_wd_yoiyami', name: '宵闇結界', src: '紅', cls: 'rumia', type: 'ward', cost: 3,
  text: '我方角色登場時獲得隱行。',
  onAllySummon: function (s, owner, u) { u.stealth = true; }
});

C({
  id: 'bgm_rumia', name: 'ほおずきみたいに紅い魂', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_rumia',
  text: '發動：從牌庫檢索「露米婭」。我方隱行的角色 +1/+0。',
  aura: function (s, owner, u) { return (u.owner === owner && u.stealth) ? [1, 0] : null; }
});

/* ========== 琪露諾：全體冰結 ==========
   技能是「冰結一個；已冰結的改為生命 -1」—— 前期擋刀，後期把凍住的東西慢慢削死。
   職業卡負責把「凍住」從單點延伸成全場，並給被凍住的目標追加懲罰。 */

C({
  id: 'ci_perfectfreeze', name: '凍符「パーフェクトフリーズ」', src: '紅', cls: 'cirno', type: 'spell', cost: 4,
  text: '使所有敵方角色冰結。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { freeze(s, u); });
    logMsg(s, '全場凍結');
  }
});

C({
  id: 'ci_icicle', name: '冰符「アイシクルフォール」', src: '紅', cls: 'cirno', type: 'spell', cost: 2,
  text: '對一個敵方角色造成 2 點傷害並使其冰結。', target: T.eUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    dmgUnit(s, u, 2);
    if (!u.dead) freeze(s, u);
  }
});

C({
  id: 'ci_diamond', name: '雪符「ダイアモンドブリザード」', src: '紅', cls: 'cirno', type: 'spell', cost: 3,
  text: '對所有敵方角色造成 1 點傷害；已被冰結的改為 3 點。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) {
      dmgUnit(s, u, isFrozen(u) ? 3 : 1);
    });
  }
});

C({
  id: 'ci_kanzen', name: '冷符「完全凍結」', src: '紅', cls: 'cirno', type: 'spell', cost: 6,
  text: '破壞所有被冰結的敵方角色。',
  onPlay: function (s, c) {
    var list = unitsOf(s, foe(c.pi)).filter(isFrozen);
    if (!list.length) { logMsg(s, '沒有被冰結的角色，「完全凍結」落空'); return; }
    list.forEach(function (u) { destroyUnit(s, u); });
  }
});

/* 本來這張也是「登場：冰結一個敵方角色」，跟中立的「琪露諾」同費同效果、
   數值還少一點 —— 專屬卡被中立卡完全壓過，沒有存在的理由。
   改成「收割已經凍住的目標」：不再是第六張冰結卡，而是把凍好的場面
   換成傷害，補上這個流派缺的收頭手段。 */
C({
  id: 'ci_icefairy', tribe: ['妖精'], name: '冰之妖精', src: '紅', cls: 'cirno', type: 'unit',
  cost: 2, atk: 2, hp: 2, works: ['紅'],
  text: '登場：對每個被冰結的敵方角色造成 1 點傷害。',
  onPlay: function (s, c) {
    var list = unitsOf(s, foe(c.pi)).filter(isFrozen);
    if (!list.length) { logMsg(s, '對方沒有被冰結的角色'); return; }
    list.forEach(function (u) { dmgUnit(s, u, 1); });
  }
});

C({
  id: 'ci_wd_misty', name: '霧之湖結界', src: '紅', cls: 'cirno', type: 'ward', cost: 3,
  text: '你的回合結束時，對每個被冰結的敵方角色造成 1 點傷害。',
  onTurnEnd: function (s, owner) {
    unitsOf(s, foe(owner)).filter(isFrozen).forEach(function (u) { dmgUnit(s, u, 1); });
  }
});

C({
  id: 'bgm_cirno', name: 'おてんば恋娘', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_cirno',
  text: '發動：從牌庫檢索「琪露諾」。我方「妖精」角色 +1/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '妖精')) ? [1, 0] : null;
  }
});

/* ========== 大妖精：妖精增益 ==========
   技能每回合隨機給「妖精」+1/+1 兩次 —— 場上妖精愈多，技能命中愈準。
   所以她的職業卡不是強力單卡，而是「把妖精鋪滿」與「一次全體加成」。 */

C({
  id: 'da_swarm', name: '妖精大戰爭', src: '紅', cls: 'daiyousei', type: 'spell', cost: 4,
  text: '召喚三個「妖精」。',
  onPlay: function (s, c) {
    for (var i = 0; i < 3; i++) summon(s, c.pi, 'n_fairy', {});
  }
});

C({
  id: 'da_growth', name: '妖精的成長', src: '紅', cls: 'daiyousei', type: 'spell', cost: 3,
  text: '我方所有「妖精」角色 +1/+1。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) {
      if (hasTribe(def(u.defId), '妖精')) buffUnit(u, 1, 1);
    });
  }
});

C({
  id: 'da_gather', name: '妖精的呼喚', src: '紅', cls: 'daiyousei', type: 'spell', cost: 1,
  text: '從牌庫檢索一張「妖精」角色。',
  onPlay: function (s, c) {
    tutor(s, c.pi, function (d) { return d.type === 'unit' && hasTribe(d, '妖精'); });
  }
});

C({
  id: 'da_sunflower', tribe: ['妖精'], name: '向日葵妖精', src: '紅', cls: 'daiyousei', type: 'unit',
  cost: 3, atk: 2, hp: 2, works: ['紅'],
  text: '登場：其他我方「妖精」角色 +1/+1。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) {
      if (u !== c.self && hasTribe(def(u.defId), '妖精')) buffUnit(u, 1, 1);
    });
  }
});

C({
  id: 'da_guardfairy', tribe: ['妖精'], name: '守護妖精', src: '紅', cls: 'daiyousei', type: 'unit',
  cost: 3, atk: 1, hp: 4, kw: ['守護'], works: ['紅'],
  text: '守護。其他我方「妖精」角色 +0/+1。',
  unitAura: function (s, self, u) {
    return hasTribe(def(u.defId), '妖精') ? [0, 1] : null;
  }
});

C({
  id: 'da_fd_lake', name: '霧之湖', src: '紅', cls: 'daiyousei', type: 'field', cost: 4,
  text: '我方「妖精」角色 +1/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '妖精')) ? [1, 1] : null;
  }
});

C({
  id: 'bgm_daiyousei', name: 'ルーネイトエルフ', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_daiyousei',
  text: '發動：從牌庫檢索「大妖精」。我方「妖精」角色 +0/+2。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '妖精')) ? [0, 2] : null;
  }
});

/* ========== 紅美鈴：守護 ==========
   技能給守護，已有守護的改為生命 +1 —— 她的資源是「生命值」而不是攻擊力。
   核心是「気符『地気の球』」：守護角色的生命值加倍，
   讓那些 1/6、2/5 的門番一口氣變成清不掉的牆。 */

C({
  id: 'me_wd_chiki', name: '気符「地気の球」', src: '紅', cls: 'meiling', type: 'ward', cost: 4,
  text: '我方擁有「守護」的角色，生命值加倍。',
  // 加倍的基準是「基礎生命 + 永久強化」，不含其他光環 ——
  // 否則兩個互相參照的光環會在 recalc 裡無限膨脹。
  aura: function (s, owner, u) {
    if (u.owner !== owner || !hasKw(u, '守護')) return null;
    return [0, u.baseHp + (u.buffHp || 0)];
  }
});

C({
  id: 'me_kouka', name: '華符「芳華絢爛」', src: '紅', cls: 'meiling', type: 'spell', cost: 3,
  text: '我方一個角色獲得守護並 +0/+4。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    addKw(u, '守護');
    buffUnit(u, 0, 4);
  }
});

C({
  id: 'me_rainbow', name: '虹符「彩虹の風鈴」', src: '紅', cls: 'meiling', type: 'spell', cost: 2,
  text: '我方一個角色 +0/+3；若它有守護，抽 1 張。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 0, 3);
    if (hasKw(u, '守護')) { logMsg(s, '守住了 — 抽 1 張'); draw(s, c.pi, 1); }
  }
});

C({
  id: 'me_saikou', name: '極彩「彩光乱舞」', src: '紅', cls: 'meiling', type: 'spell', cost: 5,
  text: '對所有敵方角色造成傷害，點數等於我方擁有「守護」的角色數（最多 4）。',
  onPlay: function (s, c) {
    var n = Math.min(4, unitsOf(s, c.pi).filter(function (u) { return hasKw(u, '守護'); }).length);
    if (!n) { logMsg(s, '沒有守護的角色，「彩光乱舞」落空'); return; }
    logMsg(s, '守護 ' + n + ' 個 — 全體 ' + n + ' 點傷害');
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, n); });
  }
});

C({
  id: 'me_youkai', tribe: ['妖怪'], name: '紅魔館的門衛', src: '紅', cls: 'meiling', type: 'unit',
  // 中立的「紅美鈴」同樣 3 費 2/5 守護，所以這張必須在生命上更高，
  // 否則專屬卡完全沒有存在的理由。生命高也正好配合她的「生命加倍」。
  cost: 3, atk: 1, hp: 6, kw: ['守護'], works: ['紅'],
  text: '守護。跟著美鈴一起在門口站著的妖怪。'
});

C({
  id: 'me_fairymaid', tribe: ['妖精'], name: '值班的妖精女僕', src: '紅', cls: 'meiling', type: 'unit',
  cost: 2, atk: 1, hp: 3, works: ['紅'],
  text: '登場：我方一個角色獲得守護。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) addKw(c.target.unit, '守護'); }
});

C({
  id: 'bgm_meiling', name: '上海紅茶館 ～ Chinese Tea', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_meiling',
  text: '發動：從牌庫檢索「紅美鈴」。我方擁有「守護」的角色 +1/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasKw(u, '守護')) ? [1, 0] : null;
  }
});

/* ========== 帕秋莉：七曜與賢者之石 ==========
   技能用「血量」換抽牌 —— 她抽得比誰都快，但活得比誰都短。
   七曜符卡各自負責一種功能（燒、補、抽、削、爆），
   賢者之石則讓每一張她自己的符卡都額外附帶一次隨機傷害，
   把「手牌換血量」變成「血量換場面」。 */

C({
  id: 'pa_wd_stone', name: '賢者之石', src: '紅', cls: 'patchouli', type: 'ward', cost: 4,
  text: '你發動帕秋莉的符卡時，對隨機一個敵方角色造成 2 點傷害。',
  onAllySpell: function (s, owner, sd) {
    if (!sd || sd.cls !== 'patchouli') return;
    var t = pick(s, unitsOf(s, foe(owner)));
    if (!t) return;
    logMsg(s, '『賢者之石』共鳴 — 隨機 2 點傷害');
    dmgUnit(s, t, 2);
  }
});

C({
  id: 'pa_agni', name: '火符「アグニシャイン」', src: '紅', cls: 'patchouli', type: 'spell', cost: 2,
  text: '對一個敵方角色造成 3 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 3); }
});

C({
  id: 'pa_undine', name: '水符「プリンセスウンディネ」', src: '紅', cls: 'patchouli', type: 'spell', cost: 3,
  text: '我方英雄回復 6 點。',
  onPlay: function (s, c) { healHero(s, c.pi, 6); }
});

C({
  id: 'pa_sylphy', name: '木符「シルフィホルン」', src: '紅', cls: 'patchouli', type: 'spell', cost: 2,
  text: '抽 2 張。',
  onPlay: function (s, c) { draw(s, c.pi, 2); }
});

C({
  id: 'pa_metal', name: '金符「メタルファティーグ」', src: '紅', cls: 'patchouli', type: 'spell', cost: 2,
  text: '使一個敵方角色 -3/-0。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, -3, 0); }
});

C({
  id: 'pa_kyoseki', name: '土符「巨石落とし」', src: '紅', cls: 'patchouli', type: 'spell', cost: 4,
  text: '對一個敵方角色造成 6 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 6); }
});

C({
  id: 'pa_royalflare', name: '日符「ロイヤルフレア」', src: '紅', cls: 'patchouli', type: 'spell', cost: 6,
  text: '對所有敵方角色造成 4 點傷害。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, 4); });
  }
});

C({
  id: 'pa_selena', name: '月符「サイレントセレナ」', src: '紅', cls: 'patchouli', type: 'spell', cost: 5,
  text: '對所有敵方角色造成 3 點傷害，我方英雄回復 3 點。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, 3); });
    healHero(s, c.pi, 3);
  }
});

C({
  id: 'bgm_patchouli', name: 'ラクトガール ～ 少女密室', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_patchouli',
  text: '發動：從牌庫檢索「帕秋莉·諾蕾姬」。我方「魔法使」角色 +1/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '魔法使')) ? [1, 1] : null;
  }
});

/* ========== 小惡魔：圖書館的助手 ==========
   （這一組沒有指定方向，是照她的技能「隨機生成一張費用 -2 的卡」延伸的：
     圖書館助手 = 檢索、抄寫、降費。她自己打不動人，但能讓別人早一回合出手。）*/

C({
  id: 'ko_search', name: '文獻檢索', src: '紅', cls: 'koakuma', type: 'spell', cost: 1,
  text: '從牌庫檢索一張符卡。',
  onPlay: function (s, c) { tutor(s, c.pi, function (d) { return d.type === 'spell'; }); }
});

C({
  id: 'ko_copy', name: '謄寫', src: '紅', cls: 'koakuma', type: 'spell', cost: 3,
  text: '複製手牌中隨機一張卡，複製品費用 -1。',
  onPlay: function (s, c) {
    var p = s.players[c.pi];
    var src = pick(s, p.hand);
    if (!src) { logMsg(s, '手牌是空的，沒有東西可抄'); return; }
    if (p.hand.length >= HAND_MAX) { logMsg(s, '手牌已滿'); return; }
    var copy = makeCard(src.defId);
    copy.costMod -= 1;
    p.hand.push(copy);
    logMsg(s, '抄寫了「' + def(src.defId).name + '」（費用 -1）');
  }
});

C({
  id: 'ko_serve', tribe: ['惡魔'], name: '圖書館的助手', src: '紅', cls: 'koakuma', type: 'unit',
  cost: 2, atk: 2, hp: 3, works: ['紅'],
  text: '登場：手牌中隨機一張符卡費用 -2。',
  onPlay: function (s, c) {
    var sp = s.players[c.pi].hand.filter(function (h) { return def(h.defId).type === 'spell'; });
    var t = pick(s, sp);
    if (!t) { logMsg(s, '手牌沒有符卡'); return; }
    t.costMod -= 2;
    logMsg(s, '「' + def(t.defId).name + '」費用 -2');
  }
});

C({
  id: 'ko_wings', tribe: ['惡魔'], name: '惡魔的羽翼', src: '紅', cls: 'koakuma', type: 'unit',
  cost: 3, atk: 3, hp: 2, kw: ['飛行'], works: ['紅'],
  text: '飛行。小惡魔背上那對不太可靠的翅膀。'
});

C({
  id: 'ko_fd_voile', name: 'ヴワル魔法圖書館', src: '紅', cls: 'koakuma', type: 'field', cost: 3,
  text: '你每回合的第一張符卡費用 -1。',
  costMod: function (s, owner, d, casterPi) {
    if (casterPi !== owner || d.type !== 'spell') return 0;
    return (s.players[owner].spellsThisTurn || 0) === 0 ? -1 : 0;
  }
});

C({
  id: 'bgm_koakuma', name: 'ヴワル魔法図書館', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_koakuma',
  text: '發動：從牌庫檢索「小惡魔」。我方「惡魔」與「魔法使」角色 +1/+1。',
  aura: function (s, owner, u) {
    if (u.owner !== owner) return null;
    var d = def(u.defId);
    return (hasTribe(d, '惡魔') || hasTribe(d, '魔法使')) ? [1, 1] : null;
  }
});

/* ========== 芙蘭朵露：破壞 ==========
   技能 5 費無條件破壞 —— 貴，但什麼都殺得掉。
   職業卡走同一條路：效果都比同費強一截，代價是自己的血、手牌、或連自己的場面一起炸。
   她是那種「贏要贏在對面先倒下」的英雄。 */

C({
  id: 'c_flandre', tribe: ['吸血鬼'], name: '芙蘭朵露·斯卡蕾特', src: '紅', cls: 'neutral', type: 'unit',
  cost: 6, atk: 5, hp: 5, kw: ['吸血'], works: ['紅'],
  text: '吸血。登場：對一個敵方角色造成 3 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 3); }
});

C({
  id: 'fl_levantine', name: '禁忌「レーヴァテイン」', src: '紅', cls: 'flandre', type: 'spell', cost: 6,
  text: '對所有敵方角色造成 4 點傷害；我方英雄受到 3 點傷害。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, 4); });
    dmgHero(s, c.pi, 3);
  }
});

C({
  id: 'fl_four', name: '禁忌「フォーオブアカインド」', src: '紅', cls: 'flandre', type: 'spell', cost: 5,
  text: '召喚三個 1/1 並具有疾走的「分身」。',
  onPlay: function (s, c) {
    for (var i = 0; i < 3; i++) summon(s, c.pi, 'fl_bunshin', {});
  }
});

C({
  id: 'fl_bunshin', tribe: ['吸血鬼'], name: '分身', src: '紅', cls: 'flandre', type: 'unit',
  cost: 1, atk: 1, hp: 1, kw: ['疾走'], token: true, works: ['紅'],
  text: '疾走。芙蘭朵露分裂出來的自己。'
});

C({
  id: 'fl_starbow', name: '禁弾「スターボウブレイク」', src: '紅', cls: 'flandre', type: 'spell', cost: 3,
  text: '對所有角色造成 2 點傷害（包含我方）。',
  onPlay: function (s, c) {
    allUnits(s).forEach(function (u) { dmgUnit(s, u, 2); });
  }
});

C({
  id: 'fl_andthen', name: '秘弾「そして誰もいなくなるか?」', src: '紅', cls: 'flandre', type: 'spell', cost: 5,
  text: '破壞一個角色；隨機棄掉 2 張手牌。', target: T.anyUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) destroyUnit(s, c.target.unit);
    var h = s.players[c.pi].hand;
    for (var i = 0; i < 2 && h.length; i++) {
      var k = rngInt(s, h.length);
      logMsg(s, '棄掉「' + def(h[k].defId).name + '」');
      s.players[c.pi].grave.push({ defId: h[k].defId });
      h.splice(k, 1);
    }
  }
});

C({
  id: 'fl_qed', name: '「QED "495年の波紋"」', src: '紅', cls: 'flandre', type: 'spell', cost: 8,
  text: '破壞場上所有角色。',
  onPlay: function (s, c) {
    allUnits(s).forEach(function (u) { destroyUnit(s, u); });
    logMsg(s, '四百九十五年份的破壞 — 場上清空');
  }
});

C({
  id: 'fl_wd_kinki', name: '禁忌的地下室', src: '紅', cls: 'flandre', type: 'ward', cost: 3,
  text: '我方角色死去時，對敵方英雄造成 1 點傷害。',
  onAllyDeath: function (s, owner, u) { dmgHero(s, foe(owner), 1); }
});

C({
  id: 'bgm_flandre', name: 'U.N.オーエンは彼女なのか？', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_flandre',
  text: '發動：從牌庫檢索「芙蘭朵露·斯卡蕾特」。我方「吸血鬼」角色 +2/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '吸血鬼')) ? [2, 0] : null;
  }
});

/* ===== js/cards/pcb.js ===== */
/* ============================================================
   東方符卡大戰 — 卡表：第七彈・東方妖妖夢 (TH07 PCB)
   白玉樓、八雲家、騷靈三姊妹、人偶
   共 55 張。要新增這一彈的卡，直接在本檔加 C({...})。
   ============================================================ */
'use strict';

C({ id: 'n_shanghai', tribe: ['人偶'], name: '上海人偶', src: '妖', cls: 'neutral', type: 'unit', cost: 1, atk: 1, hp: 1, kw: ['守護'], text: '守護。愛麗絲最愛用的人偶。', token: true });

C({
  id: 'n_lily', tribe: ['妖精'], name: '莉莉白', src: '妖', cls: 'neutral', type: 'unit', cost: 1, atk: 1, hp: 1,
  text: '登場：抽 1 張。', onPlay: function (s, c) { draw(s, c.pi, 1); }
});

C({ id: 'n_chen', tribe: ['式神', '妖獸'], name: '橙', src: '妖', cls: 'neutral', type: 'unit', cost: 2, atk: 3, hp: 1, kw: ['疾走'], text: '疾走。式神之式神。' });

C({ id: 'n_ghost', works: [], set: '基', tribe: ['亡靈'], name: '亡靈', src: '妖', cls: 'neutral', type: 'unit', cost: 2, atk: 2, hp: 2, kw: ['飛行'], text: '飛行。白玉樓外飄盪的幽魂。' });

C({
  id: 'n_merlin', tribe: ['亡靈', '騷靈'], name: '梅露蘭·普莉茲姆利巴', src: '妖',
  cls: 'neutral', type: 'unit', cost: 2, atk: 1, hp: 3, kw: ['飛行'],
  text: '飛行。登場：使我方一個角色 +2/+0。合奏：此角色 +1/+1。',
  target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, 2, 0); },
  selfAura: function (s, u) { return ensemble(s, u.owner) ? [1, 1] : null; }
});

C({
  id: 'n_lyrica', tribe: ['亡靈', '騷靈'], name: '莉莉卡·普莉茲姆利巴', src: '妖',
  cls: 'neutral', type: 'unit', cost: 2, atk: 1, hp: 3, kw: ['飛行'],
  text: '飛行。回合結束時抽 1 張。合奏：此角色 +1/+1。',
  onTurnEnd: function (s, u) { draw(s, u.owner, 1); },
  selfAura: function (s, u) { return ensemble(s, u.owner) ? [1, 1] : null; }
});

C({
  id: 'n_letty', tribe: ['妖怪'], name: '蕾迪·懷特洛克', src: '妖', cls: 'neutral', type: 'unit', cost: 3, atk: 3, hp: 3,
  text: '登場：使一個敵方角色冰結。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) freeze(s, c.target.unit); }
});

/* ========== 騷靈三姊妹 ==========
   各自都有能力，湊齊三位不同的「騷靈」時額外 +2/+2（合奏）。
   合奏是動態光環：有一位被打死，另外兩位的加成立刻消失。 */
C({
  id: 'n_lunasa', tribe: ['亡靈', '騷靈'], name: '露娜薩·普莉茲姆利巴', src: '妖',
  cls: 'neutral', type: 'unit', cost: 2, atk: 1, hp: 3, kw: ['飛行'],
  text: '飛行。登場：使一個敵方角色的攻擊力 -2。合奏：此角色 +1/+1。',
  target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, -2, 0); },
  selfAura: function (s, u) { return ensemble(s, u.owner) ? [1, 1] : null; }
});

C({
  id: 'n_ran', tribe: ['式神', '妖獸'], name: '八雲藍', src: '妖', cls: 'neutral', type: 'unit', cost: 5, atk: 4, hp: 4,
  text: '登場：召喚一個「橙」。',
  onPlay: function (s, c) { summon(s, c.pi, 'n_chen', {}); }
});

C({ id: 'y_hansho', tribe: ['亡靈'], name: '半靈', src: '妖', cls: 'neutral', type: 'unit', cost: 1, atk: 1, hp: 2, kw: ['飛行'], text: '飛行。妖夢的另一半。', token: true });

C({
  id: 'n_sp_gap', name: '八雲的隙間', src: '妖', cls: 'neutral', type: 'spell', cost: 1,
  text: '從牌庫檢索 1 張「結界」或「場地」到手上。',
  onPlay: function (s, c) { tutor(s, c.pi, function (d) { return d.type === 'ward' || d.type === 'field'; }); }
});

C({
  id: 'n_wd_sakura', name: '春符「櫻花結界」', src: '妖', cls: 'neutral', type: 'ward', cost: 3,
  text: '你的符卡費用 -1。',
  costMod: function (s, owner, d, casterPi) { return (casterPi === owner && d.type === 'spell') ? -1 : 0; }
});

C({
  id: 'n_fd_hakugyokurou', name: '白玉樓', src: '妖', cls: 'neutral', type: 'field', cost: 3,
  text: '我方角色死去時，我方英雄回復 2 點。',
  onAllyDeath: function (s, owner, u) { healHero(s, owner, 2); }
});

C({
  id: 'm_stardust', set: '紅',  name: '星符「星塵收集」', src: '妖', cls: 'marisa', type: 'spell', cost: 2,
  text: '抽 2 張。',
  onPlay: function (s, c) { draw(s, c.pi, 2); }
});

C({
  id: 'y_utsusemi', name: '人符「現世斬」', src: '妖', cls: 'youmu', type: 'spell', cost: 3,
  text: '破壞一個攻擊力 3 以下的敵方角色。', target: T.eUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    if (atkOf(u) <= 3) destroyUnit(s, u);
    else logMsg(s, '「' + def(u.defId).name + '」攻擊力過高，斬擊落空');
  }
});

C({
  id: 'y_hakurou', tribe: ['人類', '亡靈'], name: '半靈與白樓劍', src: '妖', cls: 'youmu', type: 'unit', cost: 2, atk: 2, hp: 2, kw: ['飛行'],
  text: '飛行。登場：我方一個角色 +1/+1。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, 1, 1); }
});

C({
  id: 'y_rokudou', name: '人鬼「未來永劫斬」', src: '妖', cls: 'youmu', type: 'spell', cost: 6,
  text: '破壞一個角色。', target: T.anyUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) destroyUnit(s, c.target.unit); }
});

C({
  id: 'y_konpaku', tribe: ['人類', '亡靈'], name: '魂魄妖忌', src: '妖', cls: 'youmu', type: 'unit', cost: 5, atk: 5, hp: 5, kw: ['疾走'],
  text: '疾走。登場：對我方英雄造成 1 點傷害。',
  onPlay: function (s, c) { dmgHero(s, c.pi, 1); }
});

C({
  id: 'k_gapyoukai', tribe: ['妖怪'], name: '隙間之目', src: '妖', cls: 'yukari', type: 'unit', cost: 4, atk: 4, hp: 4, kw: ['隱行'],
  text: '隱行。'
});

C({
  id: 'k_hands', tribe: ['妖怪'], name: '隙間之手', src: '妖', cls: 'yukari', type: 'unit', cost: 2, atk: 2, hp: 3, kw: ['隱行'],
  text: '隱行。從境界縫隙伸出的無數雙手。'
});

C({
  id: 'k_shijuu', name: '境界符「四重結界」', src: '妖', cls: 'yukari', type: 'ward', cost: 3,
  text: '登場：抽 1 張。你的英雄受到的傷害 -1。',
  dmgReduce: function () { return 1; },
  onPlay: function (s, c) { draw(s, c.pi, 1); }
});

C({
  id: 'k_shinkai', name: '「深彈幕結界」', src: '妖', cls: 'yukari', type: 'spell', cost: 6,
  text: '破壞所有角色。',
  onPlay: function (s, c) { allUnits(s).forEach(function (u) { destroyUnit(s, u); }); }
});

C({
  id: 'a_shanghai', name: '人形「上海人形」', src: '妖', cls: 'alice', type: 'spell', cost: 2,
  text: '召喚兩個「上海人偶」。',
  onPlay: function (s, c) { summon(s, c.pi, 'n_shanghai', {}); summon(s, c.pi, 'n_shanghai', {}); }
});

C({
  id: 'a_hourai', tribe: ['人偶'], name: '蓬萊人形', src: '妖', cls: 'alice', type: 'unit', cost: 3, atk: 3, hp: 4,
  text: '死去：召喚一個「上海人偶」。',
  onDeath: function (s, pi, u) { summon(s, pi, 'n_shanghai', {}); }
});

C({
  id: 'a_army', name: '咒符「上海人形軍」', src: '妖', cls: 'alice', type: 'ward', cost: 4,
  text: '我方的「上海人偶」+1/+1。我方非「上海人偶」的角色死去時，召喚一個「上海人偶」。',
  aura: function (s, owner, u) { return (u.owner === owner && u.defId === 'n_shanghai') ? [1, 1] : null; },
  onAllyDeath: function (s, owner, u) { if (u.defId !== 'n_shanghai') summon(s, owner, 'n_shanghai', {}); }
});

C({
  id: 'a_goliath', tribe: ['人偶'], name: '人偶軍團', src: '妖', cls: 'alice', type: 'unit', cost: 5, atk: 4, hp: 4,
  text: '登場：我方所有其他角色 +1/+1。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { if (u !== c.self) buffUnit(u, 1, 1); });
  }
});

/* 原本是「5 費對所有敵方角色 2 點傷害」，跟 4 費的中立「彈幕勝負」效果完全相同
   卻更貴 —— 專屬卡沒有存在的理由。改成綁她自己的流派：
   亡者輪迴要的就是我方角色死去，所以本回合死得愈多，這張打得愈痛。 */
C({
  id: 'u_botan', name: '櫻符「完全櫻·緋」', src: '妖', cls: 'yuyuko', type: 'spell', cost: 5,
  text: '對所有敵方角色造成 2 點傷害；本回合我方每有一個角色死去，傷害 +1。',
  onPlay: function (s, c) {
    var n = 2 + (s.players[c.pi].deathsThisTurn || 0);
    if (n > 2) logMsg(s, '本回合已有 ' + (n - 2) + ' 個我方角色死去 — 傷害提升為 ' + n);
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, n); });
  }
});

C({
  id: 'u_shitai', name: '亡舞「生死流轉」', src: '妖', cls: 'yuyuko', type: 'spell', cost: 5,
  text: '破壞一個角色，抽 1 張。', target: T.anyUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) { destroyUnit(s, c.target.unit); draw(s, c.pi, 1); } }
});

C({
  id: 'u_yuurei', tribe: ['亡靈'], name: '彷徨的亡靈', src: '妖', cls: 'yuyuko', type: 'unit', cost: 2, atk: 2, hp: 2, kw: ['飛行'],
  text: '飛行。死去：抽 1 張。',
  onDeath: function (s, pi, u) { draw(s, pi, 1); }
});

C({
  id: 'u_saigyou', tribe: ['亡靈'], name: '西行妖', src: '妖', cls: 'yuyuko', type: 'unit', cost: 6, atk: 3, hp: 7, kw: ['守護'],
  text: '守護。回合結束：對敵方英雄造成 2 點傷害。',
  onTurnEnd: function (s, u) { dmgHero(s, foe(u.owner), 2); }
});

/* ========== 博麗靈夢（生與死的境界） ========== */
C({
  id: 'r_kyoukai', set: '紅',  name: '結界「生死之境」', src: '妖', cls: 'reimu', type: 'ward', cost: 4,
  text: '我方英雄受到傷害時，隨機一個我方角色 +1/+1。',
  onHeroHurt: function (s, owner, n) {
    var t = pick(s, unitsOf(s, owner));
    if (t) { logMsg(s, '「生死之境」— 「' + def(t.defId).name + '」+1/+1'); buffUnit(t, 1, 1); }
  }
});

/* ========== 霧雨魔理沙 ========== */
C({
  id: 'm_hoshikuzu', set: '紅',  name: '星屑的碎片', src: '妖', cls: 'marisa', type: 'spell', cost: 1,
  text: '抽 1 張；連奏 2：改為抽 2 張。',
  onPlay: function (s, c) {
    var n = rensou(s, c.pi, 2) ? 2 : 1;
    if (n === 2) logMsg(s, '『連奏 2』發動 — 改為抽 2 張');
    draw(s, c.pi, n);
  }
});

/* ========== 十六夜咲夜 ========== */
C({
  id: 's_private', set: '紅',  name: '時符「私人平方」', src: '妖', cls: 'sakuya', type: 'spell', cost: 3,
  text: '我方一個角色本回合可再攻擊兩次。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.attacksLeft += 2; }
});
C({
  id: 's_eternal', set: '紅',  name: '時符「未來永劫」', src: '妖', cls: 'sakuya', type: 'spell', cost: 4,
  text: '我方所有角色本回合 +1/+0 並獲得疾走。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) {
      buffUnit(u, 1, 0, true);
      addKw(u, '疾走', true);
      if (u.summoned && u.attacksLeft <= 0) u.attacksLeft = 1;
    });
  }
});

/* ========== 魂魄妖夢：一擊必殺 ========== */
C({
  id: 'y_shugyo', name: '修行', src: '妖', cls: 'youmu', type: 'spell', cost: 1,
  text: '我方一個角色 +1/+2。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, 1, 2); }
});
C({
  id: 'y_ouka', name: '劍伎「櫻花閃閃」', src: '妖', cls: 'youmu', type: 'spell', cost: 3,
  text: '我方一個角色本回合 +3/+0 並獲得貫通。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 3, 0, true);
    addKw(u, '貫通', true);
  }
});
C({
  id: 'y_roukanken', name: '二刀「白樓劍・樓觀劍」', src: '妖', cls: 'youmu', type: 'ward', cost: 4,
  text: '我方角色 +1/+0。',
  aura: function (s, owner, u) { return u.owner === owner ? [1, 0] : null; }
});
C({
  id: 'y_shokei', name: '斷命劍「究極處刑人」', src: '妖', cls: 'youmu', type: 'spell', cost: 5,
  text: '破壞一個敵方角色；若我方有攻擊力 5 以上的角色，改為再破壞一個（數值最高者）。', target: T.eUnit,
  onPlay: function (s, c) {
    var first = c.target && c.target.unit; if (!first) return;
    destroyUnit(s, first);
    if (!unitsOf(s, c.pi).some(function (u) { return atkOf(u) >= 5; })) return;
    var best = null;
    unitsOf(s, foe(c.pi)).forEach(function (u) {
      if (u === first || u.dead || !canTargetUnit(s, c.pi, u)) return;
      if (!best || atkOf(u) + hpOf(u) > atkOf(best) + hpOf(best)) best = u;
    });
    if (best) { logMsg(s, '「究極處刑人」追加破壞「' + def(best.defId).name + '」'); destroyUnit(s, best); }
  }
});

/* ========== 八雲紫：境界操作 ========== */
C({
  id: 'k_kakurenbo', name: '紫符「捉迷藏」', src: '妖', cls: 'yukari', type: 'spell', cost: 1,
  text: '我方一個角色 +1/+1 並獲得隱行。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 1, 1); u.stealth = true;
  }
});
C({
  id: 'k_sougi', name: '隙間送葬', src: '妖', cls: 'yukari', type: 'spell', cost: 2,
  text: '將一個敵方角色移回其擁有者手上。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) bounceUnit(s, c.target.unit); }
});
C({
  id: 'k_mugen', name: '夢幻泡影', src: '妖', cls: 'yukari', type: 'spell', cost: 2,
  text: '使一個敵方角色的攻擊力永久變為 0。', target: T.eUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    u.atkZero = true;
    logMsg(s, '「' + def(u.defId).name + '」的攻擊力歸零');
  }
});
C({
  id: 'k_mahoujin', name: '境界「魔法陣結界」', src: '妖', cls: 'yukari', type: 'ward', cost: 4,
  text: '我方的「隱行」角色 +1/+1。',
  aura: function (s, owner, u) { return (u.owner === owner && u.stealth) ? [1, 1] : null; }
});
C({
  id: 'k_kyoukai', name: '「幻想鄉的境界」', src: '妖', cls: 'yukari', type: 'spell', cost: 7,
  text: '交換雙方英雄目前的血量。',
  onPlay: function (s, c) {
    var me = s.players[c.pi], op = s.players[foe(c.pi)];
    var t = me.hp;
    me.hp = Math.min(op.hp, me.maxHp);
    op.hp = Math.min(t, op.maxHp);
    logMsg(s, '『幻想鄉的境界』— 血量交換為 ' + me.hp + ' / ' + op.hp);
    checkWin(s);
  }
});

/* ========== 愛麗絲：人偶大軍 ========== */
C({
  id: 'a_jizai', name: '操符「人偶自在」', src: '妖', cls: 'alice', type: 'spell', cost: 2,
  text: '我方所有角色 +1/+0。',
  onPlay: function (s, c) { unitsOf(s, c.pi).forEach(function (u) { buffUnit(u, 1, 0); }); }
});
C({
  id: 'a_hoffman', tribe: ['人偶'], name: '霍夫曼人偶', src: '妖', cls: 'alice', type: 'unit', cost: 3, atk: 2, hp: 3,
  text: '登場：召喚一個「上海人偶」。',
  onPlay: function (s, c) { summon(s, c.pi, 'n_shanghai', {}); }
});
C({
  id: 'a_shinpan', name: '咒符「人偶審判」', src: '妖', cls: 'alice', type: 'spell', cost: 4,
  text: '我方每有一個角色，就對敵方英雄造成 1 點傷害。',
  onPlay: function (s, c) {
    var n = unitsOf(s, c.pi).length;
    logMsg(s, '「人偶審判」— 場上 ' + n + ' 個角色');
    if (n > 0) dmgHero(s, foe(c.pi), n);
  }
});
C({
  id: 'a_saiban', name: '「人形裁判」', src: '妖', cls: 'alice', type: 'spell', cost: 4,
  text: '我方每有一個角色就抽 1 張（最多 3 張）。',
  onPlay: function (s, c) {
    var n = Math.min(3, unitsOf(s, c.pi).length);
    if (n > 0) draw(s, c.pi, n); else logMsg(s, '場上沒有角色，「人形裁判」沒有抽到牌');
  }
});

C({
  id: 'a_hourai_full', tribe: ['人偶'], name: '蓬萊人形·完全體', src: '妖', cls: 'alice', type: 'unit', cost: 6, atk: 5, hp: 5,
  text: '登場：召喚兩個「上海人偶」。',
  onPlay: function (s, c) { summon(s, c.pi, 'n_shanghai', {}); summon(s, c.pi, 'n_shanghai', {}); }
});

/* ========== 西行寺幽幽子：亡者輪迴 ========== */
C({
  id: 'u_band', tribe: ['亡靈'], name: '幽靈樂團', src: '妖', cls: 'yuyuko', type: 'unit', cost: 1, atk: 1, hp: 2,
  text: '死去：我方英雄回復 2 點。',
  onDeath: function (s, pi, u) { healHero(s, pi, 2); }
});
C({
  id: 'u_kurin', name: '死符「幽明的苦輪」', src: '妖', cls: 'yuyuko', type: 'spell', cost: 2,
  text: '獻祭我方一個角色：對攻擊力最高的敵方角色造成 4 點傷害。', target: T.aUnit,
  playable: function (s, pi) { return unitsOf(s, foe(pi)).length > 0; },
  onPlay: function (s, c) {
    var mine = c.target && c.target.unit; if (!mine) return;
    logMsg(s, '『獻祭』—「' + def(mine.defId).name + '」');
    destroyUnit(s, mine);
    cleanupDeaths(s);
    var best = null;
    unitsOf(s, foe(c.pi)).forEach(function (u) {
      if (!canTargetUnit(s, c.pi, u)) return;
      if (!best || atkOf(u) > atkOf(best)) best = u;
    });
    if (best) dmgUnit(s, best, 4);
  }
});
C({
  id: 'u_yomotsu', name: '冥符「黃泉平坂行路」', src: '妖', cls: 'yuyuko', type: 'spell', cost: 3,
  text: '召喚兩個「亡靈」。',
  onPlay: function (s, c) { summon(s, c.pi, 'n_ghost', {}); summon(s, c.pi, 'n_ghost', {}); }
});

C({
  id: 'u_ageha', name: '蝶符「鳳蝶紋的死槍」', src: '妖', cls: 'yuyuko', type: 'spell', cost: 4,
  text: '對一個敵方角色造成 3 點傷害；若本回合有我方角色死去，抽 2 張。', target: T.eUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 3);
    if ((s.players[c.pi].deathsThisTurn || 0) > 0) {
      logMsg(s, '本回合已有我方角色死去 — 抽 2 張');
      draw(s, c.pi, 2);
    }
  }
});
C({
  id: 'u_hangyoku', name: '「反魂蝶 -八分咲-」', src: '妖', cls: 'yuyuko', type: 'spell', cost: 6,
  text: '召喚本局中最後死去的三個我方角色。',
  playable: function (s, pi) { return (s.players[pi].fallen || []).length > 0; },
  onPlay: function (s, c) {
    var list = (s.players[c.pi].fallen || []).slice(-3).reverse();
    logMsg(s, '『反魂蝶』— 喚回 ' + list.length + ' 個亡者');
    list.forEach(function (id) { summon(s, c.pi, id, {}); });
  }
});

/* ========== 英雄的角色卡 ========== */
C({
  id: 'c_youmu', tribe: ['人類', '亡靈'], name: '魂魄妖夢', src: '妖', cls: 'neutral',
  type: 'unit', cost: 4, atk: 4, hp: 3, kw: ['貫通'], pair: 'c_yuyuko',
  text: '貫通。人妖組（西行寺幽幽子）：此角色 +1/+1，且你的回合結束時對敵方英雄造成 2 點傷害。',
  selfAura: function (s, u) { return paired(s, u) ? [1, 1] : null; },
  onTurnEnd: function (s, u) { if (paired(s, u)) dmgHero(s, foe(u.owner), 2); }
});
C({
  id: 'c_yukari', tribe: ['妖怪'], name: '八雲紫', src: '妖', cls: 'neutral', type: 'unit',
  cost: 6, atk: 5, hp: 5, kw: ['隱行'], pair: 'c_reimu',
  text: '隱行。登場：抽 1 張。人妖組（博麗靈夢）：此角色 +1/+1，且你的回合開始時抽 1 張。',
  onPlay: function (s, c) { draw(s, c.pi, 1); },
  selfAura: function (s, u) { return paired(s, u) ? [1, 1] : null; },
  onTurnStart: function (s, u) { if (paired(s, u)) draw(s, u.owner, 1); }
});
C({
  id: 'c_alice', tribe: ['魔法使'], name: '愛麗絲·瑪格特羅依德', src: '妖', cls: 'neutral',
  type: 'unit', cost: 4, atk: 3, hp: 4, pair: 'c_marisa',
  text: '登場：召喚兩個「上海人偶」。人妖組（霧雨魔理沙）：此角色 +1/+1。',
  onPlay: function (s, c) {
    summon(s, c.pi, 'n_shanghai', {});
    summon(s, c.pi, 'n_shanghai', {});
  },
  selfAura: function (s, u) { return paired(s, u) ? [1, 1] : null; }
});
C({
  id: 'c_yuyuko', tribe: ['亡靈'], name: '西行寺幽幽子', src: '妖', cls: 'neutral',
  type: 'unit', cost: 6, atk: 4, hp: 6, pair: 'c_youmu',
  text: '登場：破壞我方一個其他角色，抽 2 張。人妖組（魂魄妖夢）：此角色 +1/+1。',
  target: T.aUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit && c.target.unit !== c.self) {
      destroyUnit(s, c.target.unit);
      draw(s, c.pi, 2);
    }
  },
  selfAura: function (s, u) { return paired(s, u) ? [1, 1] : null; }
});

/* ========== BGM 卡 ========== */
C({
  id: 'bgm_youmu', name: '広有射怪鳥事 ～ Till When?', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_youmu',
  text: '發動：從牌庫檢索「魂魄妖夢」。我方攻擊力最高的角色 +2/+0。',
  aura: function (s, owner, u) {
    if (u.owner !== owner) return null;
    var best = null;
    unitsOf(s, owner).forEach(function (x) {
      if (!best || x.baseAtk + (x.buffAtk || 0) > best.baseAtk + (best.buffAtk || 0)) best = x;
    });
    return u === best ? [2, 0] : null;
  }
});
C({
  id: 'bgm_yukari', name: 'ネクロファンタジア', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_yukari',
  text: '發動：從牌庫檢索「八雲紫」。我方「隱行」角色 +1/+1。',
  aura: function (s, owner, u) { return (u.owner === owner && u.stealth) ? [1, 1] : null; }
});
C({
  id: 'bgm_alice', name: '人形裁判 ～ 人の形弄びし少女', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_alice',
  text: '發動：從牌庫檢索「愛麗絲·瑪格特羅依德」。我方的衍生物 +1/+1。',
  aura: function (s, owner, u) { return (u.owner === owner && def(u.defId).token) ? [1, 1] : null; }
});
C({
  id: 'bgm_yuyuko', name: '幽雅に咲かせ、墨染の桜 ～ Border of Life', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_yuyuko',
  text: '發動：從牌庫檢索「西行寺幽幽子」。我方有「死去」效果的角色 +1/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && def(u.defId).onDeath) ? [1, 1] : null;
  }
});

/* ========== 森羅結界（妖妖夢包的新系統） ==========
   與爐石聖盾不同：森羅結界**可以疊加**。再給一次就是兩層，能擋兩次傷害。
   卡面會顯示「結界×2」。 */
C({
  id: 'y_wd_pcb', set: '妖', tribe: [], name: '妖妖夢結界', src: '妖', cls: 'neutral', type: 'ward', cost: 3,
  text: '你召喚有收錄於「東方妖妖夢」的角色時，該角色獲得森羅結界。',
  onAllySummon: function (s, owner, u) {
    if (!unitAppearsIn(u, '妖')) return;
    addBarrier(s, u, 1);
    logMsg(s, '「妖妖夢結界」— 「' + def(u.defId).name + '」獲得森羅結界');
  }
});
C({
  id: 'y_sp_shinra', name: '結界「森羅結界」', src: '妖', cls: 'youmu', type: 'spell', cost: 2,
  text: '我方一個角色獲得森羅結界。若它已經有，改為再獲得兩層。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    addBarrier(s, u, (u.barrier || 0) > 0 ? 2 : 1);
  }
});
C({
  id: 'y_konpaku_g', name: '白玉樓的亡靈', src: '妖', cls: 'neutral', type: 'unit',
  cost: 3, atk: 2, hp: 3, kw: ['守護', '森羅結界'], tribe: ['亡靈'],
  text: '守護。森羅結界。徘徊在白玉樓外的幽魂。'
});

/* 探尋的示範卡（騷靈三姊妹英雄做出來之前，先讓這個機制有卡可用） */
C({
  id: 'n_sp_score', name: '騷靈的樂譜', src: '妖', cls: 'neutral', type: 'spell', cost: 2,
  text: '探尋：從 3 張「騷靈」卡中選 1 張加入手牌。',
  onPlay: function (s, c) { discoverTribe(s, c.pi, '騷靈', 3); }
});

/* ========== 莉莉白：全場隨機 ==========
   她跟帕秋莉的隨機不一樣。帕秋莉的隨機是「附加在符卡上、只打敵方」，
   莉莉白是「主體就是隨機、而且打全場」—— 收益比同費高一截，
   代價是你指定不了目標，經常會打到自己不想打的東西。
   組她的牌組要有心理準備：期望值站在你這邊，單一回合不一定。 */

C({
  id: 'li_haru', name: '春告', src: '妖', cls: 'lily', type: 'spell', cost: 1,
  text: '隨機一個角色 +2/+2（可能是敵方的）。',
  onPlay: function (s, c) {
    var t = pick(s, allUnits(s));
    if (!t) { logMsg(s, '場上沒有角色，春告落空'); return; }
    buffUnit(t, 2, 2);
    logMsg(s, '春天降臨在「' + def(t.defId).name + '」身上');
  }
});

C({
  id: 'li_mebuki', name: '芽吹', src: '妖', cls: 'lily', type: 'spell', cost: 2,
  text: '隨機兩個我方角色各 +1/+1（可能重複同一個）。',
  onPlay: function (s, c) {
    for (var i = 0; i < 2; i++) {
      var t = pick(s, unitsOf(s, c.pi));
      if (t) buffUnit(t, 1, 1);
    }
  }
});

C({
  id: 'li_fubuki', name: '花吹雪', src: '妖', cls: 'lily', type: 'spell', cost: 3,
  text: '隨機分配 5 點傷害，每 1 點隨機打在場上任一角色身上（包含我方）。',
  onPlay: function (s, c) {
    for (var i = 0; i < 5; i++) {
      var t = pick(s, allUnits(s));
      if (!t) break;
      dmgUnit(s, t, 1);
      cleanupDeaths(s);
    }
  }
});

C({
  id: 'li_ranman', name: '春爛漫', src: '妖', cls: 'lily', type: 'spell', cost: 5,
  text: '場上所有角色 +2/+2（包含敵方的）。',
  onPlay: function (s, c) {
    allUnits(s).forEach(function (u) { buffUnit(u, 2, 2); });
    logMsg(s, '整片幻想鄉都開花了');
  }
});

C({
  id: 'li_fairy', tribe: ['妖精'], name: '報春的妖精', src: '妖', cls: 'lily', type: 'unit',
  cost: 2, atk: 2, hp: 2, works: ['妖'],
  text: '登場：隨機一個角色 +1/+1（可能是敵方的）。',
  onPlay: function (s, c) {
    var t = pick(s, allUnits(s));
    if (t) buffUnit(t, 1, 1);
  }
});

C({
  id: 'li_blackfairy', tribe: ['妖精'], name: '報凶的妖精', src: '妖', cls: 'lily', type: 'unit',
  cost: 3, atk: 3, hp: 2, works: ['妖'],
  text: '登場：隨機一個敵方角色受到 2 點傷害。', target: null,
  onPlay: function (s, c) {
    var t = pick(s, unitsOf(s, foe(c.pi)));
    if (t) dmgUnit(s, t, 2);
  }
});

C({
  id: 'li_wd_haru', name: '春之結界', src: '妖', cls: 'lily', type: 'ward', cost: 3,
  text: '你的回合開始時，隨機一個我方角色 +1/+1。',
  onTurnStart: function (s, owner) {
    var t = pick(s, unitsOf(s, owner));
    if (t) buffUnit(t, 1, 1);
  }
});

C({
  id: 'bgm_lily', name: '天空の花の都', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_lily',
  text: '發動：從牌庫檢索「莉莉白」。你的回合開始時，隨機一個我方角色 +1/+0。',
  onTurnStart: function (s, owner) {
    var t = pick(s, unitsOf(s, owner));
    if (t) buffUnit(t, 1, 0);
  }
});

/* ========== 騷靈三姊妹：合奏 ==========
   三張角色卡與「合奏」關鍵字先前已完成，這裡補英雄的職業卡。

   合奏 = 我方場上同時有三位「不同的」騷靈。
   所以這一套的節奏是：技能每回合補一位缺的姊妹 → 湊齊 → 全部效果升級。
   代價是三姊妹本體都只有 1/3，湊齊之前場面很脆。 */

C({
  id: 'pr_poltergeist', tribe: ['騷靈', '亡靈'], name: '騷靈', src: '妖', cls: 'prismriver',
  type: 'unit', cost: 2, atk: 2, hp: 3, works: ['妖'],
  // 三姊妹本體都有飛行，這張再給飛行的話整副牌都無視守護，對手完全擋不住。
  text: '合奏：此角色 +1/+1。',
  selfAura: function (s, u) { return ensemble(s, u.owner) ? [1, 1] : null; }
});

C({
  id: 'pr_clifford', name: '幻樂「ゴーストクリフォード」', src: '妖', cls: 'prismriver',
  type: 'spell', cost: 4,
  text: '我方所有「騷靈」角色 +1/+1；合奏：改為 +2/+2。',
  onPlay: function (s, c) {
    var n = ensemble(s, c.pi) ? 2 : 1;
    if (n === 2) logMsg(s, '『合奏』成立 — 強化加倍');
    unitsOf(s, c.pi).forEach(function (u) {
      if (hasTribe(def(u.defId), '騷靈')) buffUnit(u, n, n);
    });
  }
});

C({
  id: 'pr_symphony', name: '冥樂「ゴーストシンフォニー」', src: '妖', cls: 'prismriver',
  type: 'spell', cost: 6,
  // 帕秋莉的「日符」同樣 6 費、全體 4 傷，所以這張的上限不該超過它。
  text: '對所有敵方角色造成 2 點傷害；合奏：改為 4 點。',
  onPlay: function (s, c) {
    var n = ensemble(s, c.pi) ? 4 : 2;
    if (n === 4) logMsg(s, '『合奏』成立 — 全體傷害提升為 4');
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, n); });
  }
});

C({
  id: 'pr_tuning', name: '調音', src: '妖', cls: 'prismriver', type: 'spell', cost: 2,
  text: '從牌庫檢索一張你場上還沒有的「騷靈」角色。',
  onPlay: function (s, c) {
    var here = {};
    unitsOf(s, c.pi).forEach(function (u) { here[u.defId] = true; });
    var got = tutor(s, c.pi, function (d) {
      return d.type === 'unit' && hasTribe(d, '騷靈') && !here[d.id];
    });
    if (!got) logMsg(s, '牌庫裡沒有還缺的騷靈');
  }
});

C({
  id: 'pr_encore', name: '安可', src: '妖', cls: 'prismriver', type: 'spell', cost: 3,
  text: '抽 2 張；合奏：改為抽 3 張並使我方所有「騷靈」角色本回合 +1/+0。',
  onPlay: function (s, c) {
    if (!ensemble(s, c.pi)) { draw(s, c.pi, 2); return; }
    logMsg(s, '『合奏』成立 — 安可');
    draw(s, c.pi, 3);
    unitsOf(s, c.pi).forEach(function (u) {
      if (hasTribe(def(u.defId), '騷靈')) buffUnit(u, 1, 0, true);
    });
  }
});

C({
  id: 'pr_wd_stage', name: '幽靈舞台', src: '妖', cls: 'prismriver', type: 'ward', cost: 3,
  text: '我方「騷靈」角色 +1/+0；合奏時改為 +2/+0。',
  aura: function (s, owner, u) {
    if (u.owner !== owner || !hasTribe(def(u.defId), '騷靈')) return null;
    return ensemble(s, owner) ? [2, 0] : [1, 0];
  }
});

C({
  id: 'pr_fd_hall', name: '無名之丘', src: '妖', cls: 'prismriver', type: 'field', cost: 4,
  text: '你的回合開始時，若「合奏」成立，抽 1 張。',
  onTurnStart: function (s, owner) {
    if (ensemble(s, owner)) { logMsg(s, '『合奏』成立 — 無名之丘抽 1 張'); draw(s, owner, 1); }
  }
});

C({
  id: 'bgm_prismriver', name: '幽霊楽団 ～ Phantom Ensemble', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_lunasa',
  text: '發動：從牌庫檢索「露娜薩·普莉茲姆利巴」。我方「騷靈」角色 +0/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '騷靈')) ? [0, 1] : null;
  }
});

/* ========== 蕾迪·懷特洛克：蔓延的冬天 ==========
   琪露諾的冰結是「凍住然後解決掉」，蕾迪是「凍住然後蔓延」。
   她的卡不追求殺傷，而是把整個場面凍住拖到後期，
   再用「被冰結的敵人愈多、我方愈強」的卡收割。 */

C({
  id: 'le_lingering', name: '寒符「リンガリングコールド」', src: '妖', cls: 'letty',
  type: 'spell', cost: 3,
  text: '使兩個隨機的敵方角色冰結。',
  onPlay: function (s, c) {
    var pool = unitsOf(s, foe(c.pi)).filter(function (u) { return !isFrozen(u); });
    if (!pool.length) { logMsg(s, '對方沒有還沒被凍住的角色'); return; }
    for (var i = 0; i < 2; i++) {
      var t = pick(s, pool);
      if (!t) break;
      freeze(s, t);
      pool.splice(pool.indexOf(t), 1);
    }
  }
});

C({
  id: 'le_wither', name: '冬符「フラワーウィザラウェイ」', src: '妖', cls: 'letty',
  type: 'spell', cost: 4,
  text: '使所有敵方角色的攻擊力 -1；已被冰結的改為 -3。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) {
      buffUnit(u, isFrozen(u) ? -3 : -1, 0);
    });
  }
});

C({
  id: 'le_snap', name: '寒符「コールドスナップ」', src: '妖', cls: 'letty',
  type: 'spell', cost: 5,
  text: '對每個被冰結的敵方角色造成 4 點傷害。',
  onPlay: function (s, c) {
    var list = unitsOf(s, foe(c.pi)).filter(isFrozen);
    if (!list.length) { logMsg(s, '沒有被冰結的角色，寒符落空'); return; }
    list.forEach(function (u) { dmgUnit(s, u, 4); });
  }
});

C({
  id: 'le_yuki', tribe: ['妖怪'], name: '雪之妖怪', src: '妖', cls: 'letty', type: 'unit',
  cost: 3, atk: 1, hp: 5, kw: ['守護'], works: ['妖'],
  text: '守護。登場：使一個敵方角色冰結。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) freeze(s, c.target.unit); }
});

C({
  id: 'le_fuyu', tribe: ['妖怪'], name: '冬之亡靈', src: '妖', cls: 'letty', type: 'unit',
  cost: 4, atk: 2, hp: 5, works: ['妖'],
  text: '每有一個被冰結的敵方角色，此角色 +1/+0。',
  selfAura: function (s, u) {
    var n = unitsOf(s, foe(u.owner)).filter(isFrozen).length;
    return n ? [n, 0] : null;
  }
});

C({
  id: 'le_wd_fuyu', name: '冬之結界', src: '妖', cls: 'letty', type: 'ward', cost: 3,
  text: '你的回合開始時，使一個隨機的敵方角色冰結。',
  onTurnStart: function (s, owner) {
    var t = pick(s, unitsOf(s, foe(owner)).filter(function (u) { return !isFrozen(u); }));
    if (t) freeze(s, t);
  }
});

C({
  id: 'bgm_letty', name: 'クリスタライズシルバー', src: '妖', cls: 'neutral',
  type: 'bgm', cost: 3, unique: true, tutor: 'n_letty',
  text: '發動：從牌庫檢索「蕾迪·懷特洛克」。敵方被冰結的角色攻擊力 -1。',
  aura: function (s, owner, u) {
    return (u.owner !== owner && isFrozen(u)) ? [-1, 0] : null;
  }
});


/* ========== 橙：一次性衝擊 ==========
   技能召喚的貓活不過這個回合，所以她場上留不住東西。
   整套卡都圍繞「這一回合能打出多少」：疾走、暫時強化、直接燒臉。
   拖到後期她什麼都沒有 —— 這是刻意的代價。 */

C({
  id: 'ch_neko', tribe: ['妖獸'], name: '貓', src: '妖', cls: 'chen', type: 'unit',
  cost: 1, atk: 1, hp: 1, kw: ['疾走'], token: true, works: ['妖'],
  text: '疾走。你的回合結束時，此角色死去。',
  onTurnEnd: function (s, u) { destroyUnit(s, u); }
});

C({
  id: 'ch_bakeneko', tribe: ['妖獸'], name: '化貓', src: '妖', cls: 'chen', type: 'unit',
  cost: 3, atk: 4, hp: 2, kw: ['疾走'], works: ['妖'],
  text: '疾走。'
});

C({
  id: 'ch_kuroneko', tribe: ['妖獸'], name: '黑貓', src: '妖', cls: 'chen', type: 'unit',
  cost: 2, atk: 3, hp: 1, kw: ['疾走'], works: ['妖'],
  text: '疾走。'
});

C({
  id: 'ch_shimen', name: '式輝「四面楚歌チーズ」', src: '妖', cls: 'chen', type: 'spell', cost: 4,
  text: '我方所有角色本回合 +2/+0。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { buffUnit(u, 2, 0, true); });
  }
});

C({
  id: 'ch_ultimate', name: '式弾「アルティメットブラスト」', src: '妖', cls: 'chen',
  type: 'spell', cost: 5,
  text: '對敵方英雄造成 6 點傷害。',
  onPlay: function (s, c) { dmgHero(s, foe(c.pi), 6); }
});

C({
  id: 'ch_hishou', name: '飛翔', src: '妖', cls: 'chen', type: 'spell', cost: 2,
  text: '我方一個角色本回合獲得疾走與飛行。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    addKw(u, '疾走', true);
    addKw(u, '飛行', true);
    if (u.summoned && u.attacksLeft <= 0) u.attacksLeft = 1;
  }
});

C({
  id: 'ch_wd_neko', name: '貓之結界', src: '妖', cls: 'chen', type: 'ward', cost: 2,
  text: '我方具有「疾走」的角色 +1/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasKw(u, '疾走')) ? [1, 0] : null;
  }
});

C({
  id: 'bgm_chen', name: 'ティアオイエツォン(withered leaf)', src: '妖', cls: 'neutral',
  type: 'bgm', cost: 3, unique: true, tutor: 'n_chen',
  text: '發動：從牌庫檢索「橙」。我方「妖獸」角色 +1/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '妖獸')) ? [1, 0] : null;
  }
});


/* ========== 八雲藍：式神與費用壓縮 ==========
   技能每回合把手牌兩端各降 1 費 —— 收益慢但持續。
   她的卡走同一條路：召喚式神鋪場、把費用愈壓愈低，靠後期一口氣打完。 */

C({
  id: 'ra_kudagitsune', tribe: ['式神', '妖獸'], name: '管狐', src: '妖', cls: 'ran',
  type: 'unit', cost: 1, atk: 1, hp: 1, kw: ['飛行'], works: ['妖'],
  text: '飛行。藍差遣的小式神。'
});

C({
  id: 'ra_shikigami', tribe: ['式神'], name: '式神', src: '妖', cls: 'ran', type: 'unit',
  cost: 2, atk: 2, hp: 2, works: ['妖'],
  text: '登場：手牌中隨機一張卡費用 -1。',
  onPlay: function (s, c) {
    var t = pick(s, s.players[c.pi].hand);
    if (!t) return;
    t.costMod -= 1;
    logMsg(s, '「' + def(t.defId).name + '」費用 -1');
  }
});

C({
  id: 'ra_juuni', name: '式神「十二神將之宴」', src: '妖', cls: 'ran', type: 'spell', cost: 5,
  text: '召喚兩個 2/2「式神」。',
  onPlay: function (s, c) {
    summon(s, c.pi, 'ra_shikigami_token', {});
    summon(s, c.pi, 'ra_shikigami_token', {});
  }
});

C({
  id: 'ra_shikigami_token', tribe: ['式神'], name: '式神', src: '妖', cls: 'ran',
  type: 'unit', cost: 2, atk: 2, hp: 2, token: true, works: ['妖'],
  text: '藍召喚出來的式神。'
});

C({
  id: 'ra_tenko', name: '「天狐思念」', src: '妖', cls: 'ran', type: 'spell', cost: 4,
  text: '抽 2 張，並使它們的費用 -2。',
  onPlay: function (s, c) {
    var p = s.players[c.pi];
    var before = p.hand.length;
    draw(s, c.pi, 2);
    for (var i = before; i < p.hand.length; i++) p.hand[i].costMod -= 2;
  }
});

C({
  id: 'ra_rensei', name: '戔符「天上天下的連星」', src: '妖', cls: 'ran', type: 'spell', cost: 3,
  text: '對一個敵方角色造成 4 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 4); }
});

C({
  id: 'ra_wd_shiki', name: '式之結界', src: '妖', cls: 'ran', type: 'ward', cost: 3,
  text: '我方「式神」角色 +1/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '式神')) ? [1, 1] : null;
  }
});

C({
  id: 'bgm_ran', name: '少女幻葬 ～ Necro-Fantasy', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_ran',
  text: '發動：從牌庫檢索「八雲藍」。你的回合開始時，手牌最左的卡費用 -1。',
  onTurnStart: function (s, owner) {
    var h = s.players[owner].hand;
    if (h.length) h[0].costMod -= 1;
  }
});

/* 魔理沙的「星符『ドラゴンメテオ』」出自妖妖夢，照「卡片跟著它的補充包走」的規則放這裡 */
C({
  id: 'm_dragonmeteor', set: '紅',  name: '星符「ドラゴンメテオ」', src: '妖', cls: 'marisa', type: 'spell', cost: 6,
  text: '對隨機的敵方目標造成 2 點傷害 4 次。',
  onPlay: function (s, c) {
    for (var i = 0; i < 4; i++) {
      var foes = unitsOf(s, foe(c.pi)).filter(function (u) { return canTargetUnit(s, c.pi, u); });
      if (!foes.length || rngInt(s, foes.length + 1) === 0) dmgHero(s, foe(c.pi), 2);
      else dmgUnit(s, pick(s, foes), 2);
      cleanupDeaths(s);
    }
  }
});

/* 紫的「神隱之主犯」出自妖妖夢，先前誤放在永夜抄的檔案裡 */
C({
  id: 'k_kamikakushi', name: '神隱之主犯', src: '妖', cls: 'yukari', type: 'spell', cost: 5,
  text: '神隱一個敵方角色；若它的費用為 5 以上，抽 1 張。',
  target: T.eUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    var big = def(u.defId).cost >= 5;
    banishUnit(s, u);
    if (big) { logMsg(s, '大物被送進隙間 — 抽 1 張'); draw(s, c.pi, 1); }
  }
});

/* ===== js/cards/in.js ===== */
/* ============================================================
   東方符卡大戰 — 卡表：第八彈・東方永夜抄 (TH08 IN)
   永遠亭、迷途竹林、夜雀與不死之人
   共 11 張。要新增這一彈的卡，直接在本檔加 C({...})。
   ============================================================ */
'use strict';

C({
  id: 'n_wriggle', tribe: ['妖怪'], name: '莉格露·奈特巴格', src: '永', cls: 'neutral', type: 'unit', cost: 2, atk: 2, hp: 2, kw: ['飛行'],
  text: '飛行。我方其他「飛行」角色 +1/+0。',
  unitAura: function (s, src, u) { return hasKw(u, '飛行') ? [1, 0] : null; }
});

C({
  id: 'n_tewi', tribe: ['妖怪'], name: '因幡帝', src: '永', cls: 'neutral', type: 'unit', cost: 2, atk: 2, hp: 2,
  text: '登場：我方一個角色獲得「隱行」。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.stealth = true; }
});

C({
  id: 'n_mystia', tribe: ['妖怪'], name: '米斯蒂婭·蘿蕾拉', src: '永', cls: 'neutral', type: 'unit', cost: 3, atk: 3, hp: 3, kw: ['飛行'],
  text: '飛行。登場：一個敵方角色本回合攻擊力 -2。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, -2, 0, true); }
});

C({
  id: 'n_reisen', tribe: ['月人'], name: '鈴仙·優曇華院·因幡', src: '永', cls: 'neutral', type: 'unit', cost: 3, atk: 2, hp: 4,
  text: '登場：使一個敵方角色冰結，且攻擊力 -1。', target: T.eUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) { freeze(s, c.target.unit); buffUnit(c.target.unit, -1, 0, true); }
  }
});

/* 本體刻意做成 2/4 —— 代價前置，有同伴才回本。
   召喚時她自己已經在場上（summon 先於 onPlay），所以一個人打出來就是 3/5 守護，
   跟改動前完全一樣，不會變成爛卡；有其他人類在場才是賺。

   守護放在她身上是有理由的：妹紅的資源是英雄血量（捨身一直在自傷），
   而守護正好保護那個資源 —— 兩人在機制上真的互相需要，
   不必在卡面上寫任何配對的字。 */
C({
  id: 'n_keine', tribe: ['人類', '妖獸'], name: '上白澤慧音', src: '永', cls: 'neutral',
  type: 'unit', cost: 4, atk: 2, hp: 4, kw: ['守護'], works: ['永'],
  text: '守護。登場：我方所有「人類」角色 +1/+1。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) {
      if (hasTribe(def(u.defId), '人類')) buffUnit(u, 1, 1);
    });
  }
});

C({
  id: 'n_mokou', tribe: ['人類'], name: '藤原妹紅', src: '永', cls: 'neutral', type: 'unit', cost: 5, atk: 4, hp: 4,
  text: '死去：召喚一個 4/4「不死鳥」。',
  onDeath: function (s, pi, u) { summon(s, pi, 'n_phoenix', {}); }
});

C({ id: 'n_phoenix', tribe: ['妖獸'], name: '不死鳥', src: '永', cls: 'neutral', type: 'unit', cost: 5, atk: 4, hp: 4, kw: ['飛行'], text: '飛行。從灰燼中重生。', token: true });

C({
  id: 'n_eirin', tribe: ['月人'], name: '八意永琳', src: '永', cls: 'neutral', type: 'unit', cost: 6, atk: 5, hp: 6,
  text: '登場：我方英雄回復 5 點。',
  onPlay: function (s, c) { healHero(s, c.pi, 5); }
});

C({
  id: 'n_kaguya', tribe: ['月人'], name: '蓬萊山輝夜', src: '永', cls: 'neutral', type: 'unit', cost: 7, atk: 6, hp: 7,
  text: '死去：抽 2 張。',
  onDeath: function (s, pi, u) { draw(s, pi, 2); }
});

C({
  id: 'n_fd_eientei', name: '永遠亭', src: '永', cls: 'neutral', type: 'field', cost: 3,
  text: '你的回合結束時，我方英雄回復 2 點。',
  onTurnEnd: function (s, owner) { healHero(s, owner, 2); }
});

C({
  id: 'r_tensei', set: '紅', name: '「夢想天生」', src: '永', cls: 'reimu', type: 'spell', cost: 8,
  text: '破壞所有敵方角色。',
  onPlay: function (s, c) { unitsOf(s, foe(c.pi)).forEach(function (u) { destroyUnit(s, u); }); }
});

/* ========== 依作品觸發的結界 ========== */
C({
  id: 'i_wd_in', name: '永夜的結界', src: '永', cls: 'neutral', type: 'ward', cost: 3,
  text: '你召喚有收錄於「東方永夜抄」的角色時，該角色 +0/+2。',
  onAllySummon: function (s, owner, u) {
    if (!unitAppearsIn(u, '永')) return;
    buffUnit(u, 0, 2);
    logMsg(s, '「永夜的結界」— 「' + def(u.defId).name + '」+0/+2');
  }
});

/* ========== 藤原妹紅：捨身 ==========
   技能 0 費、代價是自傷 —— 每回合都能主動點燃捨身，
   再用下面這些「捨身時效果加倍」的卡把血量換成傷害。 */
C({
  id: 'mk_wu', name: '虛人「ウー」', src: '永', cls: 'mokou', type: 'spell', cost: 2,
  text: '我方一個角色 +1/+2；捨身：改為 +3/+3。', target: T.aUnit,
  onPlay: function (s, c) {
    if (!c.target || !c.target.unit) return;
    if (sutemi(s, c.pi)) { logMsg(s, '『捨身』發動 — 強化提升'); buffUnit(c.target.unit, 3, 3); }
    else buffUnit(c.target.unit, 1, 2);
  }
});

C({
  id: 'mk_ono', name: '不滅「鳳凰之尾」', src: '永', cls: 'mokou', type: 'spell', cost: 2,
  text: '我方英雄受到 3 點傷害，抽 3 張。',
  onPlay: function (s, c) { dmgHero(s, c.pi, 3); draw(s, c.pi, 3); }
});
C({
  id: 'mk_metsuzai', name: '藤原「滅罪寺院傷」', src: '永', cls: 'mokou', type: 'spell', cost: 3,
  text: '對一個敵方角色造成 3 點傷害；捨身：改為 5 點並抽 1 張。', target: T.eUnit,
  onPlay: function (s, c) {
    if (!c.target || !c.target.unit) return;
    if (sutemi(s, c.pi)) {
      logMsg(s, '『捨身』發動 — 傷害提升為 5');
      dmgUnit(s, c.target.unit, 5);
      draw(s, c.pi, 1);
    } else dmgUnit(s, c.target.unit, 3);
  }
});
C({
  id: 'mk_possessed', name: '「Possessed by Phoenix」', src: '永', cls: 'mokou', type: 'spell', cost: 4,
  text: '我方一個角色本回合 +3/+0 並獲得疾走；捨身：再獲得貫通。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 3, 0, true);
    addKw(u, '疾走', true);
    if (u.summoned && u.attacksLeft <= 0) u.attacksLeft = 1;
    if (sutemi(s, c.pi)) { logMsg(s, '『捨身』發動 — 追加貫通'); addKw(u, '貫通', true); }
  }
});

C({
  id: 'mk_houou', name: '不死「火之鳥 -鳳翼天翔-」', src: '永', cls: 'mokou', type: 'spell', cost: 5,
  text: '對所有敵方角色造成 3 點傷害；捨身：改為 5 點。',
  onPlay: function (s, c) {
    var n = sutemi(s, c.pi) ? 5 : 3;
    if (n === 5) logMsg(s, '『捨身』發動 — 全體傷害提升為 5');
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, n); });
  }
});
C({
  id: 'mk_gaifu', name: '蓬萊「凱風快晴」', src: '永', cls: 'mokou', type: 'spell', cost: 6,
  text: '對敵方英雄造成 5 點傷害；捨身：改為 8 點。',
  onPlay: function (s, c) {
    var n = sutemi(s, c.pi) ? 8 : 5;
    if (n === 8) logMsg(s, '『捨身』發動 — 傷害提升為 8');
    dmgHero(s, foe(c.pi), n);
  }
});
C({
  id: 'bgm_mokou', name: '月まで届け、不死の煙', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_mokou',
  text: '發動：從牌庫檢索「藤原妹紅」。我方「人類」角色 +1/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '人類')) ? [1, 1] : null;
  }
});

/* ========== 不死的妹紅，與唯一解得掉她的「神隱」 ==========
   妹紅的「死なない程度の能力」在中階版本（n_mokou）只是死去召喚不死鳥；
   這張是把它推到極限：破壞她沒有用，她會原樣回來。

   要處理她只有三條路，全都是既有機制：
     神隱 —— 送出場外，不進墓地也不觸發死去
     封印 —— cleanupDeaths 是 if (d.onDeath && !u.silenced)，封印後復活不會發動
     回手 —— 8 費要重新打出來很痛（紫的「隙間送葬」）
   「把對手場地塞滿」不算解 —— cleanupDeaths 是先把格子清成 null 才觸發死去，
   她永遠有自己那一格可以回來。 */

/* 蓬萊的兩位不死者。
   身材刻意做得很差（8 費只有 4/4）—— 她們的價值不在打人，
   而在「對手每次處理她都是在幫你」：妹紅把對手的移除換成傷害，
   輝夜換成血量。要真正解決只有神隱、封印、回手三條路。 */

C({
  id: 'n_mokou_immortal', tribe: ['人類'], name: '藤原妹紅（不死）', src: '永', cls: 'neutral',
  type: 'unit', cost: 8, atk: 4, hp: 4, works: ['永'],
  text: '死去：對敵方英雄造成 3 點傷害，並召喚一個「藤原妹紅（不死）」。（被「神隱」或「封印」時不會發動）',
  onDeath: function (s, pi, u) {
    dmgHero(s, foe(pi), 3);
    summon(s, pi, 'n_mokou_immortal', {});
  }
});

C({
  id: 'n_kaguya_immortal', tribe: ['月人'], name: '蓬萊山輝夜（不死）', src: '永', cls: 'neutral',
  type: 'unit', cost: 8, atk: 4, hp: 4, works: ['永'],
  text: '死去：我方英雄回復 3 點，並召喚一個「蓬萊山輝夜（不死）」。（被「神隱」或「封印」時不會發動）',
  onDeath: function (s, pi, u) {
    healHero(s, pi, 3);
    summon(s, pi, 'n_kaguya_immortal', {});
  }
});

C({
  id: 'n_sp_kamikakushi', set: '基', name: '神隱', src: '永', cls: 'neutral', type: 'spell', cost: 6,
  text: '神隱一個敵方角色。',
  target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) banishUnit(s, c.target.unit); }
});


/* ========== 上白澤慧音：森羅結界與守護 ==========
   技能每回合白給一層護盾（所以要靈 3）。
   她的卡把「被打不死」變成資源：疊護盾、加守護，
   再用「我方有幾個帶護盾的角色」當成收頭的計數。 */

C({
  id: 'ke_ken', name: '神符「三種之神器 劍」', src: '永', cls: 'keine', type: 'spell', cost: 3,
  text: '我方一個角色 +2/+0 並獲得一層森羅結界。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 2, 0);
    addBarrier(s, u, 1);
  }
});

C({
  id: 'ke_tama', name: '國符「三種之神器 玉」', src: '永', cls: 'keine', type: 'spell', cost: 3,
  text: '我方一個角色 +0/+3 並獲得守護。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 0, 3);
    addKw(u, '守護');
  }
});

C({
  id: 'ke_kagami', name: '神符「三種之神器 鏡」', src: '永', cls: 'keine', type: 'spell', cost: 4,
  text: '我方一個角色獲得兩層森羅結界，抽 1 張。', target: T.aUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) addBarrier(s, c.target.unit, 2);
    draw(s, c.pi, 1);
  }
});

C({
  id: 'ke_amaterasu', name: '光符「アマテラス」', src: '永', cls: 'keine', type: 'spell', cost: 6,
  text: '我方所有角色 +1/+1 並各獲得一層森羅結界。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { buffUnit(u, 1, 1); addBarrier(s, u, 1); });
  }
});

C({
  id: 'ke_kioku', name: '覺神「神代的記憶」', src: '永', cls: 'keine', type: 'spell', cost: 5,
  text: '對所有敵方角色造成傷害，點數等於我方帶有森羅結界的角色數（最多 4）。',
  onPlay: function (s, c) {
    var n = Math.min(4, unitsOf(s, c.pi).filter(function (u) { return (u.barrier || 0) > 0; }).length);
    if (!n) { logMsg(s, '我方沒有帶森羅結界的角色，記憶落空'); return; }
    logMsg(s, '森羅結界 ' + n + ' 個 — 全體 ' + n + ' 點傷害');
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, n); });
  }
});

C({
  id: 'ke_jikeidan', tribe: ['人類'], name: '人間之里的自警團', src: '永', cls: 'keine',
  // 3 費時這張一張就佔 20 個百分點 —— 守護加森羅結界等於「第一次傷害免疫的牆」，
  // 而中立的紅美鈴同樣 3 費只有 2/5 守護。多付一費才合理。
  type: 'unit', cost: 4, atk: 2, hp: 4, kw: ['守護'], works: ['永'],
  text: '守護。登場：此角色獲得一層森羅結界。',
  onPlay: function (s, c) { if (c.self) addBarrier(s, c.self, 1); }
});

C({
  id: 'ke_hakutaku', tribe: ['妖獸'], name: '白澤的化身', src: '永', cls: 'keine',
  type: 'unit', cost: 5, atk: 3, hp: 5, works: ['永'],
  text: '登場：我方所有帶有森羅結界的角色 +2/+2。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { if ((u.barrier || 0) > 0) buffUnit(u, 2, 2); });
  }
});

C({
  id: 'bgm_keine', name: 'プレインエイジア', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_keine',
  text: '發動：從牌庫檢索「上白澤慧音」。我方帶有森羅結界的角色 +1/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && (u.barrier || 0) > 0) ? [1, 0] : null;
  }
});


/* ========== 莉格露·奈特巴格：蟲群 ==========
   技能每回合兩隻會飛的小蟲。飛行無視守護，
   所以她的壓迫來自「擋不住」而不是「打得大」——
   單隻永遠很小，靠數量與全體加成滾起來。 */

C({
  id: 'wr_firefly', tribe: ['妖怪'], name: '螢火蟲', src: '永', cls: 'wriggle', type: 'unit',
  cost: 1, atk: 1, hp: 1, kw: ['飛行'], token: true, works: ['永'],
  text: '飛行。莉格露召喚出來的小蟲。'
});

C({
  id: 'wr_bug', tribe: ['妖怪'], name: '夜之蟲', src: '永', cls: 'wriggle', type: 'unit',
  cost: 2, atk: 1, hp: 2, kw: ['飛行'], works: ['永'],
  text: '飛行。登場：我方其他「飛行」角色 +1/+0。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) {
      if (u !== c.self && hasKw(u, '飛行')) buffUnit(u, 1, 0);
    });
  }
});

C({
  id: 'wr_shigure', name: '蟲符「蟲時雨」', src: '永', cls: 'wriggle', type: 'spell', cost: 4,
  text: '召喚三隻 1/1 且有飛行的「螢火蟲」。',
  onPlay: function (s, c) {
    for (var i = 0; i < 3; i++) summon(s, c.pi, 'wr_firefly', {});
  }
});

C({
  id: 'wr_kousei', name: '螢符「地上的恆星」', src: '永', cls: 'wriggle', type: 'spell', cost: 3,
  text: '我方所有「飛行」角色 +1/+1。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { if (hasKw(u, '飛行')) buffUnit(u, 1, 1); });
  }
});

C({
  id: 'wr_butterfly', name: '蝶符「バタフライストーム」', src: '永', cls: 'wriggle',
  type: 'spell', cost: 5,
  text: '我方每有一個「飛行」角色，對敵方英雄造成 1 點傷害。',
  onPlay: function (s, c) {
    var n = unitsOf(s, c.pi).filter(function (u) { return hasKw(u, '飛行'); }).length;
    if (!n) { logMsg(s, '我方沒有飛行角色'); return; }
    logMsg(s, '飛行 ' + n + ' 個 — 對英雄 ' + n + ' 點傷害');
    dmgHero(s, foe(c.pi), n);
  }
});

C({
  id: 'wr_wd_yamiyo', name: '蟲之夜', src: '永', cls: 'wriggle', type: 'ward', cost: 3,
  text: '我方「飛行」角色 +0/+1。你的回合開始時，召喚一隻「螢火蟲」。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasKw(u, '飛行')) ? [0, 1] : null;
  },
  onTurnStart: function (s, owner) { summon(s, owner, 'wr_firefly', {}); }
});

C({
  id: 'bgm_wriggle', name: '蠢々秋月 ～ Mooned Insect', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_wriggle',
  text: '發動：從牌庫檢索「莉格露·奈特巴格」。我方「飛行」角色 +1/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasKw(u, '飛行')) ? [1, 0] : null;
  }
});


/* ========== 米斯蒂婭·蘿蕾拉：夜盲 ==========
   她不殺人，只讓對手看不見 —— 削攻擊力、擋攻擊。
   對手的場面還在，但打不動；她靠這段時間慢慢把血量磨完。 */

C({
  id: 'my_song', name: '夜盲「夜雀之歌」', src: '永', cls: 'mystia', type: 'spell', cost: 3,
  text: '所有敵方角色的攻擊力 -1，且本回合無法攻擊。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) {
      buffUnit(u, -1, 0);
      u.cantAttack = true;
    });
  }
});

C({
  id: 'my_moth', name: '蛾符「天蛾的蠱道」', src: '永', cls: 'mystia', type: 'spell', cost: 4,
  text: '使一個敵方角色的攻擊力永久變為 0。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.atkZero = true; }
});

C({
  id: 'my_chorus', name: '夜雀「真夜中的合唱指揮」', src: '永', cls: 'mystia', type: 'spell', cost: 5,
  text: '對每個攻擊力 2 以下的敵方角色造成 4 點傷害。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { if (atkOf(u) <= 2) dmgUnit(s, u, 4); });
  }
});

C({
  id: 'my_owl', tribe: ['妖怪'], name: '夜之梟', src: '永', cls: 'mystia', type: 'unit',
  cost: 3, atk: 2, hp: 4, kw: ['飛行'], works: ['永'],
  text: '飛行。登場：一個敵方角色的攻擊力 -2。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, -2, 0); }
});

C({
  id: 'my_sparrow', tribe: ['妖怪'], name: '夜雀', src: '永', cls: 'mystia', type: 'unit',
  cost: 2, atk: 2, hp: 2, kw: ['飛行'], works: ['永'],
  // 引擎沒有「攻擊時」的鉤子，所以改成登場效果，不要寫卡面做不到的事
  text: '飛行。登場：使一個敵方角色本回合無法攻擊。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.cantAttack = true; }
});

C({
  id: 'my_wd_yoru', name: '鳥目之夜', src: '永', cls: 'mystia', type: 'ward', cost: 3,
  text: '你的回合開始時，攻擊力最高的敵方角色 -1 攻擊力。',
  onTurnStart: function (s, owner) {
    var list = unitsOf(s, foe(owner));
    if (!list.length) return;
    var top = list[0];
    list.forEach(function (u) { if (atkOf(u) > atkOf(top)) top = u; });
    buffUnit(top, -1, 0);
  }
});

C({
  id: 'bgm_mystia', name: '夜雀の歌声 ～ Night Bird', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_mystia',
  text: '發動：從牌庫檢索「米斯蒂婭·蘿蕾拉」。敵方角色 -1 攻擊力。',
  aura: function (s, owner, u) { return (u.owner !== owner) ? [-1, 0] : null; }
});

/* ========== 八意永琳：藥與反魂 ==========
   技能給角色一次「死不了」，對手的移除就得多花一次。
   她的卡把這件事推到極致：疊反魂、回血、把死亡當成資源。 */

C({
  id: 'ei_medicine', name: '藥符「壺中之藥」', src: '永', cls: 'eirin', type: 'spell', cost: 3,
  text: '我方一個角色獲得反魂，並回復所有生命。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    u.revive = (u.revive || 0) + 1;
    u.dmg = 0;
  }
});

C({
  id: 'ei_hourai', name: '藥符「蓬萊之藥」', src: '永', cls: 'eirin', type: 'spell', cost: 6,
  text: '我方所有角色獲得反魂。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { u.revive = (u.revive || 0) + 1; });
  }
});

C({
  id: 'ei_astro', name: '天文「天鵝座 α」', src: '永', cls: 'eirin', type: 'spell', cost: 4,
  text: '對所有敵方角色造成 2 點傷害，我方英雄回復 4 點。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, 2); });
    healHero(s, c.pi, 4);
  }
});

C({
  id: 'ei_mixture', name: '難題「新蓬萊之藥」', src: '永', cls: 'eirin', type: 'spell', cost: 2,
  text: '我方英雄回復 6 點；若我方有帶反魂的角色，改為回復 10 點。',
  onPlay: function (s, c) {
    var boost = unitsOf(s, c.pi).some(function (u) { return (u.revive || 0) > 0; });
    if (boost) logMsg(s, '藥效倍增');
    healHero(s, c.pi, boost ? 10 : 6);
  }
});

C({
  id: 'ei_usagi', tribe: ['月人'], name: '月之藥師', src: '永', cls: 'eirin', type: 'unit',
  cost: 4, atk: 3, hp: 4, works: ['永'],
  text: '登場：我方一個其他角色獲得反魂。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit;
    if (u && u !== c.self) u.revive = (u.revive || 0) + 1;
  }
});

C({
  id: 'ei_moonrabbit', tribe: ['月人'], name: '月兔', src: '永', cls: 'eirin', type: 'unit',
  cost: 2, atk: 2, hp: 2, works: ['永'],
  text: '死去：我方英雄回復 3 點。',
  onDeath: function (s, pi, u) { healHero(s, pi, 3); }
});

C({
  id: 'bgm_eirin', name: 'ヴォヤージュ1970', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_eirin',
  text: '發動：從牌庫檢索「八意永琳」。我方「月人」角色 +1/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '月人')) ? [1, 1] : null;
  }
});


/* ========== 鈴仙·優曇華院·因幡：狂氣 ==========
   她不自己出手，讓對手的角色互相殘殺。
   對手鋪得愈滿她愈強 —— 全場唯一「對手鋪場反而危險」的流派。 */

C({
  id: 're_lunatic', name: '狂符「幻視盲聽」', src: '永', cls: 'reisen', type: 'spell', cost: 4,
  text: '使兩個隨機的敵方角色互相攻擊。',
  onPlay: function (s, c) {
    var list = unitsOf(s, foe(c.pi));
    if (list.length < 2) { logMsg(s, '對方角色不足兩個'); return; }
    var a = pick(s, list);
    var b = pick(s, list.filter(function (x) { return x !== a; }));
    forceClash(s, a, b);
  }
});

C({
  id: 're_discarder', name: '狂視「Illusion Seeker」', src: '永', cls: 'reisen', type: 'spell', cost: 5,
  text: '使一個敵方角色攻擊所有其他敵方角色。', target: T.eUnit,
  onPlay: function (s, c) {
    var a = c.target && c.target.unit; if (!a) return;
    unitsOf(s, foe(c.pi)).slice().forEach(function (b) {
      if (b !== a && !a.dead) forceClash(s, a, b);
    });
  }
});

C({
  id: 're_wave', name: '波符「幻朧月睨」', src: '永', cls: 'reisen', type: 'spell', cost: 3,
  text: '所有敵方角色的攻擊力 -2。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { buffUnit(u, -2, 0); });
  }
});

C({
  id: 're_madness', tribe: ['月人'], name: '狂氣的月兔', src: '永', cls: 'reisen', type: 'unit',
  cost: 3, atk: 3, hp: 3, works: ['永'],
  text: '登場：敵方角色每有 3 個，對敵方英雄造成 2 點傷害。',
  onPlay: function (s, c) {
    var n = Math.floor(unitsOf(s, foe(c.pi)).length / 3) * 2;
    if (n > 0) { logMsg(s, '對方場面擁擠 — 對英雄 ' + n + ' 點傷害'); dmgHero(s, foe(c.pi), n); }
  }
});

C({
  id: 're_eye', tribe: ['月人'], name: '紅色的眼', src: '永', cls: 'reisen', type: 'unit',
  cost: 2, atk: 1, hp: 4, works: ['永'],
  text: '登場：一個敵方角色本回合無法攻擊。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.cantAttack = true; }
});

C({
  id: 're_wd_kyouki', name: '狂氣之波', src: '永', cls: 'reisen', type: 'ward', cost: 4,
  text: '你的回合開始時，若敵方角色有 3 個以上，使兩個隨機的敵方角色互相攻擊。',
  onTurnStart: function (s, owner) {
    var list = unitsOf(s, foe(owner));
    if (list.length < 3) return;
    var a = pick(s, list);
    var b = pick(s, list.filter(function (x) { return x !== a; }));
    forceClash(s, a, b);
  }
});

C({
  id: 'bgm_reisen', name: '狂気の瞳 ～ Invisible Full Moon', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_reisen',
  text: '發動：從牌庫檢索「鈴仙·優曇華院·因幡」。敵方角色 -1 攻擊力。',
  aura: function (s, owner, u) { return (u.owner !== owner) ? [-1, 0] : null; }
});


/* ========== 因幡帝：幸運 ==========
   技能把便宜的卡變成免費。她的卡走同一條路：
   讓費用消失、讓小卡變大，靠「白賺的那一點」累積成優勢。 */

C({
  id: 'te_luck', name: '兔符「因幡的素兔」', src: '永', cls: 'tewi', type: 'spell', cost: 2,
  text: '抽 2 張，它們的費用各 -1。',
  onPlay: function (s, c) {
    var p = s.players[c.pi];
    var before = p.hand.length;
    draw(s, c.pi, 2);
    for (var i = before; i < p.hand.length; i++) p.hand[i].costMod -= 1;
  }
});

C({
  id: 'te_fortune', name: '幸運的加護', src: '永', cls: 'tewi', type: 'spell', cost: 1,
  text: '我方一個角色 +2/+2。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, 2, 2); }
});

C({
  id: 'te_trap', name: '罠符「Ultimate Buried」', src: '永', cls: 'tewi', type: 'spell', cost: 3,
  text: '對一個敵方角色造成 5 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 5); }
});

C({
  id: 'te_rabbit', tribe: ['妖怪'], name: '因幡的兔', src: '永', cls: 'tewi', type: 'unit',
  cost: 1, atk: 1, hp: 2, works: ['永'],
  text: '登場：手牌中隨機一張卡費用 -1。',
  onPlay: function (s, c) {
    var t = pick(s, s.players[c.pi].hand);
    if (t) { t.costMod -= 1; logMsg(s, '「' + def(t.defId).name + '」費用 -1'); }
  }
});

C({
  id: 'te_lucky', tribe: ['妖怪'], name: '幸運的兔', src: '永', cls: 'tewi', type: 'unit',
  cost: 3, atk: 3, hp: 3, works: ['永'],
  text: '登場：探尋(3)：從費用 2 以下的卡中選 1 張，其費用變為 0。',
  onPlay: function (s, c) {
    discoverWhere(s, c.pi,
      function (d) { return d.cost <= 2 && d.type !== 'bgm'; },
      3, '探尋「幸運」',
      function (s2, pi, card) { card.costMod -= 99; });
  }
});

C({
  id: 'te_wd_kouun', name: '幸運之兆', src: '永', cls: 'tewi', type: 'ward', cost: 3,
  text: '你的回合開始時，手牌中隨機一張卡費用 -1。',
  onTurnStart: function (s, owner) {
    var t = pick(s, s.players[owner].hand);
    if (t) t.costMod -= 1;
  }
});

C({
  id: 'bgm_tewi', name: 'お宇佐さまの素い幡', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_tewi',
  text: '發動：從牌庫檢索「因幡帝」。你的回合開始時，手牌最右的卡費用 -1。',
  onTurnStart: function (s, owner) {
    var h = s.players[owner].hand;
    if (h.length) h[h.length - 1].costMod -= 1;
  }
});


/* ========== 蓬萊山輝夜：五個難題 ==========
   技能每回合把一個難題洗進手裡（費用 -2）。
   難題本身就是她的五張專屬大招 —— 各自對應原作那五樣不可能的寶物，
   單張都比同費強，但你抽到哪一個由不得你。 */

C({
  id: 'ka_hourai', name: '難題「蓬萊的玉枝 -永夜的雕刻家-」', src: '永', cls: 'kaguya',
  // 全體 +2/+2 且沒有族群限制 —— 大妖精的「妖精的成長」3 費只給妖精 +1/+1
  type: 'spell', cost: 7, nandai: true,
  text: '我方所有角色 +2/+2。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { buffUnit(u, 2, 2); });
  }
});

C({
  id: 'ka_hachi', name: '難題「佛之石缽 -不碎的意志-」', src: '永', cls: 'kaguya',
  // 慧音的「アマテラス」6 費才給「+1/+1 ＋一層護盾」，這張原本 5 費就給兩層護盾
  type: 'spell', cost: 6, nandai: true,
  text: '我方所有角色各獲得兩層森羅結界。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { addBarrier(s, u, 2); });
  }
});

C({
  id: 'ka_koromo', name: '難題「火鼠的皮衣 -燒不盡的心-」', src: '永', cls: 'kaguya',
  type: 'spell', cost: 4, nandai: true,
  text: '我方英雄回復 8 點，並抽 1 張。',
  onPlay: function (s, c) { healHero(s, c.pi, 8); draw(s, c.pi, 1); }
});

C({
  id: 'ka_tama', name: '難題「龍頸之玉 -五色的彈丸-」', src: '永', cls: 'kaguya',
  // 魔理沙的「ドラゴンメテオ」6 費打 4 次，這張原本 5 費就打 5 次
  type: 'spell', cost: 6, nandai: true,
  text: '對隨機的敵方目標造成 2 點傷害 5 次。',
  onPlay: function (s, c) {
    for (var i = 0; i < 5; i++) {
      var t = pick(s, unitsOf(s, foe(c.pi)));
      if (t) dmgUnit(s, t, 2); else dmgHero(s, foe(c.pi), 2);
      cleanupDeaths(s);
    }
  }
});

C({
  id: 'ka_kai', name: '難題「燕的子安貝 -永遠的乳白色-」', src: '永', cls: 'kaguya',
  type: 'spell', cost: 7, nandai: true,
  text: '神隱一個敵方角色，並抽 2 張。', target: T.eUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) banishUnit(s, c.target.unit);
    draw(s, c.pi, 2);
  }
});

C({
  id: 'ka_eternity', tribe: ['月人'], name: '永遠亭的居民', src: '永', cls: 'kaguya',
  type: 'unit', cost: 3, atk: 2, hp: 5, works: ['永'],
  text: '登場：若你手上有「難題」，此角色 +2/+0。',
  onPlay: function (s, c) {
    var has = s.players[c.pi].hand.some(function (h) { return def(h.defId).nandai; });
    if (has && c.self) buffUnit(c.self, 2, 0);
  }
});

C({
  id: 'bgm_kaguya', name: '竹取飛翔 ～ Lunatic Princess', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_kaguya',
  text: '發動：從牌庫檢索「蓬萊山輝夜」。你手上的「難題」費用 -1。',
  costMod: function (s, owner, d, casterPi) {
    return (casterPi === owner && d.nandai) ? -1 : 0;
  }
});

/* ===== js/decks.js ===== */
/* ============================================================
   東方符卡大戰 — 預設牌組
   每位英雄一份手寫牌表，對應 docs/builds.md 的流派設計。
   必須在所有 cards/*.js 之後載入。

   預組的目標是「一副堪用、而且看得出戰術」的牌組，不是最佳解；
   玩家可以在牌組編輯器裡自己改。
   ============================================================ */
'use strict';

/* [卡片 id, 張數]。改動後請跑 npm run lint 檢查合法性。 */
var PRESET_DECKS = {

  /* 封印巫女：用封印把對手的關鍵角色變成白板，再慢慢清場 */
  reimu: {
    bgm: 'bgm_reimu',
    cards: [
      ['r_sekima', 4], ['r_taiji', 3], ['r_inori', 3], ['r_musou', 2],
      ['r_watashi', 2], ['r_onmyo', 2], ['r_nijuu', 1], ['r_kyoukai', 1],
      ['r_tensei', 1],
      ['n_meiling', 4], ['n_daiyousei', 4], ['n_maid', 3], ['n_lyrica', 3],
      ['n_keine', 2], ['n_koakuma', 1], ['n_fairy', 1], ['n_fd_eientei', 1],
      ['n_eirin', 1], ['c_reimu', 1]
    ]
  },

  /* 連奏魔女：技能每回合抽牌降費 → 一回合連打多張符卡 → 符卡使長大 → 隨機多段與 AOE 清場 → Spark 收頭 */
  marisa: {
    bgm: 'bgm_marisa',
    cards: [
      ['m_hijou', 4], ['m_madan', 3], ['m_milkyway', 3], ['m_hoshikuzu', 2],
      ['m_raikan', 2], ['m_spark', 2], ['m_blazing', 2], ['m_mushroom', 2],
      ['m_grimoire', 2], ['m_masterspark', 1], ['m_hakkero', 1], ['m_hat', 1],
      ['m_dragonmeteor', 1], ['m_forest', 1],
      ['n_patchouli', 3], ['n_meiling', 3], ['n_chen', 3], ['n_rumia', 2],
      ['n_koakuma', 1], ['c_marisa', 1]
    ]
  },

  /* 時間停止：數值不高，但攻擊次數是別人的兩三倍 */
  sakuya: {
    bgm: 'bgm_sakuya',
    cards: [
      ['s_knife', 4], ['s_maid2', 4], ['s_doll', 4], ['s_private', 3],
      ['s_inscribe', 2], ['s_eternal', 2], ['s_sakuyaworld', 1],
      ['s_clock', 1], ['n_chen', 4], ['n_merlin', 4], ['n_rumia', 3],
      ['n_meiling', 2], ['n_ran', 2], ['n_fd_scarlet', 1], ['n_sp_omamori', 1],
      ['c_sakuya', 2]
    ]
  },

  /* 一擊必殺：資源全疊在一隻身上，用貫通把溢出傷害打進臉 */
  youmu: {
    bgm: 'bgm_youmu',
    cards: [
      ['y_shugyo', 4], ['y_hakurou', 4], ['y_utsusemi', 3], ['y_ouka', 3],
      ['y_konpaku', 2], ['y_shokei', 2], ['y_roukanken', 1],
      ['y_rokudou', 1], ['n_daiyousei', 4], ['n_tewi', 4], ['n_meiling', 3],
      ['n_wd_shimenawa', 2], ['n_keine', 2], ['n_fd_scarlet', 1], ['n_sp_omamori', 1],
      ['c_youmu', 3]
    ]
  },

  /* 境界操作：不比大小，改寫規則 */
  yukari: {
    bgm: 'bgm_yukari',
    cards: [
      ['k_hands', 4], ['k_gapyoukai', 3], ['k_sougi', 2], ['k_mugen', 2],
      ['k_kamikakushi', 2],
      ['k_shijuu', 2], ['k_mahoujin', 2], ['k_shinkai', 2], ['k_kakurenbo', 1],
      ['k_kyoukai', 1], ['n_rumia', 4], ['n_tewi', 4],
      ['n_meiling', 3], ['n_keine', 3], ['n_ran', 2], ['n_sp_gap', 1],
      ['n_kaguya', 1], ['c_yukari', 1]
    ]
  },

  /* 人偶大軍：場上永遠站滿五個，全體強化一次打穿 */
  alice: {
    bgm: 'bgm_alice',
    cards: [
      ['a_shanghai', 4], ['a_hourai', 4], ['a_jizai', 3], ['a_hoffman', 3],
      ['a_army', 2], ['a_shinpan', 2], ['a_goliath', 2], ['a_saiban', 1],
      ['a_hourai_full', 1], ['n_fairy', 4], ['n_lily', 4], ['n_daiyousei', 3],
      ['n_wd_shimenawa', 2], ['n_meiling', 2], ['n_sp_omamori', 1], ['n_fd_scarlet', 1],
      ['c_alice', 1]
    ]
  },

  /* 吸血續航：每次攻擊都在回血，對手殺不死你 */
  remilia: {
    bgm: 'bgm_remilia',
    cards: [
      ['e_night', 4], ['e_fuyajou', 3], ['e_vampire', 3], ['e_shoot', 3],
      ['e_gungnir', 2], ['e_scarletmoon', 2], ['e_redmagic', 2], ['e_mist', 1],
      ['e_flandre', 1], ['n_meiling', 4], ['n_maid', 4],
      ['n_koakuma', 3], ['n_keine', 2], ['n_patchouli', 2], ['n_fairy', 2],
      ['n_sp_omamori', 1], ['c_remilia', 1]
    ]
  },

  /* 不死燒身：技能 0 費自傷點燃捨身，把血量換成傷害 */
  mokou: {
    bgm: 'bgm_mokou',
    cards: [
      ['mk_wu', 4], ['mk_ono', 3], ['mk_metsuzai', 3], ['mk_possessed', 3],
      ['mk_houou', 2], ['mk_gaifu', 1],
      ['n_keine', 3], ['n_chen', 3], ['n_rumia', 3], ['n_fairy', 2],
      ['n_meiling', 3], ['n_mokou', 1], ['n_mokou_immortal', 1], ['n_kaguya_immortal', 1], ['n_koakuma', 2], ['n_reisen', 2],
      ['n_sp_omamori', 2], ['c_marisa', 1]
    ]
  },

  /* 亡者輪迴：自己的角色死掉才是收益 */
  yuyuko: {
    bgm: 'bgm_yuyuko',
    cards: [
      ['u_band', 4], ['u_yuurei', 4], ['u_kurin', 3], ['u_yomotsu', 3],
      ['u_ageha', 3], ['u_botan', 2], ['u_shitai', 1], ['u_saigyou', 1],
      ['u_hangyoku', 1], ['n_ghost', 4], ['n_fairy', 4], ['n_lily', 3],
      ['n_meiling', 2], ['n_mokou', 2], ['n_sp_omamori', 1], ['n_fd_hakugyokurou', 1],
      ['c_yuyuko', 1]
    ]
  },

  /* 宵闇伏兵：鋪場 → 全體隱行躲過點殺 → 一次總攻 */
  rumia: {
    bgm: 'bgm_rumia',
    cards: [
      ['ru_yamiyousei', 4], ['ru_moonlight', 3], ['ru_dimarcation', 3],
      ['ru_kurayami', 2], ['ru_nightbird', 2], ['ru_wd_yoiyami', 2],
      ['n_rumia', 4], ['n_chen', 4], ['n_fairy', 3], ['n_maid', 3],
      ['n_koakuma', 3], ['n_wriggle', 2], ['n_meiling', 2],
      ['n_sp_omamori', 2], ['c_sakuya', 1]
    ]
  },

  /* 全面凍結：把對手的場面凍住不放，再一口氣收乾淨 */
  cirno: {
    bgm: 'bgm_cirno',
    cards: [
      ['ci_icicle', 4], ['ci_icefairy', 4], ['ci_diamond', 3],
      ['ci_perfectfreeze', 2], ['ci_wd_misty', 2], ['ci_kanzen', 1],
      ['n_cirno', 4], ['n_fairy', 4], ['n_daiyousei', 3], ['n_maid', 3],
      ['n_letty', 3], ['n_lily', 2], ['n_meiling', 2],
      ['n_sp_omamori', 2], ['c_reimu', 1]
    ]
  },

  /* 妖精大軍：單張都很弱，靠數量與層層疊上去的加成取勝 */
  daiyousei: {
    bgm: 'bgm_daiyousei',
    cards: [
      ['da_growth', 4], ['da_gather', 3], ['da_sunflower', 3],
      ['da_guardfairy', 3], ['da_swarm', 2], ['da_fd_lake', 1],
      ['n_fairy', 4], ['n_maid', 4], ['n_lily', 4], ['n_daiyousei', 4],
      ['n_cirno', 3], ['n_wd_shimenawa', 2], ['n_sp_omamori', 2],
      ['n_meiling', 1]
    ]
  },

  /* 銅牆鐵壁：守護角色的生命值加倍，對手清不動就只能看著被磨死 */
  meiling: {
    bgm: 'bgm_meiling',
    cards: [
      ['me_youkai', 4], ['me_fairymaid', 4], ['me_rainbow', 3],
      ['me_kouka', 3], ['me_wd_chiki', 2], ['me_saikou', 2],
      ['n_meiling', 4], ['n_maid', 4], ['n_letty', 2], ['n_fairy', 2], ['n_daiyousei', 3],
      ['n_keine', 2], ['n_reisen', 2], ['n_sp_omamori', 2],
      ['n_fd_scarlet', 1]
    ]
  },

  /* 圖書館助手：自己打不動人，靠檢索與降費讓別的卡早一回合出手 */
  koakuma: {
    bgm: 'bgm_koakuma',
    cards: [
      ['ko_search', 4], ['ko_serve', 4], ['ko_wings', 4], ['ko_copy', 3],
      ['ko_fd_voile', 1],
      ['n_koakuma', 4], ['n_sp_seal', 4], ['n_sp_danmaku', 3], ['n_patchouli', 3],
      ['n_rumia', 3], ['n_chen', 3], ['n_sp_omamori', 2], ['n_sp_barrier', 1],
      ['c_marisa', 1]
    ]
  },

  /* 七曜賢者：用血量換手牌，再靠賢者之石把每一張符卡都變成兩次傷害 */
  patchouli: {
    bgm: 'bgm_patchouli',
    cards: [
      ['pa_agni', 4], ['pa_sylphy', 4], ['pa_metal', 4], ['pa_undine', 3],
      ['pa_kyoseki', 3], ['pa_wd_stone', 2], ['pa_selena', 2], ['pa_royalflare', 1],
      ['n_patchouli', 4], ['n_meiling', 3], ['n_maid', 3], ['n_koakuma', 3],
      ['n_fairy', 2], ['n_sp_omamori', 1], ['c_marisa', 1]
    ]
  },

  /* 徹底破壞：每張卡都比同費強一截，代價是自己的血與手牌 */
  flandre: {
    bgm: 'bgm_flandre',
    cards: [
      ['fl_starbow', 3], ['fl_four', 3], ['fl_andthen', 3], ['fl_levantine', 2],
      ['fl_wd_kinki', 2], ['fl_qed', 1],
      ['n_maid', 4], ['n_fairy', 4], ['n_koakuma', 4], ['n_rumia', 3],
      ['n_meiling', 3], ['n_chen', 1], ['n_sp_seal', 3], ['n_sp_omamori', 2],
      ['c_remilia', 1], ['c_flandre', 1]
    ]  },

  /* 隨機春告：效果都比同費強一截，代價是你指定不了目標 */
  lily: {
    bgm: 'bgm_lily',
    cards: [
      ['li_fairy', 4], ['li_haru', 4], ['li_blackfairy', 3], ['li_mebuki', 3],
      ['li_fubuki', 3], ['li_wd_haru', 2], ['li_ranman', 1],
      ['n_lily', 4], ['n_fairy', 4], ['n_maid', 3], ['n_cirno', 3],
      ['n_daiyousei', 3], ['n_letty', 2], ['n_sp_omamori', 1]
    ]  },

  /* 合奏：湊齊三位不同的騷靈，全部效果升級。湊齊前場面很脆，這是代價 */
  prismriver: {
    bgm: 'bgm_prismriver',
    cards: [
      ['n_lunasa', 3], ['n_merlin', 3], ['n_lyrica', 3], ['pr_poltergeist', 2],
      ['pr_tuning', 2], ['pr_clifford', 3], ['pr_wd_stage', 2], ['pr_encore', 2],
      ['pr_fd_hall', 1], ['pr_symphony', 1],
      ['n_lily', 3], ['n_fairy', 3], ['n_sp_omamori', 2],
      ['n_meiling', 2], ['n_keine', 3], ['n_patchouli', 1],
      ['n_ran', 2], ['n_eirin', 1], ['n_kaguya', 1]
    ]  },

  /* 蔓延的冬天：不追求殺傷，把場面凍住拖到後期再收割 */
  letty: {
    bgm: 'bgm_letty',
    cards: [
      ['le_yuki', 3], ['le_lingering', 3], ['le_wd_fuyu', 2], ['le_fuyu', 3],
      ['le_wither', 2], ['le_snap', 2],
      ['n_letty', 3], ['n_cirno', 3], ['n_maid', 3], ['n_fairy', 3],
      ['n_meiling', 3], ['n_keine', 3], ['n_reisen', 2], ['n_sp_omamori', 2],
      ['n_ran', 2], ['n_eirin', 1]
    ]
  },

  /* 一次性衝擊：場上留不住東西，只能算這一回合能打多少 */
  chen: {
    bgm: 'bgm_chen',
    cards: [
      ['ch_kuroneko', 4], ['ch_bakeneko', 3], ['ch_hishou', 3], ['ch_wd_neko', 2],
      ['ch_shimen', 2], ['ch_ultimate', 2],
      ['n_chen', 4], ['n_rumia', 3], ['n_maid', 3], ['n_fairy', 3],
      ['n_meiling', 2], ['n_wriggle', 2], ['n_sp_omamori', 2], ['n_sp_seal', 2],
      ['n_ran', 2], ['c_marisa', 1]
    ]
  },

  /* 式神與費用壓縮：收益慢但持續，後期一口氣把手牌傾瀉出來 */
  ran: {
    bgm: 'bgm_ran',
    cards: [
      ['ra_shikigami', 4], ['ra_kudagitsune', 3], ['ra_rensei', 3], ['ra_wd_shiki', 2],
      ['ra_tenko', 2], ['ra_juuni', 2],
      ['n_chen', 4], ['n_ran', 2], ['n_maid', 3], ['n_meiling', 3],
      ['n_keine', 3], ['n_patchouli', 2], ['n_sp_omamori', 2], ['n_sp_seal', 2],
      ['n_eirin', 1], ['n_kaguya', 1], ['c_yukari', 1]
    ]  },

  /* 不壞之盾：技能每回合白給一層護盾，把「打不死」滾成優勢 */
  keine: {
    bgm: 'bgm_keine',
    cards: [
      ['ke_jikeidan', 3], ['ke_ken', 3], ['ke_tama', 3], ['ke_kagami', 2],
      ['ke_hakutaku', 2], ['ke_kioku', 2], ['ke_amaterasu', 1],
      ['n_keine', 3], ['n_meiling', 3], ['n_maid', 3], ['n_fairy', 3],
      ['n_mokou', 2], ['n_reisen', 2], ['n_sp_omamori', 2], ['n_koakuma', 2],
      ['n_eirin', 2], ['n_kaguya', 1], ['n_lily', 1]
    ]
  },

  /* 蟲群夜襲：單隻永遠很小，靠數量與飛行穿透 */
  wriggle: {
    bgm: 'bgm_wriggle',
    cards: [
      ['wr_bug', 4], ['wr_kousei', 3], ['wr_shigure', 3], ['wr_wd_yamiyo', 2],
      ['wr_butterfly', 2],
      ['n_wriggle', 4], ['n_mystia', 3], ['n_maid', 3], ['n_fairy', 3],
      ['n_ghost', 3], ['n_lunasa', 2], ['n_merlin', 2], ['n_meiling', 2],
      ['n_sp_omamori', 2], ['n_chen', 2]
    ]
  },

  /* 夜盲：對手的場面還在，但打不動 */
  mystia: {
    bgm: 'bgm_mystia',
    cards: [
      ['my_sparrow', 4], ['my_owl', 3], ['my_song', 3], ['my_moth', 2],
      ['my_chorus', 2], ['my_wd_yoru', 2],
      ['n_mystia', 3], ['n_wriggle', 3], ['n_meiling', 3], ['n_keine', 3],
      ['n_maid', 2], ['n_fairy', 2], ['n_reisen', 2], ['n_sp_omamori', 2],
      ['n_ran', 2], ['n_eirin', 1], ['n_kaguya', 1]
    ]  },

  /* 藥師：給關鍵角色反魂，對手的移除要多花一次 */
  eirin: {
    bgm: 'bgm_eirin',
    cards: [
      ['ei_moonrabbit', 4], ['ei_mixture', 3], ['ei_medicine', 3], ['ei_usagi', 3],
      ['ei_astro', 2], ['ei_hourai', 1],
      ['n_eirin', 2], ['n_reisen', 3], ['n_tewi', 3], ['n_maid', 3],
      ['n_meiling', 3], ['n_keine', 2], ['n_fairy', 2], ['n_sp_omamori', 2],
      ['n_kaguya', 2], ['c_sakuya', 1], ['c_remilia', 1]
    ]
  },

  /* 狂氣：對手鋪得愈滿，她的技能愈痛 */
  reisen: {
    bgm: 'bgm_reisen',
    cards: [
      ['re_eye', 4], ['re_madness', 3], ['re_wave', 3], ['re_lunatic', 3],
      ['re_wd_kyouki', 2], ['re_discarder', 1],
      ['n_reisen', 3], ['n_tewi', 3], ['n_meiling', 3], ['n_keine', 3],
      ['n_maid', 2], ['n_mystia', 2], ['n_sp_omamori', 2], ['n_eirin', 2],
      ['n_kaguya', 1], ['c_yukari', 1], ['c_reimu', 1], ['n_fairy', 1]
    ]
  },

  /* 幸運：讓費用消失，靠白賺的那一點累積優勢 */
  tewi: {
    bgm: 'bgm_tewi',
    cards: [
      ['te_rabbit', 4], ['te_fortune', 3], ['te_luck', 3], ['te_lucky', 3],
      ['te_trap', 3], ['te_wd_kouun', 2],
      ['n_tewi', 4], ['n_maid', 3], ['n_fairy', 3], ['n_reisen', 2],
      ['n_meiling', 2], ['n_chen', 2], ['n_sp_omamori', 2], ['n_keine', 2],
      ['n_ran', 1], ['n_eirin', 1]
    ]
  },

  /* 五個難題：技能每回合洗一個難題進手，單張都比同費強但抽到哪個由不得你 */
  kaguya: {
    bgm: 'bgm_kaguya',
    cards: [
      ['ka_eternity', 4], ['ka_koromo', 2], ['ka_tama', 2], ['ka_hachi', 2],
      ['ka_hourai', 1], ['ka_kai', 1],
      ['n_kaguya', 2], ['n_eirin', 2], ['n_reisen', 3], ['n_tewi', 3],
      ['n_keine', 3], ['n_meiling', 3], ['n_maid', 3], ['n_fairy', 3],
      ['n_sp_omamori', 2], ['n_koakuma', 2], ['c_remilia', 1], ['c_sakuya', 1]
    ]
  }
};

/* 流派名稱，給介面顯示 */
var BUILD_NAMES = {
  reimu: '封印巫女', marisa: '連奏魔女', sakuya: '時間停止', youmu: '一擊必殺',
  yukari: '境界操作', alice: '人偶大軍', remilia: '吸血續航', yuyuko: '亡者輪迴', mokou: '不死燒身',
  rumia: '宵闇伏兵', cirno: '全面凍結', daiyousei: '妖精大軍', meiling: '銅牆鐵壁',
  koakuma: '圖書館助手', patchouli: '七曜賢者', flandre: '徹底破壞',
  lily: '隨機春告', prismriver: '幻想合奏',
  letty: '蔓延之冬', chen: '一擊衝鋒', ran: '式神壓縮',
  keine: '不壞之盾', wriggle: '蟲群夜襲', mystia: '夜盲',
  eirin: '藥與反魂', reisen: '狂氣', tewi: '幸運', kaguya: '五個難題'
};

function presetDeck(heroId) {
  var entry = PRESET_DECKS[heroId];
  var list = [];
  ((entry && entry.cards) || []).forEach(function (e) {
    if (!CARDS[e[0]]) return;   // 卡片被刪掉時不要整個爆掉，交給 lint 報告
    for (var i = 0; i < e[1]; i++) list.push(e[0]);
  });
  // 牌表若因改卡而短少，用自動補牌補滿，避免預組牌組直接不合法
  if (list.length < DECK_SIZE) list = autoFill(heroId, list);
  list = list.filter(function (id) { return CARDS[id].type !== 'bgm'; });   // 防呆
  return list.slice(0, DECK_SIZE);
}

/* 預組的 BGM 欄。
   沒有手寫牌表的英雄挑一張同作品的 BGM，讓預組不會缺第 4 回合的 BGM。 */
function presetBgm(heroId) {
  var entry = PRESET_DECKS[heroId];
  if (entry && entry.bgm) return entry.bgm;
  var set = HEROES[heroId] && HEROES[heroId].set;
  var pool = Object.keys(CARDS).filter(function (id) {
    return CARDS[id].type === 'bgm' && CARDS[id].src === set;
  });
  return pool[0] || null;
}

/* ---------- 自動補牌 ----------
   只在牌組不足 40 張時使用：按費用曲線挑該英雄能用的卡填滿。
   給「玩家自組但沒組完」與「預組牌表短少」兩種情況兜底。 */
function autoFill(heroId, current) {
  var list = (current || []).slice();
  var cnt = {};
  list.forEach(function (id) { cnt[id] = (cnt[id] || 0) + 1; });

  // 目標曲線：低費多、高費少
  var want = { 0: 1, 1: 5, 2: 8, 3: 8, 4: 6, 5: 4, 6: 2, 7: 1 };
  var pool = cardsForHero(heroId).sort(function (a, b) {
    return CARDS[a].cost - CARDS[b].cost || CARDS[a].name.localeCompare(CARDS[b].name);
  });

  function bucket(id) { return Math.min(7, CARDS[id].cost); }
  function have(b) {
    return list.filter(function (id) { return bucket(id) === b; }).length;
  }
  function capOf(id) {
    var d = CARDS[id];
    // BGM 要先判斷 —— BGM 卡本身帶 unique，被上面攔下就永遠回傳 1，會被塞進主牌組
    if (d.type === 'bgm') return 0;   // BGM 放在獨立的 BGM 欄，不自動補進主牌組
    if (d.unique) return 1;
    if (d.type === 'field') return 1;
    if (d.cost >= 6) return 1;
    if (d.type === 'ward' || d.cost >= 5) return 2;
    return MAX_COPIES;
  }

  // 先照曲線缺口補，再無條件補滿
  [false, true].forEach(function (ignoreCurve) {
    for (var round = 0; round < MAX_COPIES && list.length < DECK_SIZE; round++) {
      for (var i = 0; i < pool.length && list.length < DECK_SIZE; i++) {
        var id = pool[i], b = bucket(id);
        if (!ignoreCurve && have(b) >= (want[b] || 0)) continue;
        if ((cnt[id] || 0) >= capOf(id)) continue;
        cnt[id] = (cnt[id] || 0) + 1;
        list.push(id);
      }
    }
  });
  return list;
}

/* 玩家在一個回合裡能做的所有事，全部走這一個入口。
   與瀏覽器端 js/ai.js 裡的那一份保持一致 —— 兩邊都靠它解讀動作訊息。 */
function applyAction(s, pi, a) {
  if (a.k === 'choose') return resolveChoice(s, a.defId);
  if (a.k === 'play') return playCard(s, pi, a.uid, a.t);
  if (a.k === 'power') return useHeroPower(s, pi, a.t);
  if (a.k === 'atk') return doAttack(s, a.uid, a.t);
  if (a.k === 'mull') {
    if (!s.pendingMulligan[pi]) return '你已經調度過了';
    doMulligan(s, pi, a.toss || []);
    return null;
  }
  if (a.k === 'end') {
    if (s.active !== pi) return '不是你的回合';
    return endTurn(s) || null;
  }
  if (a.k === 'concede') {
    if (s.winner != null) return '對局已結束';
    s.winner = foe(pi);
    s.phase = 'over';
    logMsg(s, heroName(s.players[pi]) + ' 投降');
    return null;
  }
  return '未知動作';
}

/* 遮蔽視野。與 js/net.js 的 redact() 同一套規則 ——
   對手的手牌與雙方的牌庫換成同長度的佔位物，探尋選項只有當事人看得到。 */
function redactState(state, forPi) {
  var s = JSON.parse(JSON.stringify(state));
  var foePi = 1 - forPi;
  s.players[foePi].hand = s.players[foePi].hand.map(function () {
    return { uid: 0, defId: '?', costMod: 0, tempCostMod: 0 };
  });
  s.players[foePi].bgmCard = null;
  [0, 1].forEach(function (i) {
    s.players[i].deck = s.players[i].deck.map(function () { return { uid: 0, defId: '?' }; });
  });
  if (s.pendingChoice && s.pendingChoice.pi !== forPi) {
    s.pendingChoice = { pi: s.pendingChoice.pi, options: [], label: s.pendingChoice.label };
  }
  s.log = (s.log || []).slice(-60);
  return s;
}

export {
  CARDS,
  HEROES,
  HERO_ORDER,
  KEYWORDS,
  TRIBES,
  newGame,
  doMulligan,
  endTurn,
  playCard,
  doAttack,
  useHeroPower,
  resolveChoice,
  canPlay,
  canHeroPower,
  validateDeck,
  presetDeck,
  presetBgm,
  foe,
  def,
  unitsOf,
  logMsg,
  heroName,
  DECK_SIZE,
  MAX_COPIES,
  TURN_SECONDS,
  DISCONNECT_GRACE,
  applyAction,
  redactState
};

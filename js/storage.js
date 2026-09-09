/* ============================================================
   東方符卡大戰 — localStorage 存檔
   ============================================================ */
'use strict';

var SAVE_VER = 1;

var K = {
  decks: 'tsw_decks_v1',
  stats: 'tsw_stats_v1',
  settings: 'tsw_settings_v1',
  game: 'tsw_game_v1'
};

function lsGet(k, fallback) {
  try {
    var raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { }
}

/* ---------- 牌組 ----------
   預設牌組**不存進 localStorage**，每次由 PRESET_DECKS 即時產生。
   好處：永遠是最新版（加了新卡不必做存檔遷移）、玩家也刪不掉。
   localStorage 只存玩家自己做的牌組。 */

function presetDecks() {
  return HERO_ORDER.map(function (h) {
    return {
      id: 'preset_' + h,
      name: HEROES[h].name + (BUILD_NAMES[h] ? '・' + BUILD_NAMES[h] : ''),
      heroId: h,
      cards: presetDeck(h),
      bgm: presetBgm(h),
      preset: true
    };
  });
}

/* 玩家自己做的牌組 */
function loadDecks() {
  var d = lsGet(K.decks, null);
  if (!Array.isArray(d)) return [];
  var mine = d.filter(function (x) { return x && !x.preset; });
  // 清掉舊存檔裡殘留的預設牌組（現在改為即時產生）
  if (mine.length !== d.length) lsSet(K.decks, mine);
  return mine;
}
function saveDecks(d) {
  lsSet(K.decks, (d || []).filter(function (x) { return !x.preset; }));
}

/* 對戰選擇畫面用：預設 + 自己的 */
function allDecks() { return presetDecks().concat(loadDecks()); }
function findDeck(id) {
  var all = allDecks();
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return null;
}

function newDeckId() { return 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1000); }

/* ---------- 戰績 ---------- */
function loadStats() { return lsGet(K.stats, { win: 0, lose: 0, draw: 0, byHero: {} }); }
function recordResult(heroId, r) {
  var st = loadStats();
  st[r] = (st[r] || 0) + 1;
  st.byHero[heroId] = st.byHero[heroId] || { win: 0, lose: 0, draw: 0 };
  st.byHero[heroId][r]++;
  lsSet(K.stats, st);
}
function resetStats() { lsSet(K.stats, { win: 0, lose: 0, draw: 0, byHero: {} }); }

/* ---------- 設定 ---------- */
function loadSettings() { return lsGet(K.settings, { aiDelay: 700, showLog: true }); }
function saveSettings(s) { lsSet(K.settings, s); }

/* ---------- 進行中的對局 ---------- */
function saveGame(s) {
  if (!s || s.winner != null) { clearGame(); return; }
  lsSet(K.game, {
    ver: SAVE_VER,
    state: {
      seed: s.seed, turn: s.turn, active: s.active, first: s.first,
      winner: s.winner, phase: s.phase, players: s.players, bgm: s.bgm,
      pendingChoice: s.pendingChoice,
      pendingMulligan: s.pendingMulligan, log: s.log.slice(-60),
      aiLevel: s.aiLevel
    },
    humanSide: s.humanSide
  });
}
function loadGame() {
  var g = lsGet(K.game, null);
  if (!g || g.ver !== SAVE_VER) return null;
  var s = g.state;
  s.humanSide = g.humanSide;
  // 修正 uid 計數器，避免與舊物件衝突
  var mx = 0;
  s.players.forEach(function (p) {
    p.hand.concat(p.deck).forEach(function (c) { if (c.uid > mx) mx = c.uid; });
    p.units.forEach(function (u) { if (u && u.uid > mx) mx = u.uid; });
    p.wards.forEach(function (w) { if (w && w.uid > mx) mx = w.uid; });
    if (p.field && p.field.uid > mx) mx = p.field.uid;
  });
  bumpUid(mx + 1);
  return s;
}
function clearGame() { try { localStorage.removeItem(K.game); } catch (e) { } }

/* ---------- 牌組碼（Base64） ---------- */
function encodeDeck(deck) {
  var ids = Object.keys(CARDS);
  var payload = {
    h: deck.heroId, n: deck.name, b: deck.bgm ? ids.indexOf(deck.bgm) : -1,
    c: deck.cards.map(function (c) { return ids.indexOf(c); })
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}
function decodeDeck(code) {
  try {
    var ids = Object.keys(CARDS);
    var o = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!HEROES[o.h]) return null;
    var cards = o.c.map(function (i) { return ids[i]; }).filter(Boolean);
    if (cards.length !== DECK_SIZE) return null;
    var bgm = (o.b != null && o.b >= 0) ? ids[o.b] : null;
    if (bgm && (!CARDS[bgm] || CARDS[bgm].type !== 'bgm')) bgm = null;
    return { id: newDeckId(), name: o.n || '匯入的牌組', heroId: o.h, cards: cards, bgm: bgm };
  } catch (e) { return null; }
}


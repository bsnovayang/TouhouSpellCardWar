/* ============================================================
   東方符卡大戰 — 連線層

   設計的核心是一句話：**只有一邊跑引擎**。

   權威端（單機時是你自己、雙人時是主機或伺服器）持有完整盤面，
   套用動作之後把「遮蔽過的視野」推給雙方；
   非權威端只負責渲染與送出動作，從不自己改變盤面。

   這樣做的理由有三個：
     1. 對手的手牌永遠不會離開權威端，客戶端翻 DevTools 也看不到
     2. 雙方不可能出現盤面不一致（只有一份是真的）
     3. 之後把傳輸換成 WebSocket 時，遊戲邏輯一行都不用動 ——
        BroadcastChannel 與 WebSocket 對這一層來說只是「會送訊息的通道」

   引擎的 uid 計數器是模組層全域，AI 模擬也會消耗它。
   在「只有一邊跑引擎」的架構下這完全不是問題；
   但如果之後改成雙方各自模擬（lockstep），就必須先把它搬進 state。
   ============================================================ */
'use strict';

var NET = {
  mode: 'local',     // local（單機打 AI）／host（雙人・我是權威端）／guest（雙人・我是客戶端）
  side: 0,           // 我在這局裡是 players[side]
  transport: null,   // { send(msg), close() }
  matchId: null,
  onState: null,     // 收到新盤面時要做什麼（由 ui.js 掛上）
  onInfo: null,      // 連線狀態變化（等待對手／對手斷線／對手離開）
  onTick: null,      // 每 250ms 回報剩餘秒數
  onTimeout: null    // 單機模式時間到（由 ui 決定怎麼結束回合）
};

/* ---------- 遮蔽視野 ----------
   介面只渲染自己的手牌，對手那邊只用到 deck.length 與 hand.length，
   所以把對手的手牌與雙方的牌庫換成同長度的佔位物件就夠了。
   佔位卡的 defId 是 '?'，任何試圖讀取牌面的程式都會立刻壞掉而不是默默給出錯誤資訊 —— 這是故意的。 */
function redact(state, forPi) {
  var s = JSON.parse(JSON.stringify(state));
  var foePi = 1 - forPi;
  s.players[foePi].hand = s.players[foePi].hand.map(function () {
    return { uid: 0, defId: '?', costMod: 0, tempCostMod: 0 };
  });
  // 對手 BGM 欄的內容是隱藏資訊。留 null 而不是假物件，避免任何程式把它當成真卡去查。
  s.players[foePi].bgmCard = null;
  [0, 1].forEach(function (i) {
    s.players[i].deck = s.players[i].deck.map(function () { return { uid: 0, defId: '?' }; });
  });
  // 探尋的選項只有當事人看得到
  if (s.pendingChoice && s.pendingChoice.pi !== forPi) {
    s.pendingChoice = { pi: s.pendingChoice.pi, options: [], label: s.pendingChoice.label };
  }
  s.log = (s.log || []).slice(-60);
  return s;
}

/* ---------- 動作出口 ----------
   介面的每一個操作都經過這裡，不再直接改 G。 */
function dispatch(a) {
  if (!G || G.winner != null) return '對局已結束';

  if (NET.mode === 'local') {
    return applyAction(G, ME, a);
  }

  if (NET.mode === 'host') {
    // 對權威盤面套用，不是對 G —— G 是「我看到的視野」，是遮蔽過的。
    var err = applyAction(HOST.full, NET.side, a);
    if (err) return err;
    hostBroadcast();
    return null;
  }

  // guest：不自己套用，送出去等權威端回覆
  NET.transport.send({ t: 'act', a: a });
  return null;
}

/* ---------- 主機端 ----------
   HOST.full 是唯一的權威盤面，含雙方完整手牌，永遠不離開這一端。
   全域的 G 在任何一端都只是「我看到的視野」（遮蔽過的）。

   這兩者一定要分開。先前的版本讓主機把 G 直接當權威盤面用，
   結果廣播時 onState 把 G 換成遮蔽版本，
   下一次廣播就變成「對已經遮蔽過的盤面再遮蔽一次」——
   連客人自己的手牌都被抹成 '?'。 */
var HOST = { full: null, myDeck: null };

function hostBroadcast() {
  timerSync(HOST.full);
  NET.transport.send({
    t: 'state', side: 1 - NET.side,
    s: redact(HOST.full, 1 - NET.side),
    deadline: TIMER.deadline
  });
  if (NET.onState) NET.onState(redact(HOST.full, NET.side));
}

/* 主機收到客人的訊息 */
function hostOnMessage(msg) {
  aliveSeen();
  if (msg.t === 'ping') return;
  if (msg.t === 'join') {
    // 對局在這一刻才被建立 —— 在知道對手帶什麼牌組之前不能開始。
    if (HOST.full) { NET.transport.send({ t: 'full', m: '房間已經有人了' }); return; }
    var errs = validateDeck(msg.deck);
    if (errs.length) {
      NET.transport.send({ t: 'reject', m: '對手的牌組不合法：' + errs.join('、') });
      if (NET.onInfo) NET.onInfo('reject', '對手的牌組不合法，已拒絕');
      return;
    }
    hostStart(msg.deck);
    return;
  }
  if (!HOST.full) return;               // 還沒開局，其他訊息一律忽略
  if (msg.t === 'act') {
    var err = applyAction(HOST.full, 1 - NET.side, msg.a);
    if (err) { NET.transport.send({ t: 'err', m: err }); return; }
    hostBroadcast();
  } else if (msg.t === 'bye') {
    if (NET.onInfo) NET.onInfo('left', '對手離開了');
  }
}

/* 雙方牌組都到齊了才真的開局 */
function hostStart(guestDeck) {
  var mine = HOST.myDeck;
  HOST.full = newGame({
    p0: { heroId: mine.heroId, deck: mine.cards.slice(), bgm: mine.bgm || null },
    p1: { heroId: guestDeck.heroId, deck: guestDeck.cards.slice(), bgm: guestDeck.bgm || null },
    firstPlayer: null            // PvP 一律由權威端隨機決定
  });
  G = redact(HOST.full, 0);
  G.humanSide = 0;
  NET.transport.send({ t: 'begin', side: 1 });
  hostBroadcast();
  if (NET.onInfo) NET.onInfo('begin', '對手已加入');
}

/* 客人收到主機的訊息 */
function guestOnMessage(msg) {
  aliveSeen();
  if (msg.t === 'ping') return;
  if (msg.t === 'full' || msg.t === 'reject') {
    if (NET.onInfo) NET.onInfo('reject', msg.m);
    return;
  }
  if (msg.t === 'begin') {
    if (NET.onInfo) NET.onInfo('begin', '已連上主機');
    return;
  }
  if (msg.t === 'state' && msg.side === NET.side) {
    G = msg.s;
    G.humanSide = NET.side;
    // 倒數由權威端決定，客人只是顯示。兩邊時鐘可能有幾百毫秒的差，
    // 但只有權威端會真的結束回合，所以不會有「我這邊還有 1 秒卻被結束」的爭議。
    TIMER.deadline = msg.deadline || 0;
    if (NET.onState) NET.onState(G);
  } else if (msg.t === 'err') {
    if (NET.onInfo) NET.onInfo('err', msg.m);
  } else if (msg.t === 'bye') {
    if (NET.onInfo) NET.onInfo('left', '對手離開了');
  }
}

/* ---------- 傳輸：同一台電腦的兩個分頁 ----------
   BroadcastChannel 是瀏覽器內建的，同源同裝置，零設定。
   換裝置就完全沒用 —— 它只是用來在不碰後端的情況下驗證整套雙人流程。 */
function localChannel(room, onMessage) {
  var bc = new BroadcastChannel('tsw-' + room);
  bc.onmessage = function (e) {
    // 自己送的訊息 BroadcastChannel 不會回給自己，所以不用過濾
    onMessage(e.data);
  };
  return {
    send: function (m) { bc.postMessage(m); },
    close: function () { try { bc.close(); } catch (e) { } }
  };
}

/* ---------- 傳輸：WebSocket（跨裝置） ----------
   跟 localChannel 的介面完全一樣，所以上面所有邏輯都不用改。

   跨裝置時伺服器才是權威端，兩邊都是 guest —— 沒有人在瀏覽器裡跑引擎，
   所以對手的手牌真的離不開伺服器。同裝置的 BroadcastChannel 模式
   則是主機端跑引擎，那個只用來在沒有後端時驗證流程。 */
var SERVER_URL = '';   // 例如 'wss://tsw.你的帳號.workers.dev'，空字串代表沒有設定伺服器

function wsChannel(room, onMessage, onOpen) {
  var ws = new WebSocket(SERVER_URL + '/ws/' + room);
  var queue = [];
  ws.onopen = function () {
    queue.forEach(function (m) { ws.send(JSON.stringify(m)); });
    queue = [];
    if (onOpen) onOpen();
  };
  ws.onmessage = function (e) {
    var m; try { m = JSON.parse(e.data); } catch (x) { return; }
    onMessage(m);
  };
  ws.onclose = function () { if (NET.onInfo) NET.onInfo('lost', '與伺服器的連線中斷'); };
  return {
    send: function (m) {
      // 連線還沒建立就先排隊，否則第一個 join 訊息會掉
      if (ws.readyState === 1) ws.send(JSON.stringify(m)); else queue.push(m);
    },
    close: function () { try { ws.close(); } catch (e) { } }
  };
}

/* 伺服器模式：兩邊都是客戶端，權威在 DO 那一側 */
function netConnect(room, myDeck, side) {
  NET.mode = 'guest';
  NET.side = side;
  NET.matchId = room;
  HOST.full = null;
  G = null;
  NET.transport = wsChannel(room, guestOnMessage, function () {
    NET.transport.send({ t: 'join', deck: myDeck });
  });
  aliveStart();
}

/* 自動配對：先問伺服器要一個房間，再連上去 */
function netMatchmake(myDeck, onWaiting) {
  var http = SERVER_URL.replace(/^ws/, 'http');
  return fetch(http + '/matchmake', { method: 'POST' })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (j.waiting && onWaiting) onWaiting(j.room);
      netConnect(j.room, myDeck, j.side);
      return j;
    });
}

/* ---------- 對外：開一場雙人對局 ---------- */

/* 主機：開房等待。**這裡不建立對局** ——
   要等客人帶著自己的牌組連進來（hostStart）才開始，
   否則對手還沒到就能開打，而且他會被迫用開房者的英雄。 */
function netHost(room, myDeck) {
  NET.mode = 'host';
  NET.side = 0;
  NET.matchId = room;
  HOST.full = null;
  HOST.myDeck = myDeck;
  G = null;
  NET.transport = localChannel(room, hostOnMessage);
  aliveStart();
}

/* 客人：帶著自己的牌組連上房間 */
function netJoin(room, myDeck) {
  NET.mode = 'guest';
  NET.side = 1;
  NET.matchId = room;
  NET.transport = localChannel(room, guestOnMessage);
  NET.transport.send({ t: 'join', deck: myDeck });
  aliveStart();
}

function netLeave() {
  timerStop();
  aliveStop();
  if (NET.transport) {
    try { NET.transport.send({ t: 'bye' }); } catch (e) { }
    NET.transport.close();
  }
  NET.transport = null;
  NET.mode = 'local';
  NET.matchId = null;
}


/* ============================================================
   回合計時

   為什麼不放進引擎：引擎必須是確定性的（rules 測試、平衡跑、重播都靠這個），
   一旦讀牆上時鐘就不可重現了。所以引擎只認得「結束回合」這個動作，
   何時送出它是這一層的判斷。

   權威端負責強制結束；非權威端只顯示倒數（deadline 跟著盤面一起推過來）。
   ============================================================ */

var TIMER = { deadline: 0, iv: null, key: '' };

/* 權威盤面：單機與主機是自己那份，客人沒有 */
function authState() {
  if (NET.mode === 'host') return HOST.full;
  if (NET.mode === 'local') return G;
  return null;
}

/* 回合換人時重設倒數。用 turn+active+phase 當識別，
   因為同一個回合內做很多動作不該讓時間重來。 */
function timerSync(s) {
  if (!s) return;
  var k = s.turn + ':' + s.active + ':' + s.phase;
  if (k === TIMER.key) return;
  TIMER.key = k;
  TIMER.deadline = (s.phase === 'play' && s.winner == null)
    ? Date.now() + TURN_SECONDS * 1000 : 0;
}

function timerSecondsLeft() {
  if (!TIMER.deadline) return null;
  return Math.max(0, Math.ceil((TIMER.deadline - Date.now()) / 1000));
}

function timerTick() {
  var left = timerSecondsLeft();
  if (NET.onTick) NET.onTick(left);
  if (left !== 0) return;

  var s = authState();
  if (!s || s.phase !== 'play' || s.winner != null) return;
  // 單機時只逼自己的回合 —— AI 本來就瞬間完成，不需要被計時
  if (NET.mode === 'local' && s.active !== ME) return;

  TIMER.deadline = 0;
  logMsg(s, '時間到 — 自動結束回合');
  if (NET.mode === 'local') {
    if (NET.onTimeout) NET.onTimeout();
  } else {
    applyAction(s, s.active, { k: 'end' });
    hostBroadcast();
  }
}

function timerStart() {
  if (TIMER.iv) clearInterval(TIMER.iv);
  TIMER.iv = setInterval(timerTick, 250);
}

function timerStop() {
  if (TIMER.iv) clearInterval(TIMER.iv);
  TIMER.iv = null;
  TIMER.deadline = 0;
  TIMER.key = '';
}


/* ============================================================
   斷線偵測

   用心跳而不是通道的關閉事件，理由有兩個：
     · BroadcastChannel 在分頁被關掉時不會通知另一端
     · 心跳也涵蓋「連著但沒回應」（當機、睡眠、網路黑洞）
   換成 WebSocket 之後這一套完全不用改。

   對手斷線時不立刻判輸 —— 伺服器分不出「重新整理」和「不玩了」，
   給 DISCONNECT_GRACE 秒的寬限，回來就繼續。
   ============================================================ */

var ALIVE = { lastSeen: 0, iv: null, lost: false };

function aliveStart() {
  aliveStop();
  ALIVE.lastSeen = Date.now();
  ALIVE.lost = false;
  ALIVE.iv = setInterval(aliveTick, 1000);
}

function aliveStop() {
  if (ALIVE.iv) clearInterval(ALIVE.iv);
  ALIVE.iv = null;
  ALIVE.lost = false;
}

function aliveSeen() {
  var wasLost = ALIVE.lost;
  ALIVE.lastSeen = Date.now();
  ALIVE.lost = false;
  if (wasLost && NET.onInfo) NET.onInfo('back', '對手回來了');
}

function aliveTick() {
  if (NET.mode === 'local' || !NET.transport) return;
  NET.transport.send({ t: 'ping' });

  var gone = (Date.now() - ALIVE.lastSeen) / 1000;
  if (gone < 3) return;                       // 還在正常心跳範圍

  var left = Math.max(0, Math.ceil(DISCONNECT_GRACE - gone));
  if (!ALIVE.lost) {
    ALIVE.lost = true;
    if (NET.onInfo) NET.onInfo('lost', '對手斷線中…');
  }
  if (NET.onInfo) NET.onInfo('waiting', '對手斷線中…（' + left + ' 秒後判定）');

  if (left > 0) return;

  // 寬限期用完：權威端判定對手離開，客人只能顯示狀態並停止
  aliveStop();
  var s = authState();
  if (s && s.winner == null) {
    applyAction(s, 1 - NET.side, { k: 'concede' });
    hostBroadcast();
  }
  if (NET.onInfo) NET.onInfo('left', '對手已離開，判定你獲勝');
}

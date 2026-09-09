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
  onInfo: null       // 連線狀態變化（等待對手／對手斷線／對手離開）
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
var HOST = { full: null };

function hostBroadcast() {
  NET.transport.send({ t: 'state', side: 1 - NET.side, s: redact(HOST.full, 1 - NET.side) });
  if (NET.onState) NET.onState(redact(HOST.full, NET.side));
}

/* 主機收到客人的動作 */
function hostOnMessage(msg) {
  if (msg.t === 'act') {
    var err = applyAction(HOST.full, 1 - NET.side, msg.a);
    if (err) { NET.transport.send({ t: 'err', m: err }); return; }
    hostBroadcast();
  } else if (msg.t === 'hello') {
    hostBroadcast();
  } else if (msg.t === 'bye') {
    if (NET.onInfo) NET.onInfo('left', '對手離開了');
  }
}

/* 客人收到主機的訊息 */
function guestOnMessage(msg) {
  if (msg.t === 'state' && msg.side === NET.side) {
    G = msg.s;
    G.humanSide = NET.side;
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

/* ---------- 對外：開一場雙人對局 ---------- */

/* 主機：建立盤面並等客人連進來 */
function netHost(room, myDeck, foeDeck) {
  NET.mode = 'host';
  NET.side = 0;
  NET.matchId = room;
  HOST.full = newGame({
    p0: { heroId: myDeck.heroId, deck: myDeck.cards.slice(), bgm: myDeck.bgm || null },
    p1: { heroId: foeDeck.heroId, deck: foeDeck.cards.slice(), bgm: foeDeck.bgm || null },
    firstPlayer: null            // PvP 一律由權威端隨機決定
  });
  G = redact(HOST.full, 0);
  G.humanSide = 0;
  NET.transport = localChannel(room, hostOnMessage);
  return G;
}

/* 客人：連上房間，盤面等主機推過來 */
function netJoin(room) {
  NET.mode = 'guest';
  NET.side = 1;
  NET.matchId = room;
  NET.transport = localChannel(room, guestOnMessage);
  NET.transport.send({ t: 'hello' });
}

function netLeave() {
  if (NET.transport) {
    try { NET.transport.send({ t: 'bye' }); } catch (e) { }
    NET.transport.close();
  }
  NET.transport = null;
  NET.mode = 'local';
  NET.matchId = null;
}

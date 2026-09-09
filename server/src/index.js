/* ============================================================
   東方符卡大戰 — 連線伺服器（Cloudflare Worker + Durable Objects）

   兩種 Durable Object 用途，共用同一個 class：
     Lobby（固定 id 'lobby'）  配對佇列
     Match（每場一個 id）      權威裁判

   為什麼用 DO 而不是 Supabase Realtime：
     · Realtime 有帳號級的 200 條併發連線上限；DO 是「一場對局一個 instance」，
       每個 instance 只服務 2 條連線，沒有併發天花板
     · 盤面留在 DO 的記憶體＋SQLite，斷線重連能直接續上
     · 有權威裁判才擋得住「快輸了就拔網路線」

   計費上必須用 WebSocket Hibernation API（state.acceptWebSocket）——
   回合制遊戲大半時間在等玩家思考，用一般的 addEventListener
   會讓閒置連線一直計 duration。官方例子是同工作量 $20.65 vs $142.95／月。
   ============================================================ */

import {
  newGame, applyAction, redactState, validateDeck,
  TURN_SECONDS, DISCONNECT_GRACE
} from './game.js';

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type'
        }
      });
    }

    // 配對：丟進佇列，回傳房間 id
    if (url.pathname === '/matchmake') {
      const id = env.MATCH.idFromName('lobby');
      return env.MATCH.get(id).fetch(request);
    }

    // 對局：升級成 WebSocket
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9_-]{1,32})$/);
    if (m) {
      const id = env.MATCH.idFromName('match:' + m[1]);
      return env.MATCH.get(id).fetch(request);
    }

    return json({ error: 'not found' }, 404);
  }
};

export class Match {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    /* 盤面放在 storage 而不是只放記憶體 —— DO 可能被系統回收，
       只留記憶體的話那一局就消失了。 */
    this.full = null;
    this.decks = {};       // side -> deck
    this.lastSeen = {};    // side -> ms
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    this.full = (await this.state.storage.get('full')) || null;
    this.decks = (await this.state.storage.get('decks')) || {};
    this.deadline = (await this.state.storage.get('deadline')) || 0;
  }

  async save() {
    await this.state.storage.put({
      full: this.full, decks: this.decks, deadline: this.deadline || 0
    });
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);

    /* 給配對佇列問「這個房間還有人連著嗎」。
       比看時間戳可靠 —— 等待中的玩家本來就已經開著 WebSocket。 */
    if (url.pathname === '/alive') {
      return json({ n: this.state.getWebSockets().length });
    }

    /* ---------- 配對佇列（只有 lobby 這個 instance 會走到） ---------- */
    if (url.pathname === '/matchmake') {
      /* skip = 呼叫者自己的房間。等待中的玩家會定期回來續命，
         沒有這個欄位的話他會跟「自己」配對成功。 */
      let skip = null;
      try { skip = (await request.json()).skip || null; } catch (e) { }

      const waiting = await this.state.storage.get('waiting');

      if (waiting && waiting.room === skip) {          // 自己回來續命
        await this.state.storage.put('waiting', { room: skip, at: Date.now() });
        return json({ room: skip, side: 0, waiting: true });
      }

      if (waiting) {
        /* 原本這裡用「60 秒內才算數」，但手機和電腦不可能在一分鐘內
           先後按下配對，兩邊會各自開房、永遠等不到對方。
           改成直接問那個房間還有沒有人連著。剛拿到房號還來不及接上
           WebSocket 的那一瞬間，用 10 秒的寬限補起來。 */
        const fresh = Date.now() - waiting.at < 10000;
        const alive = fresh || await this.roomHasPlayer(waiting.room);
        await this.state.storage.delete('waiting');
        if (alive) return json({ room: waiting.room, side: 1 });
        // 對方早就走了，這筆丟掉，往下重開一間
      }

      const room = skip || Math.random().toString(36).slice(2, 8).toUpperCase();
      await this.state.storage.put('waiting', { room, at: Date.now() });
      return json({ room, side: 0, waiting: true });
    }

    /* ---------- 對局：WebSocket ---------- */
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'expected websocket' }, 426);
    }

    const sockets = this.state.getWebSockets();
    if (sockets.length >= 2) return json({ error: 'room full' }, 409);

    const pair = new WebSocketPair();
    const side = sockets.length;          // 先到的是 0，後到的是 1
    // Hibernation API：閒置時不計 duration
    this.state.acceptWebSocket(pair[1], ['side:' + side]);
    this.lastSeen[side] = Date.now();
    /* 先後手由「誰先連上」決定，客戶端猜不到 —— 房間碼模式下開房的人
       未必先連上。所以由這裡告知，客戶端不要自己假設。 */
    pair[1].send(JSON.stringify({ t: 'hello', side }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async roomHasPlayer(room) {
    try {
      const stub = this.env.MATCH.get(this.env.MATCH.idFromName('match:' + room));
      const r = await stub.fetch('https://do/alive');
      return (await r.json()).n > 0;
    } catch (e) {
      return false;                    // 問不到就當作沒人，寧可重開一間
    }
  }

  sideOf(ws) {
    const tags = this.state.getTags(ws);
    const t = tags.find(x => x.startsWith('side:'));
    return t ? Number(t.slice(5)) : -1;
  }

  send(side, msg) {
    for (const ws of this.state.getWebSockets('side:' + side)) {
      try { ws.send(JSON.stringify(msg)); } catch (e) { /* 對方已離線 */ }
    }
  }

  broadcast() {
    for (const side of [0, 1]) {
      this.send(side, {
        t: 'state', side,
        s: redactState(this.full, side),
        deadline: this.deadline
      });
    }
  }

  bumpDeadline() {
    this.deadline = (this.full && this.full.phase === 'play' && this.full.winner == null)
      ? Date.now() + TURN_SECONDS * 1000 : 0;
    // 鬧鐘設在「回合時限」與「斷線寬限」之中較早的那個
    this.state.storage.setAlarm(Date.now() + 5000);
  }

  async webSocketMessage(ws, raw) {
    await this.load();
    const side = this.sideOf(ws);
    if (side < 0) return;
    this.lastSeen[side] = Date.now();

    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (msg.t === 'ping') { ws.send(JSON.stringify({ t: 'ping' })); return; }

    if (msg.t === 'join') {
      const errs = validateDeck(msg.deck);
      if (errs.length) {
        ws.send(JSON.stringify({ t: 'reject', m: '牌組不合法：' + errs.join('、') }));
        return;
      }
      this.decks[side] = msg.deck;
      this.send(1 - side, { t: 'peer', gone: false });   // 對手（重新）連上了
      // 兩邊的牌組都到齊才開局 —— 在知道對手帶什麼之前不能建立盤面
      if (this.decks[0] && this.decks[1] && !this.full) {
        this.full = newGame({
          p0: { heroId: this.decks[0].heroId, deck: this.decks[0].cards.slice(), bgm: this.decks[0].bgm || null },
          p1: { heroId: this.decks[1].heroId, deck: this.decks[1].cards.slice(), bgm: this.decks[1].bgm || null },
          firstPlayer: null      // 先後手由伺服器隨機決定
        });
        this.bumpDeadline();
        this.broadcast();
      }
      await this.save();
      return;
    }

    if (!this.full) return;

    if (msg.t === 'act') {
      const before = this.full.turn + ':' + this.full.active + ':' + this.full.phase;
      const err = applyAction(this.full, side, msg.a);
      if (err) { ws.send(JSON.stringify({ t: 'err', m: err })); return; }
      const after = this.full.turn + ':' + this.full.active + ':' + this.full.phase;
      if (before !== after) this.bumpDeadline();
      this.broadcast();
      await this.save();
    }
  }

  async webSocketClose(ws) {
    // 不在這裡判輸 —— 分不出「重新整理」和「不玩了」，交給 alarm 的寬限期。
    // 但一定要告訴另一邊，否則他會對著「你的回合」乾等一分鐘，
    // 完全不知道對手已經走了（客戶端的心跳量的是與伺服器的連線，不是對手在不在）。
    const side = this.sideOf(ws);
    if (side >= 0) {
      this.lastSeen[side] = Date.now();
      this.send(1 - side, { t: 'peer', gone: true, until: Date.now() + DISCONNECT_GRACE * 1000 });
    }
    this.state.storage.setAlarm(Date.now() + 5000);
  }

  /* 鬧鐘同時負責回合逾時與斷線寬限。
     DO 只能有一個 alarm，所以兩件事共用一次喚醒。 */
  async alarm() {
    await this.load();
    if (!this.full || this.full.winner != null) return;

    // 回合逾時
    if (this.deadline && Date.now() >= this.deadline && this.full.phase === 'play') {
      applyAction(this.full, this.full.active, { k: 'end' });
      this.bumpDeadline();
      this.broadcast();
      await this.save();
    }

    // 斷線寬限
    const live = new Set(this.state.getWebSockets().map(w => this.sideOf(w)));
    for (const side of [0, 1]) {
      if (live.has(side)) continue;
      const gone = (Date.now() - (this.lastSeen[side] || 0)) / 1000;
      if (gone > DISCONNECT_GRACE) {
        applyAction(this.full, side, { k: 'concede' });
        this.broadcast();
        await this.save();
        return;                      // 對局結束，不用再設鬧鐘
      }
    }

    if (this.full.winner == null) this.state.storage.setAlarm(Date.now() + 5000);
  }
}

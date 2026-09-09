/* ============================================================
   東方符卡大戰 — 介面層
   ============================================================ */
'use strict';

var G = null;          // 目前對局
var ME = 0, AI = 1;    // 玩家位置
var sel = null;        // 選取狀態
var busy = false;      // AI 行動中
var SET = null;

function $(id) { return document.getElementById(id); }
function el(tag, cls, txt) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

/* ---------- 畫面切換 ---------- */
function showScreen(name) {
  hideTip();
  ['menu', 'select', 'hero', 'deck', 'stats', 'rules', 'game'].forEach(function (n) {
    $('screen-' + n).classList.toggle('active', n === name);
  });
}

/* ---------- 卡片 DOM ---------- */
var TYPE_NAME = { unit: '角色', spell: '符卡', ward: '結界', field: '場地', bgm: 'BGM' };
var SRC_NAME = { 紅: '紅魔鄉', 妖: '妖妖夢', 永: '永夜抄', 通: '通用' };

/* 遮蔽過的卡（defId '?'）畫成牌背而不是拋錯 ——
   連線對戰時對手的手牌本來就不該有內容。 */
function cardBackEl() {
  var e = el('div', 'card back');
  e.appendChild(el('div', 'nm', '？'));
  return e;
}

function cardEl(defId, opt) {
  opt = opt || {};
  if (!CARDS[defId]) return cardBackEl();
  var d = def(defId);
  var c = el('div', 'card t-' + d.type);
  // 專屬卡用英雄色的左側色條標記，跟中立卡一眼區分
  if (d.cls !== 'neutral' && HEROES[d.cls]) {
    c.classList.add('own');
    c.style.borderLeftColor = HEROES[d.cls].color;
    c.title = HEROES[d.cls].name + ' 的專屬卡';
  }
  var cost = opt.cost != null ? opt.cost : d.cost;
  var gem = el('div', 'cost' + (cost < d.cost ? ' cheap' : ''), String(cost));
  c.appendChild(gem);
  c.appendChild(el('div', 'nm', d.name));
  var tribes = tribesOf(d);
  // 單一作品顯示全名；多作登場顯示縮寫清單，讓玩家一眼看出能吃到哪些作品結界
  var w = worksOf(d);
  // works 為空 = 不屬於任何一作（基本包泛用卡），標成「基本」避免誤以為吃得到作品結界
  var wLabel = !w.length ? '基本' : (w.length > 1 ? w.join('') : (SRC_NAME[d.src] || ''));
  var tp = el('div', 'tp', TYPE_NAME[d.type] + '・' + wLabel +
    (tribes.length ? '・' + tribes.join('／') : ''));
  if (w.length > 1) tp.classList.add('multi');
  else if (!w.length) tp.classList.add('base');
  c.appendChild(tp);
  if (d.kw && d.kw.length) c.appendChild(el('div', 'kws', d.kw.join(' ')));
  var tx = el('div', 'tx');
  tx.innerHTML = markKeywords(d.text || '');
  c.appendChild(tx);
  if (d.type === 'unit') {
    var st = el('div', 'stats');
    st.appendChild(el('span', 'a', String(d.atk)));
    st.appendChild(el('span', 'h', String(d.hp)));
    c.appendChild(st);
  }
  if (opt.count) { var b = el('div', 'cnt', '×' + opt.count); c.appendChild(b); }
  if (opt.dim) c.classList.add('dis');
  c.dataset.def = defId;
  bindTip(c, d);
  return c;
}

/* HTML 逸出後，把辭典裡的關鍵字包成 TAG */
function escHtml(str) {
  return String(str).replace(/[&<>"]/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
  });
}
function markKeywords(str) {
  var out = escHtml(str);
  Object.keys(KEYWORDS).forEach(function (k) {
    out = out.split(k).join('<i class="kw">' + k + '</i>');
  });
  return out;
}
/* 這張卡用到的關鍵字說明，讓玩家不必背 */
function keywordHtml(d) {
  var ks = keywordsOn(d);
  if (!ks.length) return '';
  return '<div class="kwdefs">' + ks.map(function (k) {
    return '<div><b>' + k + '</b>：' + escHtml(KEYWORDS[k]) + '</div>';
  }).join('') + '</div>';
}

/* 提示框靠 mouseleave 關閉，但畫面切換／重繪時元素會被整個移除，
   那個事件就永遠不會觸發，提示框會卡在畫面上。
   所以額外記住「是誰開的」，在元素消失或滑鼠離開它的範圍時主動關掉。 */
var tipOwner = null;

function hideTip() {
  tipOwner = null;
  var t = $('tooltip');
  if (t) t.hidden = true;
}

/* 元素已經不在畫面上就關掉（重繪、切換畫面時會發生） */
function tipWatchdog() {
  if (tipOwner && !tipOwner.isConnected) hideTip();
}

function bindTip(node, d) {
  node.addEventListener('mouseenter', function (e) {
    tipOwner = node;
    var t = $('tooltip');
    t.innerHTML = '<b>' + escHtml(d.name) + '</b><br>' +
      TYPE_NAME[d.type] + '・' + (SRC_NAME[d.src] || '') + '・' + d.cost + ' 靈力' +
      (d.type === 'unit' ? '・' + d.atk + '/' + d.hp : '') +
      (tribesOf(d).length ? '<br><span style="color:#7fb8e8">' + tribesOf(d).join('／') + '</span>' : '') +
      (d.type === 'unit'
        ? '<br><span style="color:#d9a441">收錄：' +
          (worksOf(d).length
            ? worksOf(d).map(function (x) { return SRC_FULL[x] || x; }).join('／')
            : '無（不受作品結界影響）') + '</span>'
        : '') +
      (d.cls !== 'neutral' && HEROES[d.cls]
        ? '<br><span style="color:' + HEROES[d.cls].color + '">' +
          HEROES[d.cls].name + ' 專屬</span>'
        : '<br><span style="color:#7d7499">中立卡（所有英雄都能使用）</span>') +
      (d.text ? '<br>' + markKeywords(d.text) : '') +
      keywordHtml(d);
    t.hidden = false;
    moveTip(e);
  });
  node.addEventListener('mousemove', moveTip);
  node.addEventListener('mouseleave', hideTip);
}
function moveTip(e) {
  var t = $('tooltip');
  if (t.hidden) return;
  var x = e.clientX + 16, y = e.clientY + 16;
  if (x + 260 > innerWidth) x = e.clientX - 266;
  if (y + t.offsetHeight + 12 > innerHeight) y = innerHeight - t.offsetHeight - 12;
  t.style.left = x + 'px'; t.style.top = y + 'px';
}

/* ============================================================
   對戰
   ============================================================ */
function startBattle(deck, aiHeroId, firstChoice, aiLevel) {
  if (aiHeroId === 'random') aiHeroId = HERO_ORDER[Math.floor(Math.random() * HERO_ORDER.length)];
  var aiDeckCards = presetDeck(aiHeroId);
  var fp = firstChoice === 'me' ? 0 : (firstChoice === 'ai' ? 1 : null);

  G = newGame({
    p0: { heroId: deck.heroId, deck: deck.cards.slice(), bgm: deck.bgm || null },
    p1: { heroId: aiHeroId, deck: aiDeckCards, bgm: presetBgm(aiHeroId) },
    firstPlayer: fp
  });
  // 難度存在 state 上，才會跟著存檔一起序列化，續戰時不會被打回預設
  G.aiLevel = AI_LEVELS[aiLevel] ? aiLevel : AI_DEFAULT_LEVEL;
  G.humanSide = 0;
  sel = null; busy = false;
  resetHpTracking();
  showScreen('game');
  showMulligan();
}

function resumeBattle(s) {
  G = s; sel = null; busy = false;
  resetHpTracking();
  showScreen('game');
  if (G.phase === 'mulligan') showMulligan();
  else { renderGame(); if (NET.mode === 'local' && G.active === AI) setTimeout(aiStep, 500); }
}

/* ---------- 調度 ---------- */
function showMulligan() {
  var toss = {};
  var ov = $('overlay'), inner = $('overlay-inner');
  ov.hidden = false;
  function draw2() {
    clear(inner);
    var f = G.first === ME ? '先手' : '後手';
    inner.appendChild(el('h2', null, '起手調度'));
    inner.appendChild(el('p', null, '你是 ' + f + '。點擊要換掉的卡片，換掉的牌會洗回牌庫並補抽同樣張數。'));
    var wrap = el('div', 'mull-cards');
    G.players[ME].hand.forEach(function (c) {
      var e = cardEl(c.defId, {});
      if (toss[c.uid]) e.classList.add('toss');
      e.onclick = function () { toss[c.uid] = !toss[c.uid]; draw2(); };
      wrap.appendChild(e);
    });
    inner.appendChild(wrap);
    var b = el('button', 'btn big primary', '確定');
    b.onclick = function () {
      var uids = Object.keys(toss).filter(function (k) { return toss[k]; }).map(Number);
      dispatch({ k: 'mull', toss: uids });
      if (NET.mode === 'local') {
        // 單機：對手是 AI，順手幫他調度
        applyAction(G, AI, { k: 'mull', toss: aiMulligan(G, AI) });
      }
      ov.hidden = true;
      renderGame();
      if (NET.mode === 'local') saveGame(G);
      if (NET.mode === 'local' && G.active === AI) setTimeout(aiStep, 600);
      // 連線：另一邊還沒調度完的話，畫面會停在等待狀態，
      // 由權威端推來的新盤面觸發重繪
    };
    inner.appendChild(b);
  }
  draw2();
}

/* ---------- 探尋：三選一 ----------
   有 pendingChoice 時整場暫停，只能先做完選擇。 */
function renderChoice() {
  var ov = $('overlay'), inner = $('overlay-inner');
  var c = G.pendingChoice;
  if (!c || c.pi !== ME) return false;
  clear(inner);
  ov.hidden = false;
  inner.appendChild(el('h2', null, c.label || '探尋'));
  inner.appendChild(el('p', null, '選一張加入手牌。'));
  var wrap = el('div', 'mull-cards');
  c.options.forEach(function (defId) {
    var e = cardEl(defId, {});
    e.onclick = function () {
      var err = dispatch({ k: 'choose', defId: defId });
      if (err) { toast(err); return; }
      ov.hidden = true;
      renderGame();
      saveGame(G);
    };
    wrap.appendChild(e);
  });
  inner.appendChild(wrap);
  return true;
}

/* ---------- 渲染 ---------- */
function renderGame() {
  if (!G) return;
  tipWatchdog();
  if (G.pendingChoice && G.pendingChoice.pi === ME) renderChoice();
  renderHeroRow('foe-hero-row', AI, true);
  renderHeroRow('me-hero-row', ME, false);
  renderLane('foe-units', AI, 'units');
  renderLane('me-units', ME, 'units');
  renderLane('foe-wards', AI, 'wards');
  renderLane('me-wards', ME, 'wards');
  renderHand();
  renderBgm();
  renderMid();
  renderLog();
  applySelectionHighlights();
}

function heroAvatar(heroId) {
  var h = HEROES[heroId];
  var a = el('div', 'av', h.name.charAt(0));
  a.style.background = h.color;
  return a;
}

function renderHeroRow(nodeId, pi, isFoe) {
  var n = $(nodeId), p = G.players[pi], h = HEROES[p.heroId];
  clear(n);

  var hero = el('div', 'hero');
  hero.appendChild(heroAvatar(p.heroId));
  var box = el('div');
  box.appendChild(el('div', 'hname', h.name));
  var hp = el('div', 'hhp', String(p.hp));
  var sm = el('small', null, ' / ' + p.maxHp); hp.appendChild(sm);
  box.appendChild(hp);
  hero.appendChild(box);
  var dHp = trackHp({ t: 'h', id: pi }, p.hp);
  if (dHp) { floatNum(hero, dHp); hp.classList.add(dHp < 0 ? 'flash-dmg' : 'flash-heal'); }
  hero.dataset.hero = pi;
  hero.onclick = function () { onHeroClick(pi); };
  n.appendChild(hero);

  // 靈力
  var spBox = el('div');
  var gems = el('div', 'sp');
  for (var i = 0; i < p.spMax; i++) {
    var g = el('i', i < p.sp ? 'on' : 'used');
    gems.appendChild(g);
  }
  spBox.appendChild(gems);
  spBox.appendChild(el('div', 'spnum', '靈力 ' + p.sp + ' / ' + p.spMax));
  n.appendChild(spBox);

  // 英雄技能
  var pw = el('button', 'btn hpow');
  var hf = heroFormOf(p.heroId, G, p.idx);
  // 說明文字包成 .ptext —— 窄螢幕時整段收起來只留名稱與費用，
  // 說明本來就還能從提示框看到，不必在每一格都佔掉三行寬度。
  pw.innerHTML = '<b>' + hf.power + '</b>（' + heroPowerCostLabel(p.heroId, G, p.idx) + '）' +
    '<span class="ptext">' + markKeywords(hf.powerText) + '</span>';
  pw.disabled = isFoe || !!canHeroPower(G, pi, null) && canHeroPower(G, pi, null) !== 'NEED_TARGET';
  if (!isFoe) pw.onclick = onHeroPowerClick;
  n.appendChild(pw);

  // 場地
  var fieldBox = el('div');
  if (p.field) {
    var fd = def(p.field.defId);
    var fe = el('div', 'perm field');
    fe.appendChild(el('b', null, fd.name));
    var ft = el('span'); ft.innerHTML = markKeywords(fd.text || ''); fe.appendChild(ft);
    fe.style.width = '150px';
    bindTip(fe, fd);
    fieldBox.appendChild(fe);
  } else {
    fieldBox.appendChild(el('div', 'deckinfo', '（無場地）'));
  }
  n.appendChild(fieldBox);

  n.appendChild(el('div', 'deckinfo', '牌庫 ' + p.deck.length + '\n手牌 ' + p.hand.length));
  var di = n.lastChild; di.style.whiteSpace = 'pre-line';
}

function renderLane(nodeId, pi, kind) {
  var n = $(nodeId), p = G.players[pi];
  clear(n);
  var arr = kind === 'units' ? p.units : p.wards;
  for (var i = 0; i < arr.length; i++) {
    var item = arr[i];
    if (!item) { n.appendChild(el('div', 'slot', '')); continue; }
    if (kind === 'units') n.appendChild(unitEl(item));
    else {
      var d = def(item.defId);
      var w = el('div', 'perm');
      w.appendChild(el('b', null, d.name));
      var wt = el('span'); wt.innerHTML = markKeywords(d.text || ''); w.appendChild(wt);
      bindTip(w, d);
      n.appendChild(w);
    }
  }
}

/* ---------- 血量變化的浮動數字 ----------
   renderGame() 每次都把整個盤面重畫，所以「掉了多少血」不能從 DOM 看，
   必須自己記住上一次的數字再比對。
   死掉的角色沒有節點可以掛，那一次的數字就不顯示 —— 角色消失本身已經是回饋。 */
var lastHp = { units: {}, heroes: [null, null] };

function resetHpTracking() { lastHp = { units: {}, heroes: [null, null] }; }

function floatNum(node, delta) {
  if (!delta) return;
  var f = el('div', 'floatnum ' + (delta < 0 ? 'dmg' : 'heal'),
    (delta < 0 ? '' : '+') + delta);
  node.appendChild(f);
  // 動畫跑完就移除，否則重畫時會愈疊愈多
  setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 950);
}

/* 比對並記錄。回傳這次的變化量（沒有前值時回傳 0，避免一進場就跳數字）。 */
function trackHp(key, now) {
  var prev = (key.t === 'u') ? lastHp.units[key.id] : lastHp.heroes[key.id];
  var delta = (prev == null) ? 0 : now - prev;
  if (key.t === 'u') lastHp.units[key.id] = now; else lastHp.heroes[key.id] = now;
  return delta;
}

function unitEl(u) {
  var d = def(u.defId);
  var e = el('div', 'unit');
  e.dataset.uid = u.uid;
  if (hasKw(u, '守護')) e.classList.add('taunt');
  if (u.stealth) e.classList.add('stealth');
  if (u.cantAttack || isFrozen(u)) e.classList.add('frozen');
  if (u.silenced) e.classList.add('silenced');
  if (u.owner === ME && G.active === ME && canAttack(G, u)) e.classList.add('ready');

  // 本回合還剩幾次攻擊。只標記「正在行動的那一方」——
  // 非行動方的 attacksLeft 是上一個回合留下的，標出來會誤導。
  if (u.owner === G.active && canAttack(G, u)) {
    var left = u.attacksLeft || 0;
    if (left > 0) e.appendChild(el('div', 'atkleft', left > 1 ? '⚔' + left : '⚔'));
  }

  var kws = [];
  ['疾走', '守護', '飛行', '隱行', '彈幕', '貫通', '吸血'].forEach(function (k) {
    if (hasKw(u, k)) kws.push(k);
  });
  if ((u.barrier || 0) > 0) { kws.unshift('結界×' + u.barrier); e.classList.add('barrier'); }
  if (ensembleActive(u)) { kws.unshift('合奏'); e.classList.add('ensemble'); }
  // 封印＝卡面文字全部失效，所以蓋掉其他關鍵字只留這一個標記
  if (u.silenced) kws = ['封印'];
  if (kws.length) { var b = el('div', 'ubadge', kws.join('')); e.appendChild(b); }

  e.appendChild(el('div', 'un', d.name));
  var st = el('div', 'ust');
  st.appendChild(el('span', 'a', String(atkOf(u))));
  var hp = el('span', 'h' + (hpOf(u) < maxHpOf(u) ? ' hurt' : ''), String(hpOf(u)));
  st.appendChild(hp);
  e.appendChild(st);
  var dHp = trackHp({ t: 'u', id: u.uid }, hpOf(u));
  if (dHp) { floatNum(e, dHp); hp.classList.add(dHp < 0 ? 'flash-dmg' : 'flash-heal'); }
  bindTip(e, d);
  e.onclick = function (ev) { ev.stopPropagation(); onUnitClick(u.uid); };
  return e;
}

function renderHand() {
  var n = $('me-hand'), p = G.players[ME];
  clear(n);
  p.hand.forEach(function (c) {
    var cost = costOf(G, ME, c);
    var e = cardEl(c.defId, { cost: cost });
    var err = canPlay(G, ME, c, null);
    var ok = !err || err === 'NEED_TARGET';
    if (ok) e.classList.add('playable'); else e.classList.add('dis');
    if (sel && sel.mode === 'card' && sel.uid === c.uid) e.classList.add('sel');
    e.onclick = function (ev) { ev.stopPropagation(); onHandClick(c.uid); };
    n.appendChild(e);
  });
}

/* 全場唯一的 BGM 播放器 */
function renderBgm() {
  var n = $('bgm-box');
  clear(n);
  if (!G.bgm) {
    n.className = 'bgmbox empty';
    n.appendChild(el('span', null, '♪ 尚未播放 BGM'));
    return;
  }
  var d = def(G.bgm.defId);
  var mine = G.bgm.owner === ME;
  n.className = 'bgmbox ' + (mine ? 'mine' : 'foe');
  n.appendChild(el('span', 'note', '♪'));
  var box = el('div');
  box.appendChild(el('b', null, d.name));
  box.appendChild(el('small', null, (mine ? '你的' : '對手的') + ' BGM'));
  n.appendChild(box);
  bindTip(n, d);
  if (G.players[ME].bgmLock > 0) {
    n.appendChild(el('span', 'lock', '🔒 還要 ' + G.players[ME].bgmLock + ' 回合才能換'));
  }
}

function renderMid() {
  var t = $('turn-info');
  var who = G.active === ME ? '你的回合' : '對手回合';
  var p = G.players[G.active];
  t.innerHTML = '第 <b>' + G.turn + '</b> 回合 ・ <b>' + who + '</b>' +
    (G.players[ME].goSen.length ? ' ・ <span style="color:#8fd6a8">後之先 ' + G.players[ME].goSen.join('/') + '</span>' : '');
  $('btn-end').disabled = (G.active !== ME || busy || G.winner != null);
}

function renderLog() {
  var n = $('log');
  clear(n);
  G.log.slice(-40).forEach(function (l) {
    var d = el('div');
    d.appendChild(el('span', 't', 'T' + l.turn + ' '));
    d.appendChild(document.createTextNode(l.text));
    n.appendChild(d);
  });
  n.parentNode.scrollTop = n.parentNode.scrollHeight;
}

function showHint(txt) {
  var h = $('hint');
  if (!txt) { h.hidden = true; return; }
  h.textContent = txt; h.hidden = false;
}

/* ---------- 選取與高亮 ---------- */
function applySelectionHighlights() {
  document.querySelectorAll('.unit.tgt,.hero.tgt').forEach(function (e) { e.classList.remove('tgt'); });
  document.querySelectorAll('.unit.sel').forEach(function (e) { e.classList.remove('sel'); });
  if (!sel) { showHint(null); return; }

  var targets = [];
  if (sel.mode === 'card') {
    var c = findCardInHand(G, ME, sel.uid);
    if (!c) { sel = null; return; }
    var d = def(c.defId);
    if (d.target) targets = legalTargets(G, ME, d.target);
    showHint('選擇「' + d.name + '」的目標（點空白處取消）');
  } else if (sel.mode === 'attack') {
    var u = findUnit(G, sel.uid);
    if (!u) { sel = null; return; }
    targets = attackTargets(G, u);
    var ue = document.querySelector('.unit[data-uid="' + u.uid + '"]');
    if (ue) ue.classList.add('sel');
    showHint('選擇攻擊目標（點空白處取消）');
  } else if (sel.mode === 'power') {
    targets = legalTargets(G, ME, heroFormOf(G.players[ME].heroId, G, ME).target);
    showHint('選擇英雄技能的目標（點空白處取消）');
  }

  targets.forEach(function (t) {
    if (t.t === 'unit') {
      var e = document.querySelector('.unit[data-uid="' + t.uid + '"]');
      if (e) e.classList.add('tgt');
    } else {
      var h = document.querySelector('.hero[data-hero="' + t.pi + '"]');
      if (h) h.classList.add('tgt');
    }
  });
}

function isLegalSelTarget(t) {
  var list = [];
  if (sel.mode === 'card') {
    var c = findCardInHand(G, ME, sel.uid);
    var d = def(c.defId);
    list = d.target ? legalTargets(G, ME, d.target) : [];
  } else if (sel.mode === 'attack') {
    list = attackTargets(G, findUnit(G, sel.uid));
  } else if (sel.mode === 'power') {
    list = legalTargets(G, ME, heroFormOf(G.players[ME].heroId, G, ME).target);
  }
  return list.some(function (x) {
    return (x.t === 'hero' && t.t === 'hero' && x.pi === t.pi) ||
      (x.t === 'unit' && t.t === 'unit' && x.uid === t.uid);
  });
}

/* ---------- 玩家操作 ---------- */
function guard() { return G && G.winner == null && G.active === ME && !busy && G.phase === 'play'; }

function onHandClick(uid) {
  if (!guard()) return;
  if (sel && sel.mode === 'card' && sel.uid === uid) { sel = null; renderGame(); return; }
  var c = findCardInHand(G, ME, uid);
  if (!c) return;
  var err = canPlay(G, ME, c, null);
  if (err === 'NEED_TARGET') { sel = { mode: 'card', uid: uid }; renderGame(); return; }
  if (err) { toast(err); return; }
  doPlay(uid, null);
}

function onUnitClick(uid) {
  if (!guard()) return;
  var u = findUnit(G, uid);
  if (!u) return;

  if (sel && isLegalSelTarget({ t: 'unit', uid: uid })) { resolveSel({ t: 'unit', uid: uid }); return; }

  if (u.owner === ME && canAttack(G, u)) {
    sel = (sel && sel.mode === 'attack' && sel.uid === uid) ? null : { mode: 'attack', uid: uid };
    renderGame();
    return;
  }
  sel = null; renderGame();
}

function onHeroClick(pi) {
  if (!guard()) return;
  if (sel && isLegalSelTarget({ t: 'hero', pi: pi })) { resolveSel({ t: 'hero', pi: pi }); return; }
  sel = null; renderGame();
}

function onHeroPowerClick() {
  if (!guard()) return;
  var err = canHeroPower(G, ME, null);
  if (err === 'NEED_TARGET') { sel = { mode: 'power' }; renderGame(); return; }
  if (err) { toast(err); return; }
  var e = dispatch({ k: 'power', t: null });
  if (e) { toast(e); return; }
  afterAction();
}

function resolveSel(t) {
  if (sel.mode === 'card') doPlay(sel.uid, t);
  else if (sel.mode === 'attack') { var e = dispatch({ k: 'atk', uid: sel.uid, t: t }); if (e) toast(e); sel = null; afterAction(); }
  else if (sel.mode === 'power') { var e2 = dispatch({ k: 'power', t: t }); if (e2) toast(e2); sel = null; afterAction(); }
}

function doPlay(uid, t) {
  var err = dispatch({ k: 'play', uid: uid, t: t });
  if (err) { toast(err); return; }
  sel = null;
  afterAction();
}

function afterAction() {
  sel = null;
  renderGame();
  // 連線對戰不存本地檔 —— 那份是過期副本，重連時必須以權威端的盤面為準，
  // 存了反而會讓玩家重整後「回到過去」，兩邊對不上。
  if (NET.mode === 'local') saveGame(G);
  if (G.winner != null) showResult();
}

/* 卡面關鍵字列也顯示合奏是否已啟動 */
function ensembleActive(u) {
  return def(u.defId).selfAura && hasTribe(def(u.defId), '騷靈') && ensemble(G, u.owner);
}

function onEndTurn() {
  if (!guard()) return;
  sel = null;
  var err = dispatch({ k: 'end' });
  if (err) { toast(err); return; }
  renderGame();
  saveGame(G);
  if (G.winner != null) { showResult(); return; }
  // 只有單機才叫 AI。連線對戰時對面是真人，而且本地的 G 是遮蔽過的視野 ——
  // AI 在上面跑會讀到 '?' 的手牌直接爆掉。
  if (NET.mode === 'local' && G.active === AI) { busy = true; renderMid(); setTimeout(aiStep, SET.aiDelay); }
}

function toast(msg) {
  showHint(msg);
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { if (!sel) showHint(null); }, 1400);
}

/* ---------- AI 行動 ---------- */
function aiStep() {
  if (!G || G.winner != null) { busy = false; renderGame(); if (G && G.winner != null) showResult(); return; }
  if (G.active !== AI) { busy = false; renderGame(); return; }

  var a = aiNextAction(G, AI);
  if (!a) {
    endTurn(G);
    busy = false;
    renderGame();
    saveGame(G);
    if (G.winner != null) showResult();
    else if (G.active === AI) { busy = true; setTimeout(aiStep, SET.aiDelay); }
    return;
  }
  var err = applyAction(G, AI, a);
  if (err) { // 保險：避免卡死
    endTurn(G); busy = false; renderGame();
    if (G.winner != null) showResult();
    return;
  }
  renderGame();
  setTimeout(aiStep, SET.aiDelay);
}

/* ---------- 結果 ---------- */
function showResult() {
  busy = true;
  hideTip();
  clearGame();
  var r = G.winner === ME ? 'win' : (G.winner === -1 ? 'draw' : 'lose');
  recordResult(G.players[ME].heroId, r);
  var ov = $('overlay'), inner = $('overlay-inner');
  clear(inner); ov.hidden = false;
  var title = r === 'win' ? '勝利！' : (r === 'draw' ? '平手' : '敗北…');
  var h = el('h2', null, title);
  h.style.color = r === 'win' ? '#e8c86a' : (r === 'lose' ? '#ff8e9e' : '#a79ec6');
  inner.appendChild(h);
  inner.appendChild(el('p', null,
    HEROES[G.players[ME].heroId].name + ' vs ' + HEROES[G.players[AI].heroId].name +
    ' ・ 共 ' + G.turn + ' 回合'));
  var row = el('div', 'row-inline');
  row.style.justifyContent = 'center';
  var b1 = el('button', 'btn big primary', '再來一場');
  b1.onclick = function () { ov.hidden = true; showScreen('select'); renderSelect(); };
  var b2 = el('button', 'btn big', '回主選單');
  b2.onclick = function () { ov.hidden = true; G = null; showScreen('menu'); refreshMenu(); };
  row.appendChild(b1); row.appendChild(b2);
  inner.appendChild(row);
}

/* ============================================================
   選擇畫面
   ============================================================ */
var chosenDeckId = null;

/* 一張牌組卡 */
function deckCard(d, opt) {
  opt = opt || {};
  var e = el('div', 'deck-card' + (opt.selected ? ' sel' : '') + (d.preset ? ' preset' : ''));
  e.style.borderLeftColor = HEROES[d.heroId].color;
  var head = el('div', 'dk-head');
  head.appendChild(el('b', null, d.name));
  if (d.preset) head.appendChild(el('span', 'tag-preset', '預設'));
  e.appendChild(head);
  e.appendChild(el('small', null, HEROES[d.heroId].name + ' ・ ' + d.cards.length + '/' + DECK_SIZE));
  var bgmLine = el('small', 'dk-bgm', '♪ ' + (d.bgm ? CARDS[d.bgm].name : '未設定 BGM'));
  if (!d.bgm) bgmLine.classList.add('none');
  e.appendChild(bgmLine);
  var errs = validateDeck(d);
  if (errs.length) { var w = el('small', null, '⚠ ' + errs[0]); w.style.color = '#ff9db0'; e.appendChild(w); }
  return e;
}

var selectSetFilter = '';   // 對戰選擇畫面
var presetSetFilter = '';   // 牌組編輯的預設清單

/* 預設牌組會隨英雄數 1:1 成長，兩個畫面共用同一套作品分頁 */
function renderSetTabs(node, decks, current, onPick) {
  var bySet = {};
  decks.forEach(function (d) {
    var k = (HEROES[d.heroId] && HEROES[d.heroId].set) || '其他';
    (bySet[k] = bySet[k] || []).push(d);
  });
  clear(node);
  var all = el('button', 'tab' + (current === '' ? ' on' : ''), '全部（' + decks.length + '）');
  all.onclick = function () { onPick(''); };
  node.appendChild(all);
  Object.keys(bySet).forEach(function (k) {
    var t = el('button', 'tab' + (current === k ? ' on' : ''),
      (SET_NAMES[k] || k) + '（' + bySet[k].length + '）');
    t.onclick = function () { onPick(k); };
    node.appendChild(t);
  });
}
function bySetFilter(decks, setKey) {
  return decks.filter(function (d) {
    return !setKey || (HEROES[d.heroId] && HEROES[d.heroId].set) === setKey;
  });
}

function renderSelect() {
  var presets = presetDecks(), mine = loadDecks();
  if (!findDeck(chosenDeckId)) chosenDeckId = presets[0].id;

  renderSetTabs($('select-tabs'), presets, selectSetFilter,
    function (k) { selectSetFilter = k; renderSelect(); });

  var pn = $('select-presets'); clear(pn);
  bySetFilter(presets, selectSetFilter).forEach(function (d) {
    var e = deckCard(d, { selected: d.id === chosenDeckId });
    e.onclick = function () { chosenDeckId = d.id; renderSelect(); };
    pn.appendChild(e);
  });

  var n = $('select-decks'); clear(n);
  if (!mine.length) {
    var tip = el('p', 'hintline', '還沒有自己的牌組 — 可以到「牌組編輯」新增，或直接用上面的預設牌組開打。');
    n.appendChild(tip);
  }
  mine.forEach(function (d) {
    var e = deckCard(d, { selected: d.id === chosenDeckId });
    e.onclick = function () { chosenDeckId = d.id; renderSelect(); };
    n.appendChild(e);
  });

  var sel2 = $('ai-hero');
  if (sel2.options.length <= 1) {
    HERO_ORDER.forEach(function (h) {
      var o = document.createElement('option');
      o.value = h; o.textContent = HEROES[h].name + '（' + (BUILD_NAMES[h] || '—') + '）';
      sel2.appendChild(o);
    });
  }
}

/* ============================================================
   英雄選擇
   ------------------------------------------------------------
   下拉選單在 8 位時還能用，長到 28 位就不行了 ——
   看不到技能、無法比較、要捲動。改成分作品的卡片牆。
   ============================================================ */
var heroPicker = null;   // { title, current, onPick, onBack }
var heroFilter = { set: '', text: '' };

/* 依補充包分組 */
function heroesBySet() {
  var g = {};
  HERO_ORDER.forEach(function (h) {
    var k = HEROES[h].set || '其他';
    (g[k] = g[k] || []).push(h);
  });
  return g;
}

function openHeroPicker(opts) {
  heroPicker = opts || {};
  heroFilter = { set: '', text: '' };
  $('hero-search').value = '';
  $('hero-title').textContent = heroPicker.title || '選擇英雄';
  showScreen('hero');
  renderHeroPicker();
}

function renderHeroPicker() {
  var groups = heroesBySet();
  var sets = Object.keys(groups);

  // 分頁
  var tabs = $('hero-tabs'); clear(tabs);
  var all = el('button', 'tab' + (heroFilter.set === '' ? ' on' : ''),
    '全部（' + HERO_ORDER.length + '）');
  all.onclick = function () { heroFilter.set = ''; renderHeroPicker(); };
  tabs.appendChild(all);
  sets.forEach(function (k) {
    var t = el('button', 'tab' + (heroFilter.set === k ? ' on' : ''),
      (SET_NAMES[k] || k) + '（' + groups[k].length + '）');
    t.onclick = function () { heroFilter.set = k; renderHeroPicker(); };
    tabs.appendChild(t);
  });

  // 卡片牆
  var grid = $('hero-grid'); clear(grid);
  var q = heroFilter.text.trim();
  var shown = 0;
  sets.forEach(function (k) {
    if (heroFilter.set && heroFilter.set !== k) return;
    var list = groups[k].filter(function (h) {
      if (!q) return true;
      var hero = HEROES[h];
      return (hero.name + hero.title + hero.power + hero.powerText +
        (BUILD_NAMES[h] || '')).indexOf(q) >= 0;
    });
    if (!list.length) return;
    if (!heroFilter.set) {
      var head = el('h3', 'sect', SET_NAMES[k] || k);
      head.style.gridColumn = '1/-1';
      grid.appendChild(head);
    }
    list.forEach(function (h) { grid.appendChild(heroCard(h)); shown++; });
  });
  $('hero-empty').hidden = shown > 0;
}

function heroCard(heroId) {
  var h = HEROES[heroId];
  var e = el('div', 'hero-card' + (heroPicker && heroPicker.current === heroId ? ' sel' : ''));
  e.style.borderLeftColor = h.color;

  var top = el('div', 'hc-top');
  top.appendChild(heroAvatar(heroId));
  var nm = el('div');
  nm.appendChild(el('b', null, h.name));
  nm.appendChild(el('small', null, h.title));
  top.appendChild(nm);
  var hp = el('div', 'hc-hp', String(h.hp));
  hp.title = '英雄血量';
  top.appendChild(hp);
  e.appendChild(top);

  if (BUILD_NAMES[heroId]) e.appendChild(el('div', 'hc-build', '「' + BUILD_NAMES[heroId] + '」'));

  var pw = el('div', 'hc-power');
  pw.appendChild(el('b', null, h.power + '（' + heroPowerCostLabel(heroId) + '）'));
  var txt = el('span'); txt.innerHTML = markKeywords(h.powerText); pw.appendChild(txt);
  e.appendChild(pw);

  // 職業卡＝ cls 等於這位英雄的卡片「種類數」（不含衍生物、中立卡、BGM）。
  // 中立卡每位英雄都能用，所以不算進來 —— 這個數字反映的是這位英雄的專屬內容量。
  var own = cardsForHero(heroId).filter(function (id) { return CARDS[id].cls === heroId; });
  var info = el('div', 'hc-cards');
  if (own.length) {
    var byType = {};
    own.forEach(function (id) { var t = TYPE_NAME[CARDS[id].type]; byType[t] = (byType[t] || 0) + 1; });
    info.textContent = '專屬卡 ' + own.length + ' 種';
    info.title = Object.keys(byType).map(function (t) { return t + ' ' + byType[t]; }).join('、') +
      '（種類數，每種最多放 ' + MAX_COPIES + ' 張）';
  } else {
    info.textContent = '尚無專屬卡 — 只能用中立卡組牌';
    info.classList.add('none');
  }
  e.appendChild(info);

  e.onclick = function () {
    if (heroPicker && heroPicker.onPick) heroPicker.onPick(heroId);
  };
  return e;
}

/* ============================================================
   牌組編輯器
   ============================================================ */
var editing = null;

/* 單卡在牌組裡的張數上限 */
function deckLimitOf(cd) { return cd.unique ? 1 : MAX_COPIES; }

/* ---------- 卡池篩選 ----------
   全部改成可複選的按鈕群：費用直接點 0~7+，不再是寫死的區間。
   什麼都沒選＝不限制。 */
var poolFilter = { cost: [], type: [], owner: [], tribe: [], works: [], text: '' };

function toggleIn(arr, v) {
  var i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1); else arr.push(v);
}

function chipRow(node, items, selected, onToggle, opt) {
  clear(node);
  items.forEach(function (it) {
    var on = selected.indexOf(it.v) >= 0;
    var b = el('button', 'chip' + (on ? ' on' : '') + (opt && opt.cls ? ' ' + opt.cls : ''), it.label);
    if (it.title) b.title = it.title;
    b.onclick = function () { onToggle(it.v); };
    node.appendChild(b);
  });
}

function renderPoolFilters(counts) {
  var costs = [];
  for (var i = 0; i <= 7; i++) costs.push({ v: i, label: i === 7 ? '7+' : String(i) });
  chipRow($('f-cost'), costs, poolFilter.cost,
    function (v) { toggleIn(poolFilter.cost, v); renderEditor(); }, { cls: 'cost' });

  chipRow($('f-owner'), [
    { v: 'own', label: '專屬', title: '只有這位英雄能放的卡' },
    { v: 'neutral', label: '中立', title: '所有英雄都能放的卡' }
  ], poolFilter.owner, function (v) { toggleIn(poolFilter.owner, v); renderEditor(); });

  chipRow($('f-type'), [
    { v: 'unit', label: '角色' }, { v: 'spell', label: '符卡' },
    { v: 'ward', label: '結界' }, { v: 'field', label: '場地' }, { v: 'bgm', label: 'BGM' }
  ], poolFilter.type, function (v) { toggleIn(poolFilter.type, v); renderEditor(); });

  chipRow($('f-tribe'), TRIBES.map(function (t) { return { v: t, label: t }; }),
    poolFilter.tribe, function (v) { toggleIn(poolFilter.tribe, v); renderEditor(); });

  chipRow($('f-works'), [
    { v: '紅', label: '紅魔鄉' }, { v: '妖', label: '妖妖夢' },
    { v: '永', label: '永夜抄' }, { v: '無', label: '不屬於任何作品', title: '基本包的泛用卡，不受作品結界影響' }
  ], poolFilter.works, function (v) { toggleIn(poolFilter.works, v); renderEditor(); });

  var f = poolFilter;
  var active = f.cost.length + f.type.length + f.owner.length +
    f.tribe.length + f.works.length + (f.text ? 1 : 0);
  $('f-count').textContent = counts.shown + ' / ' + counts.total + ' 張' +
    (active ? '（' + active + ' 個條件）' : '');
  $('f-clear').disabled = !active;
  var ownCount = 0, neuCount = 0;
  cardsForHero(editing.heroId).forEach(function (id) {
    if (CARDS[id].cls === 'neutral') neuCount++; else ownCount++;
  });
  $('f-owner').childNodes.forEach(function (btn, i) {
    btn.textContent += '（' + (i === 0 ? ownCount : neuCount) + '）';
  });
}

function passesFilter(cd) {
  var f = poolFilter;
  if (f.cost.length && f.cost.indexOf(Math.min(7, cd.cost)) < 0) return false;
  if (f.type.length && f.type.indexOf(cd.type) < 0) return false;
  if (f.owner.length && f.owner.indexOf(cd.cls === 'neutral' ? 'neutral' : 'own') < 0) return false;
  if (f.tribe.length && !f.tribe.some(function (t) { return hasTribe(cd, t); })) return false;
  if (f.works.length) {
    var w = worksOf(cd);
    var ok = f.works.some(function (x) {
      return x === '無' ? w.length === 0 : w.indexOf(x) >= 0;
    });
    if (!ok) return false;
  }
  if (f.text) {
    var q = f.text.trim();
    if (q && cd.name.indexOf(q) < 0 && (cd.text || '').indexOf(q) < 0) return false;
  }
  return true;
}

function renderDeckList() {
  $('deck-list-view').hidden = false;
  $('deck-edit-view').hidden = true;

  var mine = loadDecks();
  var n = $('deck-list'); clear(n);
  $('deck-empty').hidden = mine.length > 0;
  mine.forEach(function (d) {
    var e = deckCard(d);
    e.onclick = function () { openEditor(d.id); };
    n.appendChild(e);
  });

  var presets = presetDecks();
  renderSetTabs($('preset-tabs'), presets, presetSetFilter,
    function (k) { presetSetFilter = k; renderDeckList(); });
  var pn = $('preset-list'); clear(pn);
  bySetFilter(presets, presetSetFilter).forEach(function (d) {
    var e = deckCard(d);
    var btn = el('button', 'btn small', '複製一份來編輯');
    btn.onclick = function (ev) { ev.stopPropagation(); copyPresetToMine(d); };
    e.appendChild(btn);
    pn.appendChild(e);
  });
}

/* 以預設牌組為範本，建立一副自己的牌組並直接開始編輯 */
function copyPresetToMine(preset) {
  var mine = loadDecks();
  var copy = {
    id: newDeckId(),
    name: preset.name + '（副本）',
    heroId: preset.heroId,
    cards: preset.cards.slice(),
    bgm: preset.bgm || null
  };
  mine.push(copy);
  saveDecks(mine);
  openEditor(copy.id);
}

function openEditor(id) {
  var d = loadDecks().filter(function (x) { return x.id === id; })[0];
  if (!d) { toast('預設牌組不能編輯，請先複製一份'); renderDeckList(); return; }

  editing = d;
  $('deck-list-view').hidden = true;
  $('deck-edit-view').hidden = false;
  $('deck-name').value = d.name;
  renderEditor();
}

/* 更換英雄。職業卡不通用，所以先算出會被移除幾張再讓玩家確認。 */
function changeHero(d) {
  openHeroPicker({
    title: '更換英雄 — ' + d.name,
    current: d.heroId,
    onBack: function () { showScreen('deck'); renderEditor(); },
    onPick: function (heroId) {
      if (heroId === d.heroId) { showScreen('deck'); renderEditor(); return; }
      var lost = d.cards.filter(function (c) {
        return CARDS[c].cls !== 'neutral' && CARDS[c].cls !== heroId;
      });
      var lostBgm = d.bgm && CARDS[d.bgm].cls !== 'neutral' && CARDS[d.bgm].cls !== heroId;
      if (lost.length || lostBgm) {
        var msg = '換成「' + HEROES[heroId].name + '」會移除 ' + lost.length + ' 張職業卡' +
          (lostBgm ? '與 BGM 欄的卡' : '') + '。確定嗎？';
        if (!confirm(msg)) return;
      }
      d.heroId = heroId;
      d.cards = d.cards.filter(function (c) {
        return CARDS[c].cls === 'neutral' || CARDS[c].cls === heroId;
      });
      if (lostBgm) d.bgm = null;
      persistEditing();
      showScreen('deck');
      renderEditor();
    }
  });
}

function persistEditing() {
  var decks = loadDecks();
  var i = -1;
  decks.forEach(function (x, k) { if (x.id === editing.id) i = k; });
  if (i < 0) decks.push(editing); else decks[i] = editing;
  saveDecks(decks);
}

function renderEditor() {
  var d = editing;
  var cnt = {};
  d.cards.forEach(function (c) { cnt[c] = (cnt[c] || 0) + 1; });

  // 卡池
  var pool = $('pool'); clear(pool);
  var all = cardsForHero(d.heroId);
  var shown = 0;
  all.forEach(function (id) {
    var cd = CARDS[id];
    if (!passesFilter(cd)) return;
    shown++;
    var n = cnt[id] || 0;
    var lim = deckLimitOf(cd);
    var e = cardEl(id, { count: n || 0, dim: n >= lim });
    if (!n) { var b = e.querySelector('.cnt'); if (b) b.remove(); }
    if (n >= lim) e.classList.add('maxed');
    e.onclick = function () {
      if (cd.type === 'bgm') {
        d.bgm = (d.bgm === id) ? null : id;
        persistEditing(); renderEditor();
        return;
      }
      if ((cnt[id] || 0) >= lim || d.cards.length >= DECK_SIZE) return;
      d.cards.push(id); persistEditing(); renderEditor();
    };
    pool.appendChild(e);
  });
  renderPoolFilters({ shown: shown, total: all.length });
  if (!shown) {
    var none = el('p', 'hintline', '沒有符合條件的卡片。');
    none.style.gridColumn = '1/-1';
    pool.appendChild(none);
  }

  // 牌表
  var list = $('decklist'); clear(list);
  Object.keys(cnt).sort(function (a, b) {
    return CARDS[a].cost - CARDS[b].cost || CARDS[a].name.localeCompare(CARDS[b].name);
  }).forEach(function (id) {
    var cd = CARDS[id];
    var r = el('div', 'dl-row');
    if (cd.cls !== 'neutral' && HEROES[cd.cls]) {
      r.classList.add('own');
      r.style.borderLeftColor = HEROES[cd.cls].color;
    }
    r.appendChild(el('div', 'dl-cost', String(cd.cost)));
    r.appendChild(el('div', 'dl-name', cd.name));
    r.appendChild(el('div', 'dl-n', '×' + cnt[id]));

    // −／＋ 直接增減。原本是「點整列刪一張」，那個沒有提示、
    // 想看卡片說明時很容易誤刪，改成明確的按鈕。
    var btns = el('div', 'dl-btns');
    var minus = el('button', 'dlbtn', '−');
    minus.title = '減少一張';
    minus.onclick = function (ev) {
      ev.stopPropagation();
      var i = d.cards.lastIndexOf(id);
      if (i >= 0) d.cards.splice(i, 1);
      persistEditing(); renderEditor();
    };
    var plus = el('button', 'dlbtn', '＋');
    var full = d.cards.length >= DECK_SIZE;
    var maxed = cnt[id] >= deckLimitOf(cd);
    plus.disabled = full || maxed;
    plus.title = maxed ? '已達同名上限 ' + deckLimitOf(cd) + ' 張'
      : full ? '牌組已滿 ' + DECK_SIZE + ' 張' : '增加一張';
    plus.onclick = function (ev) {
      ev.stopPropagation();
      if (plus.disabled) return;
      d.cards.push(id);
      persistEditing(); renderEditor();
    };
    btns.appendChild(minus); btns.appendChild(plus);
    r.appendChild(btns);

    bindTip(r, cd);
    list.appendChild(r);
  });

  // 英雄橫幅（取代原本的下拉選單）
  var hb = $('deck-hero-banner'); clear(hb);
  var hero = HEROES[d.heroId];
  hb.style.borderLeftColor = hero.color;
  hb.appendChild(heroAvatar(d.heroId));
  var hinfo = el('div', 'hb-info');
  hinfo.appendChild(el('b', null, hero.name + (BUILD_NAMES[d.heroId] ? '「' + BUILD_NAMES[d.heroId] + '」' : '')));
  var hpw = el('small');
  hpw.innerHTML = hero.power + '（' + heroPowerCostLabel(d.heroId) + '）' + markKeywords(hero.powerText);
  hinfo.appendChild(hpw);
  hb.appendChild(hinfo);
  var swap = el('button', 'btn small', '更換英雄');
  swap.onclick = function () { changeHero(d); };
  hb.appendChild(swap);

  // BGM 欄
  var bs = $('bgm-slot'); clear(bs);
  bs.appendChild(el('span', 'bl', '♪ BGM 欄'));
  if (d.bgm) {
    var bd = CARDS[d.bgm];
    var chip = el('span', 'chip', bd.name);
    chip.title = bd.text;
    bs.appendChild(chip);
    var x = el('button', 'btn small', '移除');
    x.onclick = function () { d.bgm = null; persistEditing(); renderEditor(); };
    bs.appendChild(x);
  } else {
    bs.appendChild(el('span', 'none', '未設定（在卡池點一張 BGM 卡即可）'));
  }

  // 費用曲線
  var curve = $('curve'); clear(curve);
  var buckets = [0, 0, 0, 0, 0, 0, 0, 0];
  d.cards.forEach(function (c) { buckets[Math.min(7, CARDS[c].cost)]++; });
  var mx = Math.max.apply(null, buckets) || 1;
  buckets.forEach(function (v, i) {
    var b = el('div');
    b.style.height = Math.max(2, v / mx * 46) + 'px';
    b.appendChild(el('span', null, i === 7 ? '7+' : String(i)));
    b.title = (i === 7 ? '7+' : i) + ' 費：' + v + ' 張';
    curve.appendChild(b);
  });

  var ownInDeck = d.cards.filter(function (id) { return CARDS[id].cls !== 'neutral'; }).length;
  $('deck-count').textContent = d.cards.length + ' / ' + DECK_SIZE +
    '　專屬 ' + ownInDeck + ' ・ 中立 ' + (d.cards.length - ownInDeck);
  $('deck-count').style.color = d.cards.length === DECK_SIZE ? '#8fd6a8' : '#e8c86a';
  var errs = validateDeck(d);
  if (errs.length) {
    $('deck-errs').textContent = errs[0];
    $('deck-errs').style.color = '#ff9db0';
  } else if (!d.bgm) {
    $('deck-errs').textContent = '牌組合法 ✓（BGM 欄是空的，第 ' + BGM_AUTO_TURN + ' 回合不會有 BGM 上手）';
    $('deck-errs').style.color = '#e8c86a';
  } else {
    $('deck-errs').textContent = '牌組合法 ✓';
    $('deck-errs').style.color = '#8fd6a8';
  }
}

/* ============================================================
   戰績 / 規則 / 選單
   ============================================================ */
function renderStats() {
  var st = loadStats(), n = $('stats-body'); clear(n);
  var total = st.win + st.lose + st.draw;
  var box = el('div', 'statbox');
  [['總場數', total], ['勝', st.win], ['敗', st.lose], ['平', st.draw],
  ['勝率', total ? Math.round(st.win / total * 100) + '%' : '—']].forEach(function (p) {
    var d = el('div');
    d.appendChild(el('b', null, String(p[1])));
    d.appendChild(el('span', null, p[0]));
    box.appendChild(d);
  });
  n.appendChild(box);

  var h = el('h3', 'sect', '各英雄成績'); n.appendChild(h);
  var tbl = el('table');
  tbl.innerHTML = '<tr><th>英雄</th><th>勝</th><th>敗</th><th>平</th></tr>';
  HERO_ORDER.forEach(function (id) {
    var r = st.byHero[id] || { win: 0, lose: 0, draw: 0 };
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + HEROES[id].name + '</td><td>' + r.win + '</td><td>' + r.lose + '</td><td>' + r.draw + '</td>';
    tbl.appendChild(tr);
  });
  tbl.className = ''; n.className = 'pad rules';
  n.appendChild(tbl);
  var rb = el('button', 'btn danger', '清除戰績');
  rb.onclick = function () { if (confirm('確定清除所有戰績？')) { resetStats(); renderStats(); } };
  n.appendChild(el('div', 'row-inline')).appendChild(rb);
}

function renderRules() {
  $('rules-body').innerHTML = [
    '<h3>勝負</h3><p>把對手英雄血量打到 0 即獲勝。牌庫抽完後每次抽牌會受到累加的<b>疲勞</b>傷害。</p>',
    '<h3>靈力</h3><p>每回合開始靈力上限 +1（最多 10）並回滿，用來發動卡片與英雄技能。</p>',
    '<h3>場地佈局</h3><p>前排<b>角色列 5 格</b>、後排<b>結界列 5 格</b>，另有<b>場地區 1 格</b>（雙方各一張，可互相替換自己的）。</p>',
    '<h3>卡片種類</h3><table>',
    '<tr><th>種類</th><th>說明</th></tr>',
    '<tr><td>角色</td><td>佔前排一格。召喚當回合不能攻擊（除非有「疾走」）。</td></tr>',
    '<tr><td>符卡</td><td>一次性魔法，不佔格子，發動後進入棄牌區。</td></tr>',
    '<tr><td>結界</td><td>永續魔法，放後排 5 格之一，持續生效。</td></tr>',
    '<tr><td>場地</td><td>放在自己的場地區，每人只能有一張，新的會替換舊的。</td></tr>',
    '<tr><td>BGM</td><td>點擊發動，放進場上的 BGM 播放器。詳見下方。</td></tr>',
    '</table>',
    '<h3>BGM 卡</h3>',
    '<ul>',
    '<li>BGM 卡放在<b>獨立的 BGM 欄</b>，不算在主牌組的 ' + DECK_SIZE + ' 張裡，也不會被洗進牌庫 —— 所以不會起手就抽到。</li>',
    '<li>你的<b>第 ' + BGM_AUTO_TURN + ' 個回合</b>，BGM 欄的卡會自動進入手牌。</li>',
    '<li><b>整個場上只有一個 BGM 播放器</b>，新發動的 BGM 會蓋過當前的 —— 包含對手的。效果只對<b>擁有者</b>生效。</li>',
    '<li>發動時可以<b>從牌庫檢索</b>該 BGM 敘述指定的角色。</li>',
    '<li>發動後，<b>對手接下來 ' + BGM_LOCK_TURNS + ' 個回合不能發動 BGM</b>。</li>',
    (BGM_RETURN_ON_OVERWRITE
      ? '<li>被對手蓋過時，你的 BGM 會<b>回到手上</b>，可以再花費用搶回播放器。</li>'
      : '<li>被對手蓋過時，你的 BGM 會進入棄牌區。</li>'),
    '</ul>',
    '<h3>專屬卡</h3><p>成為英雄的原作角色同時也有角色卡版本。這類<b>專屬卡</b>每副牌組只能放 1 張。</p>',
    '<h3>關鍵字</h3><p style="color:#a79ec6">遊戲中把滑鼠移到卡片上，就會顯示該卡用到的關鍵字說明，不需要記憶。</p>',
    '<table><tr><th>關鍵字</th><th>效果</th></tr>',
    Object.keys(KEYWORDS).map(function (k) {
      return '<tr><td><b style="color:#8fd6a8">' + k + '</b></td><td>' + KEYWORDS[k] + '</td></tr>';
    }).join(''),
    '</table>',
    '<h3>先手 / 後手</h3>',
    '<p><b>先手</b>：起手 3 張。優勢來自<b>行動順序本身</b> — 前兩回合你的每一步都比對手早一拍，能先搶下場面。適合快攻。</p>',
    '<p><b>後手</b>：起手 4 張、英雄血量 +3，並獲得「<b>後之先</b>」— 當你的靈力上限提升到 2、4、6 時各抽 1 張。優勢是卡差與耐久，會累積到中後期，適合控制。</p>',
    '<h3>牌組</h3><p>剛好 <b>40 張</b>，同名卡最多 <b>4 張</b>，只能放中立卡與該英雄的職業卡。</p>',
    '<p style="color:#6b6390;margin-top:24px">※ 本版為規則驗證原型，BGM 卡種尚未實裝。</p>'
  ].join('');
}

function refreshMenu() {
  var g = lsGet(K.game, null);
  $('btn-resume').hidden = !g;
}


/* ============================================================
   連線對戰的介面接線
   ============================================================ */

/* 權威端推來新盤面時，整個換掉並重繪。
   注意 G 會被整包取代 —— 客人端從不自己修改盤面，
   所以不會有「本地改了一半又被覆蓋」的閃爍問題。 */
function netAttach() {
  NET.onState = function (s) {
    if (!s) return;
    G = s;
    ME = NET.side; AI = 1 - NET.side;
    busy = (G.active !== ME);
    if (G.phase === 'mulligan' && G.pendingMulligan[ME]) showMulligan();
    else { $('overlay').hidden = true; renderGame(); }
    if (G.winner != null) showResult();
    netStatus(G.active === ME ? '你的回合' : '等待對手…');
  };
  NET.onInfo = function (kind, msg) {
    netStatus(msg);
    if (kind === 'left') toast('對手離開了');
    if (kind === 'reject') { toast(msg); netLeave(); showScreen('select'); }
  };
}

function netStatus(msg) {
  var n = $('net-status');
  if (n) n.textContent = msg || '';
}

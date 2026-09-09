/* 介面煙霧測試：用 jsdom 真的把 index.html 跑起來，模擬點擊打完整局 */
const { JSDOM } = require('jsdom');
const path = require('path'), fs = require('fs'), http = require('http');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

(async () => {
  // 用真的 HTTP 伺服器供檔，相對路徑與 localStorage 才會正常運作
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(fs.readFileSync(file));
  }).listen(0);
  const port = server.address().port;

  const errors = [];
  const dom = await JSDOM.fromURL('http://127.0.0.1:' + port + '/index.html', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true
  });
  const w = dom.window, d = w.document;
  w.addEventListener('error', e => errors.push('window error: ' + e.message));
  w.onerror = (m) => errors.push('onerror: ' + m);
  const origErr = console.error;
  w.console.error = (...a) => errors.push('console.error: ' + a.join(' '));

  await sleep(400);
  const click = sel => { const e = typeof sel === 'string' ? d.querySelector(sel) : sel; if (e) e.click(); return !!e; };

  function step(label, fn) {
    try { fn(); } catch (e) { errors.push(label + ': ' + e.message + ' @ ' + String(e.stack).split('\n')[1]); }
  }

  // 主選單 → 選牌組 → 開戰
  step('進入選擇畫面', () => click('#btn-play'));
  await sleep(50);
  if (!d.querySelector('#select-presets .deck-card')) errors.push('預設牌組列表沒有渲染');
  step('開始對戰', () => click('#btn-start'));
  await sleep(50);
  if (d.getElementById('overlay').hidden) errors.push('起手調度覆蓋層沒有出現');

  // 調度：換掉第一張，再確定
  step('調度換牌', () => click('#overlay-inner .card'));
  await sleep(20);
  step('確定調度', () => click('#overlay-inner button'));
  await sleep(50);

  w.SET.aiDelay = 0;
  if (!d.querySelector('#me-hand .card')) errors.push('手牌沒有渲染');

  // 打完整局
  let guard = 0, humanTurns = 0;
  while (w.G && w.G.winner == null && guard++ < 600) {
    if (w.busy || w.G.active !== 0) { await sleep(5); continue; }
    humanTurns++;
    // 盡量出牌
    for (let i = 0; i < 12; i++) {
      const c = d.querySelector('#me-hand .card.playable');
      if (!c) break;
      const before = w.G.players[0].hand.length;
      step('出牌', () => c.click());
      if (w.sel) { // 需要目標
        const t = d.querySelector('.unit.tgt') || d.querySelector('.hero.tgt');
        if (t) step('選目標', () => t.click());
        else step('取消選取', () => { w.sel = null; w.renderGame(); });
      }
      if (w.G.players[0].hand.length === before) break; // 出不動就停
    }
    // 英雄技能
    const pw = d.querySelector('#me-hero-row .hpow');
    if (pw && !pw.disabled) {
      step('英雄技能', () => pw.click());
      if (w.sel) {
        const t = d.querySelector('.unit.tgt') || d.querySelector('.hero.tgt');
        if (t) step('技能目標', () => t.click()); else step('取消', () => { w.sel = null; w.renderGame(); });
      }
    }
    // 攻擊
    for (let i = 0; i < 8; i++) {
      const a = d.querySelector('#me-units .unit.ready');
      if (!a) break;
      step('選攻擊者', () => a.click());
      const t = d.querySelector('.unit.tgt') || d.querySelector('.hero.tgt');
      if (!t) { step('取消攻擊', () => { w.sel = null; w.renderGame(); }); break; }
      step('攻擊', () => t.click());
    }
    if (w.G.winner != null) break;
    step('結束回合', () => click('#btn-end'));
    await sleep(5);
  }

  // 存檔往返
  step('存檔往返', () => {
    const decks = w.presetDecks();
    const code = w.encodeDeck(decks[0]);
    const back = w.decodeDeck(code);
    if (!back || back.cards.length !== 40) throw new Error('牌組碼往返失敗');
    if (back.heroId !== decks[0].heroId) throw new Error('牌組碼英雄不符');
  });

  // 牌組編輯器
  step('開啟牌組編輯', () => { click('#overlay-inner button:last-child'); click('#btn-decks'); });
  await sleep(30);
  step('複製預設牌組來編輯', () => click('#preset-list .deck-card .btn'));
  await sleep(30);
  if (!d.querySelector('#pool .card')) errors.push('卡池沒有渲染');
  if (!d.querySelector('#decklist .dl-row')) errors.push('牌表沒有渲染');
  step('從卡池加卡', () => click('#pool .card'));
  const nBefore = w.editing.cards.length;
  step('牌表 − 減一張', () => click('#decklist .dl-row .dlbtn'));
  await sleep(20);
  if (w.editing.cards.length !== nBefore - 1) errors.push('牌表的 − 沒有生效');
  step('牌表 ＋ 加一張', () => click('#decklist .dl-row .dlbtn:last-child'));
  await sleep(20);
  if (w.editing.cards.length !== nBefore) errors.push('牌表的 ＋ 沒有生效');
  await sleep(20);

  console.log('人類回合數 ' + humanTurns + '，對局結果 ' +
    (w.G ? (w.G.winner === 0 ? '玩家勝' : w.G.winner === 1 ? 'AI 勝' : w.G.winner === -1 ? '平手' : '未結束(guard=' + guard + ')') : '無'));
  console.log('剩餘卡池卡片 ' + d.querySelectorAll('#pool .card').length + ' 張');

  if (errors.length) {
    server.close();
    console.log('--- 錯誤 (' + errors.length + ') ---');
    [...new Set(errors)].slice(0, 15).forEach(e => console.log('  ' + e));
    process.exit(1);
  }
  console.log('介面煙霧測試通過 ✓');
  server.close();
  process.exit(0);
})().catch(e => { console.error('測試本身失敗:', e); process.exit(2); });

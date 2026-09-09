const puppeteer = require('puppeteer-core');
const wait = ms => new Promise(r => setTimeout(r, ms));
const URL = 'http://localhost:8899/index.html';

(async () => {
  // BroadcastChannel 需要同源，file:// 每個分頁是不同 origin，所以起一個本地伺服器
  const http = require('http'), fs = require('fs'), path = require('path');
  const ROOT = require('path').join(__dirname, '..');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
      res.end(d);
    });
  }).listen(8899);

  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox'], protocolTimeout: 15000
  });
  const errs = [];
  const mk = async name => {
    const p = await b.newPage();
    await p.setViewport({ width: 1400, height: 900 });
    p.on('pageerror', e => { errs.push(name + ': ' + e.message); console.log('  ⚠ ' + name + ' 頁面錯誤：' + e.message.slice(0,120)); });
    await p.goto(URL, { waitUntil: 'networkidle0' });
    // 清掉伺服器位址，強制走 BroadcastChannel。這支測試要能離線跑，
    // 不該依賴線上的 Worker，也不該把測試房間丟進正式配對佇列。
    await p.evaluate(() => { SERVER_URL = ''; });
    await wait(300);
    return p;
  };

  const A = await mk('主機'), B = await mk('客人');
  const step = m => console.log('  … ' + m);
  const nlx = String.fromCharCode(10);
  // 背景分頁的 compositor 會被 Chrome 節流，page.click 需要它做 scrollIntoView。
  // 這是測試環境的限制，不是遊戲的問題。
  const click = async (p, sel) => { await p.bringToFront(); await p.click(sel); };

  // 兩邊都到牌組選擇畫面
  step('點 開始對戰');
  for (const p of [A, B]) { await click(p, '#btn-play'); await wait(250); }
  step('畫面：' + await A.evaluate(() => document.querySelector('.screen.active').id));
  // 兩邊刻意挑不同英雄 —— 否則「兩邊都變成開房者的英雄」這種 bug 測不出來
  await A.evaluate(() => {
    document.getElementById('room-code').value = 'TEST';
    chosenDeckId = 'preset_reimu'; renderSelect();
  });
  await B.evaluate(() => {
    document.getElementById('room-code').value = 'TEST';
    chosenDeckId = 'preset_kaguya'; renderSelect();
  });

  step('主機開房');
  await click(A, '#btn-host'); await wait(500);
  step('主機畫面：' + await A.evaluate(() => document.querySelector('.screen.active').id) +
    '　overlay=' + await A.evaluate(() => document.getElementById('overlay').hidden));
    const soloHost = await A.evaluate(() => ({ hasG: !!G, overlay: !document.getElementById('overlay').hidden }));
  console.log('  客人加入前，主機 G=' + soloHost.hasG + '　調度介面=' + soloHost.overlay);
step('客人加入');
  await click(B, '#btn-join'); await wait(800);
  step('客人 G=' + await B.evaluate(() => G ? G.phase : 'null'));

  const snap = async (p, who) => p.evaluate(w => ({
    who: w, mode: NET.mode, side: NET.side,
    phase: G ? G.phase : null, active: G ? G.active : null,
    myHand: G ? G.players[NET.side].hand.map(c => c.defId).slice(0, 3) : null,
    foeHand: G ? G.players[1 - NET.side].hand.map(c => c.defId) : null,
    status: (document.getElementById('net-status') || {}).textContent,
    heroes: G ? [G.players[0].heroId, G.players[1].heroId] : null
  }), who);

  console.log('=== 開房／加入後 ===');
  console.log(' ', JSON.stringify(await snap(A, '主機')));
  console.log(' ', JSON.stringify(await snap(B, '客人')));

  // 兩邊各自完成調度
  for (const [p, who] of [[A, '主機'], [B, '客人']]) {
    const has = await p.evaluate(() => !document.getElementById('overlay').hidden);
    const inner = await p.evaluate(() => {
      const o = document.getElementById('overlay-inner');
      return { html: o.innerHTML.length, btns: o.querySelectorAll('button').length };
    });
    console.log(who + ' overlay 顯示=' + has + '　inner 內容長度=' + inner.html + '　按鈕數=' + inner.btns);
    if (has && inner.btns) { await click(p, '#overlay-inner button'); await wait(400); }
    console.log(who + ' 調度完成，overlay hidden = ' + await p.evaluate(() => document.getElementById('overlay').hidden));
  }
  await wait(600);

  console.log('\n=== 調度後 ===');
  const a2 = await snap(A, '主機'), b2 = await snap(B, '客人');
  console.log(' ', JSON.stringify(a2));
  console.log(' ', JSON.stringify(b2));
  console.log('  主機看到的對手手牌是否全被遮蔽：' + (b2.foeHand ? '' : '-') +
    (a2.foeHand ? a2.foeHand.every(x => x === '?') : '-'));
  console.log('  客人看到的對手手牌是否全被遮蔽：' + (b2.foeHand ? b2.foeHand.every(x => x === '?') : '-'));

  console.log('\n=== 由當前行動方結束回合，看另一邊會不會同步 ===');
  const actor = a2.active === a2.side ? A : B;
  const other = actor === A ? B : A;
  const before = await other.evaluate(() => G.active);
  await click(actor, '#btn-end'); await wait(700);
  const after = await other.evaluate(() => G.active);
  console.log('  另一邊的 active：' + before + ' → ' + after + (before !== after ? '　✓ 有同步' : '　✗ 沒同步'));

    /* --- 回合計時：權威端會強制結束，且兩邊同步 --- */
  console.log(nlx + '=== 回合計時 ===');
  // 改短時限之後要讓權威端重新同步一次 deadline ——
  // timerSync 只在「動作發生」或「廣播」時被呼叫，不會自己輪詢設定值。
  await A.evaluate(() => {
    TURN_SECONDS = 3;
    TIMER.key = '';
    timerSync(HOST.full);
    hostBroadcast();
  });
  await wait(300);
  const clockBefore = await B.evaluate(() => ({ a: G.active, left: timerSecondsLeft() }));
  console.log('  客人看到的倒數：' + clockBefore.left + 's');
  await wait(4500);
  const clockAfter = await Promise.all([
    A.evaluate(() => G.active), B.evaluate(() => G.active)
  ]);
  console.log('  4.5 秒後 active：主機 ' + clockAfter[0] + '　客人 ' + clockAfter[1]);

  /* --- 對局進行中不得留下本地存檔 --- */
  /* 連線時本地那份是遮蔽過的過期副本。留著的話重整會被當成單機續戰，
     AI 就接手了對手 —— 玩家會看到「對手突然變成 NPC」。 */
  const savedDuring = await A.evaluate(() => !!localStorage.getItem('tsw_game_v1'));
  console.log('  對局中本地存檔：' + (savedDuring ? '有（不該有）' : '無 ✓'));

  /* --- 斷線：關掉客人的分頁，主機應該倒數後判定獲勝 --- */
  console.log(nlx + '=== 斷線處理 ===');
  await A.evaluate(() => { DISCONNECT_GRACE = 6; });
  await B.close();
  await wait(3500);
  const dc1 = await A.evaluate(() => ({
    s: document.getElementById('net-status').textContent, lost: ALIVE.lost, w: G ? G.winner : null }));
  console.log('  3.5 秒：「' + dc1.s + '」lost=' + dc1.lost);
  await wait(5000);
  const dc2 = await A.evaluate(() => ({
    s: document.getElementById('net-status').textContent, w: G ? G.winner : null }));
  console.log('  8.5 秒：「' + dc2.s + '」winner=' + dc2.w);

  /* --- 重整後不得變成單機續戰 --- */
  console.log(nlx + '=== 重整 ===');
  await A.reload({ waitUntil: 'domcontentloaded' });
  await wait(700);
  const afterReload = await A.evaluate(() => ({
    screen: document.querySelector('.screen.active').id,
    mode: NET.mode,
    hasG: !!(typeof G !== 'undefined' && G)
  }));
  console.log('  重整後：畫面=' + afterReload.screen + '　NET.mode=' + afterReload.mode +
    '　有對局=' + afterReload.hasG);

  /* 斷言 —— 沒有這一段的話這支測試只會印字，不會擋下任何回歸 */
  const fail = [];
  if (savedDuring) fail.push('連線對局中留下了本地存檔 —— 重整會被當成單機續戰');
  if (afterReload.hasG) fail.push('重整後仍載入了對局 —— 對手會變成 AI');
  if (!dc1.lost) fail.push('對手分頁關掉了，卻沒有偵測到斷線');
  if (dc1.w !== null) fail.push('斷線當下就判定勝負了 —— 應該給寬限期');
  if (dc2.w !== 0) fail.push('寬限期過了卻沒有判定主機獲勝');
  if (clockBefore.left == null) fail.push('客人看不到回合倒數');
  if (clockAfter[0] === clockBefore.a) fail.push('時間到了但權威端沒有強制結束回合');
  if (clockAfter[0] !== clockAfter[1]) fail.push('強制結束回合後兩邊不同步');
  if (soloHost.hasG) fail.push('客人還沒加入，主機就已經有對局了');
  if (soloHost.overlay) fail.push('客人還沒加入，主機就跳出調度介面了');
  if (a2.heroes && a2.heroes[0] === a2.heroes[1]) fail.push('雙方英雄一樣 —— 客人的牌組沒有被採用');
  if (a2.myHand.some(x => x === '?')) fail.push('主機看不到自己的手牌');
  if (b2.myHand.some(x => x === '?')) fail.push('客人看不到自己的手牌');
  if (!a2.foeHand.every(x => x === '?')) fail.push('主機看得到對手手牌 —— 遮蔽失效');
  if (!b2.foeHand.every(x => x === '?')) fail.push('客人看得到對手手牌 —— 遮蔽失效');
  if (a2.myHand.join() === b2.myHand.join()) fail.push('雙方手牌一模一樣 —— 沒有真的分成兩個玩家');
  if (a2.phase !== 'play' || b2.phase !== 'play') fail.push('雙方調度後沒有進入對局');
  if (before === after) fail.push('結束回合沒有同步到另一端');
  errs.forEach(e => fail.push(e));
  const NL = String.fromCharCode(10);
  console.log(fail.length
    ? NL + '--- 雙人連線測試失敗 ---' + NL + '  ' + fail.join(NL + '  ')
    : NL + '雙人連線測試通過 ✓');
  await b.close(); srv.close();
  process.exit(fail.length ? 1 : 0);
})();

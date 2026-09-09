/* 真瀏覽器煙霧測試
   關鍵：用 page.click()（真的滑鼠座標 + 命中測試），才抓得到「元素被覆蓋層擋住」這類 bug。
   jsdom 的 element.click() 直接派發事件，無視遮擋，抓不到。
   用法：node tools/chrometest.js [網址]   預設用 file:// 開啟 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const target = process.argv[2] ||
  'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const FILE_FLAGS = process.argv.indexOf('--strict-file') < 0;

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox'].concat(FILE_FLAGS ? ['--allow-file-access-from-files'] : [])
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  const $$ = s => page.$$(s);
  /* 真的點下去；點不到（被擋住／不可見）就記成錯誤 */
  async function click(sel, label, optional) {
    const h = typeof sel === 'string' ? await page.$(sel) : sel;
    if (!h) { if (!optional) errors.push((label || sel) + '：找不到元素'); return false; }
    try { await h.click(); return true; }
    catch (e) { errors.push((label || sel) + '：點不到（' + e.message.split('\n')[0] + '）'); return false; }
  }
  const st = fn => page.evaluate(fn).catch(e => { errors.push('evaluate: ' + e.message); return null; });

  console.log('=== ' + target + (FILE_FLAGS ? '' : ' [嚴格 file:// 模式]') + ' ===');

  await page.goto(target, { waitUntil: 'networkidle0' });
  await wait(250);

  const ls = await st(() => { try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); return 'ok'; } catch (e) { return e.name; } });
  console.log('localStorage：' + ls);

  /* --- 規則、戰績、牌組編輯器各進去一次 --- */
  for (const [btn, screen, must] of [
    ['#btn-rules', 'screen-rules', '#rules-body table'],
    ['#btn-stats', 'screen-stats', '#stats-body .statbox'],
  ]) {
    await click(btn, btn); await wait(120);
    const ok = await st(s => document.querySelector('.screen.active') && document.querySelector('.screen.active').id, screen);
    if (ok !== screen) errors.push(btn + ' 沒有切到 ' + screen + '（目前 ' + ok + '）');
    if (!(await page.$(must))) errors.push(screen + ' 內容沒有渲染');
    await click('.screen.active .btn.back', '返回'); await wait(120);
  }

  /* --- 牌組編輯器：加卡 / 減卡 --- */
  await click('#btn-decks', '牌組編輯'); await wait(150);
  // 初始沒有自製牌組：先從預設複製一份再編輯
  await click('#preset-list .deck-card .btn', '複製預設牌組'); await wait(250);
  const before = await st(() => editing.cards.length);
  // 牌表每列的兩顆按鈕：第一顆是 −，第二顆是 ＋
  await click('#decklist .dl-row .dlbtn', '牌表 − 減一張'); await wait(120);
  const mid = await st(() => editing.cards.length);
  await click('#decklist .dl-row .dlbtn:last-child', '牌表 ＋ 加一張'); await wait(120);
  const back2 = await st(() => editing.cards.length);
  await click('#decklist .dl-row .dlbtn', '再減一張'); await wait(120);
  await click('#pool .card', '從卡池加卡'); await wait(120);
  const after = await st(() => editing.cards.length);
  if (before == null || after == null) errors.push('牌組編輯器狀態讀不到');
  if (mid !== before - 1) errors.push('牌表的 − 沒有生效（' + before + ' → ' + mid + '）');
  if (back2 !== before) errors.push('牌表的 ＋ 沒有生效（' + mid + ' → ' + back2 + '）');
  if (after !== before) errors.push('從卡池加卡沒有生效（' + after + '，應為 ' + before + '）');
  // 牌組滿 40 張時 ＋ 必須是停用的，不然會超過上限
  const plusDisabled = await st(() =>
    [...document.querySelectorAll('#decklist .dl-row')].every(r =>
      r.querySelector('.dlbtn:last-child').disabled));
  if (!plusDisabled) errors.push('牌組已滿 40 張，但牌表的 ＋ 還能按');
  console.log('牌組編輯器：' + before + ' → − ' + mid + ' → ＋ ' + back2 +
    ' → 加回 ' + after + '，滿牌時 ＋ 停用 ' + (plusDisabled ? '✓' : '✗'));
  await click('#btn-deck-back', '回牌組列表'); await wait(100);
  await click('#screen-deck .btn.back', '回主選單'); await wait(120);

  /* --- 打一整局 --- */
  await click('#btn-play', '開始對戰'); await wait(150);
  const nHeroes = await st(() => HERO_ORDER.length);
  const nPresets = (await $$('#select-presets .deck-card')).length;
  const nMine = (await $$('#select-decks .deck-card')).length;
  // 預設牌組與英雄數 1:1，加英雄時測試不該壞掉
  if (nPresets !== nHeroes) errors.push('預設牌組應有 ' + nHeroes + ' 副（＝英雄數），實際 ' + nPresets);
  if (nMine < 1) errors.push('剛複製的自製牌組沒有出現在選擇畫面');
  console.log('牌組選擇：預設 ' + nPresets + ' 副（英雄 ' + nHeroes + ' 位）/ 自製 ' + nMine + ' 副');
  // 用困難難度打這一局 —— 順便驗證下拉有接上、規劃不會卡住介面
  await page.select('#ai-level', 'hard');
  await click('#btn-start', '對戰開始'); await wait(250);
  const lv = await st(() => G && G.aiLevel);
  if (lv !== 'hard') errors.push('難度沒有傳進對局，G.aiLevel = ' + lv);
  console.log('AI 難度：' + lv);
  if (await st(() => document.getElementById('overlay').hidden)) errors.push('起手調度沒有出現');
  await click('#overlay-inner .card', '調度換牌'); await wait(80);
  await click('#overlay-inner button', '確定調度'); await wait(300);

  await page.evaluate(() => { SET.aiDelay = 0; });

  /* --- 盤面標記與扣血動畫 --- */
  {
    const r = await page.evaluate(() => {
      // 擺一個可控盤面：我方兩個能攻擊的角色、敵方一個要被封印的
      G.players[0].units = [null, null, null, null, null];
      G.players[1].units = [null, null, null, null, null];
      const a = summon(G, 0, 'n_meiling', {});
      const c = summon(G, 0, 'n_chen', {});
      const d = summon(G, 1, 'n_mokou', {});
      a.summoned = false; a.attacksLeft = 1;
      c.summoned = false; c.attacksLeft = 2;
      const active = G.active; G.active = 0;
      recalc(G); renderGame();
      const atk = [...document.querySelectorAll('#me-units .unit .atkleft')].map(x => x.textContent);
      const foeAtk = document.querySelectorAll('#foe-units .unit .atkleft').length;

      silence(G, d); recalc(G); renderGame();
      const sil = document.querySelector('#foe-units .unit.silenced');
      const silBadge = sil ? sil.querySelector('.ubadge').textContent : null;

      renderGame();                       // 讓血量追蹤記下現值
      dmgUnit(G, d, 3); dmgHero(G, 1, 5);
      recalc(G); renderGame();
      const nums = [...document.querySelectorAll('.floatnum')].map(n => n.textContent);
      G.active = active;
      return { atk, foeAtk, silBadge, nums };
    });
    if (r.atk.join(',') !== '⚔,⚔2') errors.push('剩餘攻擊次數標記不正確：' + r.atk.join(','));
    if (r.foeAtk !== 0) errors.push('非行動方不該顯示攻擊次數');
    if (r.silBadge !== '封印') errors.push('封印註記沒有出現：' + r.silBadge);
    if (!r.nums.includes('-3') || !r.nums.includes('-5')) errors.push('扣血浮動數字沒有出現：' + r.nums.join(','));
    console.log('盤面標記：攻擊次數 ' + r.atk.join('/') + '、封印 ' + r.silBadge +
      '、扣血數字 ' + r.nums.join('/'));
  }

  let guard = 0, myTurns = 0, plays = 0, attacks = 0, powers = 0;
  while (guard++ < 300) {
    const s = await st(() => G ? { win: G.winner, active: G.active, busy: busy, turn: G.turn } : null);
    if (!s) { errors.push('對局物件消失'); break; }
    if (s.win != null) break;
    if (s.busy || s.active !== 0) { await wait(20); continue; }
    myTurns++;

    for (let i = 0; i < 12; i++) {
      const c = await page.$('#me-hand .card.playable');
      if (!c) break;
      const n0 = await st(() => G.players[0].hand.length);
      if (!(await click(c, '出牌'))) break;
      if (await st(() => !!sel)) {
        const t = (await page.$('.unit.tgt')) || (await page.$('.hero.tgt'));
        if (t) await click(t, '指定目標');
        else await page.evaluate(() => { sel = null; renderGame(); });
      }
      const n1 = await st(() => G.players[0].hand.length);
      if (n1 === n0) break;
      plays++;
    }

    const pw = await page.$('#me-hero-row .hpow:not([disabled])');
    if (pw) {
      if (await click(pw, '英雄技能', true)) {
        powers++;
        if (await st(() => !!sel)) {
          const t = (await page.$('.unit.tgt')) || (await page.$('.hero.tgt'));
          if (t) await click(t, '技能目標');
          else await page.evaluate(() => { sel = null; renderGame(); });
        }
      }
    }

    for (let i = 0; i < 8; i++) {
      const a = await page.$('#me-units .unit.ready');
      if (!a) break;
      if (!(await click(a, '選攻擊者'))) break;
      const t = (await page.$('.unit.tgt')) || (await page.$('.hero.tgt'));
      if (!t) { await page.evaluate(() => { sel = null; renderGame(); }); break; }
      await click(t, '攻擊'); attacks++;
    }

    if (await st(() => G.winner != null)) break;
    await click('#btn-end', '結束回合');
    await wait(30);
  }

  const fin = await st(() => G ? { win: G.winner, turn: G.turn, hp0: G.players[0].hp, hp1: G.players[1].hp } : null);
  console.log('對局：' + (fin ? '第 ' + fin.turn + ' 回合結束，' +
    (fin.win === 0 ? '玩家勝' : fin.win === 1 ? 'AI 勝' : fin.win === -1 ? '平手' : '未分勝負(guard=' + guard + ')') +
    '（' + fin.hp0 + ' vs ' + fin.hp1 + '）' : '無'));
  console.log('玩家回合 ' + myTurns + '：出牌 ' + plays + '、攻擊 ' + attacks + '、技能 ' + powers);
  if (fin && fin.win == null) errors.push('對局沒有在 ' + guard + ' 次迴圈內結束');
  if (plays === 0) errors.push('整局一張牌都沒出成功');
  if (attacks === 0) errors.push('整局一次攻擊都沒成功');

  /* 結算畫面 */
  await wait(200);
  if (await st(() => document.getElementById('overlay').hidden)) errors.push('結算畫面沒有出現');

  /* 卡片提示框不該在畫面切換後卡住
     （靠 mouseleave 關閉的話，元素被重繪移除時那個事件不會觸發） */
  await st(() => {
    // 結算覆蓋層還蓋著的話滑鼠碰不到卡片，先收起來並補一張手牌
    document.getElementById('overlay').hidden = true;
    showScreen('game');
    if (G) { G.players[0].hand = [makeCard('n_fairy')]; renderGame(); }
  });
  await wait(200);
  const hoverBox = await st(() => {
    const c = document.querySelector('#me-hand .card') || document.querySelector('#me-units .unit');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (hoverBox) {
    await page.mouse.move(hoverBox.x, hoverBox.y);
    await wait(200);
    if (await st(() => document.getElementById('tooltip').hidden)) {
      errors.push('滑鼠停在卡片上但提示框沒出現');
    }
    await st(() => { showScreen('menu'); refreshMenu(); });
    await wait(200);
    if (!(await st(() => document.getElementById('tooltip').hidden))) {
      errors.push('切換畫面後提示框還卡在畫面上');
    } else {
      /* --- 小螢幕版面 --- */
  /* iPhone SE（375×667）曾經整個壞掉：英雄列 flex-wrap:nowrap，內容需要 509px
     但容器只有 355px，技能說明溢出 214px 壓在旁邊的元素上；垂直也差 10px、
     手牌被切掉 43px。這一段確保那些修正不會被之後的改動弄回去。 */
  for (const [nm, vw, vh] of [[ 'iPhone SE', 375, 667 ], [ 'iPhone 14', 390, 844 ]]) {
    await page.setViewport({ width: vw, height: vh, isMobile: true, hasTouch: true });
    // 這時候上面那局已經結束了，盤面元素全是 0 高 —— 得先擺一個活的對局，
    // 否則量到的永遠是 0，測試會變成「永遠通過」。
    await page.evaluate(() => {
      startBattle(presetDecks().find(x => x.heroId === 'reimu'), 'letty', 'me');
      doMulligan(G, 0, []); doMulligan(G, 1, []);
      document.getElementById('overlay').hidden = true;
      for (let i = 0; i < 5; i++) { summon(G, 0, 'n_meiling', {}); summon(G, 1, 'n_ran', {}); }
      G.players[0].wards[0] = makeCard('n_wd_shimenawa');
      recalc(G); renderGame();
    });
    await wait(250);
    const r = await page.evaluate(() => {
      const H = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().height : 0; };
      const need = H('#foe-hero-row') + H('#foe-units') + H('#foe-wards') + H('.midbar') +
        H('#me-wards') + H('#me-units') + H('#me-hero-row') + H('#me-hand');
      const bad = [];
      ['#foe-hero-row', '#me-hero-row'].forEach(sel => {
        const row = document.querySelector(sel);
        if (!row) return;
        if (row.scrollWidth > row.getBoundingClientRect().width + 1) bad.push(sel + ' 內容溢出');
        row.querySelectorAll('*').forEach(e => {
          const b = e.getBoundingClientRect();
          if (b.width > 0 && b.right > window.innerWidth + 1) bad.push(sel + ' 內有元素超出畫面');
        });
      });
      const hand = document.querySelector('#me-hand').getBoundingClientRect();
      return { need: Math.round(need), vh: window.innerHeight, bad: [...new Set(bad)],
        handOff: Math.round(hand.bottom - window.innerHeight),
        ox: document.documentElement.scrollWidth - window.innerWidth };
    });
    if (!r.need) errors.push(nm + '：量到 0 —— 盤面沒有渲染，這個檢查等於沒做');
    if (r.ox > 0) errors.push(nm + '：橫向溢出 ' + r.ox + 'px');
    if (r.need > r.vh) errors.push(nm + '：垂直需求 ' + r.need + ' 超過可視高度 ' + r.vh);
    if (r.handOff > 0) errors.push(nm + '：手牌超出畫面 ' + r.handOff + 'px');
    r.bad.forEach(x => errors.push(nm + '：' + x));
    console.log('小螢幕 ' + nm + ' ' + vw + '×' + vh + '：垂直 ' + r.need + '/' + r.vh +
      '、手牌' + (r.handOff > 0 ? '超出' : '在畫面內') + '、英雄列' + (r.bad.length ? '有溢出' : '正常'));
  }
  await page.setViewport({ width: 1500, height: 980, isMobile: false, hasTouch: false });
  await wait(200);

  console.log('提示框：切換畫面後正確關閉 ✓');
    }
  }

  await browser.close();
  if (errors.length) {
    console.log('--- 錯誤 (' + errors.length + ') ---');
    [...new Set(errors)].slice(0, 15).forEach(e => console.log('  ' + e));
    process.exit(1);
  }
  console.log('真瀏覽器測試通過 ✓');
})().catch(e => { console.error('測試本身失敗:', e); process.exit(2); });

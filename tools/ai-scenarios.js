/* AI 難度的行為回歸測試：擺出特定盤面，斷言困難看得到、簡單看不到。
   這些是「多步才成立」的判斷，正好是單步貪心的盲點。 */
const g = require('./sources').loadGame();

let fail = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) fail++;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + '　得到「' + got + '」' + (ok ? '' : '，應為「' + want + '」'));
}

/* 跑完某一方的整個回合，回傳這回合做了哪些事 */
function playTurn(s, pi, level) {
  s.aiLevel = level; s._aiPlan = null;
  const done = [];
  let steps = 0, a;
  while ((a = g.aiNextAction(s, pi)) && steps++ < 40) {
    done.push(a);
    if (g.applyAction(s, pi, a)) break;
  }
  return done;
}

function board(opts) {
  const s = g.newGame({
    seed: 42,
    p0: { heroId: opts.hero || 'mokou', deck: g.presetDeck(opts.hero || 'mokou'), bgm: null },
    p1: { heroId: 'reimu', deck: g.presetDeck('reimu'), bgm: null },
    firstPlayer: 0
  });
  g.doMulligan(s, 0, []); g.doMulligan(s, 1, []);
  s.players[0].hand = [];
  s.players[0].sp = s.players[0].spMax = 10;
  s.players[0].hp = 30;
  s.players[1].hp = opts.foeHp;
  (opts.mine || []).forEach(id => {
    const u = g.summon(s, 0, id, {});
    u.summoned = false; u.attacksLeft = 1;      // 當成上一回合就在場上
  });
  (opts.theirs || []).forEach(id => g.summon(s, 1, id, {}));
  g.recalc(s);
  return s;
}

/* ---------- 情境 1：技能加攻擊力才打得死 ----------
   妹紅技能 0 費、本回合 +2/+0。我方 4/4，對手 6 血。
   先打臉只有 4 傷；先按技能再打臉才是 6 傷 = 剛好斬殺。
   單步貪心一定先打臉（打臉的即時評分高很多），於是永遠差 2 點。 */
console.log('情境 1：先強化再打臉才有斬殺（妹紅 4/4 vs 對手 6 血）');
['easy', 'hard'].forEach(level => {
  const s = board({ hero: 'mokou', foeHp: 6, mine: ['c_marisa'] });   // 5/4
  s.players[0].units.filter(Boolean).forEach(u => { u.buffAtk = -1; });  // 調成 4/4
  g.recalc(s);
  playTurn(s, 0, level);
  check(level, s.winner === 0 ? '斬殺成功' : '對手剩 ' + s.players[1].hp + ' 血',
    level === 'hard' ? '斬殺成功' : '對手剩 2 血');
});

/* ---------- 情境 2：有守護、對手沒有飛行 → 該打臉而不是換牌 ----------
   我方有一個守護牆，對手只有地面角色，穿不過來。
   這時候拿其他角色去跟對手換是虧的，應該直接打臉。
   這個判斷靠的是威脅評估（reachOf），不是搜尋 —— 因為它問的是「對手下回合」。 */
console.log('情境 2：我方有守護、對手無飛行時應該打臉');
{
  const face = {};
  ['easy', 'hard'].forEach(level => {
    const s = board({
      hero: 'meiling', foeHp: 30,
      mine: ['me_youkai', 'c_marisa'],     // 1/5 守護 ＋ 5/4
      theirs: []
    });
    g.summon(s, 1, 'n_patchouli', {});     // 3/4，無守護也無飛行 → 穿不過我的守護
    g.recalc(s);
    const before = s.players[1].hp;
    playTurn(s, 0, level);
    face[level] = before - s.players[1].hp;
    console.log('    ' + level + ' 打到臉上 ' + face[level] + ' 傷');
  });
  // 這一題兩種難度都答得出來（守護在場時打臉本來就評分高），
  // 所以只斷言困難沒有做錯，不假裝它是難度的分水嶺。
  check('困難有把傷害打在臉上', face.hard > 0, true);
}

/* ---------- 情境 3：攻擊順序 ----------
   我方 2/2 與 5/4，對手只有一個 2/5 守護。
   正確順序是先用 5/4 打掉守護（5 傷剛好清掉 5 血），2/2 就能繞過去打臉。
   反過來先用 2/2 撞守護只是白死。 */
console.log('情境 3：攻擊順序（先清守護，多出來的角色才能繞過去打臉）');
{
  const face = {};
  ['easy', 'hard'].forEach(level => {
    const s = board({ hero: 'mokou', foeHp: 30, mine: ['n_ghost', 'c_marisa'], theirs: ['n_meiling'] });
    const before = s.players[1].hp;
    playTurn(s, 0, level);
    face[level] = before - s.players[1].hp;
    console.log('    ' + level + ' 打到臉上 ' + face[level] + ' 傷');
  });
  check('困難打出的傷害不低於簡單', face.hard >= face.easy, true);
  check('困難確實多打了一些', face.hard > face.easy, true);
}

/* ---------- 情境 5：2-ply 前瞻 —— 打臉爽，但下回合會被反殺 ----------
   我 5 血。對手一個 6/2，我一個 3/3，雙方都沒有守護。
     打臉 → 對手 20→17，然後那個 6/2 打我 6 點，我死。
     清場 → 我的 3/3 換掉那個 6/2，兩個一起死，我活下來。
   打臉的即時評分高很多，所以搜尋這一回合的結果一定是打臉；
   要看到「對手回擊之後」才知道那是自殺。 */
console.log('情境 5：打臉會被反殺時，該先清掉威脅');
['easy', 'hard'].forEach(level => {
  const s = g.newGame({
    seed: 5,
    p0: { heroId: 'reimu', deck: g.presetDeck('reimu'), bgm: null },
    p1: { heroId: 'reimu', deck: g.presetDeck('reimu'), bgm: null },
    firstPlayer: 0
  });
  g.doMulligan(s, 0, []); g.doMulligan(s, 1, []);
  s.players[0].hand = []; s.players[0].sp = 0; s.players[0].hp = 5;
  s.players[1].hp = 20;
  const mine = g.summon(s, 0, 'n_ghost', {}); g.buffUnit(mine, 1, 1);   // 3/3
  mine.summoned = false; mine.attacksLeft = 1;
  const foeU = g.summon(s, 1, 'n_fairy', {}); g.buffUnit(foeU, 5, 0);   // 6/2
  g.recalc(s);

  playTurn(s, 0, level);
  // 換手，讓對手用簡單邏輯打回來
  g.endTurn(s);
  playTurn(s, 1, 'easy');
  check(level, s.winner === 1 ? '被反殺' : '活下來（剩 ' + s.players[0].hp + ' 血）',
    level === 'hard' ? '活下來（剩 5 血）' : '被反殺');
});

/* ---------- 情境 4：兩種難度都不能出非法動作 ---------- */
console.log('情境 4：整局跑完沒有非法動作');
['easy', 'hard'].forEach(level => {
  let bad = 0;
  for (let n = 0; n < 6; n++) {
    const hs = g.HERO_ORDER;
    const s = g.newGame({
      seed: 777 + n * 131,
      p0: { heroId: hs[n % hs.length], deck: g.presetDeck(hs[n % hs.length]), bgm: g.presetBgm(hs[n % hs.length]) },
      p1: { heroId: hs[(n + 3) % hs.length], deck: g.presetDeck(hs[(n + 3) % hs.length]), bgm: g.presetBgm(hs[(n + 3) % hs.length]) },
      firstPlayer: n % 2
    });
    s.aiLevel = level;
    g.doMulligan(s, 0, g.aiMulligan(s, 0)); g.doMulligan(s, 1, g.aiMulligan(s, 1));
    let guard = 0;
    while (s.winner == null && guard++ < 400) {
      const pi = s.active;
      s._aiPlan = null;
      let steps = 0, a;
      while ((a = g.aiNextAction(s, pi)) && steps++ < 40) {
        if (g.applyAction(s, pi, a)) { bad++; break; }
      }
      if (s.winner != null) break;
      g.endTurn(s);
    }
  }
  check(level, bad, 0);
});

/* ---------- 情境 6：規劃耗時不能失控 ----------
   困難的價值來自搜尋，但搜尋參數一旦調大就會悄悄變卡。
   門檻抓得寬鬆 —— 這裡是 Node 的 vm 沙箱，比瀏覽器慢一個量級
   （實測 Chrome 平均 18ms、中位 11ms、最久 208ms，而介面本來就有
   700ms 的 AI 動作間隔）。所以這道防線只攔「參數開太大」等級的爆炸，
   不會因為機器忙就誤報。 */
console.log('情境 6：困難的規劃耗時');
{
  let n = 0, ms = 0, mx = 0;
  for (let k = 0; k < 4; k++) {
    const hs = g.HERO_ORDER;
    const s = g.newGame({
      seed: 6100 + k * 977,
      p0: { heroId: hs[k % hs.length], deck: g.presetDeck(hs[k % hs.length]), bgm: g.presetBgm(hs[k % hs.length]) },
      p1: { heroId: hs[(k + 6) % hs.length], deck: g.presetDeck(hs[(k + 6) % hs.length]), bgm: g.presetBgm(hs[(k + 6) % hs.length]) },
      firstPlayer: k % 2
    });
    s.aiLevel = 'hard';
    g.doMulligan(s, 0, g.aiMulligan(s, 0)); g.doMulligan(s, 1, g.aiMulligan(s, 1));
    let guard = 0;
    while (s.winner == null && guard++ < 300) {
      const pi = s.active;
      s._aiPlan = null;
      let steps = 0, a;
      while (steps++ < 40) {
        const had = !!s._aiPlan;
        const t0 = Date.now();
        a = g.aiNextAction(s, pi);
        const dt = Date.now() - t0;
        if (!had && a) { n++; ms += dt; if (dt > mx) mx = dt; }
        if (!a) break;
        if (g.applyAction(s, pi, a)) break;
      }
      if (s.winner != null) break;
      g.endTurn(s);
    }
  }
  const avg = ms / Math.max(1, n);
  console.log('    規劃 ' + n + ' 次，平均 ' + avg.toFixed(0) + ' ms，最久 ' + mx + ' ms');
  check('平均規劃時間 < 400ms', avg < 400, true);
  check('最久規劃時間 < 3000ms', mx < 3000, true);
}

console.log(fail ? '\n' + fail + ' 項不符預期' : '\nAI 難度行為測試通過 ✓');
process.exit(fail ? 1 : 0);

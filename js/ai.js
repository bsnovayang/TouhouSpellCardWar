/* ============================================================
   東方符卡大戰 — AI 對手

   state 可序列化 → 直接複製盤面模擬，所以搜尋不需要認識任何一張卡。

   兩種難度共用同一份搜尋程式，差別只在 AI_LEVELS 的參數：
     簡單 beam=1 depth=1  → 展開一層、只留一個 → 就是原本的單步貪心
     困難 beam=12 depth=10 → 展開整個回合，只在「回合結束的盤面」評分

   為什麼要看到回合結束才評分：
   單步貪心會把「先加攻擊力再打臉」「先用小的換掉對面、再用大的打臉」
   這種前一步看起來虧的線直接濾掉。斬殺也是同一個問題 ——
   改成整回合搜尋之後斬殺是免費附贈的，因為 evalState 對獲勝回傳 1e6，
   只要有任何一條序列打得死，葉節點就會撿到，不必寫獨立的斬殺判斷。
   ============================================================ */
'use strict';

function cloneState(s) {
  var t = s._log; // 不需要複製過長的紀錄
  s._log = null;
  var c = JSON.parse(JSON.stringify({
    seed: s.seed, turn: s.turn, active: s.active, first: s.first,
    winner: s.winner, phase: s.phase, players: s.players, bgm: s.bgm,
    pendingChoice: s.pendingChoice, pendingMulligan: s.pendingMulligan,
    aiLevel: s.aiLevel   // 不帶的話，模擬裡的 AI 會退回預設難度，搜尋結果就不是真的
  }));
  s._log = t;
  c.log = [];
  c.autoResolveChoice = true;   // 模擬盤面不能停下來等人選，直接取第一個選項
  return c;
}

function evalState(s, me) {
  if (s.winner === me) return 1e6;
  if (s.winner === foe(me) || s.winner === -1) return -1e6;
  var v = 0;
  var mp = s.players[me], op = s.players[foe(me)];

  // 打臉的價值隨對手血量下降而遞增：血量高時場面優先，接近斬殺時全力推進
  v -= op.hp * 2.6;
  if (op.hp <= 14) v -= (15 - op.hp) * 1.5;
  v += Math.min(mp.hp, 22) * 1.3;
  if (mp.hp <= 8) v -= (9 - mp.hp) * 5; // 危險區加權

  function unitVal(u) {
    var a = atkOf(u), h = hpOf(u);
    var val = a * 1.25 + h * 1.0 + 1.0;
    if (hasKw(u, '守護')) val += h * 0.5;
    if (hasKw(u, '飛行')) val += 1.0;
    if (u.stealth) val += 1.0;
    if (hasKw(u, '彈幕')) val += 1.5;
    if (hasKw(u, '吸血')) val += a * 0.6;   // 每次攻擊都等於回同量的血
    if (hasKw(u, '貫通')) val += a * 0.3;   // 溢出傷害不會浪費
    val += (u.barrier || 0) * 3.0;          // 森羅結界每層約等於多一條命
    if (hasKw(u, '連舞')) val += a * 0.8;   // 一回合打兩次
    if (isFrozen(u)) val -= a * 0.7;        // 被冰結等於少一次攻擊
    // 尚未用掉的攻擊次數：1-ply 搜尋看不到「下一步才打出去」的價值，這裡直接補上
    if (u.owner === s.active && !u.cantAttack) val += Math.max(0, (u.attacksLeft || 0) - 1) * a * 0.8;
    return val;
  }
  unitsOf(s, me).forEach(function (u) { v += unitVal(u); });
  unitsOf(s, foe(me)).forEach(function (u) { v -= unitVal(u); });

  v += mp.hand.length * 0.7 - op.hand.length * 0.35;
  v += mp.wards.filter(Boolean).length * 1.2;
  if (mp.field) v += 1.5;
  if (s.bgm) v += (s.bgm.owner === me ? 2.0 : -2.0);   // BGM 播放器只有一個，搶到就是賺
  v -= mp.sp * 0.25; // 鼓勵把靈力用掉
  return v;
}

/* 這裡曾經有一個「威脅評估」項：用
     飛行攻擊力 + max(0, 地面攻擊力 - 守護總生命)
   估對手下回合能打到臉上多少，藉此讓 AI 知道「有守護、對方沒飛行時可以放心打臉」。

   移除的理由：量不出效果。六種權重對上「關掉它」的對照組全落在 49.6–52.0%，
   連只留一半也一樣；384 場的大樣本是 52.6% ±5.0，跨過 50%。
   五個行為情境裡也沒有任何一個需要它（關掉之後全過）。

   原因大概是它跟 unitVal 重複計算了同一件事 —— 我這回合能改變 reachOf(對手)
   的方式基本上只有「殺掉對手的角色」，而那早就算在角色估值裡了。
   它想近似的東西，現在由 2-ply 前瞻用真正的模擬做到（見 scoreAfterFoeReply）。 */

/* 列出目前所有可執行動作 */
function enumActions(s, pi) {
  var acts = [];
  var p = s.players[pi];

  p.hand.forEach(function (card) {
    var d = def(card.defId);
    if (costOf(s, pi, card) > p.sp) return;
    if (d.target) {
      legalTargets(s, pi, d.target).forEach(function (t) {
        if (!canPlay(s, pi, card, t)) acts.push({ k: 'play', uid: card.uid, t: t });
      });
    } else {
      if (!canPlay(s, pi, card, null)) acts.push({ k: 'play', uid: card.uid, t: null });
    }
  });

  var h = heroFormOf(p.heroId, s, pi);
  if (h.target) {
    legalTargets(s, pi, h.target).forEach(function (t) {
      if (!canHeroPower(s, pi, t)) acts.push({ k: 'power', t: t });
    });
  } else if (!canHeroPower(s, pi, null)) acts.push({ k: 'power', t: null });

  unitsOf(s, pi).forEach(function (u) {
    if (!canAttack(s, u)) return;
    attackTargets(s, u).forEach(function (t) { acts.push({ k: 'atk', uid: u.uid, t: t }); });
  });

  return acts;
}

/* 玩家在一個回合裡能做的所有事，全部走這一個入口。
   連線對戰時傳輸的就是這種物件（約 51 bytes），
   所以「結束回合」與「投降」也必須是動作，不能是另外呼叫的函式。 */
function applyAction(s, pi, a) {
  if (a.k === 'choose') return resolveChoice(s, a.defId);
  if (a.k === 'play') return playCard(s, pi, a.uid, a.t);
  if (a.k === 'power') return useHeroPower(s, pi, a.t);
  if (a.k === 'atk') return doAttack(s, a.uid, a.t);
  if (a.k === 'end') {
    if (s.active !== pi) return '不是你的回合';
    return endTurn(s) || null;
  }
  if (a.k === 'mull') {
    if (!s.pendingMulligan[pi]) return '你已經調度過了';
    doMulligan(s, pi, a.toss || []);
    return null;
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

function aiLevel(s) {
  return AI_LEVELS[(s && s.aiLevel) || AI_DEFAULT_LEVEL] || AI_LEVELS[AI_DEFAULT_LEVEL];
}

/* 同分時的偏好，兩種難度共用 */
function actionBias(a) {
  if (a.k === 'play') return 0.05;    // 同分先出牌
  if (a.k === 'power') return -0.03;  // 同分最後才用技能
  return 0;
}

/* 把一個候選盤面往前推一個回合，回傳「對手回擊之後」從 pi 角度看的分數。

   對手只模擬**攻擊**，不模擬出牌 —— 這是刻意的限制而不是偷懶：
   cloneState 是整個 state 複製，模擬對手出牌就會用到他手上的牌和他下一張抽牌，
   等於 AI 偷看玩家的手。場面是公開資訊，所以只推演攻擊不算作弊。 */
function scoreAfterFoeReply(st, pi, beam) {
  var nx = cloneState(st);
  if (nx.winner != null) return evalState(nx, pi);
  try { endTurn(nx); } catch (e) { return evalState(nx, pi); }
  if (nx.winner != null) return evalState(nx, pi);

  var op = foe(pi);
  if (nx.active !== op) return evalState(nx, pi);

  // 對手用攻擊把「他自己的」分數最大化
  var fr = [{ st: nx, score: evalState(nx, op) }];
  var worst = nx, worstV = fr[0].score;
  for (var d = 0; d < 8 && fr.length; d++) {
    var next = [];
    for (var i = 0; i < fr.length; i++) {
      var node = fr[i];
      if (node.st.winner != null || node.st.pendingChoice) continue;
      var acts = enumActions(node.st, op);
      for (var j = 0; j < acts.length; j++) {
        if (acts[j].k !== 'atk') continue;
        var sim = cloneState(node.st);
        if (applyAction(sim, op, acts[j])) continue;
        var v = evalState(sim, op);
        next.push({ st: sim, score: v });
        if (v > worstV) { worstV = v; worst = sim; }   // 對他最好 = 對我最壞
      }
    }
    if (!next.length) break;
    next.sort(function (a, b) { return b.score - a.score; });
    fr = next.slice(0, beam);
  }
  return evalState(worst, pi);
}

/* 規劃「這一整個回合」要做的動作序列。
   逐層展開，每層只留分數最高的 beam 個盤面，
   走到沒有動作可做（或碰到深度上限）為止，回傳最好的那條路徑。

   beam=1 且 depth=1 時，這個函式退化成原本的單步貪心 —— 這是刻意的，
   兩種難度共用同一份程式，才不會有一邊改了另一邊忘了改的問題。 */
function planTurn(s, pi) {
  var cfg = aiLevel(s);
  var base = evalState(s, pi);
  // 一條路徑 = { st: 盤面, path: 動作序列, score: 分數 }
  var frontier = [{ st: s, path: [], score: base }];
  var cands = [];   // 所有「走得完就停手」的候選，之後可能要重新排序

  for (var depth = 0; depth < cfg.depth && frontier.length; depth++) {
    var next = [];
    for (var f = 0; f < frontier.length; f++) {
      var node = frontier[f];
      if (node.st.winner != null) continue;
      // 模擬中途也可能跳出探尋；autoResolveChoice 會自動解掉，這裡只是保險
      if (node.st.pendingChoice) continue;
      var acts = enumActions(node.st, pi);
      for (var i = 0; i < acts.length; i++) {
        var sim = cloneState(node.st);
        if (applyAction(sim, pi, acts[i])) continue;
        var v = evalState(sim, pi) + actionBias(acts[i]);
        var cand = { st: sim, path: node.path.concat([acts[i]]), score: v };
        next.push(cand);
        // 每一條走得完的路徑都是候選 —— 不必等到最深層，
        // 因為「打完就停手」有時候本來就比「把靈力全用掉」好。
        cands.push(cand);
      }
    }
    if (!next.length) break;
    next.sort(function (a, b) { return b.score - a.score; });
    frontier = next.slice(0, cfg.beam);
    // 候選清單也要收斂，否則深層展開會累積上千個盤面副本
    if (cands.length > 40) {
      cands.sort(function (a, b) { return b.score - a.score; });
      cands = cands.slice(0, 40);
    }
  }
  if (!cands.length) return null;
  cands.sort(function (a, b) { return b.score - a.score; });

  var threshold = base;
  // 參數放在 AI_FORESEE 而不是 AI_LEVELS 裡，難度旗標只管開不開 ——
  // 這樣調參數時不必動難度表，測試也能單獨換掉參數。
  var fs = cfg.foresee ? AI_FORESEE : null;
  if (fs) {
    // 前瞻之後的分數是「對手回擊完」的分數，跟 base 不同基準，直接比會全部被否決。
    // 所以基準線也要用同一把尺量：假設我這回合什麼都不做，對手回擊之後是多少分。
    threshold = scoreAfterFoeReply(s, pi, fs.beam);
    var top = cands.slice(0, fs.topN);
    top.forEach(function (c) { c.score = scoreAfterFoeReply(c.st, pi, fs.beam); });
    top.sort(function (a, b) { return b.score - a.score; });
    cands = top.concat(cands.slice(fs.topN));
  }

  // 必須嚴格比「什麼都不做」好
  return cands[0].score > threshold + 0.01 ? cands[0].path : null;
}

/* 對「當前真實盤面」求下一個最佳動作；沒有值得做的事就回傳 null。
   一次只回一步：UI 要逐步播放，而且模擬中新生成的 uid 對不上真實盤面。
   困難難度會把整個回合的計畫算好快取起來，之後每一步直接取用。 */
function aiNextAction(s, pi) {
  if (s.winner != null || s.active !== pi) return null;

  // 探尋等待中：先把選擇做完。
  // 模擬裡是自動選第一個，跟實際可能不同 —— 所以解完要重算，舊計畫直接丟掉。
  if (s.pendingChoice) {
    if (s.pendingChoice.pi !== pi) return null;
    s._aiPlan = null;
    return { k: 'choose', defId: aiPickDiscover(s, pi, s.pendingChoice.options) };
  }

  // 快取的計畫還有效就直接用下一步
  var a = shiftPlan(s, pi);
  if (a) return a;

  var plan = planTurn(s, pi);
  if (!plan || !plan.length) { s._aiPlan = null; return null; }
  s._aiPlan = { pi: pi, turn: s.turn, acts: plan };
  return shiftPlan(s, pi);
}

/* 取出計畫的下一步，並驗證它在「現在這個真實盤面」上仍然合法。
   cloneState 有複製 seed，所以模擬與實際會走出同一條亂數，計畫通常不會失效；
   但只要有一步對不上就整份作廢重算，寧可多算也不要送出非法動作。 */
function shiftPlan(s, pi) {
  var plan = s._aiPlan;
  if (!plan || plan.pi !== pi || plan.turn !== s.turn || !plan.acts.length) return null;
  var a = plan.acts.shift();
  if (!plan.acts.length) s._aiPlan = null;
  if (!isActionLegal(s, pi, a)) { s._aiPlan = null; return null; }
  return a;
}

function isActionLegal(s, pi, a) {
  if (a.k === 'play') {
    var card = findCardInHand(s, pi, a.uid);
    return !!card && !canPlay(s, pi, card, a.t);
  }
  if (a.k === 'power') return !canHeroPower(s, pi, a.t);
  if (a.k === 'atk') {
    var u = findUnit(s, a.uid);
    if (!canAttack(s, u) || u.owner !== pi) return false;
    return attackTargets(s, u).some(function (x) {
      return (x.t === 'hero' && a.t.t === 'hero' && x.pi === a.t.pi) ||
        (x.t === 'unit' && a.t.t === 'unit' && x.uid === a.t.uid);
    });
  }
  return false;
}

/* 探尋要選哪一張：優先本回合出得起的，同條件下取費用最高（通常最有價值） */
function aiPickDiscover(s, pi, options) {
  var sp = s.players[pi].sp;
  var best = options[0], bestScore = -1e9;
  options.forEach(function (id) {
    var d = CARDS[id];
    var score = d.cost * 2 + (d.type === 'unit' ? d.atk + d.hp : 3);
    if (d.cost <= sp) score += 8;   // 現在就能用的優先
    if (score > bestScore) { bestScore = score; best = id; }
  });
  return best;
}

/* 調度：丟掉 5 費以上的牌 */
function aiMulligan(s, pi) {
  var p = s.players[pi];
  return p.hand.filter(function (c) { return def(c.defId).cost >= 5; })
    .map(function (c) { return c.uid; });
}

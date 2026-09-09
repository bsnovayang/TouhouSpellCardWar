/* ============================================================
   東方符卡大戰 — 卡表：第七彈・東方妖妖夢 (TH07 PCB)
   白玉樓、八雲家、騷靈三姊妹、人偶
   共 55 張。要新增這一彈的卡，直接在本檔加 C({...})。
   ============================================================ */
'use strict';

C({ id: 'n_shanghai', tribe: ['人偶'], name: '上海人偶', src: '妖', cls: 'neutral', type: 'unit', cost: 1, atk: 1, hp: 1, kw: ['守護'], text: '守護。愛麗絲最愛用的人偶。', token: true });

C({
  id: 'n_lily', tribe: ['妖精'], name: '莉莉白', src: '妖', cls: 'neutral', type: 'unit', cost: 1, atk: 1, hp: 1,
  text: '登場：抽 1 張。', onPlay: function (s, c) { draw(s, c.pi, 1); }
});

C({ id: 'n_chen', tribe: ['式神', '妖獸'], name: '橙', src: '妖', cls: 'neutral', type: 'unit', cost: 2, atk: 3, hp: 1, kw: ['疾走'], text: '疾走。式神之式神。' });

C({ id: 'n_ghost', works: [], set: '基', tribe: ['亡靈'], name: '亡靈', src: '妖', cls: 'neutral', type: 'unit', cost: 2, atk: 2, hp: 2, kw: ['飛行'], text: '飛行。白玉樓外飄盪的幽魂。' });

C({
  id: 'n_merlin', tribe: ['亡靈', '騷靈'], name: '梅露蘭·普莉茲姆利巴', src: '妖',
  cls: 'neutral', type: 'unit', cost: 2, atk: 1, hp: 3, kw: ['飛行'],
  text: '飛行。登場：使我方一個角色 +2/+0。合奏：此角色 +1/+1。',
  target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, 2, 0); },
  selfAura: function (s, u) { return ensemble(s, u.owner) ? [1, 1] : null; }
});

C({
  id: 'n_lyrica', tribe: ['亡靈', '騷靈'], name: '莉莉卡·普莉茲姆利巴', src: '妖',
  cls: 'neutral', type: 'unit', cost: 2, atk: 1, hp: 3, kw: ['飛行'],
  text: '飛行。回合結束時抽 1 張。合奏：此角色 +1/+1。',
  onTurnEnd: function (s, u) { draw(s, u.owner, 1); },
  selfAura: function (s, u) { return ensemble(s, u.owner) ? [1, 1] : null; }
});

C({
  id: 'n_letty', tribe: ['妖怪'], name: '蕾迪·懷特洛克', src: '妖', cls: 'neutral', type: 'unit', cost: 3, atk: 3, hp: 3,
  text: '登場：使一個敵方角色冰結。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) freeze(s, c.target.unit); }
});

/* ========== 騷靈三姊妹 ==========
   各自都有能力，湊齊三位不同的「騷靈」時額外 +2/+2（合奏）。
   合奏是動態光環：有一位被打死，另外兩位的加成立刻消失。 */
C({
  id: 'n_lunasa', tribe: ['亡靈', '騷靈'], name: '露娜薩·普莉茲姆利巴', src: '妖',
  cls: 'neutral', type: 'unit', cost: 2, atk: 1, hp: 3, kw: ['飛行'],
  text: '飛行。登場：使一個敵方角色的攻擊力 -2。合奏：此角色 +1/+1。',
  target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, -2, 0); },
  selfAura: function (s, u) { return ensemble(s, u.owner) ? [1, 1] : null; }
});

C({
  id: 'n_ran', tribe: ['式神', '妖獸'], name: '八雲藍', src: '妖', cls: 'neutral', type: 'unit', cost: 5, atk: 4, hp: 4,
  text: '登場：召喚一個「橙」。',
  onPlay: function (s, c) { summon(s, c.pi, 'n_chen', {}); }
});

C({ id: 'y_hansho', tribe: ['亡靈'], name: '半靈', src: '妖', cls: 'neutral', type: 'unit', cost: 1, atk: 1, hp: 2, kw: ['飛行'], text: '飛行。妖夢的另一半。', token: true });

C({
  id: 'n_sp_gap', name: '八雲的隙間', src: '妖', cls: 'neutral', type: 'spell', cost: 1,
  text: '從牌庫檢索 1 張「結界」或「場地」到手上。',
  onPlay: function (s, c) { tutor(s, c.pi, function (d) { return d.type === 'ward' || d.type === 'field'; }); }
});

C({
  id: 'n_wd_sakura', name: '春符「櫻花結界」', src: '妖', cls: 'neutral', type: 'ward', cost: 3,
  text: '你的符卡費用 -1。',
  costMod: function (s, owner, d, casterPi) { return (casterPi === owner && d.type === 'spell') ? -1 : 0; }
});

C({
  id: 'n_fd_hakugyokurou', name: '白玉樓', src: '妖', cls: 'neutral', type: 'field', cost: 3,
  text: '我方角色死去時，我方英雄回復 2 點。',
  onAllyDeath: function (s, owner, u) { healHero(s, owner, 2); }
});

C({
  id: 'm_stardust', set: '紅',  name: '星符「星塵收集」', src: '妖', cls: 'marisa', type: 'spell', cost: 2,
  text: '抽 2 張。',
  onPlay: function (s, c) { draw(s, c.pi, 2); }
});

C({
  id: 'y_utsusemi', name: '人符「現世斬」', src: '妖', cls: 'youmu', type: 'spell', cost: 3,
  text: '破壞一個攻擊力 3 以下的敵方角色。', target: T.eUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    if (atkOf(u) <= 3) destroyUnit(s, u);
    else logMsg(s, '「' + def(u.defId).name + '」攻擊力過高，斬擊落空');
  }
});

C({
  id: 'y_hakurou', tribe: ['人類', '亡靈'], name: '半靈與白樓劍', src: '妖', cls: 'youmu', type: 'unit', cost: 2, atk: 2, hp: 2, kw: ['飛行'],
  text: '飛行。登場：我方一個角色 +1/+1。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, 1, 1); }
});

C({
  id: 'y_rokudou', name: '人鬼「未來永劫斬」', src: '妖', cls: 'youmu', type: 'spell', cost: 6,
  text: '破壞一個角色。', target: T.anyUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) destroyUnit(s, c.target.unit); }
});

C({
  id: 'y_konpaku', tribe: ['人類', '亡靈'], name: '魂魄妖忌', src: '妖', cls: 'youmu', type: 'unit', cost: 5, atk: 5, hp: 5, kw: ['疾走'],
  text: '疾走。登場：對我方英雄造成 1 點傷害。',
  onPlay: function (s, c) { dmgHero(s, c.pi, 1); }
});

C({
  id: 'k_gapyoukai', tribe: ['妖怪'], name: '隙間之目', src: '妖', cls: 'yukari', type: 'unit', cost: 4, atk: 4, hp: 4, kw: ['隱行'],
  text: '隱行。'
});

C({
  id: 'k_hands', tribe: ['妖怪'], name: '隙間之手', src: '妖', cls: 'yukari', type: 'unit', cost: 2, atk: 2, hp: 3, kw: ['隱行'],
  text: '隱行。從境界縫隙伸出的無數雙手。'
});

C({
  id: 'k_shijuu', name: '境界符「四重結界」', src: '妖', cls: 'yukari', type: 'ward', cost: 3,
  text: '登場：抽 1 張。你的英雄受到的傷害 -1。',
  dmgReduce: function () { return 1; },
  onPlay: function (s, c) { draw(s, c.pi, 1); }
});

C({
  id: 'k_shinkai', name: '「深彈幕結界」', src: '妖', cls: 'yukari', type: 'spell', cost: 6,
  text: '破壞所有角色。',
  onPlay: function (s, c) { allUnits(s).forEach(function (u) { destroyUnit(s, u); }); }
});

C({
  id: 'a_shanghai', name: '人形「上海人形」', src: '妖', cls: 'alice', type: 'spell', cost: 2,
  text: '召喚兩個「上海人偶」。',
  onPlay: function (s, c) { summon(s, c.pi, 'n_shanghai', {}); summon(s, c.pi, 'n_shanghai', {}); }
});

C({
  id: 'a_hourai', tribe: ['人偶'], name: '蓬萊人形', src: '妖', cls: 'alice', type: 'unit', cost: 3, atk: 3, hp: 4,
  text: '死去：召喚一個「上海人偶」。',
  onDeath: function (s, pi, u) { summon(s, pi, 'n_shanghai', {}); }
});

C({
  id: 'a_army', name: '咒符「上海人形軍」', src: '妖', cls: 'alice', type: 'ward', cost: 4,
  text: '我方的「上海人偶」+1/+1。我方非「上海人偶」的角色死去時，召喚一個「上海人偶」。',
  aura: function (s, owner, u) { return (u.owner === owner && u.defId === 'n_shanghai') ? [1, 1] : null; },
  onAllyDeath: function (s, owner, u) { if (u.defId !== 'n_shanghai') summon(s, owner, 'n_shanghai', {}); }
});

C({
  id: 'a_goliath', tribe: ['人偶'], name: '人偶軍團', src: '妖', cls: 'alice', type: 'unit', cost: 5, atk: 4, hp: 4,
  text: '登場：我方所有其他角色 +1/+1。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { if (u !== c.self) buffUnit(u, 1, 1); });
  }
});

/* 原本是「5 費對所有敵方角色 2 點傷害」，跟 4 費的中立「彈幕勝負」效果完全相同
   卻更貴 —— 專屬卡沒有存在的理由。改成綁她自己的流派：
   亡者輪迴要的就是我方角色死去，所以本回合死得愈多，這張打得愈痛。 */
C({
  id: 'u_botan', name: '櫻符「完全櫻·緋」', src: '妖', cls: 'yuyuko', type: 'spell', cost: 5,
  text: '對所有敵方角色造成 2 點傷害；本回合我方每有一個角色死去，傷害 +1。',
  onPlay: function (s, c) {
    var n = 2 + (s.players[c.pi].deathsThisTurn || 0);
    if (n > 2) logMsg(s, '本回合已有 ' + (n - 2) + ' 個我方角色死去 — 傷害提升為 ' + n);
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, n); });
  }
});

C({
  id: 'u_shitai', name: '亡舞「生死流轉」', src: '妖', cls: 'yuyuko', type: 'spell', cost: 5,
  text: '破壞一個角色，抽 1 張。', target: T.anyUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) { destroyUnit(s, c.target.unit); draw(s, c.pi, 1); } }
});

C({
  id: 'u_yuurei', tribe: ['亡靈'], name: '彷徨的亡靈', src: '妖', cls: 'yuyuko', type: 'unit', cost: 2, atk: 2, hp: 2, kw: ['飛行'],
  text: '飛行。死去：抽 1 張。',
  onDeath: function (s, pi, u) { draw(s, pi, 1); }
});

C({
  id: 'u_saigyou', tribe: ['亡靈'], name: '西行妖', src: '妖', cls: 'yuyuko', type: 'unit', cost: 6, atk: 3, hp: 7, kw: ['守護'],
  text: '守護。回合結束：對敵方英雄造成 2 點傷害。',
  onTurnEnd: function (s, u) { dmgHero(s, foe(u.owner), 2); }
});

/* ========== 博麗靈夢（生與死的境界） ========== */
C({
  id: 'r_kyoukai', set: '紅',  name: '結界「生死之境」', src: '妖', cls: 'reimu', type: 'ward', cost: 4,
  text: '我方英雄受到傷害時，隨機一個我方角色 +1/+1。',
  onHeroHurt: function (s, owner, n) {
    var t = pick(s, unitsOf(s, owner));
    if (t) { logMsg(s, '「生死之境」— 「' + def(t.defId).name + '」+1/+1'); buffUnit(t, 1, 1); }
  }
});

/* ========== 霧雨魔理沙 ========== */
C({
  id: 'm_hoshikuzu', set: '紅',  name: '星屑的碎片', src: '妖', cls: 'marisa', type: 'spell', cost: 1,
  text: '抽 1 張；連奏 2：改為抽 2 張。',
  onPlay: function (s, c) {
    var n = rensou(s, c.pi, 2) ? 2 : 1;
    if (n === 2) logMsg(s, '『連奏 2』發動 — 改為抽 2 張');
    draw(s, c.pi, n);
  }
});

/* ========== 十六夜咲夜 ========== */
C({
  id: 's_private', set: '紅',  name: '時符「私人平方」', src: '妖', cls: 'sakuya', type: 'spell', cost: 3,
  text: '我方一個角色本回合可再攻擊兩次。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.attacksLeft += 2; }
});
C({
  id: 's_eternal', set: '紅',  name: '時符「未來永劫」', src: '妖', cls: 'sakuya', type: 'spell', cost: 4,
  text: '我方所有角色本回合 +1/+0 並獲得疾走。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) {
      buffUnit(u, 1, 0, true);
      addKw(u, '疾走', true);
      if (u.summoned && u.attacksLeft <= 0) u.attacksLeft = 1;
    });
  }
});

/* ========== 魂魄妖夢：一擊必殺 ========== */
C({
  id: 'y_shugyo', name: '修行', src: '妖', cls: 'youmu', type: 'spell', cost: 1,
  text: '我方一個角色 +1/+2。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, 1, 2); }
});
C({
  id: 'y_ouka', name: '劍伎「櫻花閃閃」', src: '妖', cls: 'youmu', type: 'spell', cost: 3,
  text: '我方一個角色本回合 +3/+0 並獲得貫通。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 3, 0, true);
    addKw(u, '貫通', true);
  }
});
C({
  id: 'y_roukanken', name: '二刀「白樓劍・樓觀劍」', src: '妖', cls: 'youmu', type: 'ward', cost: 4,
  text: '我方角色 +1/+0。',
  aura: function (s, owner, u) { return u.owner === owner ? [1, 0] : null; }
});
C({
  id: 'y_shokei', name: '斷命劍「究極處刑人」', src: '妖', cls: 'youmu', type: 'spell', cost: 5,
  text: '破壞一個敵方角色；若我方有攻擊力 5 以上的角色，改為再破壞一個（數值最高者）。', target: T.eUnit,
  onPlay: function (s, c) {
    var first = c.target && c.target.unit; if (!first) return;
    destroyUnit(s, first);
    if (!unitsOf(s, c.pi).some(function (u) { return atkOf(u) >= 5; })) return;
    var best = null;
    unitsOf(s, foe(c.pi)).forEach(function (u) {
      if (u === first || u.dead || !canTargetUnit(s, c.pi, u)) return;
      if (!best || atkOf(u) + hpOf(u) > atkOf(best) + hpOf(best)) best = u;
    });
    if (best) { logMsg(s, '「究極處刑人」追加破壞「' + def(best.defId).name + '」'); destroyUnit(s, best); }
  }
});

/* ========== 八雲紫：境界操作 ========== */
C({
  id: 'k_kakurenbo', name: '紫符「捉迷藏」', src: '妖', cls: 'yukari', type: 'spell', cost: 1,
  text: '我方一個角色 +1/+1 並獲得隱行。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 1, 1); u.stealth = true;
  }
});
C({
  id: 'k_sougi', name: '隙間送葬', src: '妖', cls: 'yukari', type: 'spell', cost: 2,
  text: '將一個敵方角色移回其擁有者手上。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) bounceUnit(s, c.target.unit); }
});
C({
  id: 'k_mugen', name: '夢幻泡影', src: '妖', cls: 'yukari', type: 'spell', cost: 2,
  text: '使一個敵方角色的攻擊力永久變為 0。', target: T.eUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    u.atkZero = true;
    logMsg(s, '「' + def(u.defId).name + '」的攻擊力歸零');
  }
});
C({
  id: 'k_mahoujin', name: '境界「魔法陣結界」', src: '妖', cls: 'yukari', type: 'ward', cost: 4,
  text: '我方的「隱行」角色 +1/+1。',
  aura: function (s, owner, u) { return (u.owner === owner && u.stealth) ? [1, 1] : null; }
});
C({
  id: 'k_kyoukai', name: '「幻想鄉的境界」', src: '妖', cls: 'yukari', type: 'spell', cost: 7,
  text: '交換雙方英雄目前的血量。',
  onPlay: function (s, c) {
    var me = s.players[c.pi], op = s.players[foe(c.pi)];
    var t = me.hp;
    me.hp = Math.min(op.hp, me.maxHp);
    op.hp = Math.min(t, op.maxHp);
    logMsg(s, '『幻想鄉的境界』— 血量交換為 ' + me.hp + ' / ' + op.hp);
    checkWin(s);
  }
});

/* ========== 愛麗絲：人偶大軍 ========== */
C({
  id: 'a_jizai', name: '操符「人偶自在」', src: '妖', cls: 'alice', type: 'spell', cost: 2,
  text: '我方所有角色 +1/+0。',
  onPlay: function (s, c) { unitsOf(s, c.pi).forEach(function (u) { buffUnit(u, 1, 0); }); }
});
C({
  id: 'a_hoffman', tribe: ['人偶'], name: '霍夫曼人偶', src: '妖', cls: 'alice', type: 'unit', cost: 3, atk: 2, hp: 3,
  text: '登場：召喚一個「上海人偶」。',
  onPlay: function (s, c) { summon(s, c.pi, 'n_shanghai', {}); }
});
C({
  id: 'a_shinpan', name: '咒符「人偶審判」', src: '妖', cls: 'alice', type: 'spell', cost: 4,
  text: '我方每有一個角色，就對敵方英雄造成 1 點傷害。',
  onPlay: function (s, c) {
    var n = unitsOf(s, c.pi).length;
    logMsg(s, '「人偶審判」— 場上 ' + n + ' 個角色');
    if (n > 0) dmgHero(s, foe(c.pi), n);
  }
});
C({
  id: 'a_saiban', name: '「人形裁判」', src: '妖', cls: 'alice', type: 'spell', cost: 4,
  text: '我方每有一個角色就抽 1 張（最多 3 張）。',
  onPlay: function (s, c) {
    var n = Math.min(3, unitsOf(s, c.pi).length);
    if (n > 0) draw(s, c.pi, n); else logMsg(s, '場上沒有角色，「人形裁判」沒有抽到牌');
  }
});

C({
  id: 'a_hourai_full', tribe: ['人偶'], name: '蓬萊人形·完全體', src: '妖', cls: 'alice', type: 'unit', cost: 6, atk: 5, hp: 5,
  text: '登場：召喚兩個「上海人偶」。',
  onPlay: function (s, c) { summon(s, c.pi, 'n_shanghai', {}); summon(s, c.pi, 'n_shanghai', {}); }
});

/* ========== 西行寺幽幽子：亡者輪迴 ========== */
C({
  id: 'u_band', tribe: ['亡靈'], name: '幽靈樂團', src: '妖', cls: 'yuyuko', type: 'unit', cost: 1, atk: 1, hp: 2,
  text: '死去：我方英雄回復 2 點。',
  onDeath: function (s, pi, u) { healHero(s, pi, 2); }
});
C({
  id: 'u_kurin', name: '死符「幽明的苦輪」', src: '妖', cls: 'yuyuko', type: 'spell', cost: 2,
  text: '獻祭我方一個角色：對攻擊力最高的敵方角色造成 4 點傷害。', target: T.aUnit,
  playable: function (s, pi) { return unitsOf(s, foe(pi)).length > 0; },
  onPlay: function (s, c) {
    var mine = c.target && c.target.unit; if (!mine) return;
    logMsg(s, '『獻祭』—「' + def(mine.defId).name + '」');
    destroyUnit(s, mine);
    cleanupDeaths(s);
    var best = null;
    unitsOf(s, foe(c.pi)).forEach(function (u) {
      if (!canTargetUnit(s, c.pi, u)) return;
      if (!best || atkOf(u) > atkOf(best)) best = u;
    });
    if (best) dmgUnit(s, best, 4);
  }
});
C({
  id: 'u_yomotsu', name: '冥符「黃泉平坂行路」', src: '妖', cls: 'yuyuko', type: 'spell', cost: 3,
  text: '召喚兩個「亡靈」。',
  onPlay: function (s, c) { summon(s, c.pi, 'n_ghost', {}); summon(s, c.pi, 'n_ghost', {}); }
});

C({
  id: 'u_ageha', name: '蝶符「鳳蝶紋的死槍」', src: '妖', cls: 'yuyuko', type: 'spell', cost: 4,
  text: '對一個敵方角色造成 3 點傷害；若本回合有我方角色死去，抽 2 張。', target: T.eUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 3);
    if ((s.players[c.pi].deathsThisTurn || 0) > 0) {
      logMsg(s, '本回合已有我方角色死去 — 抽 2 張');
      draw(s, c.pi, 2);
    }
  }
});
C({
  id: 'u_hangyoku', name: '「反魂蝶 -八分咲-」', src: '妖', cls: 'yuyuko', type: 'spell', cost: 6,
  text: '召喚本局中最後死去的三個我方角色。',
  playable: function (s, pi) { return (s.players[pi].fallen || []).length > 0; },
  onPlay: function (s, c) {
    var list = (s.players[c.pi].fallen || []).slice(-3).reverse();
    logMsg(s, '『反魂蝶』— 喚回 ' + list.length + ' 個亡者');
    list.forEach(function (id) { summon(s, c.pi, id, {}); });
  }
});

/* ========== 英雄的角色卡 ========== */
C({
  id: 'c_youmu', tribe: ['人類', '亡靈'], name: '魂魄妖夢', src: '妖', cls: 'neutral',
  type: 'unit', cost: 4, atk: 4, hp: 3, kw: ['貫通'], pair: 'c_yuyuko',
  text: '貫通。人妖組（西行寺幽幽子）：此角色 +1/+1，且你的回合結束時對敵方英雄造成 2 點傷害。',
  selfAura: function (s, u) { return paired(s, u) ? [1, 1] : null; },
  onTurnEnd: function (s, u) { if (paired(s, u)) dmgHero(s, foe(u.owner), 2); }
});
C({
  id: 'c_yukari', tribe: ['妖怪'], name: '八雲紫', src: '妖', cls: 'neutral', type: 'unit',
  cost: 6, atk: 5, hp: 5, kw: ['隱行'], pair: 'c_reimu',
  text: '隱行。登場：抽 1 張。人妖組（博麗靈夢）：此角色 +1/+1，且你的回合開始時抽 1 張。',
  onPlay: function (s, c) { draw(s, c.pi, 1); },
  selfAura: function (s, u) { return paired(s, u) ? [1, 1] : null; },
  onTurnStart: function (s, u) { if (paired(s, u)) draw(s, u.owner, 1); }
});
C({
  id: 'c_alice', tribe: ['魔法使'], name: '愛麗絲·瑪格特羅依德', src: '妖', cls: 'neutral',
  type: 'unit', cost: 4, atk: 3, hp: 4, pair: 'c_marisa',
  text: '登場：召喚兩個「上海人偶」。人妖組（霧雨魔理沙）：此角色 +1/+1。',
  onPlay: function (s, c) {
    summon(s, c.pi, 'n_shanghai', {});
    summon(s, c.pi, 'n_shanghai', {});
  },
  selfAura: function (s, u) { return paired(s, u) ? [1, 1] : null; }
});
C({
  id: 'c_yuyuko', tribe: ['亡靈'], name: '西行寺幽幽子', src: '妖', cls: 'neutral',
  type: 'unit', cost: 6, atk: 4, hp: 6, pair: 'c_youmu',
  text: '登場：破壞我方一個其他角色，抽 2 張。人妖組（魂魄妖夢）：此角色 +1/+1。',
  target: T.aUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit && c.target.unit !== c.self) {
      destroyUnit(s, c.target.unit);
      draw(s, c.pi, 2);
    }
  },
  selfAura: function (s, u) { return paired(s, u) ? [1, 1] : null; }
});

/* ========== BGM 卡 ========== */
C({
  id: 'bgm_youmu', name: '広有射怪鳥事 ～ Till When?', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_youmu',
  text: '發動：從牌庫檢索「魂魄妖夢」。我方攻擊力最高的角色 +2/+0。',
  aura: function (s, owner, u) {
    if (u.owner !== owner) return null;
    var best = null;
    unitsOf(s, owner).forEach(function (x) {
      if (!best || x.baseAtk + (x.buffAtk || 0) > best.baseAtk + (best.buffAtk || 0)) best = x;
    });
    return u === best ? [2, 0] : null;
  }
});
C({
  id: 'bgm_yukari', name: 'ネクロファンタジア', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_yukari',
  text: '發動：從牌庫檢索「八雲紫」。我方「隱行」角色 +1/+1。',
  aura: function (s, owner, u) { return (u.owner === owner && u.stealth) ? [1, 1] : null; }
});
C({
  id: 'bgm_alice', name: '人形裁判 ～ 人の形弄びし少女', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_alice',
  text: '發動：從牌庫檢索「愛麗絲·瑪格特羅依德」。我方的衍生物 +1/+1。',
  aura: function (s, owner, u) { return (u.owner === owner && def(u.defId).token) ? [1, 1] : null; }
});
C({
  id: 'bgm_yuyuko', name: '幽雅に咲かせ、墨染の桜 ～ Border of Life', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_yuyuko',
  text: '發動：從牌庫檢索「西行寺幽幽子」。我方有「死去」效果的角色 +1/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && def(u.defId).onDeath) ? [1, 1] : null;
  }
});

/* ========== 森羅結界（妖妖夢包的新系統） ==========
   與爐石聖盾不同：森羅結界**可以疊加**。再給一次就是兩層，能擋兩次傷害。
   卡面會顯示「結界×2」。 */
C({
  id: 'y_wd_pcb', set: '妖', tribe: [], name: '妖妖夢結界', src: '妖', cls: 'neutral', type: 'ward', cost: 3,
  text: '你召喚有收錄於「東方妖妖夢」的角色時，該角色獲得森羅結界。',
  onAllySummon: function (s, owner, u) {
    if (!unitAppearsIn(u, '妖')) return;
    addBarrier(s, u, 1);
    logMsg(s, '「妖妖夢結界」— 「' + def(u.defId).name + '」獲得森羅結界');
  }
});
C({
  id: 'y_sp_shinra', name: '結界「森羅結界」', src: '妖', cls: 'youmu', type: 'spell', cost: 2,
  text: '我方一個角色獲得森羅結界。若它已經有，改為再獲得兩層。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    addBarrier(s, u, (u.barrier || 0) > 0 ? 2 : 1);
  }
});
C({
  id: 'y_konpaku_g', name: '白玉樓的亡靈', src: '妖', cls: 'neutral', type: 'unit',
  cost: 3, atk: 2, hp: 3, kw: ['守護', '森羅結界'], tribe: ['亡靈'],
  text: '守護。森羅結界。徘徊在白玉樓外的幽魂。'
});

/* 探尋的示範卡（騷靈三姊妹英雄做出來之前，先讓這個機制有卡可用） */
C({
  id: 'n_sp_score', name: '騷靈的樂譜', src: '妖', cls: 'neutral', type: 'spell', cost: 2,
  text: '探尋：從 3 張「騷靈」卡中選 1 張加入手牌。',
  onPlay: function (s, c) { discoverTribe(s, c.pi, '騷靈', 3); }
});

/* ========== 莉莉白：全場隨機 ==========
   她跟帕秋莉的隨機不一樣。帕秋莉的隨機是「附加在符卡上、只打敵方」，
   莉莉白是「主體就是隨機、而且打全場」—— 收益比同費高一截，
   代價是你指定不了目標，經常會打到自己不想打的東西。
   組她的牌組要有心理準備：期望值站在你這邊，單一回合不一定。 */

C({
  id: 'li_haru', name: '春告', src: '妖', cls: 'lily', type: 'spell', cost: 1,
  text: '隨機一個角色 +2/+2（可能是敵方的）。',
  onPlay: function (s, c) {
    var t = pick(s, allUnits(s));
    if (!t) { logMsg(s, '場上沒有角色，春告落空'); return; }
    buffUnit(t, 2, 2);
    logMsg(s, '春天降臨在「' + def(t.defId).name + '」身上');
  }
});

C({
  id: 'li_mebuki', name: '芽吹', src: '妖', cls: 'lily', type: 'spell', cost: 2,
  text: '隨機兩個我方角色各 +1/+1（可能重複同一個）。',
  onPlay: function (s, c) {
    for (var i = 0; i < 2; i++) {
      var t = pick(s, unitsOf(s, c.pi));
      if (t) buffUnit(t, 1, 1);
    }
  }
});

C({
  id: 'li_fubuki', name: '花吹雪', src: '妖', cls: 'lily', type: 'spell', cost: 3,
  text: '隨機分配 5 點傷害，每 1 點隨機打在場上任一角色身上（包含我方）。',
  onPlay: function (s, c) {
    for (var i = 0; i < 5; i++) {
      var t = pick(s, allUnits(s));
      if (!t) break;
      dmgUnit(s, t, 1);
      cleanupDeaths(s);
    }
  }
});

C({
  id: 'li_ranman', name: '春爛漫', src: '妖', cls: 'lily', type: 'spell', cost: 5,
  text: '場上所有角色 +2/+2（包含敵方的）。',
  onPlay: function (s, c) {
    allUnits(s).forEach(function (u) { buffUnit(u, 2, 2); });
    logMsg(s, '整片幻想鄉都開花了');
  }
});

C({
  id: 'li_fairy', tribe: ['妖精'], name: '報春的妖精', src: '妖', cls: 'lily', type: 'unit',
  cost: 2, atk: 2, hp: 2, works: ['妖'],
  text: '登場：隨機一個角色 +1/+1（可能是敵方的）。',
  onPlay: function (s, c) {
    var t = pick(s, allUnits(s));
    if (t) buffUnit(t, 1, 1);
  }
});

C({
  id: 'li_blackfairy', tribe: ['妖精'], name: '報凶的妖精', src: '妖', cls: 'lily', type: 'unit',
  cost: 3, atk: 3, hp: 2, works: ['妖'],
  text: '登場：隨機一個敵方角色受到 2 點傷害。', target: null,
  onPlay: function (s, c) {
    var t = pick(s, unitsOf(s, foe(c.pi)));
    if (t) dmgUnit(s, t, 2);
  }
});

C({
  id: 'li_wd_haru', name: '春之結界', src: '妖', cls: 'lily', type: 'ward', cost: 3,
  text: '你的回合開始時，隨機一個我方角色 +1/+1。',
  onTurnStart: function (s, owner) {
    var t = pick(s, unitsOf(s, owner));
    if (t) buffUnit(t, 1, 1);
  }
});

C({
  id: 'bgm_lily', name: '天空の花の都', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_lily',
  text: '發動：從牌庫檢索「莉莉白」。你的回合開始時，隨機一個我方角色 +1/+0。',
  onTurnStart: function (s, owner) {
    var t = pick(s, unitsOf(s, owner));
    if (t) buffUnit(t, 1, 0);
  }
});

/* ========== 騷靈三姊妹：合奏 ==========
   三張角色卡與「合奏」關鍵字先前已完成，這裡補英雄的職業卡。

   合奏 = 我方場上同時有三位「不同的」騷靈。
   所以這一套的節奏是：技能每回合補一位缺的姊妹 → 湊齊 → 全部效果升級。
   代價是三姊妹本體都只有 1/3，湊齊之前場面很脆。 */

C({
  id: 'pr_poltergeist', tribe: ['騷靈', '亡靈'], name: '騷靈', src: '妖', cls: 'prismriver',
  type: 'unit', cost: 2, atk: 2, hp: 3, works: ['妖'],
  // 三姊妹本體都有飛行，這張再給飛行的話整副牌都無視守護，對手完全擋不住。
  text: '合奏：此角色 +1/+1。',
  selfAura: function (s, u) { return ensemble(s, u.owner) ? [1, 1] : null; }
});

C({
  id: 'pr_clifford', name: '幻樂「ゴーストクリフォード」', src: '妖', cls: 'prismriver',
  type: 'spell', cost: 4,
  text: '我方所有「騷靈」角色 +1/+1；合奏：改為 +2/+2。',
  onPlay: function (s, c) {
    var n = ensemble(s, c.pi) ? 2 : 1;
    if (n === 2) logMsg(s, '『合奏』成立 — 強化加倍');
    unitsOf(s, c.pi).forEach(function (u) {
      if (hasTribe(def(u.defId), '騷靈')) buffUnit(u, n, n);
    });
  }
});

C({
  id: 'pr_symphony', name: '冥樂「ゴーストシンフォニー」', src: '妖', cls: 'prismriver',
  type: 'spell', cost: 6,
  // 帕秋莉的「日符」同樣 6 費、全體 4 傷，所以這張的上限不該超過它。
  text: '對所有敵方角色造成 2 點傷害；合奏：改為 4 點。',
  onPlay: function (s, c) {
    var n = ensemble(s, c.pi) ? 4 : 2;
    if (n === 4) logMsg(s, '『合奏』成立 — 全體傷害提升為 4');
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, n); });
  }
});

C({
  id: 'pr_tuning', name: '調音', src: '妖', cls: 'prismriver', type: 'spell', cost: 2,
  text: '從牌庫檢索一張你場上還沒有的「騷靈」角色。',
  onPlay: function (s, c) {
    var here = {};
    unitsOf(s, c.pi).forEach(function (u) { here[u.defId] = true; });
    var got = tutor(s, c.pi, function (d) {
      return d.type === 'unit' && hasTribe(d, '騷靈') && !here[d.id];
    });
    if (!got) logMsg(s, '牌庫裡沒有還缺的騷靈');
  }
});

C({
  id: 'pr_encore', name: '安可', src: '妖', cls: 'prismriver', type: 'spell', cost: 3,
  text: '抽 2 張；合奏：改為抽 3 張並使我方所有「騷靈」角色本回合 +1/+0。',
  onPlay: function (s, c) {
    if (!ensemble(s, c.pi)) { draw(s, c.pi, 2); return; }
    logMsg(s, '『合奏』成立 — 安可');
    draw(s, c.pi, 3);
    unitsOf(s, c.pi).forEach(function (u) {
      if (hasTribe(def(u.defId), '騷靈')) buffUnit(u, 1, 0, true);
    });
  }
});

C({
  id: 'pr_wd_stage', name: '幽靈舞台', src: '妖', cls: 'prismriver', type: 'ward', cost: 3,
  text: '我方「騷靈」角色 +1/+0；合奏時改為 +2/+0。',
  aura: function (s, owner, u) {
    if (u.owner !== owner || !hasTribe(def(u.defId), '騷靈')) return null;
    return ensemble(s, owner) ? [2, 0] : [1, 0];
  }
});

C({
  id: 'pr_fd_hall', name: '無名之丘', src: '妖', cls: 'prismriver', type: 'field', cost: 4,
  text: '你的回合開始時，若「合奏」成立，抽 1 張。',
  onTurnStart: function (s, owner) {
    if (ensemble(s, owner)) { logMsg(s, '『合奏』成立 — 無名之丘抽 1 張'); draw(s, owner, 1); }
  }
});

C({
  id: 'bgm_prismriver', name: '幽霊楽団 ～ Phantom Ensemble', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_lunasa',
  text: '發動：從牌庫檢索「露娜薩·普莉茲姆利巴」。我方「騷靈」角色 +0/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '騷靈')) ? [0, 1] : null;
  }
});

/* ========== 蕾迪·懷特洛克：蔓延的冬天 ==========
   琪露諾的冰結是「凍住然後解決掉」，蕾迪是「凍住然後蔓延」。
   她的卡不追求殺傷，而是把整個場面凍住拖到後期，
   再用「被冰結的敵人愈多、我方愈強」的卡收割。 */

C({
  id: 'le_lingering', name: '寒符「リンガリングコールド」', src: '妖', cls: 'letty',
  type: 'spell', cost: 3,
  text: '使兩個隨機的敵方角色冰結。',
  onPlay: function (s, c) {
    var pool = unitsOf(s, foe(c.pi)).filter(function (u) { return !isFrozen(u); });
    if (!pool.length) { logMsg(s, '對方沒有還沒被凍住的角色'); return; }
    for (var i = 0; i < 2; i++) {
      var t = pick(s, pool);
      if (!t) break;
      freeze(s, t);
      pool.splice(pool.indexOf(t), 1);
    }
  }
});

C({
  id: 'le_wither', name: '冬符「フラワーウィザラウェイ」', src: '妖', cls: 'letty',
  type: 'spell', cost: 4,
  text: '使所有敵方角色的攻擊力 -1；已被冰結的改為 -3。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) {
      buffUnit(u, isFrozen(u) ? -3 : -1, 0);
    });
  }
});

C({
  id: 'le_snap', name: '寒符「コールドスナップ」', src: '妖', cls: 'letty',
  type: 'spell', cost: 5,
  text: '對每個被冰結的敵方角色造成 4 點傷害。',
  onPlay: function (s, c) {
    var list = unitsOf(s, foe(c.pi)).filter(isFrozen);
    if (!list.length) { logMsg(s, '沒有被冰結的角色，寒符落空'); return; }
    list.forEach(function (u) { dmgUnit(s, u, 4); });
  }
});

C({
  id: 'le_yuki', tribe: ['妖怪'], name: '雪之妖怪', src: '妖', cls: 'letty', type: 'unit',
  cost: 3, atk: 1, hp: 5, kw: ['守護'], works: ['妖'],
  text: '守護。登場：使一個敵方角色冰結。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) freeze(s, c.target.unit); }
});

C({
  id: 'le_fuyu', tribe: ['妖怪'], name: '冬之亡靈', src: '妖', cls: 'letty', type: 'unit',
  cost: 4, atk: 2, hp: 5, works: ['妖'],
  text: '每有一個被冰結的敵方角色，此角色 +1/+0。',
  selfAura: function (s, u) {
    var n = unitsOf(s, foe(u.owner)).filter(isFrozen).length;
    return n ? [n, 0] : null;
  }
});

C({
  id: 'le_wd_fuyu', name: '冬之結界', src: '妖', cls: 'letty', type: 'ward', cost: 3,
  text: '你的回合開始時，使一個隨機的敵方角色冰結。',
  onTurnStart: function (s, owner) {
    var t = pick(s, unitsOf(s, foe(owner)).filter(function (u) { return !isFrozen(u); }));
    if (t) freeze(s, t);
  }
});

C({
  id: 'bgm_letty', name: 'クリスタライズシルバー', src: '妖', cls: 'neutral',
  type: 'bgm', cost: 3, unique: true, tutor: 'n_letty',
  text: '發動：從牌庫檢索「蕾迪·懷特洛克」。敵方被冰結的角色攻擊力 -1。',
  aura: function (s, owner, u) {
    return (u.owner !== owner && isFrozen(u)) ? [-1, 0] : null;
  }
});


/* ========== 橙：一次性衝擊 ==========
   技能召喚的貓活不過這個回合，所以她場上留不住東西。
   整套卡都圍繞「這一回合能打出多少」：疾走、暫時強化、直接燒臉。
   拖到後期她什麼都沒有 —— 這是刻意的代價。 */

C({
  id: 'ch_neko', tribe: ['妖獸'], name: '貓', src: '妖', cls: 'chen', type: 'unit',
  cost: 1, atk: 1, hp: 1, kw: ['疾走'], token: true, works: ['妖'],
  text: '疾走。你的回合結束時，此角色死去。',
  onTurnEnd: function (s, u) { destroyUnit(s, u); }
});

C({
  id: 'ch_bakeneko', tribe: ['妖獸'], name: '化貓', src: '妖', cls: 'chen', type: 'unit',
  cost: 3, atk: 4, hp: 2, kw: ['疾走'], works: ['妖'],
  text: '疾走。'
});

C({
  id: 'ch_kuroneko', tribe: ['妖獸'], name: '黑貓', src: '妖', cls: 'chen', type: 'unit',
  cost: 2, atk: 3, hp: 1, kw: ['疾走'], works: ['妖'],
  text: '疾走。'
});

C({
  id: 'ch_shimen', name: '式輝「四面楚歌チーズ」', src: '妖', cls: 'chen', type: 'spell', cost: 4,
  text: '我方所有角色本回合 +2/+0。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { buffUnit(u, 2, 0, true); });
  }
});

C({
  id: 'ch_ultimate', name: '式弾「アルティメットブラスト」', src: '妖', cls: 'chen',
  type: 'spell', cost: 5,
  text: '對敵方英雄造成 6 點傷害。',
  onPlay: function (s, c) { dmgHero(s, foe(c.pi), 6); }
});

C({
  id: 'ch_hishou', name: '飛翔', src: '妖', cls: 'chen', type: 'spell', cost: 2,
  text: '我方一個角色本回合獲得疾走與飛行。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    addKw(u, '疾走', true);
    addKw(u, '飛行', true);
    if (u.summoned && u.attacksLeft <= 0) u.attacksLeft = 1;
  }
});

C({
  id: 'ch_wd_neko', name: '貓之結界', src: '妖', cls: 'chen', type: 'ward', cost: 2,
  text: '我方具有「疾走」的角色 +1/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasKw(u, '疾走')) ? [1, 0] : null;
  }
});

C({
  id: 'bgm_chen', name: 'ティアオイエツォン(withered leaf)', src: '妖', cls: 'neutral',
  type: 'bgm', cost: 3, unique: true, tutor: 'n_chen',
  text: '發動：從牌庫檢索「橙」。我方「妖獸」角色 +1/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '妖獸')) ? [1, 0] : null;
  }
});


/* ========== 八雲藍：式神與費用壓縮 ==========
   技能每回合把手牌兩端各降 1 費 —— 收益慢但持續。
   她的卡走同一條路：召喚式神鋪場、把費用愈壓愈低，靠後期一口氣打完。 */

C({
  id: 'ra_kudagitsune', tribe: ['式神', '妖獸'], name: '管狐', src: '妖', cls: 'ran',
  type: 'unit', cost: 1, atk: 1, hp: 1, kw: ['飛行'], works: ['妖'],
  text: '飛行。藍差遣的小式神。'
});

C({
  id: 'ra_shikigami', tribe: ['式神'], name: '式神', src: '妖', cls: 'ran', type: 'unit',
  cost: 2, atk: 2, hp: 2, works: ['妖'],
  text: '登場：手牌中隨機一張卡費用 -1。',
  onPlay: function (s, c) {
    var t = pick(s, s.players[c.pi].hand);
    if (!t) return;
    t.costMod -= 1;
    logMsg(s, '「' + def(t.defId).name + '」費用 -1');
  }
});

C({
  id: 'ra_juuni', name: '式神「十二神將之宴」', src: '妖', cls: 'ran', type: 'spell', cost: 5,
  text: '召喚兩個 2/2「式神」。',
  onPlay: function (s, c) {
    summon(s, c.pi, 'ra_shikigami_token', {});
    summon(s, c.pi, 'ra_shikigami_token', {});
  }
});

C({
  id: 'ra_shikigami_token', tribe: ['式神'], name: '式神', src: '妖', cls: 'ran',
  type: 'unit', cost: 2, atk: 2, hp: 2, token: true, works: ['妖'],
  text: '藍召喚出來的式神。'
});

C({
  id: 'ra_tenko', name: '「天狐思念」', src: '妖', cls: 'ran', type: 'spell', cost: 4,
  text: '抽 2 張，並使它們的費用 -2。',
  onPlay: function (s, c) {
    var p = s.players[c.pi];
    var before = p.hand.length;
    draw(s, c.pi, 2);
    for (var i = before; i < p.hand.length; i++) p.hand[i].costMod -= 2;
  }
});

C({
  id: 'ra_rensei', name: '戔符「天上天下的連星」', src: '妖', cls: 'ran', type: 'spell', cost: 3,
  text: '對一個敵方角色造成 4 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 4); }
});

C({
  id: 'ra_wd_shiki', name: '式之結界', src: '妖', cls: 'ran', type: 'ward', cost: 3,
  text: '我方「式神」角色 +1/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '式神')) ? [1, 1] : null;
  }
});

C({
  id: 'bgm_ran', name: '少女幻葬 ～ Necro-Fantasy', src: '妖', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_ran',
  text: '發動：從牌庫檢索「八雲藍」。你的回合開始時，手牌最左的卡費用 -1。',
  onTurnStart: function (s, owner) {
    var h = s.players[owner].hand;
    if (h.length) h[0].costMod -= 1;
  }
});

/* 魔理沙的「星符『ドラゴンメテオ』」出自妖妖夢，照「卡片跟著它的補充包走」的規則放這裡 */
C({
  id: 'm_dragonmeteor', set: '紅',  name: '星符「ドラゴンメテオ」', src: '妖', cls: 'marisa', type: 'spell', cost: 6,
  text: '對隨機的敵方目標造成 2 點傷害 4 次。',
  onPlay: function (s, c) {
    for (var i = 0; i < 4; i++) {
      var foes = unitsOf(s, foe(c.pi)).filter(function (u) { return canTargetUnit(s, c.pi, u); });
      if (!foes.length || rngInt(s, foes.length + 1) === 0) dmgHero(s, foe(c.pi), 2);
      else dmgUnit(s, pick(s, foes), 2);
      cleanupDeaths(s);
    }
  }
});

/* 紫的「神隱之主犯」出自妖妖夢，先前誤放在永夜抄的檔案裡 */
C({
  id: 'k_kamikakushi', name: '神隱之主犯', src: '妖', cls: 'yukari', type: 'spell', cost: 5,
  text: '神隱一個敵方角色；若它的費用為 5 以上，抽 1 張。',
  target: T.eUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    var big = def(u.defId).cost >= 5;
    banishUnit(s, u);
    if (big) { logMsg(s, '大物被送進隙間 — 抽 1 張'); draw(s, c.pi, 1); }
  }
});

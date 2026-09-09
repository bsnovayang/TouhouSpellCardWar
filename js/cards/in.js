/* ============================================================
   東方符卡大戰 — 卡表：第八彈・東方永夜抄 (TH08 IN)
   永遠亭、迷途竹林、夜雀與不死之人
   共 11 張。要新增這一彈的卡，直接在本檔加 C({...})。
   ============================================================ */
'use strict';

C({
  id: 'n_wriggle', tribe: ['妖怪'], name: '莉格露·奈特巴格', src: '永', cls: 'neutral', type: 'unit', cost: 2, atk: 2, hp: 2, kw: ['飛行'],
  text: '飛行。我方其他「飛行」角色 +1/+0。',
  unitAura: function (s, src, u) { return hasKw(u, '飛行') ? [1, 0] : null; }
});

C({
  id: 'n_tewi', tribe: ['妖怪'], name: '因幡帝', src: '永', cls: 'neutral', type: 'unit', cost: 2, atk: 2, hp: 2,
  text: '登場：我方一個角色獲得「隱行」。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.stealth = true; }
});

C({
  id: 'n_mystia', tribe: ['妖怪'], name: '米斯蒂婭·蘿蕾拉', src: '永', cls: 'neutral', type: 'unit', cost: 3, atk: 3, hp: 3, kw: ['飛行'],
  text: '飛行。登場：一個敵方角色本回合攻擊力 -2。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, -2, 0, true); }
});

C({
  id: 'n_reisen', tribe: ['月人'], name: '鈴仙·優曇華院·因幡', src: '永', cls: 'neutral', type: 'unit', cost: 3, atk: 2, hp: 4,
  text: '登場：使一個敵方角色冰結，且攻擊力 -1。', target: T.eUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) { freeze(s, c.target.unit); buffUnit(c.target.unit, -1, 0, true); }
  }
});

/* 本體刻意做成 2/4 —— 代價前置，有同伴才回本。
   召喚時她自己已經在場上（summon 先於 onPlay），所以一個人打出來就是 3/5 守護，
   跟改動前完全一樣，不會變成爛卡；有其他人類在場才是賺。

   守護放在她身上是有理由的：妹紅的資源是英雄血量（捨身一直在自傷），
   而守護正好保護那個資源 —— 兩人在機制上真的互相需要，
   不必在卡面上寫任何配對的字。 */
C({
  id: 'n_keine', tribe: ['人類', '妖獸'], name: '上白澤慧音', src: '永', cls: 'neutral',
  type: 'unit', cost: 4, atk: 2, hp: 4, kw: ['守護'], works: ['永'],
  text: '守護。登場：我方所有「人類」角色 +1/+1。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) {
      if (hasTribe(def(u.defId), '人類')) buffUnit(u, 1, 1);
    });
  }
});

C({
  id: 'n_mokou', tribe: ['人類'], name: '藤原妹紅', src: '永', cls: 'neutral', type: 'unit', cost: 5, atk: 4, hp: 4,
  text: '死去：召喚一個 4/4「不死鳥」。',
  onDeath: function (s, pi, u) { summon(s, pi, 'n_phoenix', {}); }
});

C({ id: 'n_phoenix', tribe: ['妖獸'], name: '不死鳥', src: '永', cls: 'neutral', type: 'unit', cost: 5, atk: 4, hp: 4, kw: ['飛行'], text: '飛行。從灰燼中重生。', token: true });

C({
  id: 'n_eirin', tribe: ['月人'], name: '八意永琳', src: '永', cls: 'neutral', type: 'unit', cost: 6, atk: 5, hp: 6,
  text: '登場：我方英雄回復 5 點。',
  onPlay: function (s, c) { healHero(s, c.pi, 5); }
});

C({
  id: 'n_kaguya', tribe: ['月人'], name: '蓬萊山輝夜', src: '永', cls: 'neutral', type: 'unit', cost: 7, atk: 6, hp: 7,
  text: '死去：抽 2 張。',
  onDeath: function (s, pi, u) { draw(s, pi, 2); }
});

C({
  id: 'n_fd_eientei', name: '永遠亭', src: '永', cls: 'neutral', type: 'field', cost: 3,
  text: '你的回合結束時，我方英雄回復 2 點。',
  onTurnEnd: function (s, owner) { healHero(s, owner, 2); }
});

C({
  id: 'r_tensei', set: '紅', name: '「夢想天生」', src: '永', cls: 'reimu', type: 'spell', cost: 8,
  text: '破壞所有敵方角色。',
  onPlay: function (s, c) { unitsOf(s, foe(c.pi)).forEach(function (u) { destroyUnit(s, u); }); }
});

/* ========== 依作品觸發的結界 ========== */
C({
  id: 'i_wd_in', name: '永夜的結界', src: '永', cls: 'neutral', type: 'ward', cost: 3,
  text: '你召喚有收錄於「東方永夜抄」的角色時，該角色 +0/+2。',
  onAllySummon: function (s, owner, u) {
    if (!unitAppearsIn(u, '永')) return;
    buffUnit(u, 0, 2);
    logMsg(s, '「永夜的結界」— 「' + def(u.defId).name + '」+0/+2');
  }
});

/* ========== 藤原妹紅：捨身 ==========
   技能 0 費、代價是自傷 —— 每回合都能主動點燃捨身，
   再用下面這些「捨身時效果加倍」的卡把血量換成傷害。 */
C({
  id: 'mk_wu', name: '虛人「ウー」', src: '永', cls: 'mokou', type: 'spell', cost: 2,
  text: '我方一個角色 +1/+2；捨身：改為 +3/+3。', target: T.aUnit,
  onPlay: function (s, c) {
    if (!c.target || !c.target.unit) return;
    if (sutemi(s, c.pi)) { logMsg(s, '『捨身』發動 — 強化提升'); buffUnit(c.target.unit, 3, 3); }
    else buffUnit(c.target.unit, 1, 2);
  }
});

C({
  id: 'mk_ono', name: '不滅「鳳凰之尾」', src: '永', cls: 'mokou', type: 'spell', cost: 2,
  text: '我方英雄受到 3 點傷害，抽 3 張。',
  onPlay: function (s, c) { dmgHero(s, c.pi, 3); draw(s, c.pi, 3); }
});
C({
  id: 'mk_metsuzai', name: '藤原「滅罪寺院傷」', src: '永', cls: 'mokou', type: 'spell', cost: 3,
  text: '對一個敵方角色造成 3 點傷害；捨身：改為 5 點並抽 1 張。', target: T.eUnit,
  onPlay: function (s, c) {
    if (!c.target || !c.target.unit) return;
    if (sutemi(s, c.pi)) {
      logMsg(s, '『捨身』發動 — 傷害提升為 5');
      dmgUnit(s, c.target.unit, 5);
      draw(s, c.pi, 1);
    } else dmgUnit(s, c.target.unit, 3);
  }
});
C({
  id: 'mk_possessed', name: '「Possessed by Phoenix」', src: '永', cls: 'mokou', type: 'spell', cost: 4,
  text: '我方一個角色本回合 +3/+0 並獲得疾走；捨身：再獲得貫通。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 3, 0, true);
    addKw(u, '疾走', true);
    if (u.summoned && u.attacksLeft <= 0) u.attacksLeft = 1;
    if (sutemi(s, c.pi)) { logMsg(s, '『捨身』發動 — 追加貫通'); addKw(u, '貫通', true); }
  }
});

C({
  id: 'mk_houou', name: '不死「火之鳥 -鳳翼天翔-」', src: '永', cls: 'mokou', type: 'spell', cost: 5,
  text: '對所有敵方角色造成 3 點傷害；捨身：改為 5 點。',
  onPlay: function (s, c) {
    var n = sutemi(s, c.pi) ? 5 : 3;
    if (n === 5) logMsg(s, '『捨身』發動 — 全體傷害提升為 5');
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, n); });
  }
});
C({
  id: 'mk_gaifu', name: '蓬萊「凱風快晴」', src: '永', cls: 'mokou', type: 'spell', cost: 6,
  text: '對敵方英雄造成 5 點傷害；捨身：改為 8 點。',
  onPlay: function (s, c) {
    var n = sutemi(s, c.pi) ? 8 : 5;
    if (n === 8) logMsg(s, '『捨身』發動 — 傷害提升為 8');
    dmgHero(s, foe(c.pi), n);
  }
});
C({
  id: 'bgm_mokou', name: '月まで届け、不死の煙', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_mokou',
  text: '發動：從牌庫檢索「藤原妹紅」。我方「人類」角色 +1/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '人類')) ? [1, 1] : null;
  }
});

/* ========== 不死的妹紅，與唯一解得掉她的「神隱」 ==========
   妹紅的「死なない程度の能力」在中階版本（n_mokou）只是死去召喚不死鳥；
   這張是把它推到極限：破壞她沒有用，她會原樣回來。

   要處理她只有三條路，全都是既有機制：
     神隱 —— 送出場外，不進墓地也不觸發死去
     封印 —— cleanupDeaths 是 if (d.onDeath && !u.silenced)，封印後復活不會發動
     回手 —— 8 費要重新打出來很痛（紫的「隙間送葬」）
   「把對手場地塞滿」不算解 —— cleanupDeaths 是先把格子清成 null 才觸發死去，
   她永遠有自己那一格可以回來。 */

/* 蓬萊的兩位不死者。
   身材刻意做得很差（8 費只有 4/4）—— 她們的價值不在打人，
   而在「對手每次處理她都是在幫你」：妹紅把對手的移除換成傷害，
   輝夜換成血量。要真正解決只有神隱、封印、回手三條路。 */

C({
  id: 'n_mokou_immortal', tribe: ['人類'], name: '藤原妹紅（不死）', src: '永', cls: 'neutral',
  type: 'unit', cost: 8, atk: 4, hp: 4, works: ['永'],
  text: '死去：對敵方英雄造成 3 點傷害，並召喚一個「藤原妹紅（不死）」。（被「神隱」或「封印」時不會發動）',
  onDeath: function (s, pi, u) {
    dmgHero(s, foe(pi), 3);
    summon(s, pi, 'n_mokou_immortal', {});
  }
});

C({
  id: 'n_kaguya_immortal', tribe: ['月人'], name: '蓬萊山輝夜（不死）', src: '永', cls: 'neutral',
  type: 'unit', cost: 8, atk: 4, hp: 4, works: ['永'],
  text: '死去：我方英雄回復 3 點，並召喚一個「蓬萊山輝夜（不死）」。（被「神隱」或「封印」時不會發動）',
  onDeath: function (s, pi, u) {
    healHero(s, pi, 3);
    summon(s, pi, 'n_kaguya_immortal', {});
  }
});

C({
  id: 'n_sp_kamikakushi', set: '基', name: '神隱', src: '永', cls: 'neutral', type: 'spell', cost: 6,
  text: '神隱一個敵方角色。',
  target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) banishUnit(s, c.target.unit); }
});


/* ========== 上白澤慧音：森羅結界與守護 ==========
   技能每回合白給一層護盾（所以要靈 3）。
   她的卡把「被打不死」變成資源：疊護盾、加守護，
   再用「我方有幾個帶護盾的角色」當成收頭的計數。 */

C({
  id: 'ke_ken', name: '神符「三種之神器 劍」', src: '永', cls: 'keine', type: 'spell', cost: 3,
  text: '我方一個角色 +2/+0 並獲得一層森羅結界。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 2, 0);
    addBarrier(s, u, 1);
  }
});

C({
  id: 'ke_tama', name: '國符「三種之神器 玉」', src: '永', cls: 'keine', type: 'spell', cost: 3,
  text: '我方一個角色 +0/+3 並獲得守護。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 0, 3);
    addKw(u, '守護');
  }
});

C({
  id: 'ke_kagami', name: '神符「三種之神器 鏡」', src: '永', cls: 'keine', type: 'spell', cost: 4,
  text: '我方一個角色獲得兩層森羅結界，抽 1 張。', target: T.aUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) addBarrier(s, c.target.unit, 2);
    draw(s, c.pi, 1);
  }
});

C({
  id: 'ke_amaterasu', name: '光符「アマテラス」', src: '永', cls: 'keine', type: 'spell', cost: 6,
  text: '我方所有角色 +1/+1 並各獲得一層森羅結界。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { buffUnit(u, 1, 1); addBarrier(s, u, 1); });
  }
});

C({
  id: 'ke_kioku', name: '覺神「神代的記憶」', src: '永', cls: 'keine', type: 'spell', cost: 5,
  text: '對所有敵方角色造成傷害，點數等於我方帶有森羅結界的角色數（最多 4）。',
  onPlay: function (s, c) {
    var n = Math.min(4, unitsOf(s, c.pi).filter(function (u) { return (u.barrier || 0) > 0; }).length);
    if (!n) { logMsg(s, '我方沒有帶森羅結界的角色，記憶落空'); return; }
    logMsg(s, '森羅結界 ' + n + ' 個 — 全體 ' + n + ' 點傷害');
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, n); });
  }
});

C({
  id: 'ke_jikeidan', tribe: ['人類'], name: '人間之里的自警團', src: '永', cls: 'keine',
  // 3 費時這張一張就佔 20 個百分點 —— 守護加森羅結界等於「第一次傷害免疫的牆」，
  // 而中立的紅美鈴同樣 3 費只有 2/5 守護。多付一費才合理。
  type: 'unit', cost: 4, atk: 2, hp: 4, kw: ['守護'], works: ['永'],
  text: '守護。登場：此角色獲得一層森羅結界。',
  onPlay: function (s, c) { if (c.self) addBarrier(s, c.self, 1); }
});

C({
  id: 'ke_hakutaku', tribe: ['妖獸'], name: '白澤的化身', src: '永', cls: 'keine',
  type: 'unit', cost: 5, atk: 3, hp: 5, works: ['永'],
  text: '登場：我方所有帶有森羅結界的角色 +2/+2。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { if ((u.barrier || 0) > 0) buffUnit(u, 2, 2); });
  }
});

C({
  id: 'bgm_keine', name: 'プレインエイジア', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_keine',
  text: '發動：從牌庫檢索「上白澤慧音」。我方帶有森羅結界的角色 +1/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && (u.barrier || 0) > 0) ? [1, 0] : null;
  }
});


/* ========== 莉格露·奈特巴格：蟲群 ==========
   技能每回合兩隻會飛的小蟲。飛行無視守護，
   所以她的壓迫來自「擋不住」而不是「打得大」——
   單隻永遠很小，靠數量與全體加成滾起來。 */

C({
  id: 'wr_firefly', tribe: ['妖怪'], name: '螢火蟲', src: '永', cls: 'wriggle', type: 'unit',
  cost: 1, atk: 1, hp: 1, kw: ['飛行'], token: true, works: ['永'],
  text: '飛行。莉格露召喚出來的小蟲。'
});

C({
  id: 'wr_bug', tribe: ['妖怪'], name: '夜之蟲', src: '永', cls: 'wriggle', type: 'unit',
  cost: 2, atk: 1, hp: 2, kw: ['飛行'], works: ['永'],
  text: '飛行。登場：我方其他「飛行」角色 +1/+0。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) {
      if (u !== c.self && hasKw(u, '飛行')) buffUnit(u, 1, 0);
    });
  }
});

C({
  id: 'wr_shigure', name: '蟲符「蟲時雨」', src: '永', cls: 'wriggle', type: 'spell', cost: 4,
  text: '召喚三隻 1/1 且有飛行的「螢火蟲」。',
  onPlay: function (s, c) {
    for (var i = 0; i < 3; i++) summon(s, c.pi, 'wr_firefly', {});
  }
});

C({
  id: 'wr_kousei', name: '螢符「地上的恆星」', src: '永', cls: 'wriggle', type: 'spell', cost: 3,
  text: '我方所有「飛行」角色 +1/+1。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { if (hasKw(u, '飛行')) buffUnit(u, 1, 1); });
  }
});

C({
  id: 'wr_butterfly', name: '蝶符「バタフライストーム」', src: '永', cls: 'wriggle',
  type: 'spell', cost: 5,
  text: '我方每有一個「飛行」角色，對敵方英雄造成 1 點傷害。',
  onPlay: function (s, c) {
    var n = unitsOf(s, c.pi).filter(function (u) { return hasKw(u, '飛行'); }).length;
    if (!n) { logMsg(s, '我方沒有飛行角色'); return; }
    logMsg(s, '飛行 ' + n + ' 個 — 對英雄 ' + n + ' 點傷害');
    dmgHero(s, foe(c.pi), n);
  }
});

C({
  id: 'wr_wd_yamiyo', name: '蟲之夜', src: '永', cls: 'wriggle', type: 'ward', cost: 3,
  text: '我方「飛行」角色 +0/+1。你的回合開始時，召喚一隻「螢火蟲」。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasKw(u, '飛行')) ? [0, 1] : null;
  },
  onTurnStart: function (s, owner) { summon(s, owner, 'wr_firefly', {}); }
});

C({
  id: 'bgm_wriggle', name: '蠢々秋月 ～ Mooned Insect', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_wriggle',
  text: '發動：從牌庫檢索「莉格露·奈特巴格」。我方「飛行」角色 +1/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasKw(u, '飛行')) ? [1, 0] : null;
  }
});


/* ========== 米斯蒂婭·蘿蕾拉：夜盲 ==========
   她不殺人，只讓對手看不見 —— 削攻擊力、擋攻擊。
   對手的場面還在，但打不動；她靠這段時間慢慢把血量磨完。 */

C({
  id: 'my_song', name: '夜盲「夜雀之歌」', src: '永', cls: 'mystia', type: 'spell', cost: 3,
  text: '所有敵方角色的攻擊力 -1，且本回合無法攻擊。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) {
      buffUnit(u, -1, 0);
      u.cantAttack = true;
    });
  }
});

C({
  id: 'my_moth', name: '蛾符「天蛾的蠱道」', src: '永', cls: 'mystia', type: 'spell', cost: 4,
  text: '使一個敵方角色的攻擊力永久變為 0。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.atkZero = true; }
});

C({
  id: 'my_chorus', name: '夜雀「真夜中的合唱指揮」', src: '永', cls: 'mystia', type: 'spell', cost: 5,
  text: '對每個攻擊力 2 以下的敵方角色造成 4 點傷害。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { if (atkOf(u) <= 2) dmgUnit(s, u, 4); });
  }
});

C({
  id: 'my_owl', tribe: ['妖怪'], name: '夜之梟', src: '永', cls: 'mystia', type: 'unit',
  cost: 3, atk: 2, hp: 4, kw: ['飛行'], works: ['永'],
  text: '飛行。登場：一個敵方角色的攻擊力 -2。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, -2, 0); }
});

C({
  id: 'my_sparrow', tribe: ['妖怪'], name: '夜雀', src: '永', cls: 'mystia', type: 'unit',
  cost: 2, atk: 2, hp: 2, kw: ['飛行'], works: ['永'],
  // 引擎沒有「攻擊時」的鉤子，所以改成登場效果，不要寫卡面做不到的事
  text: '飛行。登場：使一個敵方角色本回合無法攻擊。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.cantAttack = true; }
});

C({
  id: 'my_wd_yoru', name: '鳥目之夜', src: '永', cls: 'mystia', type: 'ward', cost: 3,
  text: '你的回合開始時，攻擊力最高的敵方角色 -1 攻擊力。',
  onTurnStart: function (s, owner) {
    var list = unitsOf(s, foe(owner));
    if (!list.length) return;
    var top = list[0];
    list.forEach(function (u) { if (atkOf(u) > atkOf(top)) top = u; });
    buffUnit(top, -1, 0);
  }
});

C({
  id: 'bgm_mystia', name: '夜雀の歌声 ～ Night Bird', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_mystia',
  text: '發動：從牌庫檢索「米斯蒂婭·蘿蕾拉」。敵方角色 -1 攻擊力。',
  aura: function (s, owner, u) { return (u.owner !== owner) ? [-1, 0] : null; }
});

/* ========== 八意永琳：藥與反魂 ==========
   技能給角色一次「死不了」，對手的移除就得多花一次。
   她的卡把這件事推到極致：疊反魂、回血、把死亡當成資源。 */

C({
  id: 'ei_medicine', name: '藥符「壺中之藥」', src: '永', cls: 'eirin', type: 'spell', cost: 3,
  text: '我方一個角色獲得反魂，並回復所有生命。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    u.revive = (u.revive || 0) + 1;
    u.dmg = 0;
  }
});

C({
  id: 'ei_hourai', name: '藥符「蓬萊之藥」', src: '永', cls: 'eirin', type: 'spell', cost: 6,
  text: '我方所有角色獲得反魂。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { u.revive = (u.revive || 0) + 1; });
  }
});

C({
  id: 'ei_astro', name: '天文「天鵝座 α」', src: '永', cls: 'eirin', type: 'spell', cost: 4,
  text: '對所有敵方角色造成 2 點傷害，我方英雄回復 4 點。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, 2); });
    healHero(s, c.pi, 4);
  }
});

C({
  id: 'ei_mixture', name: '難題「新蓬萊之藥」', src: '永', cls: 'eirin', type: 'spell', cost: 2,
  text: '我方英雄回復 6 點；若我方有帶反魂的角色，改為回復 10 點。',
  onPlay: function (s, c) {
    var boost = unitsOf(s, c.pi).some(function (u) { return (u.revive || 0) > 0; });
    if (boost) logMsg(s, '藥效倍增');
    healHero(s, c.pi, boost ? 10 : 6);
  }
});

C({
  id: 'ei_usagi', tribe: ['月人'], name: '月之藥師', src: '永', cls: 'eirin', type: 'unit',
  cost: 4, atk: 3, hp: 4, works: ['永'],
  text: '登場：我方一個其他角色獲得反魂。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit;
    if (u && u !== c.self) u.revive = (u.revive || 0) + 1;
  }
});

C({
  id: 'ei_moonrabbit', tribe: ['月人'], name: '月兔', src: '永', cls: 'eirin', type: 'unit',
  cost: 2, atk: 2, hp: 2, works: ['永'],
  text: '死去：我方英雄回復 3 點。',
  onDeath: function (s, pi, u) { healHero(s, pi, 3); }
});

C({
  id: 'bgm_eirin', name: 'ヴォヤージュ1970', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_eirin',
  text: '發動：從牌庫檢索「八意永琳」。我方「月人」角色 +1/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '月人')) ? [1, 1] : null;
  }
});


/* ========== 鈴仙·優曇華院·因幡：狂氣 ==========
   她不自己出手，讓對手的角色互相殘殺。
   對手鋪得愈滿她愈強 —— 全場唯一「對手鋪場反而危險」的流派。 */

C({
  id: 're_lunatic', name: '狂符「幻視盲聽」', src: '永', cls: 'reisen', type: 'spell', cost: 4,
  text: '使兩個隨機的敵方角色互相攻擊。',
  onPlay: function (s, c) {
    var list = unitsOf(s, foe(c.pi));
    if (list.length < 2) { logMsg(s, '對方角色不足兩個'); return; }
    var a = pick(s, list);
    var b = pick(s, list.filter(function (x) { return x !== a; }));
    forceClash(s, a, b);
  }
});

C({
  id: 're_discarder', name: '狂視「Illusion Seeker」', src: '永', cls: 'reisen', type: 'spell', cost: 5,
  text: '使一個敵方角色攻擊所有其他敵方角色。', target: T.eUnit,
  onPlay: function (s, c) {
    var a = c.target && c.target.unit; if (!a) return;
    unitsOf(s, foe(c.pi)).slice().forEach(function (b) {
      if (b !== a && !a.dead) forceClash(s, a, b);
    });
  }
});

C({
  id: 're_wave', name: '波符「幻朧月睨」', src: '永', cls: 'reisen', type: 'spell', cost: 3,
  text: '所有敵方角色的攻擊力 -2。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { buffUnit(u, -2, 0); });
  }
});

C({
  id: 're_madness', tribe: ['月人'], name: '狂氣的月兔', src: '永', cls: 'reisen', type: 'unit',
  cost: 3, atk: 3, hp: 3, works: ['永'],
  text: '登場：敵方角色每有 3 個，對敵方英雄造成 2 點傷害。',
  onPlay: function (s, c) {
    var n = Math.floor(unitsOf(s, foe(c.pi)).length / 3) * 2;
    if (n > 0) { logMsg(s, '對方場面擁擠 — 對英雄 ' + n + ' 點傷害'); dmgHero(s, foe(c.pi), n); }
  }
});

C({
  id: 're_eye', tribe: ['月人'], name: '紅色的眼', src: '永', cls: 'reisen', type: 'unit',
  cost: 2, atk: 1, hp: 4, works: ['永'],
  text: '登場：一個敵方角色本回合無法攻擊。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.cantAttack = true; }
});

C({
  id: 're_wd_kyouki', name: '狂氣之波', src: '永', cls: 'reisen', type: 'ward', cost: 4,
  text: '你的回合開始時，若敵方角色有 3 個以上，使兩個隨機的敵方角色互相攻擊。',
  onTurnStart: function (s, owner) {
    var list = unitsOf(s, foe(owner));
    if (list.length < 3) return;
    var a = pick(s, list);
    var b = pick(s, list.filter(function (x) { return x !== a; }));
    forceClash(s, a, b);
  }
});

C({
  id: 'bgm_reisen', name: '狂気の瞳 ～ Invisible Full Moon', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_reisen',
  text: '發動：從牌庫檢索「鈴仙·優曇華院·因幡」。敵方角色 -1 攻擊力。',
  aura: function (s, owner, u) { return (u.owner !== owner) ? [-1, 0] : null; }
});


/* ========== 因幡帝：幸運 ==========
   技能把便宜的卡變成免費。她的卡走同一條路：
   讓費用消失、讓小卡變大，靠「白賺的那一點」累積成優勢。 */

C({
  id: 'te_luck', name: '兔符「因幡的素兔」', src: '永', cls: 'tewi', type: 'spell', cost: 2,
  text: '抽 2 張，它們的費用各 -1。',
  onPlay: function (s, c) {
    var p = s.players[c.pi];
    var before = p.hand.length;
    draw(s, c.pi, 2);
    for (var i = before; i < p.hand.length; i++) p.hand[i].costMod -= 1;
  }
});

C({
  id: 'te_fortune', name: '幸運的加護', src: '永', cls: 'tewi', type: 'spell', cost: 1,
  text: '我方一個角色 +2/+2。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, 2, 2); }
});

C({
  id: 'te_trap', name: '罠符「Ultimate Buried」', src: '永', cls: 'tewi', type: 'spell', cost: 3,
  text: '對一個敵方角色造成 5 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 5); }
});

C({
  id: 'te_rabbit', tribe: ['妖怪'], name: '因幡的兔', src: '永', cls: 'tewi', type: 'unit',
  cost: 1, atk: 1, hp: 2, works: ['永'],
  text: '登場：手牌中隨機一張卡費用 -1。',
  onPlay: function (s, c) {
    var t = pick(s, s.players[c.pi].hand);
    if (t) { t.costMod -= 1; logMsg(s, '「' + def(t.defId).name + '」費用 -1'); }
  }
});

C({
  id: 'te_lucky', tribe: ['妖怪'], name: '幸運的兔', src: '永', cls: 'tewi', type: 'unit',
  cost: 3, atk: 3, hp: 3, works: ['永'],
  text: '登場：探尋(3)：從費用 2 以下的卡中選 1 張，其費用變為 0。',
  onPlay: function (s, c) {
    discoverWhere(s, c.pi,
      function (d) { return d.cost <= 2 && d.type !== 'bgm'; },
      3, '探尋「幸運」',
      function (s2, pi, card) { card.costMod -= 99; });
  }
});

C({
  id: 'te_wd_kouun', name: '幸運之兆', src: '永', cls: 'tewi', type: 'ward', cost: 3,
  text: '你的回合開始時，手牌中隨機一張卡費用 -1。',
  onTurnStart: function (s, owner) {
    var t = pick(s, s.players[owner].hand);
    if (t) t.costMod -= 1;
  }
});

C({
  id: 'bgm_tewi', name: 'お宇佐さまの素い幡', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_tewi',
  text: '發動：從牌庫檢索「因幡帝」。你的回合開始時，手牌最右的卡費用 -1。',
  onTurnStart: function (s, owner) {
    var h = s.players[owner].hand;
    if (h.length) h[h.length - 1].costMod -= 1;
  }
});


/* ========== 蓬萊山輝夜：五個難題 ==========
   技能每回合把一個難題洗進手裡（費用 -2）。
   難題本身就是她的五張專屬大招 —— 各自對應原作那五樣不可能的寶物，
   單張都比同費強，但你抽到哪一個由不得你。 */

C({
  id: 'ka_hourai', name: '難題「蓬萊的玉枝 -永夜的雕刻家-」', src: '永', cls: 'kaguya',
  // 全體 +2/+2 且沒有族群限制 —— 大妖精的「妖精的成長」3 費只給妖精 +1/+1
  type: 'spell', cost: 7, nandai: true,
  text: '我方所有角色 +2/+2。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { buffUnit(u, 2, 2); });
  }
});

C({
  id: 'ka_hachi', name: '難題「佛之石缽 -不碎的意志-」', src: '永', cls: 'kaguya',
  // 慧音的「アマテラス」6 費才給「+1/+1 ＋一層護盾」，這張原本 5 費就給兩層護盾
  type: 'spell', cost: 6, nandai: true,
  text: '我方所有角色各獲得兩層森羅結界。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { addBarrier(s, u, 2); });
  }
});

C({
  id: 'ka_koromo', name: '難題「火鼠的皮衣 -燒不盡的心-」', src: '永', cls: 'kaguya',
  type: 'spell', cost: 4, nandai: true,
  text: '我方英雄回復 8 點，並抽 1 張。',
  onPlay: function (s, c) { healHero(s, c.pi, 8); draw(s, c.pi, 1); }
});

C({
  id: 'ka_tama', name: '難題「龍頸之玉 -五色的彈丸-」', src: '永', cls: 'kaguya',
  // 魔理沙的「ドラゴンメテオ」6 費打 4 次，這張原本 5 費就打 5 次
  type: 'spell', cost: 6, nandai: true,
  text: '對隨機的敵方目標造成 2 點傷害 5 次。',
  onPlay: function (s, c) {
    for (var i = 0; i < 5; i++) {
      var t = pick(s, unitsOf(s, foe(c.pi)));
      if (t) dmgUnit(s, t, 2); else dmgHero(s, foe(c.pi), 2);
      cleanupDeaths(s);
    }
  }
});

C({
  id: 'ka_kai', name: '難題「燕的子安貝 -永遠的乳白色-」', src: '永', cls: 'kaguya',
  type: 'spell', cost: 7, nandai: true,
  text: '神隱一個敵方角色，並抽 2 張。', target: T.eUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) banishUnit(s, c.target.unit);
    draw(s, c.pi, 2);
  }
});

C({
  id: 'ka_eternity', tribe: ['月人'], name: '永遠亭的居民', src: '永', cls: 'kaguya',
  type: 'unit', cost: 3, atk: 2, hp: 5, works: ['永'],
  text: '登場：若你手上有「難題」，此角色 +2/+0。',
  onPlay: function (s, c) {
    var has = s.players[c.pi].hand.some(function (h) { return def(h.defId).nandai; });
    if (has && c.self) buffUnit(c.self, 2, 0);
  }
});

C({
  id: 'bgm_kaguya', name: '竹取飛翔 ～ Lunatic Princess', src: '永', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_kaguya',
  text: '發動：從牌庫檢索「蓬萊山輝夜」。你手上的「難題」費用 -1。',
  costMod: function (s, owner, d, casterPi) {
    return (casterPi === owner && d.nandai) ? -1 : 0;
  }
});

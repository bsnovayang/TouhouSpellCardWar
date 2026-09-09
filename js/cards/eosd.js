/* ============================================================
   東方符卡大戰 — 卡表：第六彈・東方紅魔鄉 (TH06 EoSD)
   紅魔館一系的角色與符卡
   共 49 張。要新增這一彈的卡，直接在本檔加 C({...})。
   ============================================================ */
'use strict';

C({ id: 'n_fairy', works: [], set: '基', tribe: ['妖精'], name: '妖精', src: '紅', cls: 'neutral', type: 'unit', cost: 1, atk: 1, hp: 2, text: '幻想鄉隨處可見的雜魚。' });

C({
  id: 'n_rumia', tribe: ['妖怪'], name: '露米婭', src: '紅', cls: 'neutral', type: 'unit', cost: 1, atk: 2, hp: 1, kw: ['隱行'],
  text: '隱行。宵闇的妖怪，那個是可以吃的嗎？'
});

C({ id: 'n_maid', tribe: ['妖精'], name: '紅魔館的女僕', src: '紅', cls: 'neutral', type: 'unit', cost: 1, atk: 1, hp: 2, text: '被咲夜使喚的普通妖精女僕。' });

C({
  id: 'n_koakuma', tribe: ['惡魔'], name: '小惡魔', src: '紅', cls: 'neutral', type: 'unit', cost: 2, atk: 2, hp: 2,
  text: '登場：抽 1 張。', onPlay: function (s, c) { draw(s, c.pi, 1); }
});

C({
  id: 'n_cirno', tribe: ['妖精'], name: '琪露諾', src: '紅', cls: 'neutral', type: 'unit', cost: 2, atk: 2, hp: 3,
  text: '登場：使一個敵方角色冰結。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) freeze(s, c.target.unit); }
});

C({
  id: 'n_daiyousei', tribe: ['妖精'], name: '大妖精', src: '紅', cls: 'neutral', type: 'unit', cost: 2, atk: 1, hp: 4,
  text: '登場：我方一個角色 +0/+2。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, 0, 2); }
});

C({ id: 'n_meiling', tribe: ['妖怪'], name: '紅美鈴', src: '紅', cls: 'neutral', type: 'unit', cost: 3, atk: 2, hp: 5, kw: ['守護'], text: '守護。中國，你在打瞌睡吧。' });

C({
  id: 'n_patchouli', tribe: ['魔法使'], name: '帕秋莉·諾蕾姬', src: '紅', cls: 'neutral', type: 'unit', cost: 4, atk: 3, hp: 4,
  text: '符卡使 1：你每發動一張符卡，此角色永久 +1/+0。',
  onAllySpell: function (s, u) { buffUnit(u, 1, 0); }
});

C({
  id: 'n_sp_barrier', name: '博麗大結界', src: '紅', cls: 'neutral', type: 'spell', cost: 3,
  text: '抽 2 張。', onPlay: function (s, c) { draw(s, c.pi, 2); }
});

C({
  id: 'n_sp_seal', name: '靈符「夢想封印」', src: '紅', cls: 'neutral', type: 'spell', cost: 2,
  text: '對一個角色造成 3 點傷害。', target: T.anyUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 3); }
});

C({
  id: 'n_wd_shimenawa', set: '基',  name: '注連繩結界', src: '紅', cls: 'neutral', type: 'ward', cost: 2,
  text: '我方角色 +0/+1。',
  aura: function (s, owner, u) { return u.owner === owner ? [0, 1] : null; }
});

C({
  id: 'n_wd_fuma', name: '夢符「封魔陣」', src: '紅', cls: 'neutral', type: 'ward', cost: 3,
  text: '你的回合開始時，對隨機一個敵方角色造成 1 點傷害。',
  onTurnStart: function (s, owner) {
    var t = pick(s, unitsOf(s, foe(owner)));
    if (t) { logMsg(s, '「封魔陣」對「' + def(t.defId).name + '」造成 1'); dmgUnit(s, t, 1); }
  }
});

C({
  id: 'n_fd_shrine', name: '博麗神社', src: '紅', cls: 'neutral', type: 'field', cost: 4,
  text: '你的回合開始時多抽 1 張。',
  onTurnStart: function (s, owner) { logMsg(s, '「博麗神社」— 多抽 1 張'); draw(s, owner, 1); }
});

C({
  id: 'n_fd_scarlet', name: '紅魔館', src: '紅', cls: 'neutral', type: 'field', cost: 3,
  text: '我方角色 +1/+0。',
  aura: function (s, owner, u) { return u.owner === owner ? [1, 0] : null; }
});

C({
  id: 'r_musou', name: '靈符「夢想封印·散」', src: '紅', cls: 'reimu', type: 'spell', cost: 3,
  text: '對一個敵方角色造成 4 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 4); }
});

C({
  id: 'r_taiji', name: '妖怪退治', src: '紅', cls: 'reimu', type: 'spell', cost: 3,
  text: '對一個敵方角色造成 2 點傷害，抽 1 張。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 2); draw(s, c.pi, 1); }
});

C({
  id: 'r_nijuu', name: '二重結界', src: '紅', cls: 'reimu', type: 'ward', cost: 3,
  text: '對手的符卡費用 +1。',
  costMod: function (s, owner, d, casterPi) { return (casterPi !== owner && d.type === 'spell') ? 1 : 0; }
});

C({
  id: 'm_hijou', name: '戀符「非常識彈」', src: '紅', cls: 'marisa', type: 'spell', cost: 2,
  text: '對一個敵方目標（角色或英雄）造成 3 點傷害。', target: T.eChar,
  onPlay: function (s, c) {
    if (!c.target) return;
    if (c.target.hero) dmgHero(s, c.target.pi, 3); else dmgUnit(s, c.target.unit, 3);
  }
});

C({
  id: 'm_mushroom', tribe: ['妖怪'], name: '魔法之森的妖怪', src: '紅', cls: 'marisa', type: 'unit', cost: 2, atk: 2, hp: 2,
  text: '死去：抽 1 張。',
  onDeath: function (s, pi, u) { draw(s, pi, 1); }
});

C({
  id: 'm_spark', name: '魔砲「Final Spark」', src: '紅', cls: 'marisa', type: 'spell', cost: 4,
  text: '對一個目標造成 6 點傷害。', target: T.eChar,
  onPlay: function (s, c) {
    if (!c.target) return;
    if (c.target.hero) dmgHero(s, c.target.pi, 6); else dmgUnit(s, c.target.unit, 6);
  }
});

C({
  id: 'm_hakkero', name: '迷你八卦爐', src: '紅', cls: 'marisa', type: 'ward', cost: 3,
  text: '你每回合的第一張符卡費用 -1。',
  costMod: function (s, owner, d, casterPi) {
    if (casterPi !== owner || d.type !== 'spell') return 0;
    return (s.players[owner].spellsThisTurn || 0) === 0 ? -1 : 0;
  }
});

C({
  id: 'm_forest', name: '魔法之森', src: '紅', cls: 'marisa', type: 'field', cost: 3,
  text: '你的符卡造成的傷害 +1。', spellDmg: 1
});

C({
  id: 's_knife', name: '銀符「彈幕刃」', src: '紅', cls: 'sakuya', type: 'spell', cost: 1,
  text: '對一個敵方角色造成 2 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 2); }
});

C({
  id: 's_doll', tribe: ['人偶'], name: '殺人人偶', src: '紅', cls: 'sakuya', type: 'unit', cost: 3, atk: 3, hp: 2, kw: ['疾走'],
  text: '疾走。'
});

C({
  id: 's_sakuyaworld', name: '幻在「清晰的世界」', src: '紅', cls: 'sakuya', type: 'spell', cost: 5,
  text: '我方所有角色本回合可再攻擊一次。',
  onPlay: function (s, c) { unitsOf(s, c.pi).forEach(function (u) { if (!u.summoned || hasKw(u, '疾走')) u.attacksLeft++; }); }
});

C({
  id: 'e_fuyajou', name: '紅符「不夜城紅」', src: '紅', cls: 'remilia', type: 'spell', cost: 3,
  text: '對一個敵方角色造成 3 點傷害，我方英雄回復 3。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 3); healHero(s, c.pi, 3); }
});

C({
  id: 'e_gungnir', name: '神槍「Spear the Gungnir」', src: '紅', cls: 'remilia', type: 'spell', cost: 4,
  text: '破壞一個敵方角色，並對我方英雄造成 3 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) { destroyUnit(s, c.target.unit); dmgHero(s, c.pi, 3); } }
});

C({
  id: 'e_scarletmoon', name: '命運的紅月', src: '紅', cls: 'remilia', type: 'spell', cost: 5,
  text: '對敵方英雄造成 4 點傷害，我方英雄回復 4 點。',
  onPlay: function (s, c) { dmgHero(s, foe(c.pi), 4); healHero(s, c.pi, 4); }
});

C({
  id: 'e_flandre', tribe: ['吸血鬼'], name: '芙蘭朵露·斯卡蕾特', src: '紅', cls: 'remilia', type: 'unit', cost: 6, atk: 7, hp: 5, kw: ['彈幕'],
  text: '彈幕（攻擊時對目標兩側的角色造成同等傷害）。'
});

/* ========== 博麗靈夢：捨身巫女 ========== */
C({
  id: 'r_watashi', name: '厄符「擺渡人」', src: '紅', cls: 'reimu', type: 'spell', cost: 1,
  text: '我方英雄受到 2 點傷害，抽 2 張。',
  onPlay: function (s, c) { dmgHero(s, c.pi, 2); draw(s, c.pi, 2); }
});
C({
  id: 'r_sekima', name: '靈符「斥魔陣」', src: '紅', cls: 'reimu', type: 'spell', cost: 2,
  text: '對一個敵方角色造成 2 點傷害；若它已被封印，改為 4 點。', target: T.eUnit,
  onPlay: function (s, c) {
    if (!c.target || !c.target.unit) return;
    var n = c.target.unit.silenced ? 4 : 2;
    if (n === 4) logMsg(s, '目標已被封印 — 傷害提升為 4');
    dmgUnit(s, c.target.unit, n);
  }
});
C({
  id: 'r_inori', name: '巫女的祈禱', src: '紅', cls: 'reimu', type: 'spell', cost: 3,
  text: '封印一個角色，抽 1 張。', target: T.anyUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) silence(s, c.target.unit);
    draw(s, c.pi, 1);
  }
});
C({
  id: 'r_onmyo', name: '寶符「陰陽寶玉」', src: '紅', cls: 'reimu', type: 'spell', cost: 4,
  text: '封印一個敵方角色，並對它造成 2 點傷害。', target: T.eUnit,
  onPlay: function (s, c) {
    if (!c.target || !c.target.unit) return;
    silence(s, c.target.unit);
    dmgUnit(s, c.target.unit, 2);
  }
});

C({
  id: 'm_madan', name: '符卡「魔彈」', src: '紅', cls: 'marisa', type: 'spell', cost: 1,
  text: '對一個敵方目標造成 1 點傷害；連奏 2：改為 3 點。', target: T.eChar,
  onPlay: function (s, c) {
    if (!c.target) return;
    var n = rensou(s, c.pi, 2) ? 3 : 1;
    if (n === 3) logMsg(s, '『連奏 2』發動 — 傷害提升為 3');
    if (c.target.hero) dmgHero(s, c.target.pi, n); else dmgUnit(s, c.target.unit, n);
  }
});
C({
  id: 'm_raikan', name: '光符「破魔的雷管」', src: '紅', cls: 'marisa', type: 'spell', cost: 2,
  text: '對一個敵方角色造成 2 點傷害；連奏 2：同時對敵方英雄造成 2 點傷害。', target: T.eUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 2);
    if (rensou(s, c.pi, 2)) { logMsg(s, '『連奏 2』發動 — 額外燒臉 2'); dmgHero(s, foe(c.pi), 2); }
  }
});
C({
  id: 'm_shop', name: '霧雨魔法店', src: '紅', cls: 'marisa', type: 'ward', cost: 3,
  text: '你的回合開始時，若你上個回合發動過 2 張以上符卡，抽 1 張。',
  onTurnStart: function (s, owner) {
    if ((s.players[owner].spellsLastTurn || 0) >= 2) {
      logMsg(s, '「霧雨魔法店」— 上回合連奏達標，抽 1 張');
      draw(s, owner, 1);
    }
  }
});
C({
  id: 'm_hat', name: '魔法使的帽子', src: '紅', cls: 'marisa', type: 'ward', cost: 4,
  text: '本回合已發動 2 張以上符卡時，你的符卡費用 -1。',
  costMod: function (s, owner, d, casterPi) {
    if (casterPi !== owner || d.type !== 'spell') return 0;
    return (s.players[owner].spellsThisTurn || 0) >= 2 ? -1 : 0;
  }
});

C({
  id: 'm_masterspark', name: '恋符「Master Spark」', src: '紅', cls: 'marisa', type: 'spell', cost: 5,
  text: '對敵方英雄造成 5 點傷害。',
  onPlay: function (s, c) { dmgHero(s, foe(c.pi), 5); }
});

/* ========== 十六夜咲夜：時間停止 ========== */
C({
  id: 's_maid2', tribe: ['妖精'], name: '紅魔館的侍女', src: '紅', cls: 'sakuya', type: 'unit', cost: 2, atk: 2, hp: 2, kw: ['疾走'],
  text: '疾走。被咲夜訓練過的妖精女僕。'
});
C({
  id: 's_inscribe', name: '傷符「幻痛」', src: '紅', cls: 'sakuya', type: 'spell', cost: 3,
  text: '我方一個角色本回合可再攻擊一次，並抽 1 張。', target: T.aUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) c.target.unit.attacksLeft++;
    draw(s, c.pi, 1);
  }
});

C({
  id: 's_clock', name: '幻在「クロックコープス」', src: '紅', cls: 'sakuya', type: 'spell', cost: 6,
  text: '我方一個角色本回合可以再攻擊三次。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.attacksLeft += 3; }
});

C({
  id: 'e_shoot', name: '紅符「Scarlet Shoot」', src: '紅', cls: 'remilia', type: 'spell', cost: 2,
  text: '對一個敵方角色造成 2 點傷害，我方英雄回復 2 點。', target: T.eUnit,
  onPlay: function (s, c) {
    if (!c.target || !c.target.unit) return;
    dmgUnit(s, c.target.unit, 2); healHero(s, c.pi, 2);
  }
});
C({
  id: 'e_night', tribe: ['妖獸'], name: '小蝙蝠', src: '紅', cls: 'remilia', type: 'unit', cost: 2, atk: 1, hp: 3, kw: ['吸血'],
  text: '吸血。'
});
C({
  id: 'e_vampire', tribe: ['妖獸'], name: '紅魔館的蝙蝠', src: '紅', cls: 'remilia', type: 'unit', cost: 4, atk: 3, hp: 3, kw: ['吸血'],
  text: '吸血。'
});
C({
  id: 'e_redmagic', name: '「Red Magic」', src: '紅', cls: 'remilia', type: 'spell', cost: 5,
  text: '對所有敵方角色造成 2 點傷害，我方英雄回復同等的總傷害量。',
  onPlay: function (s, c) {
    var total = 0;
    var bonus = spellBonus(s, c.pi);
    unitsOf(s, foe(c.pi)).forEach(function (u) {
      total += Math.min(2 + bonus, hpOf(u));
      dmgUnit(s, u, 2);
    });
    if (total > 0) { logMsg(s, '「Red Magic」回復 ' + total + ' 點'); healHero(s, c.pi, total); }
  }
});
C({
  id: 'e_mist', name: '紅霧異變', src: '紅', cls: 'remilia', type: 'field', cost: 6,
  text: '我方角色獲得吸血。',
  grantKw: function (s, owner, u) { return u.owner === owner ? '吸血' : null; }
});
C({
  id: 'c_reimu', tribe: ['人類'], name: '博麗靈夢', src: '紅', cls: 'neutral', type: 'unit',
  cost: 5, atk: 4, hp: 5, kw: ['飛行'], pair: 'c_yukari',
  text: '飛行。登場：對一個敵方角色造成 2 點傷害。人妖組（八雲紫）：此角色 +1/+1。',
  target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 2); },
  selfAura: function (s, u) { return paired(s, u) ? [1, 1] : null; }
});
C({
  id: 'c_marisa', tribe: ['人類', '魔法使'], name: '霧雨魔理沙', src: '紅', cls: 'neutral',
  type: 'unit', cost: 5, atk: 5, hp: 4, pair: 'c_alice',
  text: '登場：對敵方英雄造成 3 點傷害。人妖組（愛麗絲·瑪格特羅依德）：你每發動一張符卡，此角色 +1/+0。',
  onPlay: function (s, c) { dmgHero(s, foe(c.pi), 3); },
  onAllySpell: function (s, u) { if (paired(s, u)) buffUnit(u, 1, 0); }
});
C({
  id: 'c_sakuya', tribe: ['人類'], name: '十六夜咲夜', src: '紅', cls: 'neutral', type: 'unit',
  cost: 5, atk: 4, hp: 4, pair: 'c_remilia',
  text: '登場：我方一個角色本回合可再攻擊一次。人妖組（蕾米莉亞·斯卡蕾特）：此角色 +2/+1。',
  target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) c.target.unit.attacksLeft++; },
  selfAura: function (s, u) { return paired(s, u) ? [2, 1] : null; }
});
C({
  id: 'c_remilia', tribe: ['吸血鬼'], name: '蕾米莉亞·斯卡蕾特', src: '紅', cls: 'neutral',
  type: 'unit', cost: 5, atk: 4, hp: 4, kw: ['吸血'], pair: 'c_sakuya',
  text: '吸血。登場：對一個敵方角色造成 2 點傷害。人妖組（十六夜咲夜）：此角色 +2/+1。',
  target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 2); },
  selfAura: function (s, u) { return paired(s, u) ? [2, 1] : null; }
});

/* ========== BGM 卡 ==========
   全場只有一個 BGM 播放器，新的會蓋過舊的（包含對手的）。
   牌組只能放 1 張；發動後檢索敘述指定的角色，並讓對手下回合不能發動 BGM。
   自己的第 4 回合，牌組裡的 BGM 卡會自動上手。 */
C({
  id: 'bgm_reimu', name: '少女綺想曲 ～ Dream Battle', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_reimu',
  text: '發動：從牌庫檢索「博麗靈夢」。我方「守護」角色 +0/+2。',
  aura: function (s, owner, u) { return (u.owner === owner && hasKw(u, '守護')) ? [0, 2] : null; }
});
C({
  id: 'bgm_marisa', name: '恋色マスタースパーク', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_marisa',
  text: '發動：從牌庫檢索「霧雨魔理沙」。你的符卡造成的傷害 +1。',
  spellDmg: 1
});
C({
  id: 'bgm_sakuya', name: 'メイドと血の懐中時計', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_sakuya',
  text: '發動：從牌庫檢索「十六夜咲夜」。我方「疾走」角色 +1/+1。',
  aura: function (s, owner, u) { return (u.owner === owner && hasKw(u, '疾走')) ? [1, 1] : null; }
});
C({
  id: 'bgm_remilia', name: '亡き王女の為のセプテット', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_remilia',
  text: '發動：從牌庫檢索「蕾米莉亞·斯卡蕾特」。我方「吸血」角色 +1/+0。',
  aura: function (s, owner, u) { return (u.owner === owner && hasKw(u, '吸血')) ? [1, 0] : null; }
});

/* ========== 霧雨魔理沙：符卡引擎（連奏魔女） ==========
   技能每回合抽 1 張並降 1 費 → 一回合能連打多張便宜符卡
   → 觸發連奏、把「符卡使」角色養大 → 用隨機多段與全體傷害清場 → Spark 收頭。 */
C({
  id: 'm_grimoire', name: '魔導書', src: '紅', cls: 'marisa', type: 'ward', cost: 2,
  text: '你發動符卡時，隨機一個我方角色 +1/+0。',
  onAllySpell: function (s, owner) {
    var t = pick(s, unitsOf(s, owner));
    if (t) buffUnit(t, 1, 0);
  }
});

C({
  id: 'm_milkyway', name: '魔符「ミルキーウェイ」', src: '紅', cls: 'marisa', type: 'spell', cost: 2,
  text: '對隨機的敵方角色造成 1 點傷害 3 次（沒有敵方角色時改為打敵方英雄）。',
  onPlay: function (s, c) {
    for (var i = 0; i < 3; i++) {
      var foes = unitsOf(s, foe(c.pi)).filter(function (u) { return canTargetUnit(s, c.pi, u); });
      if (foes.length) dmgUnit(s, pick(s, foes), 1);
      else dmgHero(s, foe(c.pi), 1);
      cleanupDeaths(s);
    }
  }
});
C({
  id: 'm_blazing', name: '彗星「ブレイジングスター」', src: '紅', cls: 'marisa', type: 'spell', cost: 5,
  text: '對所有敵方角色造成 3 點傷害。',
  onPlay: function (s, c) { unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, 3); }); }
});

/* ========== 依作品觸發的結界（每包一張） ========== */
C({
  id: 'e_wd_eosd', name: '紅魔館結界', src: '紅', cls: 'neutral', type: 'ward', cost: 3,
  text: '你召喚有收錄於「東方紅魔鄉」的角色時，該角色 +1/+0。',
  onAllySummon: function (s, owner, u) {
    if (!unitAppearsIn(u, '紅')) return;
    buffUnit(u, 1, 0);
    logMsg(s, '「紅魔館結界」— 「' + def(u.defId).name + '」+1/+0');
  }
});

/* ############################################################
   紅魔館七人的職業卡
   每一組都對著該英雄的技能設計，符卡名以原作實際出現的為主。
   ############################################################ */

/* ========== 露米婭：宵闇（全體隱行） ==========
   技能每回合給一個角色隱行。隱行在本作是「不能被指定、不算守護、
   攻擊後解除」—— 所以她的玩法是鋪場 → 全體隱行躲過點殺 → 一次總攻。
   下面的卡負責把「隱行」從保命手段變成主動的傷害來源。 */

C({
  id: 'ru_nightbird', name: '夜符「ナイトバード」', src: '紅', cls: 'rumia', type: 'spell', cost: 4,
  text: '我方所有角色獲得隱行，並在本回合 +1/+0。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) { u.stealth = true; buffUnit(u, 1, 0, true); });
    logMsg(s, '宵闇降臨 — 我方全體進入隱行');
  }
});

C({
  id: 'ru_dimarcation', name: '闇符「ディマーケイション」', src: '紅', cls: 'rumia', type: 'spell', cost: 3,
  text: '我方一個角色 +2/+2 並獲得隱行。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 2, 2);
    u.stealth = true;
  }
});

C({
  id: 'ru_moonlight', name: '月符「ムーンライトレイ」', src: '紅', cls: 'rumia', type: 'spell', cost: 2,
  text: '對一個敵方角色造成 3 點傷害；若我方有隱行的角色，抽 1 張。', target: T.eUnit,
  onPlay: function (s, c) {
    if (!c.target || !c.target.unit) return;
    dmgUnit(s, c.target.unit, 3);
    var hid = unitsOf(s, c.pi).some(function (u) { return u.stealth; });
    if (hid) { logMsg(s, '暗處有伏兵 — 抽 1 張'); draw(s, c.pi, 1); }
  }
});

C({
  id: 'ru_yamiyousei', tribe: ['妖精'], name: '闇之妖精', src: '紅', cls: 'rumia', type: 'unit',
  cost: 2, atk: 3, hp: 1, kw: ['隱行'], works: ['紅'],
  text: '隱行。躲在宵闇裡的妖精，數量比看得見的多。'
});

C({
  id: 'ru_kurayami', tribe: ['妖怪'], name: '闇中的妖怪', src: '紅', cls: 'rumia', type: 'unit',
  cost: 4, atk: 3, hp: 4, kw: ['隱行'], works: ['紅'],
  text: '隱行。其他我方隱行的角色 +2/+0。',
  // 攻擊會解除隱行，但 doAttack 算傷害時還沒重算光環 ——
  // 所以從暗處打出的那一擊帶得走加成，之後才現形。這正是想要的行為。
  unitAura: function (s, self, u) { return u.stealth ? [2, 0] : null; }
});

C({
  id: 'ru_wd_yoiyami', name: '宵闇結界', src: '紅', cls: 'rumia', type: 'ward', cost: 3,
  text: '我方角色登場時獲得隱行。',
  onAllySummon: function (s, owner, u) { u.stealth = true; }
});

C({
  id: 'bgm_rumia', name: 'ほおずきみたいに紅い魂', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_rumia',
  text: '發動：從牌庫檢索「露米婭」。我方隱行的角色 +1/+0。',
  aura: function (s, owner, u) { return (u.owner === owner && u.stealth) ? [1, 0] : null; }
});

/* ========== 琪露諾：全體冰結 ==========
   技能是「冰結一個；已冰結的改為生命 -1」—— 前期擋刀，後期把凍住的東西慢慢削死。
   職業卡負責把「凍住」從單點延伸成全場，並給被凍住的目標追加懲罰。 */

C({
  id: 'ci_perfectfreeze', name: '凍符「パーフェクトフリーズ」', src: '紅', cls: 'cirno', type: 'spell', cost: 4,
  text: '使所有敵方角色冰結。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { freeze(s, u); });
    logMsg(s, '全場凍結');
  }
});

C({
  id: 'ci_icicle', name: '冰符「アイシクルフォール」', src: '紅', cls: 'cirno', type: 'spell', cost: 2,
  text: '對一個敵方角色造成 2 點傷害並使其冰結。', target: T.eUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    dmgUnit(s, u, 2);
    if (!u.dead) freeze(s, u);
  }
});

C({
  id: 'ci_diamond', name: '雪符「ダイアモンドブリザード」', src: '紅', cls: 'cirno', type: 'spell', cost: 3,
  text: '對所有敵方角色造成 1 點傷害；已被冰結的改為 3 點。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) {
      dmgUnit(s, u, isFrozen(u) ? 3 : 1);
    });
  }
});

C({
  id: 'ci_kanzen', name: '冷符「完全凍結」', src: '紅', cls: 'cirno', type: 'spell', cost: 6,
  text: '破壞所有被冰結的敵方角色。',
  onPlay: function (s, c) {
    var list = unitsOf(s, foe(c.pi)).filter(isFrozen);
    if (!list.length) { logMsg(s, '沒有被冰結的角色，「完全凍結」落空'); return; }
    list.forEach(function (u) { destroyUnit(s, u); });
  }
});

/* 本來這張也是「登場：冰結一個敵方角色」，跟中立的「琪露諾」同費同效果、
   數值還少一點 —— 專屬卡被中立卡完全壓過，沒有存在的理由。
   改成「收割已經凍住的目標」：不再是第六張冰結卡，而是把凍好的場面
   換成傷害，補上這個流派缺的收頭手段。 */
C({
  id: 'ci_icefairy', tribe: ['妖精'], name: '冰之妖精', src: '紅', cls: 'cirno', type: 'unit',
  cost: 2, atk: 2, hp: 2, works: ['紅'],
  text: '登場：對每個被冰結的敵方角色造成 1 點傷害。',
  onPlay: function (s, c) {
    var list = unitsOf(s, foe(c.pi)).filter(isFrozen);
    if (!list.length) { logMsg(s, '對方沒有被冰結的角色'); return; }
    list.forEach(function (u) { dmgUnit(s, u, 1); });
  }
});

C({
  id: 'ci_wd_misty', name: '霧之湖結界', src: '紅', cls: 'cirno', type: 'ward', cost: 3,
  text: '你的回合結束時，對每個被冰結的敵方角色造成 1 點傷害。',
  onTurnEnd: function (s, owner) {
    unitsOf(s, foe(owner)).filter(isFrozen).forEach(function (u) { dmgUnit(s, u, 1); });
  }
});

C({
  id: 'bgm_cirno', name: 'おてんば恋娘', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_cirno',
  text: '發動：從牌庫檢索「琪露諾」。我方「妖精」角色 +1/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '妖精')) ? [1, 0] : null;
  }
});

/* ========== 大妖精：妖精增益 ==========
   技能每回合隨機給「妖精」+1/+1 兩次 —— 場上妖精愈多，技能命中愈準。
   所以她的職業卡不是強力單卡，而是「把妖精鋪滿」與「一次全體加成」。 */

C({
  id: 'da_swarm', name: '妖精大戰爭', src: '紅', cls: 'daiyousei', type: 'spell', cost: 4,
  text: '召喚三個「妖精」。',
  onPlay: function (s, c) {
    for (var i = 0; i < 3; i++) summon(s, c.pi, 'n_fairy', {});
  }
});

C({
  id: 'da_growth', name: '妖精的成長', src: '紅', cls: 'daiyousei', type: 'spell', cost: 3,
  text: '我方所有「妖精」角色 +1/+1。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) {
      if (hasTribe(def(u.defId), '妖精')) buffUnit(u, 1, 1);
    });
  }
});

C({
  id: 'da_gather', name: '妖精的呼喚', src: '紅', cls: 'daiyousei', type: 'spell', cost: 1,
  text: '從牌庫檢索一張「妖精」角色。',
  onPlay: function (s, c) {
    tutor(s, c.pi, function (d) { return d.type === 'unit' && hasTribe(d, '妖精'); });
  }
});

C({
  id: 'da_sunflower', tribe: ['妖精'], name: '向日葵妖精', src: '紅', cls: 'daiyousei', type: 'unit',
  cost: 3, atk: 2, hp: 2, works: ['紅'],
  text: '登場：其他我方「妖精」角色 +1/+1。',
  onPlay: function (s, c) {
    unitsOf(s, c.pi).forEach(function (u) {
      if (u !== c.self && hasTribe(def(u.defId), '妖精')) buffUnit(u, 1, 1);
    });
  }
});

C({
  id: 'da_guardfairy', tribe: ['妖精'], name: '守護妖精', src: '紅', cls: 'daiyousei', type: 'unit',
  cost: 3, atk: 1, hp: 4, kw: ['守護'], works: ['紅'],
  text: '守護。其他我方「妖精」角色 +0/+1。',
  unitAura: function (s, self, u) {
    return hasTribe(def(u.defId), '妖精') ? [0, 1] : null;
  }
});

C({
  id: 'da_fd_lake', name: '霧之湖', src: '紅', cls: 'daiyousei', type: 'field', cost: 4,
  text: '我方「妖精」角色 +1/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '妖精')) ? [1, 1] : null;
  }
});

C({
  id: 'bgm_daiyousei', name: 'ルーネイトエルフ', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_daiyousei',
  text: '發動：從牌庫檢索「大妖精」。我方「妖精」角色 +0/+2。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '妖精')) ? [0, 2] : null;
  }
});

/* ========== 紅美鈴：守護 ==========
   技能給守護，已有守護的改為生命 +1 —— 她的資源是「生命值」而不是攻擊力。
   核心是「気符『地気の球』」：守護角色的生命值加倍，
   讓那些 1/6、2/5 的門番一口氣變成清不掉的牆。 */

C({
  id: 'me_wd_chiki', name: '気符「地気の球」', src: '紅', cls: 'meiling', type: 'ward', cost: 4,
  text: '我方擁有「守護」的角色，生命值加倍。',
  // 加倍的基準是「基礎生命 + 永久強化」，不含其他光環 ——
  // 否則兩個互相參照的光環會在 recalc 裡無限膨脹。
  aura: function (s, owner, u) {
    if (u.owner !== owner || !hasKw(u, '守護')) return null;
    return [0, u.baseHp + (u.buffHp || 0)];
  }
});

C({
  id: 'me_kouka', name: '華符「芳華絢爛」', src: '紅', cls: 'meiling', type: 'spell', cost: 3,
  text: '我方一個角色獲得守護並 +0/+4。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    addKw(u, '守護');
    buffUnit(u, 0, 4);
  }
});

C({
  id: 'me_rainbow', name: '虹符「彩虹の風鈴」', src: '紅', cls: 'meiling', type: 'spell', cost: 2,
  text: '我方一個角色 +0/+3；若它有守護，抽 1 張。', target: T.aUnit,
  onPlay: function (s, c) {
    var u = c.target && c.target.unit; if (!u) return;
    buffUnit(u, 0, 3);
    if (hasKw(u, '守護')) { logMsg(s, '守住了 — 抽 1 張'); draw(s, c.pi, 1); }
  }
});

C({
  id: 'me_saikou', name: '極彩「彩光乱舞」', src: '紅', cls: 'meiling', type: 'spell', cost: 5,
  text: '對所有敵方角色造成傷害，點數等於我方擁有「守護」的角色數（最多 4）。',
  onPlay: function (s, c) {
    var n = Math.min(4, unitsOf(s, c.pi).filter(function (u) { return hasKw(u, '守護'); }).length);
    if (!n) { logMsg(s, '沒有守護的角色，「彩光乱舞」落空'); return; }
    logMsg(s, '守護 ' + n + ' 個 — 全體 ' + n + ' 點傷害');
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, n); });
  }
});

C({
  id: 'me_youkai', tribe: ['妖怪'], name: '紅魔館的門衛', src: '紅', cls: 'meiling', type: 'unit',
  // 中立的「紅美鈴」同樣 3 費 2/5 守護，所以這張必須在生命上更高，
  // 否則專屬卡完全沒有存在的理由。生命高也正好配合她的「生命加倍」。
  cost: 3, atk: 1, hp: 6, kw: ['守護'], works: ['紅'],
  text: '守護。跟著美鈴一起在門口站著的妖怪。'
});

C({
  id: 'me_fairymaid', tribe: ['妖精'], name: '值班的妖精女僕', src: '紅', cls: 'meiling', type: 'unit',
  cost: 2, atk: 1, hp: 3, works: ['紅'],
  text: '登場：我方一個角色獲得守護。', target: T.aUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) addKw(c.target.unit, '守護'); }
});

C({
  id: 'bgm_meiling', name: '上海紅茶館 ～ Chinese Tea', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_meiling',
  text: '發動：從牌庫檢索「紅美鈴」。我方擁有「守護」的角色 +1/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasKw(u, '守護')) ? [1, 0] : null;
  }
});

/* ========== 帕秋莉：七曜與賢者之石 ==========
   技能用「血量」換抽牌 —— 她抽得比誰都快，但活得比誰都短。
   七曜符卡各自負責一種功能（燒、補、抽、削、爆），
   賢者之石則讓每一張她自己的符卡都額外附帶一次隨機傷害，
   把「手牌換血量」變成「血量換場面」。 */

C({
  id: 'pa_wd_stone', name: '賢者之石', src: '紅', cls: 'patchouli', type: 'ward', cost: 4,
  text: '你發動帕秋莉的符卡時，對隨機一個敵方角色造成 2 點傷害。',
  onAllySpell: function (s, owner, sd) {
    if (!sd || sd.cls !== 'patchouli') return;
    var t = pick(s, unitsOf(s, foe(owner)));
    if (!t) return;
    logMsg(s, '『賢者之石』共鳴 — 隨機 2 點傷害');
    dmgUnit(s, t, 2);
  }
});

C({
  id: 'pa_agni', name: '火符「アグニシャイン」', src: '紅', cls: 'patchouli', type: 'spell', cost: 2,
  text: '對一個敵方角色造成 3 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 3); }
});

C({
  id: 'pa_undine', name: '水符「プリンセスウンディネ」', src: '紅', cls: 'patchouli', type: 'spell', cost: 3,
  text: '我方英雄回復 6 點。',
  onPlay: function (s, c) { healHero(s, c.pi, 6); }
});

C({
  id: 'pa_sylphy', name: '木符「シルフィホルン」', src: '紅', cls: 'patchouli', type: 'spell', cost: 2,
  text: '抽 2 張。',
  onPlay: function (s, c) { draw(s, c.pi, 2); }
});

C({
  id: 'pa_metal', name: '金符「メタルファティーグ」', src: '紅', cls: 'patchouli', type: 'spell', cost: 2,
  text: '使一個敵方角色 -3/-0。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) buffUnit(c.target.unit, -3, 0); }
});

C({
  id: 'pa_kyoseki', name: '土符「巨石落とし」', src: '紅', cls: 'patchouli', type: 'spell', cost: 4,
  text: '對一個敵方角色造成 6 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 6); }
});

C({
  id: 'pa_royalflare', name: '日符「ロイヤルフレア」', src: '紅', cls: 'patchouli', type: 'spell', cost: 6,
  text: '對所有敵方角色造成 4 點傷害。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, 4); });
  }
});

C({
  id: 'pa_selena', name: '月符「サイレントセレナ」', src: '紅', cls: 'patchouli', type: 'spell', cost: 5,
  text: '對所有敵方角色造成 3 點傷害，我方英雄回復 3 點。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, 3); });
    healHero(s, c.pi, 3);
  }
});

C({
  id: 'bgm_patchouli', name: 'ラクトガール ～ 少女密室', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_patchouli',
  text: '發動：從牌庫檢索「帕秋莉·諾蕾姬」。我方「魔法使」角色 +1/+1。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '魔法使')) ? [1, 1] : null;
  }
});

/* ========== 小惡魔：圖書館的助手 ==========
   （這一組沒有指定方向，是照她的技能「隨機生成一張費用 -2 的卡」延伸的：
     圖書館助手 = 檢索、抄寫、降費。她自己打不動人，但能讓別人早一回合出手。）*/

C({
  id: 'ko_search', name: '文獻檢索', src: '紅', cls: 'koakuma', type: 'spell', cost: 1,
  text: '從牌庫檢索一張符卡。',
  onPlay: function (s, c) { tutor(s, c.pi, function (d) { return d.type === 'spell'; }); }
});

C({
  id: 'ko_copy', name: '謄寫', src: '紅', cls: 'koakuma', type: 'spell', cost: 3,
  text: '複製手牌中隨機一張卡，複製品費用 -1。',
  onPlay: function (s, c) {
    var p = s.players[c.pi];
    var src = pick(s, p.hand);
    if (!src) { logMsg(s, '手牌是空的，沒有東西可抄'); return; }
    if (p.hand.length >= HAND_MAX) { logMsg(s, '手牌已滿'); return; }
    var copy = makeCard(src.defId);
    copy.costMod -= 1;
    p.hand.push(copy);
    logMsg(s, '抄寫了「' + def(src.defId).name + '」（費用 -1）');
  }
});

C({
  id: 'ko_serve', tribe: ['惡魔'], name: '圖書館的助手', src: '紅', cls: 'koakuma', type: 'unit',
  cost: 2, atk: 2, hp: 3, works: ['紅'],
  text: '登場：手牌中隨機一張符卡費用 -2。',
  onPlay: function (s, c) {
    var sp = s.players[c.pi].hand.filter(function (h) { return def(h.defId).type === 'spell'; });
    var t = pick(s, sp);
    if (!t) { logMsg(s, '手牌沒有符卡'); return; }
    t.costMod -= 2;
    logMsg(s, '「' + def(t.defId).name + '」費用 -2');
  }
});

C({
  id: 'ko_wings', tribe: ['惡魔'], name: '惡魔的羽翼', src: '紅', cls: 'koakuma', type: 'unit',
  cost: 3, atk: 3, hp: 2, kw: ['飛行'], works: ['紅'],
  text: '飛行。小惡魔背上那對不太可靠的翅膀。'
});

C({
  id: 'ko_fd_voile', name: 'ヴワル魔法圖書館', src: '紅', cls: 'koakuma', type: 'field', cost: 3,
  text: '你每回合的第一張符卡費用 -1。',
  costMod: function (s, owner, d, casterPi) {
    if (casterPi !== owner || d.type !== 'spell') return 0;
    return (s.players[owner].spellsThisTurn || 0) === 0 ? -1 : 0;
  }
});

C({
  id: 'bgm_koakuma', name: 'ヴワル魔法図書館', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'n_koakuma',
  text: '發動：從牌庫檢索「小惡魔」。我方「惡魔」與「魔法使」角色 +1/+1。',
  aura: function (s, owner, u) {
    if (u.owner !== owner) return null;
    var d = def(u.defId);
    return (hasTribe(d, '惡魔') || hasTribe(d, '魔法使')) ? [1, 1] : null;
  }
});

/* ========== 芙蘭朵露：破壞 ==========
   技能 5 費無條件破壞 —— 貴，但什麼都殺得掉。
   職業卡走同一條路：效果都比同費強一截，代價是自己的血、手牌、或連自己的場面一起炸。
   她是那種「贏要贏在對面先倒下」的英雄。 */

C({
  id: 'c_flandre', tribe: ['吸血鬼'], name: '芙蘭朵露·斯卡蕾特', src: '紅', cls: 'neutral', type: 'unit',
  cost: 6, atk: 5, hp: 5, kw: ['吸血'], works: ['紅'],
  text: '吸血。登場：對一個敵方角色造成 3 點傷害。', target: T.eUnit,
  onPlay: function (s, c) { if (c.target && c.target.unit) dmgUnit(s, c.target.unit, 3); }
});

C({
  id: 'fl_levantine', name: '禁忌「レーヴァテイン」', src: '紅', cls: 'flandre', type: 'spell', cost: 6,
  text: '對所有敵方角色造成 4 點傷害；我方英雄受到 3 點傷害。',
  onPlay: function (s, c) {
    unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, 4); });
    dmgHero(s, c.pi, 3);
  }
});

C({
  id: 'fl_four', name: '禁忌「フォーオブアカインド」', src: '紅', cls: 'flandre', type: 'spell', cost: 5,
  text: '召喚三個 1/1 並具有疾走的「分身」。',
  onPlay: function (s, c) {
    for (var i = 0; i < 3; i++) summon(s, c.pi, 'fl_bunshin', {});
  }
});

C({
  id: 'fl_bunshin', tribe: ['吸血鬼'], name: '分身', src: '紅', cls: 'flandre', type: 'unit',
  cost: 1, atk: 1, hp: 1, kw: ['疾走'], token: true, works: ['紅'],
  text: '疾走。芙蘭朵露分裂出來的自己。'
});

C({
  id: 'fl_starbow', name: '禁弾「スターボウブレイク」', src: '紅', cls: 'flandre', type: 'spell', cost: 3,
  text: '對所有角色造成 2 點傷害（包含我方）。',
  onPlay: function (s, c) {
    allUnits(s).forEach(function (u) { dmgUnit(s, u, 2); });
  }
});

C({
  id: 'fl_andthen', name: '秘弾「そして誰もいなくなるか?」', src: '紅', cls: 'flandre', type: 'spell', cost: 5,
  text: '破壞一個角色；隨機棄掉 2 張手牌。', target: T.anyUnit,
  onPlay: function (s, c) {
    if (c.target && c.target.unit) destroyUnit(s, c.target.unit);
    var h = s.players[c.pi].hand;
    for (var i = 0; i < 2 && h.length; i++) {
      var k = rngInt(s, h.length);
      logMsg(s, '棄掉「' + def(h[k].defId).name + '」');
      s.players[c.pi].grave.push({ defId: h[k].defId });
      h.splice(k, 1);
    }
  }
});

C({
  id: 'fl_qed', name: '「QED "495年の波紋"」', src: '紅', cls: 'flandre', type: 'spell', cost: 8,
  text: '破壞場上所有角色。',
  onPlay: function (s, c) {
    allUnits(s).forEach(function (u) { destroyUnit(s, u); });
    logMsg(s, '四百九十五年份的破壞 — 場上清空');
  }
});

C({
  id: 'fl_wd_kinki', name: '禁忌的地下室', src: '紅', cls: 'flandre', type: 'ward', cost: 3,
  text: '我方角色死去時，對敵方英雄造成 1 點傷害。',
  onAllyDeath: function (s, owner, u) { dmgHero(s, foe(owner), 1); }
});

C({
  id: 'bgm_flandre', name: 'U.N.オーエンは彼女なのか？', src: '紅', cls: 'neutral', type: 'bgm',
  cost: 3, unique: true, tutor: 'c_flandre',
  text: '發動：從牌庫檢索「芙蘭朵露·斯卡蕾特」。我方「吸血鬼」角色 +2/+0。',
  aura: function (s, owner, u) {
    return (u.owner === owner && hasTribe(def(u.defId), '吸血鬼')) ? [2, 0] : null;
  }
});

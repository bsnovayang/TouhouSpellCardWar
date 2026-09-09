/* ============================================================
   東方符卡大戰 — 預設牌組
   每位英雄一份手寫牌表，對應 docs/builds.md 的流派設計。
   必須在所有 cards/*.js 之後載入。

   預組的目標是「一副堪用、而且看得出戰術」的牌組，不是最佳解；
   玩家可以在牌組編輯器裡自己改。
   ============================================================ */
'use strict';

/* [卡片 id, 張數]。改動後請跑 npm run lint 檢查合法性。 */
var PRESET_DECKS = {

  /* 封印巫女：用封印把對手的關鍵角色變成白板，再慢慢清場 */
  reimu: {
    bgm: 'bgm_reimu',
    cards: [
      ['r_sekima', 4], ['r_taiji', 3], ['r_inori', 3], ['r_musou', 2],
      ['r_watashi', 2], ['r_onmyo', 2], ['r_nijuu', 1], ['r_kyoukai', 1],
      ['r_tensei', 1],
      ['n_meiling', 4], ['n_daiyousei', 4], ['n_maid', 3], ['n_lyrica', 3],
      ['n_keine', 2], ['n_koakuma', 1], ['n_fairy', 1], ['n_fd_eientei', 1],
      ['n_eirin', 1], ['c_reimu', 1]
    ]
  },

  /* 連奏魔女：技能每回合抽牌降費 → 一回合連打多張符卡 → 符卡使長大 → 隨機多段與 AOE 清場 → Spark 收頭 */
  marisa: {
    bgm: 'bgm_marisa',
    cards: [
      ['m_hijou', 4], ['m_madan', 3], ['m_milkyway', 3], ['m_hoshikuzu', 2],
      ['m_raikan', 2], ['m_spark', 2], ['m_blazing', 2], ['m_mushroom', 2],
      ['m_grimoire', 2], ['m_masterspark', 1], ['m_hakkero', 1], ['m_hat', 1],
      ['m_dragonmeteor', 1], ['m_forest', 1],
      ['n_patchouli', 3], ['n_meiling', 3], ['n_chen', 3], ['n_rumia', 2],
      ['n_koakuma', 1], ['c_marisa', 1]
    ]
  },

  /* 時間停止：數值不高，但攻擊次數是別人的兩三倍 */
  sakuya: {
    bgm: 'bgm_sakuya',
    cards: [
      ['s_knife', 4], ['s_maid2', 4], ['s_doll', 4], ['s_private', 3],
      ['s_inscribe', 2], ['s_eternal', 2], ['s_sakuyaworld', 1],
      ['s_clock', 1], ['n_chen', 4], ['n_merlin', 4], ['n_rumia', 3],
      ['n_meiling', 2], ['n_ran', 2], ['n_fd_scarlet', 1], ['n_sp_omamori', 1],
      ['c_sakuya', 2]
    ]
  },

  /* 一擊必殺：資源全疊在一隻身上，用貫通把溢出傷害打進臉 */
  youmu: {
    bgm: 'bgm_youmu',
    cards: [
      ['y_shugyo', 4], ['y_hakurou', 4], ['y_utsusemi', 3], ['y_ouka', 3],
      ['y_konpaku', 2], ['y_shokei', 2], ['y_roukanken', 1],
      ['y_rokudou', 1], ['n_daiyousei', 4], ['n_tewi', 4], ['n_meiling', 3],
      ['n_wd_shimenawa', 2], ['n_keine', 2], ['n_fd_scarlet', 1], ['n_sp_omamori', 1],
      ['c_youmu', 3]
    ]
  },

  /* 境界操作：不比大小，改寫規則 */
  yukari: {
    bgm: 'bgm_yukari',
    cards: [
      ['k_hands', 4], ['k_gapyoukai', 3], ['k_sougi', 2], ['k_mugen', 2],
      ['k_kamikakushi', 2],
      ['k_shijuu', 2], ['k_mahoujin', 2], ['k_shinkai', 2], ['k_kakurenbo', 1],
      ['k_kyoukai', 1], ['n_rumia', 4], ['n_tewi', 4],
      ['n_meiling', 3], ['n_keine', 3], ['n_ran', 2], ['n_sp_gap', 1],
      ['n_kaguya', 1], ['c_yukari', 1]
    ]
  },

  /* 人偶大軍：場上永遠站滿五個，全體強化一次打穿 */
  alice: {
    bgm: 'bgm_alice',
    cards: [
      ['a_shanghai', 4], ['a_hourai', 4], ['a_jizai', 3], ['a_hoffman', 3],
      ['a_army', 2], ['a_shinpan', 2], ['a_goliath', 2], ['a_saiban', 1],
      ['a_hourai_full', 1], ['n_fairy', 4], ['n_lily', 4], ['n_daiyousei', 3],
      ['n_wd_shimenawa', 2], ['n_meiling', 2], ['n_sp_omamori', 1], ['n_fd_scarlet', 1],
      ['c_alice', 1]
    ]
  },

  /* 吸血續航：每次攻擊都在回血，對手殺不死你 */
  remilia: {
    bgm: 'bgm_remilia',
    cards: [
      ['e_night', 4], ['e_fuyajou', 3], ['e_vampire', 3], ['e_shoot', 3],
      ['e_gungnir', 2], ['e_scarletmoon', 2], ['e_redmagic', 2], ['e_mist', 1],
      ['e_flandre', 1], ['n_meiling', 4], ['n_maid', 4],
      ['n_koakuma', 3], ['n_keine', 2], ['n_patchouli', 2], ['n_fairy', 2],
      ['n_sp_omamori', 1], ['c_remilia', 1]
    ]
  },

  /* 不死燒身：技能 0 費自傷點燃捨身，把血量換成傷害 */
  mokou: {
    bgm: 'bgm_mokou',
    cards: [
      ['mk_wu', 4], ['mk_ono', 3], ['mk_metsuzai', 3], ['mk_possessed', 3],
      ['mk_houou', 2], ['mk_gaifu', 1],
      ['n_keine', 3], ['n_chen', 3], ['n_rumia', 3], ['n_fairy', 2],
      ['n_meiling', 3], ['n_mokou', 1], ['n_mokou_immortal', 1], ['n_kaguya_immortal', 1], ['n_koakuma', 2], ['n_reisen', 2],
      ['n_sp_omamori', 2], ['c_marisa', 1]
    ]
  },

  /* 亡者輪迴：自己的角色死掉才是收益 */
  yuyuko: {
    bgm: 'bgm_yuyuko',
    cards: [
      ['u_band', 4], ['u_yuurei', 4], ['u_kurin', 3], ['u_yomotsu', 3],
      ['u_ageha', 3], ['u_botan', 2], ['u_shitai', 1], ['u_saigyou', 1],
      ['u_hangyoku', 1], ['n_ghost', 4], ['n_fairy', 4], ['n_lily', 3],
      ['n_meiling', 2], ['n_mokou', 2], ['n_sp_omamori', 1], ['n_fd_hakugyokurou', 1],
      ['c_yuyuko', 1]
    ]
  },

  /* 宵闇伏兵：鋪場 → 全體隱行躲過點殺 → 一次總攻 */
  rumia: {
    bgm: 'bgm_rumia',
    cards: [
      ['ru_yamiyousei', 4], ['ru_moonlight', 3], ['ru_dimarcation', 3],
      ['ru_kurayami', 2], ['ru_nightbird', 2], ['ru_wd_yoiyami', 2],
      ['n_rumia', 4], ['n_chen', 4], ['n_fairy', 3], ['n_maid', 3],
      ['n_koakuma', 3], ['n_wriggle', 2], ['n_meiling', 2],
      ['n_sp_omamori', 2], ['c_sakuya', 1]
    ]
  },

  /* 全面凍結：把對手的場面凍住不放，再一口氣收乾淨 */
  cirno: {
    bgm: 'bgm_cirno',
    cards: [
      ['ci_icicle', 4], ['ci_icefairy', 4], ['ci_diamond', 3],
      ['ci_perfectfreeze', 2], ['ci_wd_misty', 2], ['ci_kanzen', 1],
      ['n_cirno', 4], ['n_fairy', 4], ['n_daiyousei', 3], ['n_maid', 3],
      ['n_letty', 3], ['n_lily', 2], ['n_meiling', 2],
      ['n_sp_omamori', 2], ['c_reimu', 1]
    ]
  },

  /* 妖精大軍：單張都很弱，靠數量與層層疊上去的加成取勝 */
  daiyousei: {
    bgm: 'bgm_daiyousei',
    cards: [
      ['da_growth', 4], ['da_gather', 3], ['da_sunflower', 3],
      ['da_guardfairy', 3], ['da_swarm', 2], ['da_fd_lake', 1],
      ['n_fairy', 4], ['n_maid', 4], ['n_lily', 4], ['n_daiyousei', 4],
      ['n_cirno', 3], ['n_wd_shimenawa', 2], ['n_sp_omamori', 2],
      ['n_meiling', 1]
    ]
  },

  /* 銅牆鐵壁：守護角色的生命值加倍，對手清不動就只能看著被磨死 */
  meiling: {
    bgm: 'bgm_meiling',
    cards: [
      ['me_youkai', 4], ['me_fairymaid', 4], ['me_rainbow', 3],
      ['me_kouka', 3], ['me_wd_chiki', 2], ['me_saikou', 2],
      ['n_meiling', 4], ['n_maid', 4], ['n_letty', 2], ['n_fairy', 2], ['n_daiyousei', 3],
      ['n_keine', 2], ['n_reisen', 2], ['n_sp_omamori', 2],
      ['n_fd_scarlet', 1]
    ]
  },

  /* 圖書館助手：自己打不動人，靠檢索與降費讓別的卡早一回合出手 */
  koakuma: {
    bgm: 'bgm_koakuma',
    cards: [
      ['ko_search', 4], ['ko_serve', 4], ['ko_wings', 4], ['ko_copy', 3],
      ['ko_fd_voile', 1],
      ['n_koakuma', 4], ['n_sp_seal', 4], ['n_sp_danmaku', 3], ['n_patchouli', 3],
      ['n_rumia', 3], ['n_chen', 3], ['n_sp_omamori', 2], ['n_sp_barrier', 1],
      ['c_marisa', 1]
    ]
  },

  /* 七曜賢者：用血量換手牌，再靠賢者之石把每一張符卡都變成兩次傷害 */
  patchouli: {
    bgm: 'bgm_patchouli',
    cards: [
      ['pa_agni', 4], ['pa_sylphy', 4], ['pa_metal', 4], ['pa_undine', 3],
      ['pa_kyoseki', 3], ['pa_wd_stone', 2], ['pa_selena', 2], ['pa_royalflare', 1],
      ['n_patchouli', 4], ['n_meiling', 3], ['n_maid', 3], ['n_koakuma', 3],
      ['n_fairy', 2], ['n_sp_omamori', 1], ['c_marisa', 1]
    ]
  },

  /* 徹底破壞：每張卡都比同費強一截，代價是自己的血與手牌 */
  flandre: {
    bgm: 'bgm_flandre',
    cards: [
      ['fl_starbow', 3], ['fl_four', 3], ['fl_andthen', 3], ['fl_levantine', 2],
      ['fl_wd_kinki', 2], ['fl_qed', 1],
      ['n_maid', 4], ['n_fairy', 4], ['n_koakuma', 4], ['n_rumia', 3],
      ['n_meiling', 3], ['n_chen', 1], ['n_sp_seal', 3], ['n_sp_omamori', 2],
      ['c_remilia', 1], ['c_flandre', 1]
    ]  },

  /* 隨機春告：效果都比同費強一截，代價是你指定不了目標 */
  lily: {
    bgm: 'bgm_lily',
    cards: [
      ['li_fairy', 4], ['li_haru', 4], ['li_blackfairy', 3], ['li_mebuki', 3],
      ['li_fubuki', 3], ['li_wd_haru', 2], ['li_ranman', 1],
      ['n_lily', 4], ['n_fairy', 4], ['n_maid', 3], ['n_cirno', 3],
      ['n_daiyousei', 3], ['n_letty', 2], ['n_sp_omamori', 1]
    ]  },

  /* 合奏：湊齊三位不同的騷靈，全部效果升級。湊齊前場面很脆，這是代價 */
  prismriver: {
    bgm: 'bgm_prismriver',
    cards: [
      ['n_lunasa', 3], ['n_merlin', 3], ['n_lyrica', 3], ['pr_poltergeist', 2],
      ['pr_tuning', 2], ['pr_clifford', 3], ['pr_wd_stage', 2], ['pr_encore', 2],
      ['pr_fd_hall', 1], ['pr_symphony', 1],
      ['n_lily', 3], ['n_fairy', 3], ['n_sp_omamori', 2],
      ['n_meiling', 2], ['n_keine', 3], ['n_patchouli', 1],
      ['n_ran', 2], ['n_eirin', 1], ['n_kaguya', 1]
    ]  },

  /* 蔓延的冬天：不追求殺傷，把場面凍住拖到後期再收割 */
  letty: {
    bgm: 'bgm_letty',
    cards: [
      ['le_yuki', 3], ['le_lingering', 3], ['le_wd_fuyu', 2], ['le_fuyu', 3],
      ['le_wither', 2], ['le_snap', 2],
      ['n_letty', 3], ['n_cirno', 3], ['n_maid', 3], ['n_fairy', 3],
      ['n_meiling', 3], ['n_keine', 3], ['n_reisen', 2], ['n_sp_omamori', 2],
      ['n_ran', 2], ['n_eirin', 1]
    ]
  },

  /* 一次性衝擊：場上留不住東西，只能算這一回合能打多少 */
  chen: {
    bgm: 'bgm_chen',
    cards: [
      ['ch_kuroneko', 4], ['ch_bakeneko', 3], ['ch_hishou', 3], ['ch_wd_neko', 2],
      ['ch_shimen', 2], ['ch_ultimate', 2],
      ['n_chen', 4], ['n_rumia', 3], ['n_maid', 3], ['n_fairy', 3],
      ['n_meiling', 2], ['n_wriggle', 2], ['n_sp_omamori', 2], ['n_sp_seal', 2],
      ['n_ran', 2], ['c_marisa', 1]
    ]
  },

  /* 式神與費用壓縮：收益慢但持續，後期一口氣把手牌傾瀉出來 */
  ran: {
    bgm: 'bgm_ran',
    cards: [
      ['ra_shikigami', 4], ['ra_kudagitsune', 3], ['ra_rensei', 3], ['ra_wd_shiki', 2],
      ['ra_tenko', 2], ['ra_juuni', 2],
      ['n_chen', 4], ['n_ran', 2], ['n_maid', 3], ['n_meiling', 3],
      ['n_keine', 3], ['n_patchouli', 2], ['n_sp_omamori', 2], ['n_sp_seal', 2],
      ['n_eirin', 1], ['n_kaguya', 1], ['c_yukari', 1]
    ]  },

  /* 不壞之盾：技能每回合白給一層護盾，把「打不死」滾成優勢 */
  keine: {
    bgm: 'bgm_keine',
    cards: [
      ['ke_jikeidan', 3], ['ke_ken', 3], ['ke_tama', 3], ['ke_kagami', 2],
      ['ke_hakutaku', 2], ['ke_kioku', 2], ['ke_amaterasu', 1],
      ['n_keine', 3], ['n_meiling', 3], ['n_maid', 3], ['n_fairy', 3],
      ['n_mokou', 2], ['n_reisen', 2], ['n_sp_omamori', 2], ['n_koakuma', 2],
      ['n_eirin', 2], ['n_kaguya', 1], ['n_lily', 1]
    ]
  },

  /* 蟲群夜襲：單隻永遠很小，靠數量與飛行穿透 */
  wriggle: {
    bgm: 'bgm_wriggle',
    cards: [
      ['wr_bug', 4], ['wr_kousei', 3], ['wr_shigure', 3], ['wr_wd_yamiyo', 2],
      ['wr_butterfly', 2],
      ['n_wriggle', 4], ['n_mystia', 3], ['n_maid', 3], ['n_fairy', 3],
      ['n_ghost', 3], ['n_lunasa', 2], ['n_merlin', 2], ['n_meiling', 2],
      ['n_sp_omamori', 2], ['n_chen', 2]
    ]
  },

  /* 夜盲：對手的場面還在，但打不動 */
  mystia: {
    bgm: 'bgm_mystia',
    cards: [
      ['my_sparrow', 4], ['my_owl', 3], ['my_song', 3], ['my_moth', 2],
      ['my_chorus', 2], ['my_wd_yoru', 2],
      ['n_mystia', 3], ['n_wriggle', 3], ['n_meiling', 3], ['n_keine', 3],
      ['n_maid', 2], ['n_fairy', 2], ['n_reisen', 2], ['n_sp_omamori', 2],
      ['n_ran', 2], ['n_eirin', 1], ['n_kaguya', 1]
    ]
  }
};

/* 流派名稱，給介面顯示 */
var BUILD_NAMES = {
  reimu: '封印巫女', marisa: '連奏魔女', sakuya: '時間停止', youmu: '一擊必殺',
  yukari: '境界操作', alice: '人偶大軍', remilia: '吸血續航', yuyuko: '亡者輪迴', mokou: '不死燒身',
  rumia: '宵闇伏兵', cirno: '全面凍結', daiyousei: '妖精大軍', meiling: '銅牆鐵壁',
  koakuma: '圖書館助手', patchouli: '七曜賢者', flandre: '徹底破壞',
  lily: '隨機春告', prismriver: '幻想合奏',
  letty: '蔓延之冬', chen: '一擊衝鋒', ran: '式神壓縮',
  keine: '不壞之盾', wriggle: '蟲群夜襲', mystia: '夜盲'
};

function presetDeck(heroId) {
  var entry = PRESET_DECKS[heroId];
  var list = [];
  ((entry && entry.cards) || []).forEach(function (e) {
    if (!CARDS[e[0]]) return;   // 卡片被刪掉時不要整個爆掉，交給 lint 報告
    for (var i = 0; i < e[1]; i++) list.push(e[0]);
  });
  // 牌表若因改卡而短少，用自動補牌補滿，避免預組牌組直接不合法
  if (list.length < DECK_SIZE) list = autoFill(heroId, list);
  list = list.filter(function (id) { return CARDS[id].type !== 'bgm'; });   // 防呆
  return list.slice(0, DECK_SIZE);
}

/* 預組的 BGM 欄。
   沒有手寫牌表的英雄挑一張同作品的 BGM，讓預組不會缺第 4 回合的 BGM。 */
function presetBgm(heroId) {
  var entry = PRESET_DECKS[heroId];
  if (entry && entry.bgm) return entry.bgm;
  var set = HEROES[heroId] && HEROES[heroId].set;
  var pool = Object.keys(CARDS).filter(function (id) {
    return CARDS[id].type === 'bgm' && CARDS[id].src === set;
  });
  return pool[0] || null;
}

/* ---------- 自動補牌 ----------
   只在牌組不足 40 張時使用：按費用曲線挑該英雄能用的卡填滿。
   給「玩家自組但沒組完」與「預組牌表短少」兩種情況兜底。 */
function autoFill(heroId, current) {
  var list = (current || []).slice();
  var cnt = {};
  list.forEach(function (id) { cnt[id] = (cnt[id] || 0) + 1; });

  // 目標曲線：低費多、高費少
  var want = { 0: 1, 1: 5, 2: 8, 3: 8, 4: 6, 5: 4, 6: 2, 7: 1 };
  var pool = cardsForHero(heroId).sort(function (a, b) {
    return CARDS[a].cost - CARDS[b].cost || CARDS[a].name.localeCompare(CARDS[b].name);
  });

  function bucket(id) { return Math.min(7, CARDS[id].cost); }
  function have(b) {
    return list.filter(function (id) { return bucket(id) === b; }).length;
  }
  function capOf(id) {
    var d = CARDS[id];
    // BGM 要先判斷 —— BGM 卡本身帶 unique，被上面攔下就永遠回傳 1，會被塞進主牌組
    if (d.type === 'bgm') return 0;   // BGM 放在獨立的 BGM 欄，不自動補進主牌組
    if (d.unique) return 1;
    if (d.type === 'field') return 1;
    if (d.cost >= 6) return 1;
    if (d.type === 'ward' || d.cost >= 5) return 2;
    return MAX_COPIES;
  }

  // 先照曲線缺口補，再無條件補滿
  [false, true].forEach(function (ignoreCurve) {
    for (var round = 0; round < MAX_COPIES && list.length < DECK_SIZE; round++) {
      for (var i = 0; i < pool.length && list.length < DECK_SIZE; i++) {
        var id = pool[i], b = bucket(id);
        if (!ignoreCurve && have(b) >= (want[b] || 0)) continue;
        if ((cnt[id] || 0) >= capOf(id)) continue;
        cnt[id] = (cnt[id] || 0) + 1;
        list.push(id);
      }
    }
  });
  return list;
}

/* ============================================================
   東方符卡大戰 — 進入點與事件綁定
   ============================================================ */
'use strict';

(function init() {
  SET = loadSettings();
  loadDecks();
  refreshMenu();
  renderRules();

  /* 主選單 */
  $('btn-play').onclick = function () { showScreen('select'); renderSelect(); };
  $('btn-decks').onclick = function () { showScreen('deck'); renderDeckList(); };
  $('btn-stats').onclick = function () { showScreen('stats'); renderStats(); };
  $('btn-rules').onclick = function () { showScreen('rules'); };
  $('btn-resume').onclick = function () {
    var s = loadGame();
    if (!s) { refreshMenu(); return; }
    resumeBattle(s);
  };
  document.querySelectorAll('[data-goto]').forEach(function (b) {
    b.onclick = function () { showScreen(b.dataset.goto); if (b.dataset.goto === 'menu') refreshMenu(); };
  });

  /* 開戰 */
  // 記住上次選的難度
  var st0 = loadSettings();
  if (st0.aiLevel && $('ai-level')) $('ai-level').value = st0.aiLevel;

  $('btn-start').onclick = function () {
    var d = findDeck(chosenDeckId) || presetDecks()[0];
    var errs = validateDeck(d);
    if (errs.length) { alert('牌組不合法：\n' + errs.join('\n')); return; }
    var lv = $('ai-level') ? $('ai-level').value : AI_DEFAULT_LEVEL;
    var st = loadSettings(); st.aiLevel = lv; saveSettings(st);
    startBattle(d, $('ai-hero').value, $('first-choice').value, lv);
  };

  /* 對戰操作 */
  $('btn-end').onclick = onEndTurn;
  $('btn-quit').onclick = function () {
    if (!G || G.winner != null) return;
    if (!confirm('確定要投降嗎？')) return;
    G.winner = 1 - G.humanSide;
    G.phase = 'over';
    showResult();
  };
  $('screen-game').addEventListener('click', function (e) {
    if (e.target.closest('.card,.unit,.hero,.btn,.perm')) return;
    if (sel) { sel = null; renderGame(); }
  });
  /* 全域保險：滑鼠移到任何「不是提示框來源」的地方就關掉。
     單靠 mouseleave 不夠 —— 元素被重繪移除時那個事件不會觸發。 */
  document.addEventListener('mouseover', function (e) {
    if (!tipOwner) return;
    if (tipOwner.isConnected && tipOwner.contains(e.target)) return;
    hideTip();
  });
  window.addEventListener('blur', hideTip);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sel) { sel = null; renderGame(); }
    if (e.key === ' ' && $('screen-game').classList.contains('active')) {
      e.preventDefault(); onEndTurn();
    }
  });

  /* 牌組編輯 */
  // 新牌組：先選英雄，再進編輯器
  $('btn-new-deck').onclick = function () {
    openHeroPicker({
      title: '新牌組 — 選擇英雄',
      onBack: function () { showScreen('deck'); renderDeckList(); },
      onPick: function (heroId) {
        var d = {
          id: newDeckId(),
          name: HEROES[heroId].name + (BUILD_NAMES[heroId] ? '・' + BUILD_NAMES[heroId] : '') + '的牌組',
          heroId: heroId, cards: [], bgm: presetBgm(heroId) || null
        };
        var decks = loadDecks(); decks.push(d); saveDecks(decks);
        showScreen('deck'); openEditor(d.id);
      }
    });
  };
  $('btn-hero-back').onclick = function () {
    if (heroPicker && heroPicker.onBack) heroPicker.onBack();
    else { showScreen('deck'); renderDeckList(); }
  };
  $('hero-search').oninput = function () { heroFilter.text = this.value; renderHeroPicker(); };
  $('btn-deck-back').onclick = function () { editing = null; renderDeckList(); };
  $('deck-name').oninput = function () { if (editing) { editing.name = this.value || '未命名'; persistEditing(); } };
  $('f-text').oninput = function () { poolFilter.text = this.value; renderEditor(); };
  $('f-more').onclick = function () {
    var adv = $('f-adv');
    adv.hidden = !adv.hidden;
    this.textContent = adv.hidden ? '更多篩選 ▾' : '收合篩選 ▴';
  };
  $('f-clear').onclick = function () {
    poolFilter = { cost: [], type: [], owner: [], tribe: [], works: [], text: '' };
    $('f-text').value = '';
    renderEditor();
  };
  $('btn-del-deck').onclick = function () {
    if (!editing || !confirm('刪除「' + editing.name + '」？')) return;
    var decks = loadDecks().filter(function (x) { return x.id !== editing.id; });
    saveDecks(decks); editing = null; renderDeckList();
  };
  $('btn-autofill').onclick = function () {
    if (!editing) return;
    if (editing.cards.length >= DECK_SIZE) { toast('牌組已經滿 ' + DECK_SIZE + ' 張'); return; }
    editing.cards = autoFill(editing.heroId, editing.cards);
    persistEditing(); renderEditor();
  };
  $('btn-export').onclick = function () {
    if (!editing) return;
    var code = encodeDeck(editing);
    navigator.clipboard && navigator.clipboard.writeText(code);
    prompt('牌組碼（已嘗試複製到剪貼簿）：', code);
  };
  $('btn-import').onclick = function () {
    var d = decodeDeck($('import-code').value);
    if (!d) { alert('牌組碼無效'); return; }
    var decks = loadDecks(); decks.push(d); saveDecks(decks);
    $('import-code').value = '';
    renderDeckList();
  };
})();

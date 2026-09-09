/* ============================================================
   東方符卡大戰 — 卡表：通用卡
   不屬於特定作品的泛用卡：抽濾、通用移除、結界破壞
   共 3 張。要新增這一彈的卡，直接在本檔加 C({...})。
   ============================================================ */
'use strict';

C({
  id: 'n_sp_omamori', set: '基', name: '御守', src: '通', cls: 'neutral', type: 'spell', cost: 0,
  text: '抽 1 張。', onPlay: function (s, c) { draw(s, c.pi, 1); }
});

C({
  id: 'n_sp_danmaku', set: '基',  name: '彈幕勝負', src: '通', cls: 'neutral', type: 'spell', cost: 4,
  text: '對所有敵方角色造成 2 點傷害。',
  onPlay: function (s, c) { unitsOf(s, foe(c.pi)).forEach(function (u) { dmgUnit(s, u, 2); }); }
});

C({
  id: 'n_sp_break', set: '基',  name: '結界破', src: '通', cls: 'neutral', type: 'spell', cost: 1,
  text: '破壞一個敵方結界或場地（優先場地）。',
  playable: function (s, pi) {
    var o = s.players[foe(pi)];
    return !!(o.field || o.wards.some(Boolean));
  },
  onPlay: function (s, c) {
    var o = s.players[foe(c.pi)];
    if (o.field) { logMsg(s, '場地「' + def(o.field.defId).name + '」被破壞'); o.grave.push({ defId: o.field.defId }); o.field = null; return; }
    for (var i = 0; i < o.wards.length; i++) {
      if (o.wards[i]) { logMsg(s, '結界「' + def(o.wards[i].defId).name + '」被破壞'); o.grave.push({ defId: o.wards[i].defId }); o.wards[i] = null; return; }
    }
  }
});

/* ============================================================
 * 珞珈绿茵 · app.js
 * WGS-84 → GCJ-02 转换、高德底图、Leaflet 标记/草坪框、
 * 卡片渲染、筛选、灯箱、拖动校准（localStorage）
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- WGS-84 → GCJ-02（标准 eviltransform 算法） ---------- */
  var PI = Math.PI, A = 6378245.0, EE = 0.00669342162296594323;
  function outOfChina(lat, lon) {
    return (lon < 72.004 || lon > 137.8347) || (lat < 0.8293 || lat > 55.8271);
  }
  function tLat(x, y) {
    var r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    r += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    r += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return r;
  }
  function tLon(x, y) {
    var r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    r += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    r += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return r;
  }
  function wgs2gcj(wLat, wLon) {
    if (outOfChina(wLat, wLon)) return [wLat, wLon];
    var dLat = tLat(wLon - 105.0, wLat - 35.0);
    var dLon = tLon(wLon - 105.0, wLat - 35.0);
    var radLat = wLat / 180.0 * PI;
    var magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
    dLon = (dLon * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
    return [wLat + dLat, wLon + dLon];
  }

  var D = window.WHU_FOOTBALL;
  var CAMPUS_COLOR = { wl: '#a4243b', gx: '#22577a', xx: '#2e7d32' };
  var CALIB_KEY = 'whuFbCalibV1';

  function loadCalib() {
    try { return JSON.parse(localStorage.getItem(CALIB_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveCalib(c) {
    try { localStorage.setItem(CALIB_KEY, JSON.stringify(c)); } catch (e) { /* file:// 下可能受限 */ }
  }
  var calib = loadCalib();

  /* 场地 GCJ 坐标（含校准偏移） */
  function venueGcj(v) {
    if (calib[v.id]) return calib[v.id];
    return wgs2gcj(v.wgs.lat, v.wgs.lng);
  }
  function venueGcjRaw(v) { return wgs2gcj(v.wgs.lat, v.wgs.lng); }

  /* ---------- 地图 ---------- */
  var map = L.map('map', { zoomControl: true, attributionControl: false })
    .setView([30.5455, 114.3600], 14);

  var satTiles = L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
    subdomains: ['1', '2', '3', '4'], maxZoom: 18
  });
  var satLabels = L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}', {
    subdomains: ['1', '2', '3', '4'], maxZoom: 18
  });
  var roadTiles = L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
    subdomains: ['1', '2', '3', '4'], maxZoom: 18
  });
  var satGroup = L.layerGroup([satTiles, satLabels]).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  document.querySelectorAll('#layerSwitch button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#layerSwitch button').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      if (btn.dataset.layer === 'sat') {
        if (map.hasLayer(roadTiles)) map.removeLayer(roadTiles);
        satGroup.addTo(map);
      } else {
        if (map.hasLayer(satGroup)) map.removeLayer(satGroup);
        roadTiles.addTo(map);
      }
    });
  });

  /* 标记与草坪框 */
  var markers = {}, pitchRects = {}, suppLayer = L.layerGroup();

  function pitchBounds(p) {
    var g = wgs2gcj(p.lat, p.lng);
    var dLat = (p.h / 2) / 110540;
    var dLon = (p.w / 2) / (111320 * Math.cos(g[0] * PI / 180));
    return [[g[0] - dLat, g[1] - dLon], [g[0] + dLat, g[1] + dLon]];
  }

  D.venues.forEach(function (v, i) {
    var pos = venueGcj(v);
    var color = CAMPUS_COLOR[v.campusKey] || '#94070a';
    var icon = L.divIcon({
      className: '',
      html: '<div class="venue-marker" style="background:' + color + '"><span>' + (i + 1) + '</span></div>',
      iconSize: [34, 34], iconAnchor: [17, 32], popupAnchor: [0, -30]
    });
    var thumb = v.photos.length ? '<img src="images/' + v.photos[0].f + '" alt="">' :
      '<div style="height:110px;border-radius:8px;background:linear-gradient(135deg,#2e7d32,#1c4a20);display:flex;align-items:center;justify-content:center;font-size:2rem">⚽</div>';
    var popupHtml =
      '<div class="popup-card">' + thumb +
      '<div class="pc-name">' + (v.cupVenue ? '🏆 ' : '') + v.name + '</div>' +
      '<span class="pc-campus" style="background:' + color + '">' + v.campus + '</span>' +
      '<a href="#venue-' + v.id + '">照片详情 ↓</a> ｜ <a href="3d.html#' + v.id + '">🎮 3D</a></div>';
    var mk = L.marker(pos, { icon: icon, draggable: false }).addTo(map).bindPopup(popupHtml);
    markers[v.id] = mk;

    if (v.pitch) {
      pitchRects[v.id] = L.rectangle(pitchBounds(v.pitch), {
        color: '#ffffff', weight: 2, dashArray: '6 5', fill: '#3fa54a', fillOpacity: 0.18
      }).addTo(map);
    }

    mk.on('dragend', function () {
      var ll = mk.getLatLng();
      calib[v.id] = [ll.lat, ll.lng];
      saveCalib(calib);
      if (v.pitch && pitchRects[v.id]) {
        var raw = venueGcjRaw(v);
        var dLat = ll.lat - raw[0], dLon = ll.lng - raw[1];
        var b = pitchBounds(v.pitch);
        pitchRects[v.id].setBounds([[b[0][0] + dLat, b[0][1] + dLon], [b[1][0] + dLat, b[1][1] + dLon]]);
      }
      var el = document.getElementById('coords-' + v.id);
      if (el) el.textContent = fmtCoords(v, [ll.lat, ll.lng]);
    });
  });

  /* 附属/其他场地标记（可开关） */
  D.supplemental.forEach(function (s) {
    var g = wgs2gcj(s.wgs.lat, s.wgs.lng);
    var icon = L.divIcon({ className: '', html: '<div class="supp-marker">○</div>', iconSize: [20, 20], iconAnchor: [10, 10] });
    L.marker(g, { icon: icon }).bindPopup('<b>' + s.name + '</b><br><span style="font-size:.85rem">' + s.note + '</span>').addTo(suppLayer);
  });
  document.getElementById('showSupp').addEventListener('change', function (e) {
    if (e.target.checked) suppLayer.addTo(map); else map.removeLayer(suppLayer);
  });

  /* 校准模式 */
  document.getElementById('calibMode').addEventListener('change', function (e) {
    var on = e.target.checked;
    Object.keys(markers).forEach(function (k) { markers[k].dragging[on ? 'enable' : 'disable'](); });
    if (on) map.getContainer().style.cursor = 'crosshair';
    else map.getContainer().style.cursor = '';
  });
  document.getElementById('resetCalib').addEventListener('click', function () {
    calib = {}; saveCalib(calib);
    D.venues.forEach(function (v) {
      var raw = venueGcjRaw(v);
      markers[v.id].setLatLng(raw);
      if (v.pitch && pitchRects[v.id]) pitchRects[v.id].setBounds(pitchBounds(v.pitch));
      var el = document.getElementById('coords-' + v.id);
      if (el) el.textContent = fmtCoords(v, raw);
    });
  });

  function fmtCoords(v, gcj) {
    return 'GCJ-02（高德）: ' + gcj[0].toFixed(5) + ', ' + gcj[1].toFixed(5) +
      '　·　WGS-84: ' + v.wgs.lat.toFixed(5) + ', ' + v.wgs.lng.toFixed(5);
  }

  /* 视野包含全部场地 */
  (function fitAll() {
    var pts = D.venues.map(function (v) { return venueGcj(v); });
    map.fitBounds(L.latLngBounds(pts).pad(0.25));
  })();

  /* ---------- 渲染球场卡片 ---------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var listEl = document.getElementById('venueList');
  D.venues.forEach(function (v, i) {
    var color = CAMPUS_COLOR[v.campusKey] || '#94070a';
    var card = document.createElement('article');
    card.className = 'venue-card' + (i % 2 === 1 ? ' flip' : '');
    card.id = 'venue-' + v.id;
    card.dataset.campus = v.campusKey;
    card.dataset.cup = v.cupVenue ? '1' : '0';

    var mediaHtml;
    if (v.photos.length) {
      var thumbs = v.photos.slice(1, 5).map(function (p, ti) {
        return '<img src="images/' + p.f + '" alt="' + esc(p.c) + '" loading="lazy" data-venue="' + v.id + '" data-idx="' + (ti + 1) + '">';
      }).join('');
      mediaHtml =
        '<div class="vc-media">' +
        '<img class="vc-main-photo" src="images/' + v.photos[0].f + '" alt="' + esc(v.photos[0].c) + '" loading="lazy" data-venue="' + v.id + '" data-idx="0">' +
        '<div class="vc-thumbs">' + thumbs + '</div>' +
        '<span class="vc-photo-count">📷 ' + v.photos.length + ' 张</span></div>';
    } else {
      mediaHtml =
        '<div class="vc-media"><div class="vc-nophoto">' +
        '<div class="big">⚽</div><div>暂未收录公开照片</div>' +
        '<div style="font-size:.8rem">在上方地图切换卫星底图可查看实景<br>欢迎自行拍摄后放入 images/ 并更新 js/data.js</div>' +
        '</div></div>';
    }

    var facts = v.facts.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');
    var intro = v.intro.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    var tags = v.tags.map(function (t) { return '<span class="vc-tag">' + esc(t) + '</span>'; }).join('');
    var srcs = v.sources.map(function (s) { return '<li><a href="' + s.url + '" target="_blank" rel="noopener">' + esc(s.label) + '</a></li>'; }).join('');
    var gcj = venueGcj(v);
    var pitchNote = v.pitch ? ('足球场约 ' + v.pitch.w + '×' + v.pitch.h + ' 米') : '';

    card.innerHTML = mediaHtml +
      '<div class="vc-body">' +
      '<span class="vc-campus-badge" style="background:' + color + '">' + esc(v.campus) + '</span>' +
      (v.cupVenue ? '<span class="vc-cup-badge">🏆 振兴杯比赛场地</span>' : '') +
      '<h3>' + (i + 1) + '. ' + esc(v.name) + '</h3>' +
      '<div class="vc-alias">' + esc(v.alias) + ' ｜ ' + esc(v.en) + '</div>' +
      (v.cupNote ? '<div class="vc-alias" style="color:#a67c00">🏆 ' + esc(v.cupNote) + '</div>' : '') +
      '<div class="vc-tags">' + tags + '</div>' +
      '<div class="vc-intro">' + intro + '</div>' +
      '<ul class="vc-facts">' + facts + '</ul>' +
      '<div class="vc-coords" id="coords-' + v.id + '">' + fmtCoords(v, gcj) + (pitchNote ? '　·　' + pitchNote : '') + '</div>' +
      '<a class="vc-map-btn" href="#map-section" data-locate="' + v.id + '">📍 在地图查看</a> ' +
      '<a class="vc-map-btn vc-3d-btn" href="3d.html#' + v.id + '" target="_blank" rel="noopener">🎮 3D 视图</a>' +
      '<details class="vc-links"><summary>资料来源（' + v.sources.length + '）</summary><ul>' + srcs + '</ul></details>' +
      '</div>';
    listEl.appendChild(card);
  });

  /* 卡片内照片点击 → 灯箱 */
  var lb = { set: [], idx: 0 };
  var lbEl = document.getElementById('lightbox');
  var lbImg = document.getElementById('lbImg');
  var lbCap = document.getElementById('lbCap');
  var lbCr = document.getElementById('lbCr');

  function openLb(set, idx) {
    lb.set = set; lb.idx = idx;
    showLb();
    lbEl.classList.add('open');
    lbEl.setAttribute('aria-hidden', 'false');
  }
  function showLb() {
    var p = lb.set[lb.idx];
    lbImg.src = 'images/' + p.f;
    lbImg.alt = p.c;
    lbCap.textContent = p.c + '（' + (lb.idx + 1) + '/' + lb.set.length + '）';
    lbCr.textContent = p.cr || '';
  }
  function closeLb() { lbEl.classList.remove('open'); lbEl.setAttribute('aria-hidden', 'true'); }
  document.getElementById('lbClose').addEventListener('click', closeLb);
  lbEl.addEventListener('click', function (e) { if (e.target === lbEl) closeLb(); });
  document.getElementById('lbPrev').addEventListener('click', function () { lb.idx = (lb.idx - 1 + lb.set.length) % lb.set.length; showLb(); });
  document.getElementById('lbNext').addEventListener('click', function () { lb.idx = (lb.idx + 1) % lb.set.length; showLb(); });
  document.addEventListener('keydown', function (e) {
    if (!lbEl.classList.contains('open')) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') document.getElementById('lbPrev').click();
    if (e.key === 'ArrowRight') document.getElementById('lbNext').click();
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-venue]');
    if (!t) return;
    var v = D.venues.find(function (x) { return x.id === t.dataset.venue; });
    if (v && v.photos.length) openLb(v.photos, parseInt(t.dataset.idx || '0', 10));
  });

  /* 学部筛选 */
  document.querySelectorAll('#campusFilters .chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('#campusFilters .chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      var key = chip.dataset.campus;
      document.querySelectorAll('.venue-card').forEach(function (card) {
        var show = (key === 'all') || (key === 'cup' ? card.dataset.cup === '1' : card.dataset.campus === key);
        card.style.display = show ? '' : 'none';
      });
    });
  });

  /* 地图定位按钮 */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-locate]');
    if (!a) return;
    var id = a.dataset.locate;
    var mk = markers[id];
    if (mk) {
      map.setView(mk.getLatLng(), 17);
      mk.openPopup();
    }
  });

  /* ---------- 振兴杯赛事 ---------- */
  function setText(id, t) { var el = document.getElementById(id); if (el) el.textContent = t; }
  (function renderCup() {
    if (!D.cup) return;
    var c = D.cup;
    var podium = document.getElementById('podium');
    if (podium) {
      podium.innerHTML = c.y2025.champions.map(function (ch) {
        return '<div class="podium-card"><div class="p-medal">🏆</div><div class="p-group">' + esc(ch.group) + '</div><div class="p-team">' + esc(ch.team) + '</div></div>';
      }).join('');
    }
    var meta = document.getElementById('cupMeta');
    if (meta) {
      meta.innerHTML =
        '<li>📅 决赛：' + esc(c.y2025.finalDate) + ' · ' + esc(c.y2025.finalVenue) + '</li>' +
        '<li>⚔️ 赛制：' + esc(c.format) + '</li>' +
        '<li>👥 规模：' + c.y2025.teams + ' 支队伍 · ' + c.y2025.athletes + ' 名运动员</li>' +
        '<li>🏛️ ' + esc(c.host) + '</li>' +
        '<li>🎖️ ' + esc(c.y2025.awardNote) + '</li>' +
        '<li>✨ 初心：' + esc(c.motto) + '</li>';
    }
    setText('cupQuote', '“' + c.quote + '”');
    setText('cupQuoteFrom', c.quoteFrom);
  })();

  /* ---------- 总览 ---------- */
  var ovText = document.getElementById('overviewText');
  if (ovText) ovText.innerHTML = D.overview.paragraphs.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
  var ovPhoto = document.getElementById('overviewPhoto');
  if (ovPhoto) {
    var np = D.overview.nightPhoto;
    ovPhoto.innerHTML =
      '<img src="images/' + np.f + '" alt="' + esc(np.c) + '" loading="lazy" id="ov-photo">' +
      '<figcaption>' + esc(np.c) + ' ｜ ' + esc(np.cr) + '</figcaption>';
    document.getElementById('ov-photo').addEventListener('click', function () { openLb([np], 0); });
  }

  /* ---------- 时间线 ---------- */
  document.getElementById('timelineList').innerHTML = D.timeline.map(function (t) {
    return '<li><span class="t-year">' + esc(t.y) + '</span><span class="t-text">' + esc(t.t) + '</span></li>';
  }).join('');

  /* ---------- 其他场地 ---------- */
  document.getElementById('suppGrid').innerHTML = D.supplemental.map(function (s) {
    return '<div class="supp-card"><h3>' + esc(s.name) + '</h3><p>' + esc(s.note) + '</p>' +
      '<button class="supp-locate" data-supp="' + s.id + '">在地图定位</button></div>';
  }).join('');
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-supp]');
    if (!b) return;
    var s = D.supplemental.find(function (x) { return x.id === b.dataset.supp; });
    if (!s) return;
    if (!map.hasLayer(suppLayer)) {
      document.getElementById('showSupp').checked = true;
      suppLayer.addTo(map);
    }
    var g = wgs2gcj(s.wgs.lat, s.wgs.lng);
    map.setView(g, 17);
    suppLayer.eachLayer(function (ly) {
      if (ly.getLatLng && Math.abs(ly.getLatLng().lat - g[0]) < 1e-9) ly.openPopup();
    });
    document.getElementById('map-section').scrollIntoView({ behavior: 'smooth' });
  });

  /* ---------- 资料来源 ---------- */
  document.getElementById('creditList').innerHTML = D.credits.map(function (c) {
    return '<li><a href="' + c.url + '" target="_blank" rel="noopener">' + esc(c.label) + '</a></li>';
  }).join('');

  /* ---------- 统计数字 ---------- */
  setText('stat-cupvenues', D.venues.filter(function (v) { return v.cupVenue; }).length);
  if (D.cup) {
    setText('stat-teams', D.cup.y2025.teams);
    setText('stat-athletes', D.cup.y2025.athletes);
  }
  setText('stat-venues', D.venues.length);

  /* ---------- Hero 图片加载失败兜底 ---------- */
  var heroImg = new Image();
  heroImg.onerror = function () {
    document.querySelector('.hero-bg').style.background =
      'linear-gradient(135deg, #1c4a20 0%, #2e7d32 55%, #173d1b 100%)';
  };
  heroImg.src = 'images/912-aerial-1.jpg';
})();

/* ============================================================
 * 振兴杯球场巡礼 · app.js
 * 主站逻辑：WGS-84 → GCJ-02 转换、高德底图、Leaflet 标记/草坪框、
 * 卡片渲染与筛选、球场详情轮播、灯箱、拖动校准（localStorage）、
 * 球场足迹与分享海报、冷知识挑战、球场人格测试、统计与时间线渲染
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- WGS-84 → GCJ-02（标准 eviltransform 算法） ---------- */
  var PI = Math.PI,
    A = 6378245.0;
  /* 标准 eviltransform 常数 ee = 0.00669342162296594323；双精度下实际取值如下（两者 === 为 true） */
  var EE = 0.006693421622965943;
  function outOfChina(lat, lon) {
    return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }
  function tLat(x, y) {
    var r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
    r += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
    r += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
    return r;
  }
  function tLon(x, y) {
    var r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
    r += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
    r += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
    return r;
  }
  function wgs2gcj(wLat, wLon) {
    if (outOfChina(wLat, wLon)) {
      return [wLat, wLon];
    }
    var dLat = tLat(wLon - 105.0, wLat - 35.0);
    var dLon = tLon(wLon - 105.0, wLat - 35.0);
    var radLat = (wLat / 180.0) * PI;
    var magic = Math.sin(radLat);
    magic = 1 - EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
    dLon = (dLon * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
    return [wLat + dLat, wLon + dLon];
  }

  var D = window.WHU_FOOTBALL;
  if (!D) {
    /* data.js 未加载或加载失败时，整页渲染都会失败：这里显式失败并停下，
       避免后面每一处 D.xxx 都抛一个难以定位的错误 */
    console.error('[app] js/data.js 未加载或加载失败，页面无法初始化');
    return;
  }
  var CAMPUS_COLOR = { wl: '#a4243b', gx: '#22577a', xx: '#2e7d32' };
  var CALIB_KEY = 'whuFbCalibV1';

  function loadCalib() {
    try {
      return JSON.parse(localStorage.getItem(CALIB_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }
  function saveCalib(c) {
    try {
      localStorage.setItem(CALIB_KEY, JSON.stringify(c));
    } catch (e) {
      /* file:// 下可能受限 */
    }
  }
  var calib = loadCalib();

  /* 场地 GCJ 坐标（含校准偏移） */
  function venueGcj(v) {
    if (calib[v.id]) {
      return calib[v.id];
    }
    return wgs2gcj(v.wgs.lat, v.wgs.lng);
  }
  function venueGcjRaw(v) {
    return wgs2gcj(v.wgs.lat, v.wgs.lng);
  }

  /* ---------- 地图 ---------- */
  var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([30.5455, 114.36], 14);

  var satTiles = L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
    subdomains: ['1', '2', '3', '4'],
    maxZoom: 18
  });
  var satLabels = L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}', {
    subdomains: ['1', '2', '3', '4'],
    maxZoom: 18
  });
  var roadTiles = L.tileLayer(
    'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    {
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 18
    }
  );
  var satGroup = L.layerGroup([satTiles, satLabels]).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  document.querySelectorAll('#layerSwitch button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#layerSwitch button').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      if (btn.dataset.layer === 'sat') {
        if (map.hasLayer(roadTiles)) {
          map.removeLayer(roadTiles);
        }
        satGroup.addTo(map);
      } else {
        if (map.hasLayer(satGroup)) {
          map.removeLayer(satGroup);
        }
        roadTiles.addTo(map);
      }
    });
  });

  /* 标记与草坪框 */
  var markers = {},
    pitchRects = {},
    suppLayer = L.layerGroup();

  function pitchBounds(p) {
    var g = wgs2gcj(p.lat, p.lng);
    var dLat = p.h / 2 / 110540;
    var dLon = p.w / 2 / (111320 * Math.cos((g[0] * PI) / 180));
    return [
      [g[0] - dLat, g[1] - dLon],
      [g[0] + dLat, g[1] + dLon]
    ];
  }

  D.venues.forEach(function (v, i) {
    var pos = venueGcj(v);
    var color = CAMPUS_COLOR[v.campusKey] || '#94070a';
    var icon = L.divIcon({
      className: '',
      html: '<div class="venue-marker" style="background:' + color + '"><span>' + (i + 1) + '</span></div>',
      iconSize: [34, 34],
      iconAnchor: [17, 32],
      popupAnchor: [0, -30]
    });
    var thumb = v.photos.length
      ? '<img src="images/' + v.photos[0].f + '" alt="">'
      : '<div style="height:110px;border-radius:8px;background:linear-gradient(135deg,#2e7d32,#1c4a20);display:flex;align-items:center;justify-content:center;font-size:2rem">⚽</div>';
    var popupHtml =
      '<div class="popup-card">' +
      thumb +
      '<div class="pc-name">' +
      (v.cupVenue ? '🏆 ' : '') +
      v.name +
      '</div>' +
      '<span class="pc-campus" style="background:' +
      color +
      '">' +
      v.campus +
      '</span>' +
      '<a href="#venue-' +
      v.id +
      '">照片详情 ↓</a> ｜ <a href="3d.html#' +
      v.id +
      '">🎮 3D</a></div>';
    var mk = L.marker(pos, { icon: icon, draggable: false }).addTo(map).bindPopup(popupHtml);
    markers[v.id] = mk;

    if (v.pitch) {
      pitchRects[v.id] = L.rectangle(pitchBounds(v.pitch), {
        color: '#ffffff',
        weight: 2,
        dashArray: '6 5',
        fill: '#3fa54a',
        fillOpacity: 0.18
      }).addTo(map);
    }

    mk.on('dragend', function () {
      var ll = mk.getLatLng();
      calib[v.id] = [ll.lat, ll.lng];
      saveCalib(calib);
      if (v.pitch && pitchRects[v.id]) {
        var raw = venueGcjRaw(v);
        var dLat = ll.lat - raw[0],
          dLon = ll.lng - raw[1];
        var b = pitchBounds(v.pitch);
        pitchRects[v.id].setBounds([
          [b[0][0] + dLat, b[0][1] + dLon],
          [b[1][0] + dLat, b[1][1] + dLon]
        ]);
      }
      var el = document.getElementById('coords-' + v.id);
      if (el) {
        el.textContent = fmtCoords(v, [ll.lat, ll.lng]);
      }
    });
  });

  /* 附属/其他场地标记（可开关） */
  D.supplemental.forEach(function (s) {
    var g = wgs2gcj(s.wgs.lat, s.wgs.lng);
    var icon = L.divIcon({
      className: '',
      html: '<div class="supp-marker">○</div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    L.marker(g, { icon: icon })
      .bindPopup('<b>' + s.name + '</b><br><span style="font-size:.85rem">' + s.note + '</span>')
      .addTo(suppLayer);
  });
  document.getElementById('showSupp').addEventListener('change', function (e) {
    if (e.target.checked) {
      suppLayer.addTo(map);
    } else {
      map.removeLayer(suppLayer);
    }
  });

  /* 校准模式 */
  document.getElementById('calibMode').addEventListener('change', function (e) {
    var on = e.target.checked;
    Object.keys(markers).forEach(function (k) {
      markers[k].dragging[on ? 'enable' : 'disable']();
    });
    if (on) {
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.getContainer().style.cursor = '';
    }
  });
  document.getElementById('resetCalib').addEventListener('click', function () {
    calib = {};
    saveCalib(calib);
    D.venues.forEach(function (v) {
      var raw = venueGcjRaw(v);
      markers[v.id].setLatLng(raw);
      if (v.pitch && pitchRects[v.id]) {
        pitchRects[v.id].setBounds(pitchBounds(v.pitch));
      }
      var el = document.getElementById('coords-' + v.id);
      if (el) {
        el.textContent = fmtCoords(v, raw);
      }
    });
  });

  function fmtCoords(v, gcj) {
    return (
      'GCJ-02（高德）: ' +
      gcj[0].toFixed(5) +
      ', ' +
      gcj[1].toFixed(5) +
      '　·　WGS-84: ' +
      v.wgs.lat.toFixed(5) +
      ', ' +
      v.wgs.lng.toFixed(5)
    );
  }

  /* 视野包含全部场地 */
  (function fitAll() {
    var pts = D.venues.map(function (v) {
      return venueGcj(v);
    });
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

    var mediaHtml;
    if (v.photos.length) {
      var thumbs = v.photos
        .slice(1, 5)
        .map(function (p, ti) {
          return (
            '<img src="images/' +
            p.f +
            '" alt="' +
            esc(p.c) +
            '" loading="lazy" data-venue="' +
            v.id +
            '" data-idx="' +
            (ti + 1) +
            '">'
          );
        })
        .join('');
      mediaHtml =
        '<div class="vc-media">' +
        '<div class="vc-slider" data-venue="' +
        v.id +
        '">' +
        '<div class="vc-track">' +
        v.photos
          .map(function (p, pi) {
            return (
              '<figure class="vc-slide"><img src="images/' +
              p.f +
              '" alt="' +
              esc(p.c) +
              '" loading="' +
              (pi === 0 ? 'eager' : 'lazy') +
              '" draggable="false"></figure>'
            );
          })
          .join('') +
        '</div>' +
        (v.photos.length > 1
          ? '<div class="vc-dots">' +
            v.photos
              .map(function (p, pi) {
                return '<i data-i="' + pi + '"' + (pi === 0 ? ' class="on"' : '') + '></i>';
              })
              .join('') +
            '</div>' +
            '<button class="vc-nav prev" type="button" aria-label="上一张">‹</button>' +
            '<button class="vc-nav next" type="button" aria-label="下一张">›</button>'
          : '') +
        '</div>' +
        '<div class="vc-thumbs">' +
        thumbs +
        '</div>' +
        '<span class="vc-photo-count">📷 ' +
        v.photos.length +
        ' 张</span></div>';
    } else {
      mediaHtml =
        '<div class="vc-media"><div class="vc-nophoto">' +
        '<div class="big">⚽</div><div>暂未收录公开照片</div>' +
        '<div style="font-size:.8rem">在上方地图切换卫星底图可查看实景<br>欢迎自行拍摄后放入 images/ 并更新 js/data.js</div>' +
        '</div></div>';
    }

    var facts = v.facts
      .map(function (f) {
        return '<li>' + esc(f) + '</li>';
      })
      .join('');
    var intro = v.intro
      .map(function (p) {
        return '<p>' + esc(p) + '</p>';
      })
      .join('');
    var tags = v.tags
      .map(function (t) {
        return '<span class="vc-tag">' + esc(t) + '</span>';
      })
      .join('');
    var srcs = v.sources
      .map(function (s) {
        return '<li><a href="' + s.url + '" target="_blank" rel="noopener">' + esc(s.label) + '</a></li>';
      })
      .join('');
    var gcj = venueGcj(v);
    var pitchNote = v.pitch ? '足球场约 ' + v.pitch.w + '×' + v.pitch.h + ' 米' : '';

    card.innerHTML =
      mediaHtml +
      '<div class="vc-body">' +
      '<span class="vc-campus-badge" style="background:' +
      color +
      '">' +
      esc(v.campus) +
      '</span>' +
      (v.cupVenue ? '<span class="vc-cup-badge">🏆 振兴杯比赛场地</span>' : '') +
      '<h3>' +
      (i + 1) +
      '. ' +
      esc(v.name) +
      '</h3>' +
      '<div class="vc-alias">' +
      esc(v.alias) +
      ' ｜ ' +
      esc(v.en) +
      '</div>' +
      (v.cupNote ? '<div class="vc-alias" style="color:#a67c00">🏆 ' + esc(v.cupNote) + '</div>' : '') +
      '<div class="vc-tags">' +
      tags +
      '</div>' +
      '<div class="vc-intro">' +
      intro +
      '</div>' +
      '<ul class="vc-facts">' +
      facts +
      '</ul>' +
      '<div class="vc-coords" id="coords-' +
      v.id +
      '">' +
      fmtCoords(v, gcj) +
      (pitchNote ? '　·　' + pitchNote : '') +
      '</div>' +
      '<a class="vc-map-btn" href="#map-section" data-locate="' +
      v.id +
      '">📍 在地图查看</a> ' +
      '<a class="vc-map-btn vc-3d-btn" href="3d.html#' +
      v.id +
      '" target="_blank" rel="noopener">🎮 3D 视图</a>' +
      '<details class="vc-links"><summary>资料来源（' +
      v.sources.length +
      '）</summary><ul>' +
      srcs +
      '</ul></details>' +
      '</div>';
    listEl.appendChild(card);
  });

  /* ---------- 卡片轮播：自动滚动 + 手指/鼠标拖拽 ---------- */
  var sliderStates = [];
  function sliderGoTo(st, i, animate) {
    st.i = (i + st.n) % st.n;
    st.track.style.transition = animate ? '' : 'none';
    st.track.style.transform = 'translateX(' + -st.i * 100 + '%)';
    if (!animate) {
      void st.track.offsetWidth;
      st.track.style.transition = '';
    }
    st.dots.forEach(function (d, k) {
      d.classList.toggle('on', k === st.i);
    });
  }
  function sliderSchedule(st, delay) {
    clearTimeout(st.timer);
    st.timer = setTimeout(function () {
      if (!(document.hidden || !st.visible || st.hover || st.dragging || Date.now() < st.pausedUntil)) {
        sliderGoTo(st, st.i + 1, true);
      }
      sliderSchedule(st, 4200);
    }, delay);
  }
  function initSliders() {
    document.querySelectorAll('.vc-slider').forEach(function (root) {
      var vid = root.dataset.venue;
      var v = D.venues.find(function (x) {
        return x.id === vid;
      });
      if (!v || !v.photos.length) {
        return;
      }
      var st = {
        root: root,
        track: root.querySelector('.vc-track'),
        dots: Array.prototype.slice.call(root.querySelectorAll('.vc-dots i')),
        n: v.photos.length,
        i: 0,
        vid: vid,
        pausedUntil: 0,
        lastDragEnd: 0,
        visible: true,
        hover: false,
        dragging: false,
        moved: false,
        startX: 0,
        startT: 0,
        baseOffset: 0,
        timer: null
      };
      root._st = st;
      sliderStates.push(st);
      sliderGoTo(st, 0, false);
      /* 圆点指示器：点击直达 */
      st.dots.forEach(function (d) {
        d.addEventListener('click', function (e) {
          e.stopPropagation();
          sliderGoTo(st, parseInt(d.dataset.i, 10), true);
          st.pausedUntil = Date.now() + 8000;
        });
      });
      /* 左右切换按钮 */
      var navBtns = root.querySelectorAll('.vc-nav');
      navBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          sliderGoTo(st, st.i + (btn.classList.contains('next') ? 1 : -1), true);
          st.pausedUntil = Date.now() + 8000;
        });
      });
      /* 拖拽/滑动（Pointer Events：横向切图，纵向照常滚动页面） */
      root.addEventListener('pointerdown', function (e) {
        if (st.n < 2 || e.button === 2) {
          return;
        }
        if (e.target.closest && e.target.closest('.vc-nav, .vc-dots')) {
          return;
        } /* 按钮/圆点不参与拖拽，保证 click 正常触发 */
        st.dragging = true;
        st.moved = false;
        st.startX = e.clientX;
        st.startT = Date.now();
        st.baseOffset = -st.i * root.clientWidth;
        st.track.style.transition = 'none';
        try {
          root.setPointerCapture(e.pointerId);
        } catch (err) {
          /* 老内核降级 */
        }
        root.classList.add('dragging');
      });
      root.addEventListener('pointermove', function (e) {
        if (!st.dragging) {
          return;
        }
        var dx = e.clientX - st.startX;
        if (Math.abs(dx) > 6) {
          st.moved = true;
        }
        var off = st.baseOffset + dx;
        if ((st.i === 0 && dx > 0) || (st.i === st.n - 1 && dx < 0)) {
          off = st.baseOffset + dx * 0.35;
        } /* 端头回弹 */
        st.track.style.transform = 'translateX(' + off + 'px)';
      });
      function endDrag(e) {
        if (!st.dragging) {
          return;
        }
        st.dragging = false;
        root.classList.remove('dragging');
        if (!st.moved) {
          st.track.style.transition = '';
          return;
        } /* 纯点击：不翻页、不暂停，放行灯箱点击 */
        st.lastDragEnd = Date.now();
        var dx = (typeof e.clientX === 'number' ? e.clientX : st.startX) - st.startX;
        var dt = Math.max((Date.now() - st.startT) / 1000, 0.05);
        var vel = dx / dt;
        var thresh = Math.min(root.clientWidth * 0.2, 90);
        var target = st.i;
        if (dx < -thresh || vel < -420) {
          target = st.i + 1;
        } /* 快甩也翻页 */
        else if (dx > thresh || vel > 420) {
          target = st.i - 1;
        }
        sliderGoTo(st, target, true);
        st.pausedUntil = Date.now() + 8000; /* 手动操作后暂停自动滚动 8 秒 */
      }
      root.addEventListener('pointerup', endDrag);
      root.addEventListener('pointercancel', endDrag);
      root.addEventListener('mouseenter', function () {
        st.hover = true;
      });
      root.addEventListener('mouseleave', function () {
        st.hover = false;
      });
      /* 各卡片错开相位启动，避免同时翻页 */
      sliderSchedule(st, 2600 + (sliderStates.length % 4) * 900);
    });
    /* 只有进入视口的卡片才自动滚动（省流量省电） */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.target._st) {
              en.target._st.visible = en.isIntersecting;
            }
          });
        },
        { threshold: 0.3 }
      );
      sliderStates.forEach(function (st) {
        io.observe(st.root);
      });
    }
  }
  initSliders();

  /* 卡片内照片点击 → 灯箱 */
  var lb = { set: [], idx: 0 };
  var lbEl = document.getElementById('lightbox');
  var lbImg = document.getElementById('lbImg');
  var lbCap = document.getElementById('lbCap');
  var lbCr = document.getElementById('lbCr');

  function openLb(set, idx) {
    lb.set = set;
    lb.idx = idx;
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
  function closeLb() {
    lbEl.classList.remove('open');
    lbEl.setAttribute('aria-hidden', 'true');
  }
  document.getElementById('lbClose').addEventListener('click', closeLb);
  lbEl.addEventListener('click', function (e) {
    if (e.target === lbEl) {
      closeLb();
    }
  });
  document.getElementById('lbPrev').addEventListener('click', function () {
    lb.idx = (lb.idx - 1 + lb.set.length) % lb.set.length;
    showLb();
  });
  document.getElementById('lbNext').addEventListener('click', function () {
    lb.idx = (lb.idx + 1) % lb.set.length;
    showLb();
  });
  /* 移动端：灯箱左右滑动切换 */
  var touchX0 = null;
  lbEl.addEventListener(
    'touchstart',
    function (e) {
      touchX0 = e.changedTouches[0].clientX;
    },
    { passive: true }
  );
  lbEl.addEventListener(
    'touchend',
    function (e) {
      if (touchX0 === null) {
        return;
      }
      var dx = e.changedTouches[0].clientX - touchX0;
      if (Math.abs(dx) > 50) {
        if (dx > 0) {
          document.getElementById('lbPrev').click();
        } else {
          document.getElementById('lbNext').click();
        }
      }
      touchX0 = null;
    },
    { passive: true }
  );
  document.addEventListener('keydown', function (e) {
    if (!lbEl.classList.contains('open')) {
      return;
    }
    if (e.key === 'Escape') {
      closeLb();
    }
    if (e.key === 'ArrowLeft') {
      document.getElementById('lbPrev').click();
    }
    if (e.key === 'ArrowRight') {
      document.getElementById('lbNext').click();
    }
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('.vc-3d-btn')) {
      return;
    }
    var t = e.target.closest('[data-venue]');
    if (!t) {
      return;
    }
    var v = D.venues.find(function (x) {
      return x.id === t.dataset.venue;
    });
    if (!v || !v.photos.length) {
      return;
    }
    var idx = parseInt(t.dataset.idx || '0', 10);
    var sliderEl = t.classList.contains('vc-slider') ? t : t.querySelector ? t.querySelector('.vc-slider') : null;
    if (sliderEl && sliderEl._st) {
      if (Date.now() - sliderEl._st.lastDragEnd < 300) {
        return;
      } /* 拖拽后不触发点击 */
      idx = sliderEl._st.i; /* 以轮播当前页打开灯箱 */
    }
    openLb(v.photos, idx);
  });

  /* 学部 / 球场筛选 */
  document.querySelectorAll('#campusFilters .chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('#campusFilters .chip').forEach(function (c) {
        c.classList.remove('active');
      });
      chip.classList.add('active');
      var key = chip.dataset.campus;
      var venueId = chip.dataset.venueFilter;
      document.querySelectorAll('.venue-card').forEach(function (card) {
        var show = venueId ? card.id === 'venue-' + venueId : key === 'all' || card.dataset.campus === key;
        card.style.display = show ? '' : 'none';
      });
    });
  });

  /* 地图定位按钮 */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-locate]');
    if (!a) {
      return;
    }
    var id = a.dataset.locate;
    var mk = markers[id];
    if (mk) {
      map.setView(mk.getLatLng(), 17);
      mk.openPopup();
    }
  });

  /* ---------- 振兴杯赛事 ---------- */
  function setText(id, t) {
    var el = document.getElementById(id);
    if (el) {
      el.textContent = t;
    }
  }
  (function renderCup() {
    if (!D.cup) {
      return;
    }
    var c = D.cup;
    var podium = document.getElementById('podium');
    if (podium) {
      podium.innerHTML = c.y2025.champions
        .map(function (ch) {
          return (
            '<div class="podium-card"><div class="p-medal">🏆</div><div class="p-group">' +
            esc(ch.group) +
            '</div><div class="p-team">' +
            esc(ch.team) +
            '</div></div>'
          );
        })
        .join('');
    }
    var meta = document.getElementById('cupMeta');
    if (meta) {
      meta.innerHTML =
        '<li>📅 决赛：' +
        esc(c.y2025.finalDate) +
        ' · ' +
        esc(c.y2025.finalVenue) +
        '</li>' +
        '<li>⚔️ 赛制：' +
        esc(c.format) +
        '</li>' +
        '<li>👥 规模：' +
        c.y2025.teams +
        ' 支队伍 · ' +
        c.y2025.athletes +
        ' 名运动员</li>' +
        '<li>🏛️ ' +
        esc(c.host) +
        '</li>' +
        '<li>🎖️ ' +
        esc(c.y2025.awardNote) +
        '</li>' +
        '<li>✨ 初心：' +
        esc(c.motto) +
        '</li>';
    }
    setText('cupQuote', '“' + c.quote + '”');
    setText('cupQuoteFrom', c.quoteFrom);
  })();

  /* ---------- 总览 ---------- */
  var ovText = document.getElementById('overviewText');
  if (ovText) {
    ovText.innerHTML = D.overview.paragraphs
      .map(function (p) {
        return '<p>' + esc(p) + '</p>';
      })
      .join('');
  }
  var ovPhoto = document.getElementById('overviewPhoto');
  if (ovPhoto) {
    var np = D.overview.nightPhoto;
    ovPhoto.innerHTML =
      '<img src="images/' +
      np.f +
      '" alt="' +
      esc(np.c) +
      '" loading="lazy" id="ov-photo">' +
      '<figcaption>' +
      esc(np.c) +
      ' ｜ ' +
      esc(np.cr) +
      '</figcaption>';
    document.getElementById('ov-photo').addEventListener('click', function () {
      openLb([np], 0);
    });
  }

  /* ---------- 时间线 ---------- */
  document.getElementById('timelineList').innerHTML = D.timeline
    .map(function (t) {
      return '<li><span class="t-year">' + esc(t.y) + '</span><span class="t-text">' + esc(t.t) + '</span></li>';
    })
    .join('');

  /* ---------- 其他场地 ---------- */
  document.getElementById('suppGrid').innerHTML = D.supplemental
    .map(function (s) {
      return (
        '<div class="supp-card"><h3>' +
        esc(s.name) +
        '</h3><p>' +
        esc(s.note) +
        '</p>' +
        '<button class="supp-locate" data-supp="' +
        s.id +
        '">在地图定位</button></div>'
      );
    })
    .join('');
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-supp]');
    if (!b) {
      return;
    }
    var s = D.supplemental.find(function (x) {
      return x.id === b.dataset.supp;
    });
    if (!s) {
      return;
    }
    if (!map.hasLayer(suppLayer)) {
      document.getElementById('showSupp').checked = true;
      suppLayer.addTo(map);
    }
    var g = wgs2gcj(s.wgs.lat, s.wgs.lng);
    map.setView(g, 17);
    suppLayer.eachLayer(function (ly) {
      if (ly.getLatLng && Math.abs(ly.getLatLng().lat - g[0]) < 1e-9) {
        ly.openPopup();
      }
    });
    document.getElementById('map-section').scrollIntoView({ behavior: 'smooth' });
  });

  /* ---------- 资料来源 ---------- */
  document.getElementById('creditList').innerHTML = D.credits
    .map(function (c) {
      return '<li><a href="' + c.url + '" target="_blank" rel="noopener">' + esc(c.label) + '</a></li>';
    })
    .join('');

  /* ---------- 统计数字 ---------- */
  setText(
    'stat-cupvenues',
    D.venues.filter(function (v) {
      return v.cupVenue;
    }).length
  );
  if (D.cup) {
    setText('stat-teams', D.cup.y2025.teams);
    setText('stat-athletes', D.cup.y2025.athletes);
  }
  setText('stat-venues', D.venues.length);

  /* ---------- 我的球场足迹 ---------- */
  var FP_KEY = 'whuFpV1';
  function loadFp() {
    try {
      return JSON.parse(localStorage.getItem(FP_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function saveFp(a) {
    try {
      localStorage.setItem(FP_KEY, JSON.stringify(a));
    } catch (e) {
      /* file:// 下可能受限 */
    }
  }
  var fpSet = {};
  loadFp().forEach(function (id) {
    fpSet[id] = true;
  });

  var fpItems = D.venues
    .map(function (v) {
      return { id: v.id, name: v.name, sub: v.campus, cup: true };
    })
    .concat(
      D.supplemental.map(function (s) {
        return { id: s.id, name: s.name, sub: '其他场地', cup: false };
      })
    );

  var fpGrid = document.getElementById('fpGrid');
  fpGrid.innerHTML = fpItems
    .map(function (it) {
      return (
        '<button class="fp-card" data-fp="' +
        it.id +
        '" aria-pressed="false">' +
        '<span class="fp-check">✓</span>' +
        '<span class="fp-name">' +
        esc(it.name) +
        '</span>' +
        '<span class="fp-sub">' +
        (it.cup ? '🏆 ' : '') +
        esc(it.sub) +
        '</span>' +
        '</button>'
      );
    })
    .join('');

  var FP_RANKS = [
    [0, '☁️ 云看球选手', '先点亮一座球场吧'],
    [1, '🌱 初来乍到', '珞珈绿茵向你敞开'],
    [3, '⚽ 绿茵常客', '球场都认得你的球鞋了'],
    [5, '🔥 珞珈球痴', '哪块草皮没留下你的脚印？'],
    [7, '👑 球场传奇', '你就是武大足球的活地图']
  ];
  function fpRank(n) {
    var r = FP_RANKS[0];
    FP_RANKS.forEach(function (x) {
      if (n >= x[0]) {
        r = x;
      }
    });
    return r;
  }

  function renderFp() {
    var n = 0;
    fpItems.forEach(function (it) {
      if (fpSet[it.id]) {
        n++;
      }
    });
    document.querySelectorAll('.fp-card').forEach(function (c) {
      var on = !!fpSet[c.dataset.fp];
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.getElementById('fpBar').style.width = Math.round((n / fpItems.length) * 100) + '%';
    document.getElementById('fpCount').textContent = '已点亮 ' + n + ' / ' + fpItems.length + ' 座场地';
    var r = fpRank(n);
    document.getElementById('fpRank').innerHTML = '<b>' + r[1] + '</b><span>' + r[2] + '</span>';
  }
  fpGrid.addEventListener('click', function (e) {
    var c = e.target.closest('.fp-card');
    if (!c) {
      return;
    }
    if (fpSet[c.dataset.fp]) {
      delete fpSet[c.dataset.fp];
    } else {
      fpSet[c.dataset.fp] = true;
    }
    saveFp(Object.keys(fpSet));
    renderFp();
  });
  document.getElementById('fpReset').addEventListener('click', function () {
    fpSet = {};
    saveFp([]);
    renderFp();
  });
  renderFp();

  /* ---------- 分享海报（纯 Canvas 矢量绘制，不引入照片，file:// 下也能导出） ---------- */
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) {
      c.roundRect(x, y, w, h, r);
      return;
    }
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function drawPoster() {
    var W = 750,
      H = 1200;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var c = cv.getContext('2d');
    var lit = fpItems.filter(function (it) {
      return fpSet[it.id];
    });
    var n = lit.length;
    var rank = fpRank(n);
    var YH = '"Microsoft YaHei", "PingFang SC", sans-serif';

    /* 背景：武大红渐变 + 中圈装饰 */
    var bg = c.createLinearGradient(0, 0, W * 0.4, H);
    bg.addColorStop(0, '#8c1523');
    bg.addColorStop(0.55, '#a4243b');
    bg.addColorStop(1, '#57101f');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,0.07)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(W / 2, 620, 320, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(W / 2, 620, 235, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(255,214,122,0.92)';
    c.fillRect(0, 0, W, 10);
    c.fillRect(0, H - 10, W, 10);

    /* 头部 */
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = 'rgba(255,235,200,0.92)';
    c.font = '26px ' + YH;
    c.fillText('武汉大学足球协会 · 振兴杯球场巡礼', W / 2, 82);
    c.fillStyle = '#ffffff';
    c.font = 'bold 64px ' + YH;
    c.fillText('我 的 球 场 足 迹', W / 2, 172);
    c.strokeStyle = 'rgba(255,214,122,0.7)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(W / 2 - 135, 208);
    c.lineTo(W / 2 + 135, 208);
    c.stroke();

    /* 中央统计 */
    c.fillStyle = '#ffd67a';
    c.font = 'bold 118px Georgia, serif';
    c.fillText(String(n), W / 2 - 46, 356);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = '30px ' + YH;
    c.textAlign = 'left';
    c.fillText('/ ' + fpItems.length + ' 座', W / 2 + 26, 356);
    c.textAlign = 'center';
    c.fillStyle = '#ffffff';
    c.font = 'bold 42px ' + YH;
    c.fillText(rank[1], W / 2, 442);
    c.fillStyle = 'rgba(255,230,200,0.85)';
    c.font = '24px ' + YH;
    c.fillText(rank[2], W / 2, 484);

    /* 已点亮场地列表（两列卡片） */
    var startY = 548;
    if (n === 0) {
      c.fillStyle = 'rgba(255,255,255,0.72)';
      c.font = '26px ' + YH;
      c.fillText('还没有点亮任何球场', W / 2, startY + 60);
      c.fillText('回到页面，点亮你的第一片绿茵吧 ⚽', W / 2, startY + 106);
    } else {
      lit.forEach(function (it, i) {
        var colm = i % 2,
          row = Math.floor(i / 2);
        var x = 70 + colm * 330,
          y = startY + row * 94;
        c.fillStyle = 'rgba(255,255,255,0.12)';
        rr(c, x, y, 300, 74, 14);
        c.fill();
        c.strokeStyle = 'rgba(255,214,122,0.35)';
        c.lineWidth = 1.5;
        rr(c, x, y, 300, 74, 14);
        c.stroke();
        c.textAlign = 'left';
        c.fillStyle = '#ffd67a';
        c.font = 'bold 30px ' + YH;
        c.fillText('✓', x + 18, y + 48);
        c.fillStyle = '#ffffff';
        c.font = 'bold 26px ' + YH;
        c.fillText(it.name, x + 58, y + 34);
        c.fillStyle = it.cup ? 'rgba(255,214,122,0.92)' : 'rgba(255,255,255,0.62)';
        c.font = '18px ' + YH;
        c.fillText(it.cup ? '🏆 振兴杯比赛场地' : it.sub, x + 58, y + 60);
      });
      c.textAlign = 'center';
    }

    /* 底部 */
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.font = '22px ' + YH;
    c.fillText('珞珈绿茵之上，青春永不落幕', W / 2, 1062);
    var d = new Date();
    c.fillStyle = 'rgba(255,235,200,0.92)';
    c.font = 'bold 26px ' + YH;
    c.fillText('⚽ 振兴杯球场巡礼 · ' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月', W / 2, 1120);
    return cv.toDataURL('image/png');
  }

  var pmEl = document.getElementById('posterModal');
  if (!('ontouchstart' in window)) {
    document.getElementById('pmTip').textContent = '右键图片另存，或点击下方按钮下载';
  }
  function showPoster(url, filename, alt) {
    document.getElementById('pmImg').src = url;
    document.getElementById('pmImg').alt = alt;
    document.getElementById('pmDl').href = url;
    document.getElementById('pmDl').download = filename;
    pmEl.classList.add('open');
    pmEl.setAttribute('aria-hidden', 'false');
  }
  document.getElementById('fpPoster').addEventListener('click', function () {
    try {
      showPoster(drawPoster(), '我的武大球场足迹.png', '我的武大球场足迹分享海报');
    } catch (e) {
      alert('海报生成失败：' + e.message);
    }
  });
  function closePm() {
    pmEl.classList.remove('open');
    pmEl.setAttribute('aria-hidden', 'true');
  }
  document.getElementById('pmClose').addEventListener('click', closePm);
  pmEl.addEventListener('click', function (e) {
    if (e.target === pmEl) {
      closePm();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && pmEl.classList.contains('open')) {
      closePm();
    }
  });

  /* ---------- 冷知识挑战 ---------- */
  var QUIZ_LETTERS = 'ABCD';
  var QUIZ = [
    {
      q: '“九一二操场”这个名字来自哪一年发生的大事？',
      opts: [
        '1937 年军官训练团检阅',
        '1958 年 9 月 12 日毛泽东主席在此接见高校师生',
        '2001 年扩建为标准化运动场',
        '2017 年毕业典礼航拍'
      ],
      a: 1,
      why: '1958 年 9 月 12 日，毛泽东主席视察武汉大学，在行政楼前操场接见武昌地区几所高校师生，操场因此得名“九一二”。'
    },
    {
      q: '九一二操场位于哪两座历史建筑之间的中轴线上？',
      opts: ['行政楼与老理学院（理学楼）', '宋卿体育馆与桂园食堂', '工学部体育馆与松园', '信息学部图书馆与星湖'],
      a: 0,
      why: '九一二操场端坐在老工学院（今行政楼）与老理学院的中轴线上，被行政楼、人文科学馆、理学楼等历史建筑环抱。'
    },
    {
      q: '桂园田径场东侧是哪座 1936 年竣工的建筑？',
      opts: ['宋卿体育馆', '卓尔体育馆', '鲲鹏广场', '竹园体育馆'],
      a: 0,
      why: '宋卿体育馆 1936 年竣工，坐落桂园田径场东侧；鲲鹏广场在桂园东北，竹园体育馆在信息学部。'
    },
    {
      q: '2025 年“振兴杯”有多少支队伍、多少名运动员参赛？',
      opts: [
        '30 支队伍 / 600 名运动员',
        '41 支队伍 / 872 名运动员',
        '48 支队伍 / 1000 名运动员',
        '36 支队伍 / 720 名运动员'
      ],
      a: 1,
      why: '2025 年“振兴杯”共有 41 支队伍、872 名运动员参赛，设男子超级组、男子甲级组与女子组。'
    },
    {
      q: '2025 年“振兴杯”决赛在哪座球场举行？',
      opts: ['九一二操场', '桂园田径场', '工学部田径场', '信息学部操场（竹园操场）'],
      a: 3,
      why: '2025 年 12 月 6 日，决赛在信息学部操场举行，这里就是四大球场中的“信操”。'
    },
    {
      q: '2025 年“振兴杯”男子超级组冠军是哪支队伍？',
      opts: ['计算机学院', '文学院', '文理联队', '数学与统计学院'],
      a: 0,
      why: '计算机学院获男子超级组冠军，文学院获男子甲级组冠军，文理联队获女子组冠军。'
    },
    {
      q: '全校唯一拥有 3300 余座、可承办省部级田径比赛的二类标准体育场是？',
      opts: ['九一二操场', '桂园田径场', '工学部田径场（松园操场）', '信息学部田径场'],
      a: 2,
      why: '工学部田径场是全校唯一的 3300 余座位二类标准体育场，学校龙舟队的训练场地也设在这里。'
    },
    {
      q: '2024 年全校五人制足球赛决赛在哪个场地举行？',
      opts: ['桂园足球场（带挡板的五人制场地）', '九一二操场', '信息学部操场', '梅园操场'],
      a: 0,
      why: '2024 年 4 月，全校学生校园五人制足球赛决赛在桂园足球场举行：数学与统计学院一队、经济与管理学院一队分获男女冠军。'
    },
    {
      q: '2017 年 6 月 22 日清晨，九一二操场上发生了什么“名场面”？',
      opts: ['国庆升旗仪式', '7000 余名毕业生毕业典礼', '校运会开幕式', '新生军训阅兵'],
      a: 1,
      why: '2017 年 6 月 22 日，7000 余名毕业生的毕业典礼在九一二操场举行，航拍画面成为武大经典影像。'
    },
    {
      q: '信息学部操场（信操）的足球场是什么草坪？',
      opts: ['天然草皮', '人造草坪', '煤渣场地', '水泥地'],
      a: 1,
      why: '信操足球场为人造草坪；九一二与工学部田径场为天然草皮，桂园操场在 90 年代还是煤渣跑道。'
    }
  ];

  function quizRank(score) {
    if (score >= 10) {
      return { emoji: '🏆', name: '珞珈足球通', tip: '10 题全对，你就是行走的武大足球数据库' };
    }
    if (score >= 8) {
      return { emoji: '⚽', name: '绿茵学霸', tip: '对球场与赛事如数家珍' };
    }
    if (score >= 6) {
      return { emoji: '📣', name: '看台常客', tip: '常来看球，也懂不少门道' };
    }
    if (score >= 3) {
      return { emoji: '🌱', name: '草皮萌新', tip: '刚踏上珞珈绿茵，继续加油' };
    }
    return { emoji: '☁️', name: '云球迷', tip: '多来操场走走，你会爱上这里' };
  }

  var quizBox = document.getElementById('quizBox');
  var qz = null;

  function quizStart() {
    quizBox.innerHTML =
      '<div class="q-start">' +
      '<div class="q-emoji">⚡</div>' +
      '<h3>10 道题，测测你的武大足球浓度</h3>' +
      '<p>题目全部出自本站的绿茵时间线与赛事数据。答完生成段位与成绩单海报，发给球搭子比一比。</p>' +
      '<button class="btn btn-primary" id="qStartBtn" type="button">开始挑战 →</button>' +
      '</div>';
    document.getElementById('qStartBtn').addEventListener('click', function () {
      qz = { i: 0, score: 0, answered: false, picks: [] };
      quizQuestion();
    });
  }

  function quizQuestion() {
    var item = QUIZ[qz.i];
    quizBox.innerHTML =
      '<div class="q-progress"><i style="width:' +
      Math.round((qz.i / QUIZ.length) * 100) +
      '%"></i></div>' +
      '<div class="q-step">第 ' +
      (qz.i + 1) +
      ' / ' +
      QUIZ.length +
      ' 题 · 已答对 ' +
      qz.score +
      ' 题</div>' +
      '<h3 class="q-text">' +
      esc(item.q) +
      '</h3>' +
      '<div class="q-opts">' +
      item.opts
        .map(function (o, k) {
          return (
            '<button class="q-opt" type="button" data-k="' +
            k +
            '"><b>' +
            QUIZ_LETTERS.charAt(k) +
            '</b>' +
            esc(o) +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '<div class="q-feedback" id="qFb" hidden></div>' +
      '<div class="q-actions" id="qActions"></div>';
    quizBox.querySelectorAll('.q-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        quizAnswer(parseInt(b.getAttribute('data-k'), 10));
      });
    });
  }

  function quizAnswer(k) {
    if (qz.answered) {
      return;
    }
    qz.answered = true;
    var item = QUIZ[qz.i];
    var correct = k === item.a;
    if (correct) {
      qz.score++;
    }
    qz.picks.push({ k: k, ok: correct });
    quizBox.querySelectorAll('.q-opt').forEach(function (b, i) {
      b.disabled = true;
      if (i === item.a) {
        b.classList.add('correct');
      }
      if (i === k) {
        b.classList.add(i === item.a ? 'picked' : 'wrong');
      }
    });
    var fb = document.getElementById('qFb');
    fb.hidden = false;
    fb.className = 'q-feedback ' + (correct ? 'ok' : 'no');
    fb.innerHTML =
      '<b>' + (correct ? '✅ 回答正确' : '❌ 正确答案：' + QUIZ_LETTERS.charAt(item.a)) + '</b><br>' + esc(item.why);
    var last = qz.i === QUIZ.length - 1;
    var act = document.getElementById('qActions');
    act.innerHTML =
      '<button class="btn btn-primary q-next" id="qNextBtn" type="button">' +
      (last ? '查看成绩 →' : '下一题 →') +
      '</button>';
    document.getElementById('qNextBtn').addEventListener('click', function () {
      if (last) {
        quizResult();
        return;
      }
      qz.i++;
      qz.answered = false;
      quizQuestion();
    });
  }

  function quizResult() {
    var rank = quizRank(qz.score);
    var wrong = [];
    qz.picks.forEach(function (p, i) {
      if (!p.ok) {
        wrong.push({ item: QUIZ[i], k: p.k });
      }
    });
    var review = '';
    if (wrong.length) {
      review =
        '<details class="q-review"><summary>查看错题（' +
        wrong.length +
        ' 题）</summary><ol>' +
        wrong
          .map(function (w) {
            return (
              '<li><b>' +
              esc(w.item.q) +
              '</b><br>正确答案：' +
              QUIZ_LETTERS.charAt(w.item.a) +
              '. ' +
              esc(w.item.opts[w.item.a]) +
              '<br><span>' +
              esc(w.item.why) +
              '</span></li>'
            );
          })
          .join('') +
        '</ol></details>';
    }
    quizBox.innerHTML =
      '<div class="q-result">' +
      '<div class="q-score-big">' +
      qz.score +
      '<span>/ ' +
      QUIZ.length +
      '</span></div>' +
      '<div class="q-rank">' +
      rank.emoji +
      ' ' +
      rank.name +
      '</div>' +
      '<p class="q-tip">' +
      rank.tip +
      '</p>' +
      review +
      '<div class="q-actions">' +
      '<button class="btn btn-primary" id="qPosterBtn" type="button">🖼 生成成绩单海报</button>' +
      '<button class="btn btn-ghost" id="qAgainBtn" type="button">再挑战一次</button>' +
      '</div></div>';
    document.getElementById('qPosterBtn').addEventListener('click', function () {
      try {
        showPoster(drawQuizPoster(), '武大足球冷知识成绩单.png', '武大足球冷知识挑战成绩单');
      } catch (e) {
        alert('海报生成失败：' + e.message);
      }
    });
    document.getElementById('qAgainBtn').addEventListener('click', quizStart);
  }

  function drawQuizPoster() {
    var W = 750,
      H = 1200;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var c = cv.getContext('2d');
    var rank = quizRank(qz.score);
    var YH = '"Microsoft YaHei", "PingFang SC", sans-serif';

    var bg = c.createLinearGradient(0, 0, W * 0.4, H);
    bg.addColorStop(0, '#123f1a');
    bg.addColorStop(0.55, '#1f6428');
    bg.addColorStop(1, '#0b2a11');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,0.07)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(W / 2, 500, 330, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(W / 2, 500, 240, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(255,214,122,0.9)';
    c.fillRect(0, 0, W, 10);
    c.fillRect(0, H - 10, W, 10);

    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = 'rgba(225,245,220,0.9)';
    c.font = '26px ' + YH;
    c.fillText('武汉大学足球协会 · 振兴杯球场巡礼', W / 2, 82);
    c.fillStyle = '#ffffff';
    c.font = 'bold 60px ' + YH;
    c.fillText('武大足球冷知识', W / 2, 168);
    c.fillStyle = '#ffd67a';
    c.font = 'bold 32px ' + YH;
    c.fillText('成 绩 单', W / 2, 222);
    c.strokeStyle = 'rgba(255,214,122,0.65)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(W / 2 - 120, 252);
    c.lineTo(W / 2 + 120, 252);
    c.stroke();

    c.fillStyle = '#ffd67a';
    c.font = 'bold 170px Georgia, serif';
    c.fillText(String(qz.score), W / 2 - 58, 438);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = '38px ' + YH;
    c.textAlign = 'left';
    c.fillText('/ ' + QUIZ.length, W / 2 + 52, 432);
    c.textAlign = 'center';

    c.fillStyle = '#ffffff';
    c.font = 'bold 46px ' + YH;
    c.fillText(rank.emoji + ' ' + rank.name, W / 2, 512);
    c.fillStyle = 'rgba(225,245,220,0.85)';
    c.font = '24px ' + YH;
    c.fillText(rank.tip, W / 2, 556);

    var stats = [
      ['答对', qz.score + ' 题'],
      ['答错', QUIZ.length - qz.score + ' 题'],
      ['正确率', Math.round((qz.score / QUIZ.length) * 100) + '%']
    ];
    stats.forEach(function (s, i) {
      var x = 88 + i * 200;
      c.fillStyle = 'rgba(255,255,255,0.10)';
      rr(c, x, 620, 174, 104, 16);
      c.fill();
      c.strokeStyle = 'rgba(255,214,122,0.35)';
      c.lineWidth = 1.5;
      rr(c, x, 620, 174, 104, 16);
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.65)';
      c.font = '22px ' + YH;
      c.fillText(s[0], x + 87, 660);
      c.fillStyle = '#ffd67a';
      c.font = 'bold 36px ' + YH;
      c.fillText(s[1], x + 87, 706);
    });

    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.font = '22px ' + YH;
    c.fillText('珞珈绿茵之上，青春永不落幕', W / 2, 1062);
    var d = new Date();
    c.fillStyle = 'rgba(225,245,220,0.9)';
    c.font = 'bold 26px ' + YH;
    c.fillText('⚽ 振兴杯球场巡礼 · ' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月', W / 2, 1120);
    return cv.toDataURL('image/png');
  }

  quizStart();

  /* ---------- 球场人格测试 ---------- */
  var VINFO = {
    912: {
      name: '九一二操场',
      alias: '奥场 · 九一二',
      title: '仪式感担当',
      color: '#a4243b',
      dark: '#57101f',
      keys: ['历史底蕴', '沉稳大气', '关键时刻'],
      desc: '你像九一二操场：站在行政楼与老理学院的中轴线上，见过军训、毕业典礼和无数大场面。你重仪式、有分寸，越是关键时刻越稳得住，是朋友眼里最可靠的存在。'
    },
    guiyuan: {
      name: '桂园田径场',
      alias: '桂操 · 五人制决赛地',
      title: '人缘担当',
      color: '#b03a2e',
      dark: '#5e1610',
      keys: ['热情外放', '烟火气', '社交达人'],
      desc: '你像桂园操场：紧邻食堂与宿舍，白天踢球、夜晚夜跑，永远热热闹闹。你把运动当成相聚的理由，走到哪里都能把气氛带起来。'
    },
    gongxue: {
      name: '工学部田径场',
      alias: '工操 · 松园操场',
      title: '实力担当',
      color: '#22577a',
      dark: '#102c3f',
      keys: ['低调硬核', '专业主义', '耐力型'],
      desc: '你像工学部田径场：3300 余座的专业看台、天然草皮和龙舟队训练地。你不爱张扬，但训练计划从不缺席，是队友最信赖的工兵。'
    },
    xinxi: {
      name: '信息学部田径场',
      alias: '信操 · 竹园操场',
      title: '速度担当',
      color: '#2e7d32',
      dark: '#124016',
      keys: ['新锐高效', '行动力强', '人造草皮'],
      desc: '你像信息学部操场：人造草皮、节奏飞快，旁边就是图书馆与星湖。你拥抱新事物、执行力强，喜欢用最快的方式把想法变成进球。'
    }
  };

  var VTEST = [
    {
      q: '周末清晨，你最想怎么开启一天？',
      opts: [
        { t: '去历史建筑环绕的操场走一圈', v: '912' },
        { t: '约上球搭子，先吃早餐再踢一场', v: 'guiyuan' },
        { t: '按训练计划完成一组间歇跑', v: 'gongxue' },
        { t: '睡到自然醒，下午高效运动一小时', v: 'xinxi' }
      ]
    },
    {
      q: '在球队里，你更像：',
      opts: [
        { t: '后场指挥官，稳住节奏', v: '912' },
        { t: '气氛组组长，喊得最响', v: 'guiyuan' },
        { t: '跑不死的工兵，脏活累活都干', v: 'gongxue' },
        { t: '速度型边锋，反击一击致命', v: 'xinxi' }
      ]
    },
    {
      q: '选一个最像你的关键词：',
      opts: [
        { t: '传承', v: '912' },
        { t: '热闹', v: 'guiyuan' },
        { t: '硬核', v: 'gongxue' },
        { t: '新潮', v: 'xinxi' }
      ]
    },
    {
      q: '你理想中的球场是：',
      opts: [
        { t: '历史建筑环抱、仪式感拉满', v: '912' },
        { t: '食堂宿舍就在旁边、随时能开踢', v: 'guiyuan' },
        { t: '专业看台、设施齐全', v: 'gongxue' },
        { t: '人造草皮、节奏飞快', v: 'xinxi' }
      ]
    }
  ];

  var vtestBox = document.getElementById('vtestBox');
  var vt = null;

  function vtestStart() {
    vtestBox.innerHTML =
      '<div class="q-start">' +
      '<div class="q-emoji">🔮</div>' +
      '<h3>4 道题、30 秒，测测你是哪座球场</h3>' +
      '<p>凭直觉作答，没有标准答案。结果附专属球场人格解读与分享海报。</p>' +
      '<button class="btn btn-primary" id="vtStartBtn" type="button">开始测试 →</button>' +
      '</div>';
    document.getElementById('vtStartBtn').addEventListener('click', function () {
      vt = { i: 0, picks: [] };
      vtestQuestion();
    });
  }

  function vtestQuestion() {
    var item = VTEST[vt.i];
    vtestBox.innerHTML =
      '<div class="q-progress"><i style="width:' +
      Math.round((vt.i / VTEST.length) * 100) +
      '%"></i></div>' +
      '<div class="q-step">第 ' +
      (vt.i + 1) +
      ' / ' +
      VTEST.length +
      ' 题</div>' +
      '<h3 class="q-text">' +
      esc(item.q) +
      '</h3>' +
      '<div class="q-opts">' +
      item.opts
        .map(function (o, k) {
          return (
            '<button class="q-opt" type="button" data-k="' +
            k +
            '"><b>' +
            QUIZ_LETTERS.charAt(k) +
            '</b>' +
            esc(o.t) +
            '</button>'
          );
        })
        .join('') +
      '</div>';
    vtestBox.querySelectorAll('.q-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        vt.picks.push(item.opts[parseInt(b.getAttribute('data-k'), 10)].v);
        if (vt.picks.length >= VTEST.length) {
          vtestResult();
          return;
        }
        vt.i++;
        vtestQuestion();
      });
    });
  }

  function vtestResult() {
    var score = {},
      latest = {};
    Object.keys(VINFO).forEach(function (id) {
      score[id] = 0;
      latest[id] = -1;
    });
    vt.picks.forEach(function (v, i) {
      score[v]++;
      latest[v] = i;
    });
    var best = '912';
    Object.keys(VINFO).forEach(function (id) {
      if (score[id] > score[best] || (score[id] === score[best] && latest[id] > latest[best])) {
        best = id;
      }
    });
    var info = VINFO[best];
    vtestBox.innerHTML =
      '<div class="q-result vt-result">' +
      '<div class="vt-badge">你的球场人格</div>' +
      '<div class="vt-venue">' +
      info.name +
      '</div>' +
      '<div class="vt-persona">' +
      info.title +
      ' · ' +
      info.alias +
      '</div>' +
      '<div class="vt-keys">' +
      info.keys
        .map(function (k) {
          return '<span>' + k + '</span>';
        })
        .join('') +
      '</div>' +
      '<p class="vt-desc">' +
      info.desc +
      '</p>' +
      '<div class="q-actions">' +
      '<a class="btn btn-primary" href="#venue-' +
      best +
      '">📍 查看球场详情</a>' +
      '<button class="btn btn-ghost" id="vtPosterBtn" type="button">🖼 生成人格海报</button>' +
      '<button class="btn btn-ghost" id="vtAgainBtn" type="button">重新测试</button>' +
      '</div></div>';
    document.getElementById('vtPosterBtn').addEventListener('click', function () {
      try {
        showPoster(drawVTestPoster(info), '我的球场人格_' + info.name + '.png', '我的球场人格：' + info.name);
      } catch (e) {
        alert('海报生成失败：' + e.message);
      }
    });
    document.getElementById('vtAgainBtn').addEventListener('click', vtestStart);
  }

  function wrapCJK(c, text, maxW) {
    var lines = [],
      line = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (line && c.measureText(line + ch).width > maxW) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) {
      lines.push(line);
    }
    return lines;
  }

  function drawVTestPoster(info) {
    var W = 750,
      H = 1200;
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var c = cv.getContext('2d');
    var YH = '"Microsoft YaHei", "PingFang SC", sans-serif';

    var bg = c.createLinearGradient(0, 0, W * 0.4, H);
    bg.addColorStop(0, info.color);
    bg.addColorStop(0.6, info.color);
    bg.addColorStop(1, info.dark);
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(W / 2, 470, 320, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(W / 2, 470, 230, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(255,214,122,0.9)';
    c.fillRect(0, 0, W, 10);
    c.fillRect(0, H - 10, W, 10);

    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = 'rgba(255,240,225,0.9)';
    c.font = '26px ' + YH;
    c.fillText('武汉大学足球协会 · 振兴杯球场巡礼', W / 2, 82);
    c.fillStyle = '#ffffff';
    c.font = 'bold 54px ' + YH;
    c.fillText('我 的 球 场 人 格', W / 2, 164);
    c.strokeStyle = 'rgba(255,214,122,0.65)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(W / 2 - 145, 196);
    c.lineTo(W / 2 + 145, 196);
    c.stroke();

    c.fillStyle = '#ffd67a';
    c.font = 'bold 64px ' + YH;
    c.fillText(info.name, W / 2, 300);
    c.fillStyle = 'rgba(255,240,225,0.82)';
    c.font = '24px ' + YH;
    c.fillText(info.alias, W / 2, 344);
    c.fillStyle = '#ffffff';
    c.font = 'bold 42px ' + YH;
    c.fillText(info.title, W / 2, 418);

    c.font = '22px ' + YH;
    var widths = info.keys.map(function (k) {
      return c.measureText(k).width + 40;
    });
    var total =
      widths.reduce(function (a, b) {
        return a + b;
      }, 0) +
      14 * (info.keys.length - 1);
    var x = W / 2 - total / 2;
    info.keys.forEach(function (k, i) {
      c.fillStyle = 'rgba(255,255,255,0.14)';
      rr(c, x, 456, widths[i], 42, 21);
      c.fill();
      c.strokeStyle = 'rgba(255,214,122,0.55)';
      c.lineWidth = 1.5;
      rr(c, x, 456, widths[i], 42, 21);
      c.stroke();
      c.fillStyle = '#ffd67a';
      c.font = '22px ' + YH;
      c.fillText(k, x + widths[i] / 2, 484);
      x += widths[i] + 14;
    });

    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.font = '26px ' + YH;
    c.textAlign = 'left';
    var lines = wrapCJK(c, info.desc, 600);
    lines.forEach(function (ln, i) {
      c.fillText(ln, 75, 590 + i * 44);
    });
    c.textAlign = 'center';

    c.fillStyle = 'rgba(255,240,225,0.7)';
    c.font = '22px ' + YH;
    c.fillText('珞珈绿茵之上，青春永不落幕', W / 2, 1062);
    var d = new Date();
    c.fillStyle = 'rgba(255,240,225,0.92)';
    c.font = 'bold 26px ' + YH;
    c.fillText('⚽ 振兴杯球场巡礼 · ' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月', W / 2, 1120);
    return cv.toDataURL('image/png');
  }

  vtestStart();

  /* ---------- Hero 图片加载失败兜底 ---------- */
  var heroImg = new Image();
  heroImg.onerror = function () {
    document.querySelector('.hero-bg').style.background =
      'linear-gradient(135deg, #1c4a20 0%, #2e7d32 55%, #173d1b 100%)';
  };
  heroImg.src = 'images/912-aerial-1.jpg';
})();

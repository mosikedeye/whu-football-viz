/* ============================================================
 * 珞珈绿茵 · 3D 球场（three.js 程序化建模）
 * - 400m 标准跑道几何：内半径 36.5m、直道 84.39m、8 道×1.22m
 * - 足球场尺寸/朝向取自 js/data.js（武大四季电子地图矢量数据）
 * - 跑道与草坪纹理按 10px/米 在 Canvas 上实尺绘制
 * - 看台、灯塔、球门、地标建筑为示意模型
 * ============================================================ */
const THREE = window.THREE;
if (!THREE || !THREE.OrbitControls) {
  document.getElementById('loading').innerHTML =
    '⚠️ three.js 库未加载成功<br><small>请检查网络（CDN：registry.npmmirror.com）后刷新；<br>或将 three.min.js / OrbitControls.js 下载到本地 js/vendor/ 并修改 3d.html 的 script 引用</small>';
  throw new Error('three.js not loaded');
}
const OrbitControls = THREE.OrbitControls;

const D = window.WHU_FOOTBALL;
const VENUES = D.venues;

/* 每个场地的建模配置 */
const CFG = {
  '912':     { theme: '#a4243b', landmark: 'admin',    trees: 26, stand: 'main',   note: '南侧行政楼为示意复原（1935 年建）' },
  'guiyuan': { theme: '#a4243b', landmark: 'songqing', trees: 18, stand: 'main',   note: '东侧宋卿体育馆为示意（1936 年竣工）' },
  'gongxue': { theme: '#22577a', landmark: 'gym',      trees: 12, stand: 'double', scoreboard: true, note: '全校唯一 3300 余座二类标准体育场（看台示意）' },
  'xinxi':   { theme: '#2e7d32', landmark: 'library',  trees: 10, stand: 'main',   turfArt: true, bball: true, note: '足球场为人造草坪 · 旁设室外篮球场' },
  'guoruan': { theme: '#2e7d32', landmark: 'lab',      trees: 14, stand: 'small',  turfArt: true, note: '足球场为人造草坪（信息学部西区）' },
  'yixue':   { theme: '#6a4c93', landmark: 'hospital', trees: 22, stand: 'main',   note: '现实中的田径场为东西向布置 · 旁为中南医院' }
};

/* 标准 400m 跑道常量（米） */
const TRACK = { straight: 84.39, rInner: 36.5, lanes: 8, laneW: 1.22 };
TRACK.rOuter = TRACK.rInner + TRACK.lanes * TRACK.laneW;   // 46.26
TRACK.hs = TRACK.straight / 2;                            // 42.195

/* ---------- 小工具 ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h >>> 0; }
function pitchLW(p) { return { L: Math.max(p.w, p.h), W: Math.min(p.w, p.h) }; }

/* ============================================================
 * 渲染器 / 场景 / 相机 / 灯光
 * ============================================================ */
const stage = document.getElementById('stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  document.getElementById('loading').innerHTML = '⚠️ 当前浏览器不支持 WebGL，无法显示 3D 球场';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.physicallyCorrectLights = true;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, stage.clientWidth / stage.clientHeight, 0.5, 3000);
const HOME_POS = new THREE.Vector3(128, 88, 168);
camera.position.copy(HOME_POS);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxDistance = 480;
controls.minDistance = 25;
controls.maxPolarAngle = Math.PI * 0.47;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.55;

/* 灯光（日/夜两套目标值，逐帧插值） */
const ambient = new THREE.AmbientLight(0xffffff, 0.55);
const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x5c5344, 0.9);
const sun = new THREE.DirectionalLight(0xfff3dd, 1.9);
sun.position.set(140, 190, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -170; sun.shadow.camera.right = 170;
sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
sun.shadow.camera.near = 20; sun.shadow.camera.far = 620;
sun.shadow.bias = -0.0006;
scene.add(ambient, hemi, sun, sun.target);

const spotRefs = [];      // 夜间灯塔聚光
const emissiveRefs = [];  // 灯头自发光材质

const DAY = { bg: new THREE.Color(0x9dc3e6), fog: new THREE.Color(0xcfe4f2), amb: 0.55, hemi: 0.9, dir: 1.9, spot: 0, emis: 0.12 };
const NIGHT = { bg: new THREE.Color(0x0a0f22), fog: new THREE.Color(0x0a0f22), amb: 0.16, hemi: 0.2, dir: 0.1, spot: 900, emis: 2.2 };
let nightT = 0, nightTarget = 0;

scene.background = DAY.bg.clone();
scene.fog = new THREE.Fog(DAY.fog.clone(), 320, 1050);

/* ============================================================
 * 地面纹理（Canvas 实尺绘制：10px = 1m，画布 240m × 140m）
 * ============================================================ */
const PXM = 10, GW = 240 * PXM, GH = 140 * PXM;

function stadiumPath(ctx, cx, cy, hs, r) {
  ctx.beginPath();
  ctx.moveTo(cx - hs, cy - r);
  ctx.lineTo(cx + hs, cy - r);
  ctx.arc(cx + hs, cy, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(cx - hs, cy + r);
  ctx.arc(cx - hs, cy, r, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
}

function makeGroundTexture(v, cfg) {
  const cv = document.createElement('canvas');
  cv.width = GW; cv.height = GH;
  const ctx = cv.getContext('2d');
  const cx = GW / 2, cy = GH / 2;
  const hs = TRACK.hs * PXM;

  /* 周边草地 */
  ctx.fillStyle = '#3f7a38';
  ctx.fillRect(0, 0, GW, GH);
  const rnd = mulberry32(hashStr(v.id) + 7);
  for (let i = 0; i < 260; i++) { /* 草地质感杂色 */
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(rnd() * GW, rnd() * GH, 26, 14);
  }

  /* 跑道外铺装 */
  stadiumPath(ctx, cx, cy, hs, (TRACK.rOuter + 6) * PXM);
  ctx.fillStyle = '#a7a29a'; ctx.fill();

  /* 红色塑胶跑道 */
  stadiumPath(ctx, cx, cy, hs, TRACK.rOuter * PXM);
  ctx.fillStyle = '#b3493c'; ctx.fill();

  /* 8 条道线 */
  ctx.strokeStyle = 'rgba(255,255,255,.88)';
  ctx.lineWidth = 1.8;
  for (let k = 0; k <= TRACK.lanes; k++) {
    stadiumPath(ctx, cx, cy, hs, (TRACK.rInner + k * TRACK.laneW) * PXM);
    ctx.stroke();
  }

  /* 终点线（直道处横贯各道） */
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx + 26 * PXM, cy - TRACK.rOuter * PXM);
  ctx.lineTo(cx + 26 * PXM, cy - TRACK.rInner * PXM);
  ctx.stroke();

  /* 内场草坪 */
  const turfA = cfg.turfArt ? '#3d9a50' : '#4c9a41';
  const turfB = cfg.turfArt ? '#45a757' : '#54a248';
  stadiumPath(ctx, cx, cy, hs, TRACK.rInner * PXM);
  ctx.fillStyle = turfA; ctx.fill();

  /* 足球场（实尺） */
  const p = v.pitch;
  const L = pitchLW(p).L, W = pitchLW(p).W;
  const x0 = cx - L / 2 * PXM, y0 = cy - W / 2 * PXM, pw = L * PXM, ph = W * PXM;
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 ? turfB : turfA;
    ctx.fillRect(x0 + i * pw / 9, y0, pw / 9 + 1, ph);
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.6;
  ctx.strokeRect(x0, y0, pw, ph);
  ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y0 + ph); ctx.stroke();          /* 中线 */
  ctx.beginPath(); ctx.arc(cx, cy, 9.15 * PXM, 0, Math.PI * 2); ctx.stroke();            /* 中圈 */
  const dot = (x, y) => { ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); };
  dot(cx, cy);
  for (const s of [1, -1]) {                                                            /* 两侧禁区 */
    const gx = cx + s * L / 2 * PXM;                                                     /* 球门线 x */
    const sx = cx + s * (L / 2 - 11) * PXM;                                              /* 点球点 x */
    ctx.strokeRect(Math.min(gx, gx - s * 16.5 * PXM), cy - 20.16 * PXM, 16.5 * PXM, 40.32 * PXM);
    ctx.strokeRect(Math.min(gx, gx - s * 5.5 * PXM), cy - 9.16 * PXM, 5.5 * PXM, 18.32 * PXM);
    dot(sx, cy);
    const a = Math.acos(5.5 / 9.15);
    ctx.beginPath();
    if (s > 0) ctx.arc(sx, cy, 9.15 * PXM, Math.PI - a, Math.PI + a);
    else ctx.arc(sx, cy, 9.15 * PXM, -a, a);
    ctx.stroke();
    /* 球门区小门框示意 */
    ctx.lineWidth = 3.4;
    ctx.strokeRect(Math.min(gx, gx - s * 1.6 * PXM), cy - 3.66 * PXM, 1.6 * PXM, 7.32 * PXM);
    ctx.lineWidth = 2.6;
  }
  for (const [ccx, ccy, a0] of [[x0, y0, 0], [x0 + pw, y0, Math.PI / 2], [x0 + pw, y0 + ph, Math.PI], [x0, y0 + ph, -Math.PI / 2]]) {
    ctx.beginPath(); ctx.arc(ccx, ccy, 1 * PXM, a0, a0 + Math.PI / 2); ctx.stroke();     /* 角球弧 */
  }

  /* 跑道外圈马路牙子白线 */
  stadiumPath(ctx, cx, cy, hs, (TRACK.rOuter + 0.4) * PXM);
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.stroke();

  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

/* ============================================================
 * 三维构件
 * ============================================================ */
const MAT = {
  white: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  concrete: new THREE.MeshLambertMaterial({ color: 0xb9b5ad }),
  darkConcrete: new THREE.MeshLambertMaterial({ color: 0x8f8b84 }),
  pole: new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
  leafA: new THREE.MeshLambertMaterial({ color: 0x2f6b2f, flatShading: true }),
  leafB: new THREE.MeshLambertMaterial({ color: 0x3d8b3d, flatShading: true }),
  grayWall: new THREE.MeshLambertMaterial({ color: 0x928e87 }),
  greenRoof: new THREE.MeshLambertMaterial({ color: 0x2f5d50 }),
  modern: new THREE.MeshLambertMaterial({ color: 0x7d8ca3 }),
  glass: new THREE.MeshLambertMaterial({ color: 0x9fc3d8 }),
  whiteWall: new THREE.MeshLambertMaterial({ color: 0xe6e4de }),
  labWall: new THREE.MeshLambertMaterial({ color: 0x8fa3bf }),
  libWall: new THREE.MeshLambertMaterial({ color: 0x98a5b6 })
};

function buildGoal(side, L) {
  const g = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.44, 10);
  const p1 = new THREE.Mesh(postGeo, MAT.white); p1.position.set(0, 1.22, -3.66); p1.castShadow = true;
  const p2 = new THREE.Mesh(postGeo, MAT.white); p2.position.set(0, 1.22, 3.66); p2.castShadow = true;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.32, 10), MAT.white);
  bar.rotation.x = Math.PI / 2; bar.position.y = 2.44; bar.castShadow = true;
  const netGeo = new THREE.BoxGeometry(1.9, 2.44, 7.32);
  const net = new THREE.Mesh(netGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }));
  net.position.set(side * 0.95, 1.22, 0);
  const netEdge = new THREE.LineSegments(new THREE.EdgesGeometry(netGeo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
  netEdge.position.copy(net.position);
  g.add(p1, p2, bar, net, netEdge);
  g.position.x = side * L / 2;
  return g;
}

function buildStand(len, rows, theme, roof) {
  const g = new THREE.Group();
  const seat = new THREE.MeshLambertMaterial({ color: new THREE.Color(theme) });
  for (let i = 0; i < rows; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 1.1), MAT.concrete);
    step.position.set(0, 0.25 + i * 0.5, i * 1.05);
    step.castShadow = true; step.receiveShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(len * 0.98, 0.1, 0.85), seat);
    band.position.set(0, 0.55 + i * 0.5, i * 1.05 + 0.05);
    g.add(step, band);
  }
  const backH = rows * 0.5 + 1.6;
  const back = new THREE.Mesh(new THREE.BoxGeometry(len, backH, 0.5), MAT.darkConcrete);
  back.position.set(0, backH / 2, rows * 1.05 + 0.5);
  back.castShadow = true;
  g.add(back);
  if (roof) {
    const roofY = rows * 0.5 + 3.4;
    const r = new THREE.Mesh(new THREE.BoxGeometry(len + 5, 0.32, rows * 1.05 + 5), MAT.darkConcrete);
    r.position.set(0, roofY, rows * 0.52 + 1.2);
    r.castShadow = true;
    g.add(r);
    for (const px of [-len / 2 + 3, -len / 6, len / 6, len / 2 - 3]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, roofY, 8), MAT.pole);
      col.position.set(px, roofY / 2, rows * 1.05 + 0.2);
      g.add(col);
    }
  }
  return g;
}

function buildFloodlight(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 21, 10), MAT.pole);
  pole.position.y = 10.5; pole.castShadow = true;
  const headMat = new THREE.MeshStandardMaterial({ color: 0x33383d, emissive: 0xfff2c8, emissiveIntensity: 0.12 });
  emissiveRefs.push(headMat);
  const head = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.4, 2.2), headMat);
  head.position.y = 21.6;
  head.rotation.y = Math.atan2(-x, -z);
  head.rotation.x = 0.5;
  g.add(pole, head);
  g.position.set(x, 0, z);
  const sp = new THREE.SpotLight(0xfff2cc, 0, 320, 0.62, 0.55, 1);
  sp.position.set(x, 21.5, z);
  sp.target.position.set(x * 0.15, 0, z * 0.15);
  g.userData.spot = sp;
  return g;
}

function buildTree(x, z, s, rnd) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.42 * s, 3.2 * s, 7), MAT.trunk);
  trunk.position.y = 1.6 * s; trunk.castShadow = true;
  const leafMat = rnd() > 0.5 ? MAT.leafA : MAT.leafB;
  const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6 * s, 1), leafMat);
  c1.position.y = 4.4 * s; c1.castShadow = true;
  const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9 * s, 1), leafMat);
  c2.position.set(1.1 * s, 5.8 * s, -0.6 * s); c2.castShadow = true;
  g.add(trunk, c1, c2);
  g.position.set(x, 0, z);
  return g;
}

function buildLandmark(kind) {
  const g = new THREE.Group();
  const roof = (w, d, h, y) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, h, 4), MAT.greenRoof);
    c.rotation.y = Math.PI / 4; c.position.y = y + h / 2; c.castShadow = true;
    return c;
  };
  if (kind === 'admin') {                    /* 行政楼（老工学院主楼）示意 */
    const base = new THREE.Mesh(new THREE.BoxGeometry(52, 13, 15), MAT.grayWall);
    base.position.y = 6.5; base.castShadow = true; g.add(base);
    for (const sx of [-1, 1]) {
      const wingRoof = new THREE.Mesh(new THREE.BoxGeometry(20, 1.4, 13), MAT.greenRoof);
      wingRoof.position.set(sx * 17, 13.7, 0); wingRoof.castShadow = true; g.add(wingRoof);
    }
    const tower = new THREE.Mesh(new THREE.BoxGeometry(12, 13, 12), MAT.grayWall);
    tower.position.y = 19.5; tower.castShadow = true; g.add(tower);
    g.add(roof(12, 12, 8, 26));
    g.position.set(0, 0, -68);
  } else if (kind === 'songqing') {          /* 宋卿体育馆示意 */
    const main = new THREE.Mesh(new THREE.BoxGeometry(22, 12, 30), MAT.grayWall);
    main.position.y = 6; main.castShadow = true; g.add(main);
    const c = new THREE.Mesh(new THREE.ConeGeometry(19, 9, 4), MAT.greenRoof);
    c.rotation.y = Math.PI / 4; c.position.y = 16.5; c.castShadow = true; g.add(c);
    const porch = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 12), MAT.grayWall);
    porch.position.set(-14, 3, 0); g.add(porch);
    g.position.set(100, 0, -8);
  } else if (kind === 'gym') {               /* 工学部体育馆（现代）示意 */
    const b = new THREE.Mesh(new THREE.BoxGeometry(28, 19, 48), MAT.modern);
    b.position.y = 9.5; b.castShadow = true; g.add(b);
    const band = new THREE.Mesh(new THREE.BoxGeometry(28.6, 6, 48.6), MAT.glass);
    band.position.y = 12; g.add(band);
    g.position.set(-102, 0, 0);
  } else if (kind === 'library') {           /* 信息学部图书馆示意 */
    const b = new THREE.Mesh(new THREE.BoxGeometry(24, 36, 24), MAT.libWall);
    b.position.y = 18; b.castShadow = true; g.add(b);
    const top = new THREE.Mesh(new THREE.BoxGeometry(26, 2.4, 26), MAT.darkConcrete);
    top.position.y = 37; g.add(top);
    g.position.set(14, 0, -80);
  } else if (kind === 'lab') {               /* 星湖综合实验楼示意 */
    const b = new THREE.Mesh(new THREE.BoxGeometry(50, 22, 16), MAT.labWall);
    b.position.y = 11; b.castShadow = true; g.add(b);
    const band = new THREE.Mesh(new THREE.BoxGeometry(50.4, 4, 16.4), MAT.glass);
    band.position.y = 13; g.add(band);
    g.position.set(0, 0, -80);
  } else if (kind === 'hospital') {          /* 中南医院住院楼示意 */
    const b = new THREE.Mesh(new THREE.BoxGeometry(20, 50, 16), MAT.whiteWall);
    b.position.y = 25; b.castShadow = true; g.add(b);
    const crossMat = new THREE.MeshLambertMaterial({ color: 0xc62828 });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 8, 0.5), crossMat);
    c1.position.set(0, 42, 8.3); g.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(8, 2.2, 0.5), crossMat);
    c2.position.set(0, 42, 8.3); g.add(c2);
    g.position.set(-6, 0, -82);
  }
  return g;
}

function buildBasketball(x, z) {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(28, 15), new THREE.MeshLambertMaterial({ color: 0x6f8f74 }));
  slab.rotation.x = -Math.PI / 2; slab.position.y = 0.06; slab.receiveShadow = true;
  g.add(slab);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const rect = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(26, 14)), lineMat);
  rect.rotation.x = -Math.PI / 2; rect.position.y = 0.1; g.add(rect);
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 8), MAT.pole);
    pole.position.set(s * 13, 1.7, 0); g.add(pole);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 1.9), MAT.white);
    board.position.set(s * 12.4, 2.9, 0); g.add(board);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 20), new THREE.MeshLambertMaterial({ color: 0xe65100 }));
    hoop.rotation.x = Math.PI / 2; hoop.position.set(s * 11.7, 3.05, 0); g.add(hoop);
  }
  g.position.set(x, 0, z);
  return g;
}

function buildScoreboard() {
  const g = new THREE.Group();
  for (const sx of [-6, 6]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 11, 8), MAT.pole);
    pole.position.set(sx, 5.5, 0); g.add(pole);
  }
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x14161a, emissive: 0x2a3550, emissiveIntensity: 0.5 });
  emissiveRefs.push(boardMat);
  const board = new THREE.Mesh(new THREE.BoxGeometry(17, 7.5, 0.6), boardMat);
  board.position.y = 14; board.castShadow = true; g.add(board);
  g.position.set(0, 0, -64);
  return g;
}

function buildNameSprite(v, cfg) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 230;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(16,18,24,.82)';
  const r = 46;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(20, 20, 984, 190, r) : ctx.rect(20, 20, 984, 190);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 88px "Microsoft YaHei", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(v.name, 60, 92);
  ctx.fillStyle = '#c9d2dc';
  ctx.font = '44px "Microsoft YaHei", sans-serif';
  ctx.fillText(v.campus + (v.cupVenue ? ' · 🏆振兴杯场地' : '') + ' · 400米标准田径场', 62, 168);
  ctx.fillStyle = cfg.theme;
  ctx.beginPath(); ctx.arc(950, 66, 22, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(56, 12.6, 1);
  sp.position.set(0, 33, 0);
  return sp;
}

/* ============================================================
 * 场地组装
 * ============================================================ */
const world = new THREE.Group();
scene.add(world);

/* 大地平面（延伸周边） */
const bigGround = new THREE.Mesh(
  new THREE.PlaneGeometry(1600, 1600),
  new THREE.MeshLambertMaterial({ color: 0x35612f })
);
bigGround.rotation.x = -Math.PI / 2;
bigGround.position.y = -0.12;
scene.add(bigGround);

function disposeGroup(g) {
  g.traverse(o => {
    if (o.shadow && o.shadow.dispose) o.shadow.dispose();
    if (o.geometry) o.geometry.dispose();
    if (o.material && !Object.values(MAT).includes(o.material)) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    }
  });
  while (g.children.length) g.remove(g.children[0]);
}

function buildVenue(v) {
  disposeGroup(world);
  spotRefs.length = 0;
  emissiveRefs.length = 0;
  const cfg = CFG[v.id] || { theme: '#94070a', trees: 14, stand: 'main' };
  const p = v.pitch;
  const L = pitchLW(p).L;

  /* 地面 */
  const tex = makeGroundTexture(v, cfg);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 140),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  /* 中央足球 */
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
  ball.position.y = 0.42; ball.castShadow = true;
  world.add(ball);

  /* 球门 */
  world.add(buildGoal(1, L), buildGoal(-1, L));

  /* 看台 */
  if (cfg.stand === 'double') {
    const s1 = buildStand(132, 8, cfg.theme, true); s1.position.set(0, 0, 50); world.add(s1);
    const s2 = buildStand(132, 8, cfg.theme, true); s2.position.set(0, 0, -50); s2.rotation.y = Math.PI; world.add(s2);
  } else if (cfg.stand === 'small') {
    const s = buildStand(62, 3, cfg.theme, false); s.position.set(0, 0, 50); world.add(s);
  } else {
    const s = buildStand(112, 6, cfg.theme, true); s.position.set(0, 0, 50); world.add(s);
  }
  if (cfg.scoreboard) world.add(buildScoreboard());

  /* 灯塔 */
  for (const [fx, fz] of [[92, 46], [-92, 46], [92, -46], [-92, -46]]) {
    const fl = buildFloodlight(fx, fz);
    world.add(fl);
    world.add(fl.userData.spot);
    world.add(fl.userData.spot.target);
    spotRefs.push(fl.userData.spot);
  }

  /* 地标建筑 */
  if (cfg.landmark) world.add(buildLandmark(cfg.landmark));

  /* 篮球场（信部） */
  if (cfg.bball) world.add(buildBasketball(100, -25));

  /* 树木（避开跑道、看台与地标） */
  const rnd = mulberry32(hashStr(v.id));
  const landmarkPos = cfg.landmark === 'songqing' ? [100, -8]
    : cfg.landmark === 'gym' ? [-102, 0]
    : cfg.landmark === 'hospital' ? [-6, -82]
    : cfg.landmark === 'library' ? [14, -80]
    : cfg.landmark === 'lab' ? [0, -80]
    : [0, -68];
  let placed = 0, guard = 0;
  while (placed < cfg.trees && guard < 400) {
    guard++;
    const a = rnd() * Math.PI * 2;
    const rx = 96 + rnd() * 18, rz = 56 + rnd() * 10;
    const x = Math.cos(a) * rx, z = Math.sin(a) * rz;
    if (Math.abs(x) < 95 && Math.abs(z) < 52) continue;                 /* 跑道内 */
    if (Math.abs(x) < 75 && z > 46 && z < 64) continue;                 /* 主看台 */
    if (Math.abs(x) < 75 && z < -46 && z > -64 && cfg.stand === 'double') continue;
    if (Math.hypot(x - landmarkPos[0], z - landmarkPos[1]) < 26) continue;
    const s = 0.8 + rnd() * 0.6;
    world.add(buildTree(x, z, s, rnd));
    placed++;
  }

  /* 名牌 */
  world.add(buildNameSprite(v, cfg));
}

/* ============================================================
 * UI：chips / 面板 / 按钮
 * ============================================================ */
const chipsEl = document.getElementById('venueChips');
VENUES.forEach((v, i) => {
  const b = document.createElement('button');
  b.dataset.id = v.id;
  b.innerHTML = '<i style="background:' + (CFG[v.id] ? CFG[v.id].theme : '#94070a') + '"></i>' + (i + 1) + ' · ' + v.name;
  b.addEventListener('click', () => selectVenue(v.id, true));
  chipsEl.appendChild(b);
});

const panelEl = document.getElementById('vInfo');
function renderPanel(v) {
  const cfg = CFG[v.id] || {};
  const lw = pitchLW(v.pitch);
  panelEl.innerHTML =
    '<div class="p-badge" style="background:' + (cfg.theme || '#94070a') + '">' + v.campus + '</div>' +
    (v.cupVenue ? '<div class="p-badge" style="background:#a67c00;margin-left:6px">🏆 振兴杯场地</div>' : '') +
    '<h2>' + v.name + '</h2>' +
    '<p class="p-alias">' + v.alias + '</p>' +
    '<p class="p-tags">' + v.tags.map(t => '<span>' + t + '</span>').join('') + '</p>' +
    '<p class="p-dims">🏟 400 米标准跑道 · 8 道　⚽ 足球场 ' + lw.L + '×' + lw.W + ' 米</p>' +
    (cfg.note ? '<p class="p-note">📌 ' + cfg.note + '</p>' : '') +
    '<p class="p-fact">' + (v.facts[0] || '') + '</p>' +
    '<a class="p-link" href="index.html#venue-' + v.id + '">← 返回照片与详情</a>';
}

function selectVenue(id, setHash) {
  const v = VENUES.find(x => x.id === id) || VENUES[0];
  buildVenue(v);
  renderPanel(v);
  document.querySelectorAll('#venueChips button').forEach(b =>
    b.classList.toggle('active', b.dataset.id === v.id));
  if (setHash) { try { history.replaceState(null, '', '#' + v.id); } catch (e) { /* file:// 下部分浏览器禁用 */ } }
  document.getElementById('loading').classList.add('done');
}

document.getElementById('btnDay').addEventListener('click', function () {
  nightTarget = nightTarget > 0.5 ? 0 : 1;
  this.textContent = nightTarget > 0.5 ? '☀️ 白天' : '🌙 夜晚';
  this.classList.toggle('on', nightTarget > 0.5);
});
document.getElementById('btnSpin').addEventListener('click', function () {
  controls.autoRotate = !controls.autoRotate;
  this.classList.toggle('on', controls.autoRotate);
});
document.getElementById('btnReset').addEventListener('click', () => {
  camera.position.copy(HOME_POS);
  controls.target.set(0, 0, 0);
});
window.addEventListener('hashchange', () => selectVenue(location.hash.slice(1), false));
window.addEventListener('resize', () => {
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(stage.clientWidth, stage.clientHeight);
});

/* ============================================================
 * 主循环（含日夜插值）
 * ============================================================ */
const tmpC1 = new THREE.Color(), tmpC2 = new THREE.Color();
const GRASS_DAY = new THREE.Color(0x35612f), GRASS_NIGHT = new THREE.Color(0x1c3320);
function animate() {
  requestAnimationFrame(animate);
  nightT += (nightTarget - nightT) * 0.045;
  const t = nightT;
  scene.background.copy(tmpC1.copy(DAY.bg).lerp(tmpC2.copy(NIGHT.bg), t));
  scene.fog.color.copy(tmpC1.copy(DAY.fog).lerp(tmpC2.copy(NIGHT.fog), t));
  ambient.intensity = THREE.MathUtils.lerp(DAY.amb, NIGHT.amb, t);
  hemi.intensity = THREE.MathUtils.lerp(DAY.hemi, NIGHT.hemi, t);
  sun.intensity = THREE.MathUtils.lerp(DAY.dir, NIGHT.dir, t);
  sun.color.setHex(t > 0.5 ? 0xbcc9e8 : 0xfff3dd);
  const spI = THREE.MathUtils.lerp(DAY.spot, NIGHT.spot, t);
  spotRefs.forEach(sp => { sp.intensity = spI; });
  const em = THREE.MathUtils.lerp(DAY.emis, NIGHT.emis, t);
  emissiveRefs.forEach(m => { m.emissiveIntensity = em; });
  bigGround.material.color.copy(GRASS_DAY).lerp(GRASS_NIGHT, t);
  controls.update();
  renderer.render(scene, camera);
}

/* ---------- 启动 ---------- */
const initial = (location.hash.slice(1) && VENUES.some(v => v.id === location.hash.slice(1)))
  ? location.hash.slice(1) : VENUES[0].id;
selectVenue(initial, false);
animate();
window.__threeBooted = true;

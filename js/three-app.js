/* ============================================================
 * 振兴杯球场巡礼 · 3D 球场（three.js r147 程序化建模 · 精修版）
 * - 400m 标准跑道几何：内半径 36.5m、直道 84.39m、8 道×1.22m
 * - 足球场尺寸取自 js/data.js（武大四季电子地图矢量数据）
 * - 后期处理：泛光(Bloom) + 暗角(Vignette)，ACES 电影色调映射（缺失时自动降级直渲）
 * - 珞珈山地形：建筑踞岗、操场为谷、石阶相连
 * - 有机树冠（顶点扰动）/ 广告牌 / 球员摆腿动画 / 水面涟漪 / 柔和云
 * - 所有增强部件均带 try/catch 降级
 * ============================================================ */
const THREE = window.THREE;
if (!THREE || !THREE.OrbitControls) {
  document.getElementById('loading').innerHTML =
    '⚠️ three.js 库未加载成功<br><small>请确认 js/vendor/ 下库文件完整后刷新</small>';
  throw new Error('three.js not loaded');
}
const OrbitControls = THREE.OrbitControls;

/* 移动端（含微信内置浏览器）检测与画质分级 */
const UA_STR = navigator.userAgent;
const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
const IS_MOBILE = IS_TOUCH && (/Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(UA_STR) || /Macintosh/i.test(UA_STR) || Math.min(window.innerWidth, window.innerHeight) < 760);
const Q = IS_MOBILE
  ? { dpr: 1.5, shadow: 1024, msaa: 0, crowd: 0.3, petals: 110, trees: 0.6, bloom: false, crowdShadow: false }
  : { dpr: 2, shadow: 4096, msaa: 4, crowd: 0.6, petals: 280, trees: 1, bloom: true, crowdShadow: true };

const D = window.WHU_FOOTBALL;
const VENUES = D.venues;

/* 每个场地的建模配置 */
const CFG = {
  '912':     { theme: '#a4243b', landmark: 'admin',    landmark2: 'science', trees: 20, cherry: 8, stand: 'main',   note: '行政楼踞西岗 · 老理学院踞东岗 · 操场为谷地（珞珈山"因山就势"格局示意）· 樱道' },
  'guiyuan': { theme: '#a4243b', landmark: 'songqing', trees: 16, stand: 'main',   note: '东侧宋卿体育馆为示意（1936 年竣工）' },
  'gongxue': { theme: '#22577a', landmark: 'gym',      trees: 10, stand: 'double', scoreboard: true, note: '全校唯一 3300 余座二类标准体育场（看台示意）' },
  'xinxi':   { theme: '#2e7d32', landmark: 'library',  trees: 9,  stand: 'main',   turfArt: true, bball: true, lake: true, note: '人造草坪足球场 · 室外篮球场与星湖示意' }
};

/* 地标建筑：树木避让盒 [cx,cz,hx,hz] 与岗地台地参数 */
const LANDMARK_BOX = {
  admin: [-110, 0, 26, 63],
  science: [112, 4, 22, 46],
  songqing: [104, -8, 33, 35],
  gym: [-102, 0, 46, 28],
  library: [16, -82, 28, 26]
};
const HILLS = {
  admin:    { c: [-110, 0],  a: 23, b: 62, h: 7, stairs: { n: 7, stepH: 1, stepD: 0.8, w: 12, pos: [-93.2, 0], rotY: 0 } },
  science:  { c: [112, 4],   a: 18, b: 43, h: 9, stairs: { n: 9, stepH: 1, stepD: 0.5, w: 10, pos: [99.0, 4], rotY: Math.PI } },
  songqing: { c: [104, -8],  a: 32, b: 34, h: 3, stairs: { n: 3, stepH: 1, stepD: 2.2, w: 8, pos: [81.0, -8], rotY: Math.PI } },
  gym:      { c: [-102, 0],  a: 46, b: 26, h: 4, stairs: { n: 4, stepH: 1, stepD: 2.6, w: 10, pos: [-69.2, 0], rotY: 0 } },
  library:  { c: [16, -82],  a: 26, b: 24, h: 3, stairs: { n: 3, stepH: 1, stepD: 1.9, w: 8, pos: [16, -65.2], rotY: -Math.PI / 2 } }
};

/* 标准 400m 跑道常量（米） */
const TRACK = { straight: 84.39, rInner: 36.5, lanes: 8, laneW: 1.22 };
TRACK.rOuter = TRACK.rInner + TRACK.lanes * TRACK.laneW;   // 46.26
TRACK.hs = TRACK.straight / 2;                             // 42.195

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
function safe(name, fn) {
  try { return fn(); } catch (e) { console.warn('[3D] ' + name + ' 部件跳过：', e); return null; }
}

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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.dpr));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, stage.clientWidth / stage.clientHeight, 0.5, 5000);
const VIEWS = {
  pano:  { pos: [132, 84, 172], tgt: [0, 0, 0] },
  top:   { pos: [0, 250, 14],   tgt: [0, 0, 0] },
  pitch: { pos: [-34, 1.85, 21], tgt: [18, 3.2, -12] }   /* 站在边线内侧草坪上，望向对面球门 */
};
camera.position.set(VIEWS.pano.pos[0], VIEWS.pano.pos[1], VIEWS.pano.pos[2]);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxDistance = 560;
controls.minDistance = 6;
controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

const ambient = new THREE.AmbientLight(0xffffff, 0.45);
const hemi = new THREE.HemisphereLight(0xc6dcf7, 0x57534a, 1.0);
const sun = new THREE.DirectionalLight(0xfff4de, 2.9);
sun.position.set(150, 205, 95);
sun.castShadow = true;
sun.shadow.mapSize.set(Q.shadow, Q.shadow);
sun.shadow.camera.left = -250; sun.shadow.camera.right = 250;
sun.shadow.camera.top = 250; sun.shadow.camera.bottom = -250;
sun.shadow.camera.near = 20; sun.shadow.camera.far = 1000;
sun.shadow.bias = -0.0005;
scene.add(ambient, hemi, sun, sun.target);
const fill = new THREE.DirectionalLight(0xc3d8ef, 0.6);
fill.position.set(-135, 85, -155);
scene.add(fill);

/* ============================================================
 * 天空 / 星空 / 日月 / 柔云（billboard）
 * ============================================================ */
function makeGradientTexture(stops) {
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 512;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 512);
  stops.forEach(s => g.addColorStop(s[0], s[1]));
  c.fillStyle = g; c.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
function makeRadialTexture(inner, mid) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 3, 64, 64, 62);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, mid);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}
function makeCloudTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  const rnd = mulberry32(99);
  for (let i = 0; i < 10; i++) {
    const x = 55 + rnd() * 146, y = 85 + rnd() * 86, r = 32 + rnd() * 46;
    const g = c.createRadialGradient(x, y, r * 0.12, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.17)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

let skyNight = null, starMat = null, sunSprite = null, moonSprite = null;
safe('sky', () => {
  const day = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 18),
    new THREE.MeshBasicMaterial({
      map: makeGradientTexture([[0, '#123f7d'], [0.32, '#3f77bd'], [0.58, '#8db9df'], [0.8, '#cbdfed'], [1, '#e7eff3']]),
      side: THREE.BackSide, fog: false, depthWrite: false
    }));
  day.renderOrder = -10;
  scene.add(day);
  skyNight = new THREE.Mesh(new THREE.SphereGeometry(1790, 32, 18),
    new THREE.MeshBasicMaterial({
      map: makeGradientTexture([[0, '#010208'], [0.42, '#050b1c'], [0.78, '#0d1731'], [1, '#16203e']]),
      side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0
    }));
  skyNight.renderOrder = -9;
  scene.add(skyNight);
});
safe('stars', () => {
  const N = 1200, pos = new Float32Array(N * 3), rnd = mulberry32(42);
  for (let i = 0; i < N; i++) {
    const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 0.95);
    pos[i * 3] = 1550 * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = 1550 * Math.cos(ph);
    pos[i * 3 + 2] = 1550 * Math.sin(ph) * Math.sin(th);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  scene.add(new THREE.Points(geo, starMat));
});
safe('sunmoon', () => {
  sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialTexture('rgba(255,252,240,0.95)', 'rgba(255,222,150,0.4)'),
    transparent: true, depthWrite: false, fog: false, opacity: 0.9
  }));
  sunSprite.scale.set(190, 190, 1);
  sunSprite.position.copy(sun.position).normalize().multiplyScalar(1400);
  scene.add(sunSprite);
  moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialTexture('rgba(240,244,255,0.95)', 'rgba(190,205,240,0.32)'),
    transparent: true, depthWrite: false, fog: false, opacity: 0
  }));
  moonSprite.scale.set(84, 84, 1);
  const mp = sun.position.clone().normalize().multiplyScalar(-1400);
  moonSprite.position.set(mp.x, 980, mp.z);
  scene.add(moonSprite);
});
const clouds = [];
let cloudMat = null;
safe('clouds', () => {
  const tex = makeCloudTexture();
  cloudMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
  const rnd = mulberry32(777);
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(rnd() * 3);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Sprite(cloudMat);
      const sw = 90 + rnd() * 90;
      puff.scale.set(sw, sw * (0.3 + rnd() * 0.16), 1);
      puff.position.set((rnd() - 0.5) * 120, (rnd() - 0.5) * 18, (rnd() - 0.5) * 80);
      g.add(puff);
    }
    g.position.set((rnd() - 0.5) * 1100, 210 + rnd() * 150, (rnd() - 0.5) * 1100);
    scene.add(g);
    clouds.push({ g: g, x0: g.position.x, spd: 1.5 + rnd() * 2.5 });
  }
});

/* ============================================================
 * 后期处理（Bloom + Vignette，缺库自动降级）
 * ============================================================ */
const VignetteShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 texel = texture2D(tDiffuse, vUv); float d = length(vUv - vec2(0.5)); float vig = smoothstep(0.82, 0.36, d); texel.rgb *= mix(0.82, 1.0, vig); gl_FragColor = texel; }'
};
let composer = null, bloomPass = null, useComposer = false;
(function initComposer() {
  try {
    if (!Q.bloom) return;   /* 移动端跳过后期处理，直渲更流畅 */
    if (!(THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass && THREE.ShaderPass && THREE.CopyShader && THREE.LuminosityHighPassShader)) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(Math.max(2, Math.floor(w * pr)), Math.max(2, Math.floor(h * pr)), { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples: Q.msaa === 0 ? 0 : (pr >= 1.75 ? 2 : Q.msaa) });
    rt.texture.encoding = THREE.sRGBEncoding;
    composer = new THREE.EffectComposer(renderer, rt);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.09, 0.62, 0.86);
    composer.addPass(bloomPass);
    composer.addPass(new THREE.ShaderPass(VignetteShader));
    useComposer = true;
    console.info('[3D] 后期处理已启用（Bloom + Vignette）');
  } catch (e) {
    console.warn('[3D] 后期处理不可用，降级为直接渲染：', e);
    composer = null; useComposer = false;
  }
})();

/* ============================================================
 * 程序化纹理
 * ============================================================ */
const PXM = 10, GW = 320 * PXM, GH = 210 * PXM;

function stadiumPath(ctx, cx, cy, hs, r) {
  ctx.beginPath();
  ctx.moveTo(cx - hs, cy - r);
  ctx.lineTo(cx + hs, cy - r);
  ctx.arc(cx + hs, cy, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(cx - hs, cy + r);
  ctx.arc(cx - hs, cy, r, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
}

function makeNoiseTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  const img = c.createImageData(256, 256);
  const rnd = mulberry32(1234);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 108 + Math.floor(rnd() * 76);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(44, 29);
  return t;
}
const NOISE_TEX = makeNoiseTexture();

/* 接触阴影贴片（软性 AO，让物体"落地"） */
function makeBlobTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.6)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

/* 足球表皮（五边形拼块） */
function makeBallTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#f7f7f5'; c.fillRect(0, 0, 256, 128);
  c.fillStyle = '#22252a';
  const rnd = mulberry32(555);
  for (let i = 0; i < 9; i++) {
    const x = rnd() * 256, y = 18 + rnd() * 92, r = 9 + rnd() * 7;
    c.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * Math.PI * 2 / 5;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.82;
      if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath(); c.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

/* 樱花花瓣贴图（912 限定） */
function makePetalTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(16, 16, 1, 16, 16, 14);
  g.addColorStop(0, 'rgba(255,228,236,1)');
  g.addColorStop(0.6, 'rgba(244,178,203,0.9)');
  g.addColorStop(1, 'rgba(244,178,203,0)');
  c.fillStyle = g;
  c.beginPath(); c.ellipse(16, 16, 13, 8, 0.6, 0, Math.PI * 2); c.fill();
  return new THREE.CanvasTexture(cv);
}

function makeGroundTexture(v, cfg) {
  const cv = document.createElement('canvas');
  cv.width = GW; cv.height = GH;
  const ctx = cv.getContext('2d');
  const cx = GW / 2, cy = GH / 2;
  const hs = TRACK.hs * PXM;
  const rnd = mulberry32(hashStr(v.id));

  /* 周边草地 + 噪点 + 修剪带 */
  ctx.fillStyle = '#417a3c';
  ctx.fillRect(0, 0, GW, GH);
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.035)';
    ctx.fillRect(rnd() * GW, rnd() * GH, 16 + rnd() * 34, 10 + rnd() * 18);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.02)';
  for (let bx = 0; bx < GW; bx += 16 * PXM) ctx.fillRect(bx, 0, 8 * PXM, GH);

  /* 铺装步道与建筑前广场 */
  const pave = (px, py, pw2, ph2) => {
    const X = cx + px * PXM, Y = cy + py * PXM, Wp = pw2 * PXM, Hp = ph2 * PXM;
    ctx.fillStyle = '#b0aaa0';
    ctx.fillRect(X, Y, Wp, Hp);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.strokeRect(X, Y, Wp, Hp);
  };
  pave(-126, -46, 38, 92);    /* 西端广场（行政楼前） */
  pave(92, -30, 30, 68);      /* 东端广场（老理学院前） */
  pave(-72, 52, 144, 12);     /* 北侧观众集散道 */
  pave(-72, -76, 144, 10);    /* 南侧步道 */
  for (const lp of [[94, 62], [-94, 62], [94, -62], [-94, -62]]) pave(lp[0] - 4.5, lp[1] - 4.5, 9, 9);  /* 灯塔检修坪 */

  /* 跑道外铺装环 */
  stadiumPath(ctx, cx, cy, hs, (TRACK.rOuter + 7) * PXM);
  ctx.fillStyle = '#a5a096'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 2;
  stadiumPath(ctx, cx, cy, hs, (TRACK.rOuter + 3.5) * PXM); ctx.stroke();

  /* 红色塑胶跑道（颗粒噪点） */
  stadiumPath(ctx, cx, cy, hs, TRACK.rOuter * PXM);
  ctx.fillStyle = '#ab473b'; ctx.fill();
  ctx.save();
  stadiumPath(ctx, cx, cy, hs, TRACK.rOuter * PXM); ctx.clip();
  for (let i = 0; i < 4200; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.045)';
    ctx.fillRect(rnd() * GW, cy - TRACK.rOuter * PXM + rnd() * TRACK.rOuter * 2 * PXM, 5, 4);
  }
  ctx.restore();

  /* 道线 / 外沿白线 / 内沿蓝 curb */
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = 1.8;
  for (let k = 0; k <= TRACK.lanes; k++) {
    stadiumPath(ctx, cx, cy, hs, (TRACK.rInner + k * TRACK.laneW) * PXM);
    ctx.stroke();
  }
  stadiumPath(ctx, cx, cy, hs, (TRACK.rOuter + 0.35) * PXM);
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2.4; ctx.stroke();
  stadiumPath(ctx, cx, cy, hs, (TRACK.rInner + 0.25) * PXM);
  ctx.strokeStyle = '#3f6fa8'; ctx.lineWidth = 3.4; ctx.stroke();

  /* 终点线（横贯各道粗白线） */
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx + 26 * PXM, cy - TRACK.rOuter * PXM);
  ctx.lineTo(cx + 26 * PXM, cy - TRACK.rInner * PXM);
  ctx.stroke();
  /* 400 米逐道错位起跑线 + 道次数字 */
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let k = 0; k < TRACK.lanes; k++) {
    const xi = cx + (24 - k * 4.6) * PXM;
    const yIn = cy - (TRACK.rInner + k * TRACK.laneW + 0.18) * PXM;
    const yOut = cy - (TRACK.rInner + (k + 1) * TRACK.laneW - 0.18) * PXM;
    ctx.strokeStyle = 'rgba(255,255,255,.88)';
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(xi, yIn); ctx.lineTo(xi - 1.5 * PXM, yOut); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(String(k + 1), xi + 1.6 * PXM, (yIn + yOut) / 2);
  }
  /* 800 米起跑弧线 */
  ctx.strokeStyle = 'rgba(255,255,255,.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx + (TRACK.hs + 1.2) * PXM, cy - (TRACK.rOuter - 0.3) * PXM);
  ctx.quadraticCurveTo(cx + (TRACK.hs - 4.5) * PXM, cy - (TRACK.rInner + 5) * PXM, cx + (TRACK.hs - 7.5) * PXM, cy - TRACK.rInner * PXM);
  ctx.stroke();
  /* 接力区三角标 */
  ctx.fillStyle = 'rgba(255,255,255,.78)';
  for (let k = 0; k <= TRACK.lanes; k++) {
    const yy = cy - (TRACK.rInner + k * TRACK.laneW) * PXM;
    ctx.beginPath();
    ctx.moveTo(cx + 12 * PXM, yy);
    ctx.lineTo(cx + 11.2 * PXM, yy + 0.6 * PXM);
    ctx.lineTo(cx + 12.8 * PXM, yy + 0.6 * PXM);
    ctx.closePath(); ctx.fill();
  }

  /* 内场草坪 */
  const turfA = cfg.turfArt ? '#3f9c55' : '#4d9745';
  const turfB = cfg.turfArt ? '#48ac60' : '#58a34c';
  stadiumPath(ctx, cx, cy, hs, TRACK.rInner * PXM);
  ctx.fillStyle = turfA; ctx.fill();
  ctx.save();
  stadiumPath(ctx, cx, cy, hs, TRACK.rInner * PXM); ctx.clip();
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.033)';
    ctx.fillRect(rnd() * GW, cy - TRACK.rInner * PXM + rnd() * TRACK.rInner * 2 * PXM, 7, 6);
  }
  ctx.restore();

  /* 足球场：修剪纹 + 全套标线 */
  const lw = pitchLW(v.pitch);
  const L = lw.L, W = lw.W;
  const x0 = cx - L / 2 * PXM, y0 = cy - W / 2 * PXM, pw = L * PXM, ph = W * PXM;
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? turfB : turfA;
    ctx.fillRect(x0 + i * pw / 12, y0, pw / 12 + 1, ph);
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(x0, y0, pw, ph);
  ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y0 + ph); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 9.15 * PXM, 0, Math.PI * 2); ctx.stroke();
  const dot = (x, y) => { ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); };
  dot(cx, cy);
  for (const s of [1, -1]) {
    const gx = cx + s * L / 2 * PXM;
    const sx = cx + s * (L / 2 - 11) * PXM;
    ctx.strokeRect(Math.min(gx, gx - s * 16.5 * PXM), cy - 20.16 * PXM, 16.5 * PXM, 40.32 * PXM);
    ctx.strokeRect(Math.min(gx, gx - s * 5.5 * PXM), cy - 9.16 * PXM, 5.5 * PXM, 18.32 * PXM);
    dot(sx, cy);
    const a = Math.acos(5.5 / 9.15);
    ctx.beginPath();
    if (s > 0) ctx.arc(sx, cy, 9.15 * PXM, Math.PI - a, Math.PI + a);
    else ctx.arc(sx, cy, 9.15 * PXM, -a, a);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeRect(Math.min(gx, gx - s * 1.6 * PXM), cy - 3.66 * PXM, 1.6 * PXM, 7.32 * PXM);
    ctx.lineWidth = 3;
  }
  for (const cor of [[x0, y0, 0], [x0 + pw, y0, Math.PI / 2], [x0 + pw, y0 + ph, Math.PI], [x0, y0 + ph, -Math.PI / 2]]) {
    ctx.beginPath(); ctx.arc(cor[0], cor[1], 1 * PXM, cor[2], cor[2] + Math.PI / 2); ctx.stroke();
  }

  /* 球门区前的草皮磨损痕（真实球场细节） */
  ctx.fillStyle = 'rgba(146,132,78,0.13)';
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * (L / 2 - 3.5) * PXM, cy, 4.5 * PXM, 11 * PXM, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(146,132,78,0.08)';
  ctx.beginPath();
  ctx.arc(cx, cy, 6.5 * PXM, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

/* 武大风格立面：灰砖 + 拱窗 + 白色窗套（夜晚亮窗） */
function makeFacadeTexture(opts) {
  const W = 512, H = 256;
  const rnd = mulberry32(opts.seed || 7);
  const cvD = document.createElement('canvas'); cvD.width = W; cvD.height = H;
  const cvE = document.createElement('canvas'); cvE.width = W; cvE.height = H;
  const d = cvD.getContext('2d'), e = cvE.getContext('2d');
  d.fillStyle = opts.wall; d.fillRect(0, 0, W, H);
  e.fillStyle = '#000000'; e.fillRect(0, 0, W, H);
  d.strokeStyle = 'rgba(0,0,0,0.13)'; d.lineWidth = 1;
  for (let y = 6; y < H; y += 7) {
    d.beginPath(); d.moveTo(0, y); d.lineTo(W, y); d.stroke();
    const off = (Math.floor(y / 7) % 2) * 16;
    for (let x = off; x < W; x += 32) { d.beginPath(); d.moveTo(x, y); d.lineTo(x, y + 7); d.stroke(); }
  }
  const floors = opts.floors || 3, bays = opts.bays || 8;
  d.fillStyle = 'rgba(240,238,230,0.5)';
  for (let f = 1; f < floors; f++) d.fillRect(0, Math.round(H * f / floors) - 2, W, 4);
  const winH = H / floors * 0.5, winW = W / bays * 0.4;
  const drawWin = (c, x, y, fill) => {
    c.fillStyle = fill;
    c.beginPath();
    if (opts.arch) {
      c.moveTo(x, y + winH);
      c.lineTo(x, y + winW / 2);
      c.arc(x + winW / 2, y + winW / 2, winW / 2, Math.PI, 0);
      c.lineTo(x + winW, y + winH);
      c.closePath();
    } else c.rect(x, y, winW, winH);
    c.fill();
  };
  for (let f = 0; f < floors; f++) {
    for (let b = 0; b < bays; b++) {
      const wx = (b + 0.5) * (W / bays) - winW / 2;
      const wy = (f + 0.42) * (H / floors) - winH / 2;
      drawWin(d, wx, wy, opts.glass || 'rgba(44,56,70,0.92)');
      d.strokeStyle = 'rgba(245,243,235,0.85)'; d.lineWidth = 3; d.stroke();
      d.fillStyle = 'rgba(245,243,235,0.9)';
      d.fillRect(wx - 4, wy + winH, winW + 8, 5);
      if (rnd() < (opts.lit || 0.42)) {
        drawWin(e, wx, wy, rnd() > 0.3 ? 'rgba(255,212,138,0.95)' : 'rgba(196,220,255,0.8)');
      }
    }
  }
  const tD = new THREE.CanvasTexture(cvD); tD.encoding = THREE.sRGBEncoding;
  const tE = new THREE.CanvasTexture(cvE); tE.encoding = THREE.sRGBEncoding;
  return { map: tD, emissiveMap: tE };
}
function makeRoofTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#2c564a'; c.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 9) {
    c.fillStyle = (x / 9) % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.17)';
    c.fillRect(x, 0, 4.5, 256);
  }
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0.13)');
  g.addColorStop(1, 'rgba(0,0,0,0.4)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
  return t;
}
function makeGlassFacadeTexture(seed) {
  const W = 512, H = 256;
  const rnd = mulberry32(seed || 3);
  const cvD = document.createElement('canvas'); cvD.width = W; cvD.height = H;
  const cvE = document.createElement('canvas'); cvE.width = W; cvE.height = H;
  const d = cvD.getContext('2d'), e = cvE.getContext('2d');
  d.fillStyle = '#41546a'; d.fillRect(0, 0, W, H);
  e.fillStyle = '#000000'; e.fillRect(0, 0, W, H);
  const cols = 10, rows = 6, cw = W / cols, ch = H / rows;
  for (let r = 0; r < rows; r++) for (let c2 = 0; c2 < cols; c2++) {
    const x = c2 * cw + 2, y = r * ch + 2, w = cw - 4, h = ch - 4;
    const grd = d.createLinearGradient(x, y, x + w, y + h);
    grd.addColorStop(0, 'rgba(146,184,208,0.9)'); grd.addColorStop(1, 'rgba(62,90,114,0.92)');
    d.fillStyle = grd; d.fillRect(x, y, w, h);
    d.strokeStyle = 'rgba(216,226,233,0.8)'; d.lineWidth = 2; d.strokeRect(x, y, w, h);
    if (rnd() < 0.5) {
      e.fillStyle = rnd() > 0.35 ? 'rgba(255,218,148,0.9)' : 'rgba(198,222,255,0.75)';
      e.fillRect(x, y, w, h);
    }
  }
  const tD = new THREE.CanvasTexture(cvD); tD.encoding = THREE.sRGBEncoding;
  const tE = new THREE.CanvasTexture(cvE); tE.encoding = THREE.sRGBEncoding;
  return { map: tD, emissiveMap: tE };
}
function makeNetTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 64, 64);
  c.strokeStyle = 'rgba(255,255,255,0.88)';
  c.lineWidth = 1.2;
  for (let i = 0; i <= 64; i += 2) {
    c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 64); c.stroke();
    c.beginPath(); c.moveTo(0, i); c.lineTo(64, i); c.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function makeScoreTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#0b0e14'; c.fillRect(0, 0, 512, 256);
  c.strokeStyle = '#2a3040'; c.lineWidth = 8; c.strokeRect(6, 6, 500, 244);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#e8c25a';
  c.font = 'bold 78px "Microsoft YaHei", sans-serif';
  c.fillText('振 兴 杯', 256, 86);
  c.fillStyle = '#9fd8a2';
  c.font = '40px "Microsoft YaHei", sans-serif';
  c.fillText('以球会友 · 以赛育人', 256, 174);
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
function makeFlagTexture() {
  const cv = document.createElement('canvas');
  cv.width = 160; cv.height = 100;
  const c = cv.getContext('2d');
  c.fillStyle = '#c8161d'; c.fillRect(0, 0, 160, 100);
  c.fillStyle = '#ffde00';
  c.font = 'bold 52px sans-serif';
  c.textAlign = 'left'; c.textBaseline = 'top';
  c.fillText('★', 12, 8);
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
function makeAdTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#f4f2ec'; c.fillRect(0, 0, 1024, 128);
  c.fillStyle = '#94070a'; c.fillRect(0, 106, 1024, 22);
  c.textBaseline = 'middle';
  c.fillStyle = '#94070a';
  c.font = 'bold 56px "Microsoft YaHei", sans-serif';
  c.fillText('振兴杯', 42, 52);
  c.fillStyle = '#2b2d33';
  c.font = '38px "Microsoft YaHei", sans-serif';
  c.fillText('以球会友 · 以赛育人', 240, 54);
  c.fillStyle = '#2e7d32';
  c.font = 'bold 38px "Microsoft YaHei", sans-serif';
  c.fillText('武汉大学足球协会', 660, 54);
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/* ============================================================
 * 共享材质（Standard 为主，配合 ACES/Bloom 更真实）
 * ============================================================ */
const MAT = {
  white: new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.4 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xb5b1a9, roughness: 0.92 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x8b877f, roughness: 0.9 }),
  seatBase: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }),
  pole: new THREE.MeshStandardMaterial({ color: 0x98a0a8, roughness: 0.5, metalness: 0.3 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x69707a, roughness: 0.45, metalness: 0.45 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x5f4630, roughness: 1 }),
  leafA: new THREE.MeshStandardMaterial({ color: 0x2e6b30, roughness: 1 }),
  leafB: new THREE.MeshStandardMaterial({ color: 0x3f8a3c, roughness: 1 }),
  cherryA: new THREE.MeshStandardMaterial({ color: 0xe8a2bb, roughness: 1 }),
  cherryB: new THREE.MeshStandardMaterial({ color: 0xf2c2d2, roughness: 1 }),
  greenRoof: new THREE.MeshStandardMaterial({ color: 0x2c564a, roughness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fc3d8, roughness: 0.25, metalness: 0.35 }),
  benchBlue: new THREE.MeshStandardMaterial({ color: 0x2f6fbd, roughness: 0.6 }),
  benchTop: new THREE.MeshStandardMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0.5, roughness: 0.12 }),
  cornerFlag: new THREE.MeshLambertMaterial({ color: 0xd32029, side: THREE.DoubleSide }),
  water: new THREE.MeshStandardMaterial({ color: 0x2c5f8a, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.94 }),
  lakeRim: new THREE.MeshStandardMaterial({ color: 0x99927f, roughness: 0.95, side: THREE.DoubleSide }),
  ball: new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.35 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xd9a06e, roughness: 0.8 }),
  shorts: new THREE.MeshStandardMaterial({ color: 0x26282e, roughness: 0.85 }),
  teamA: new THREE.MeshStandardMaterial({ color: 0x9d1f35, roughness: 0.75 }),
  teamB: new THREE.MeshStandardMaterial({ color: 0xeef1f5, roughness: 0.75 }),
  net: new THREE.MeshLambertMaterial({ map: makeNetTexture(), transparent: true, opacity: 0.8, side: THREE.DoubleSide, alphaTest: 0.05 }),
  flag: new THREE.MeshLambertMaterial({ map: makeFlagTexture(), side: THREE.DoubleSide }),
  ripple: new THREE.MeshBasicMaterial({ color: 0xdfeef7, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
};
MAT.roof = new THREE.MeshStandardMaterial({ map: makeRoofTexture(), roughness: 0.72, metalness: 0.06 });
MAT.eave = new THREE.MeshStandardMaterial({ color: 0x24453c, roughness: 0.85 });
MAT.stone = new THREE.MeshStandardMaterial({ color: 0x9a988f, roughness: 0.95 });
MAT.ridge = new THREE.MeshStandardMaterial({ color: 0x213f37, roughness: 0.8 });
MAT.hill = new THREE.MeshStandardMaterial({ color: 0x4a7a40, roughness: 1, bumpMap: NOISE_TEX, bumpScale: 0.15 });
MAT.curb = new THREE.MeshStandardMaterial({ color: 0xe9e7e0, roughness: 0.55 });
const BLOB_TEX = makeBlobTexture();
MAT.blobA = new THREE.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, opacity: 0.3, depthWrite: false });
MAT.blobB = new THREE.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, opacity: 0.2, depthWrite: false });
MAT.blobC = new THREE.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, opacity: 0.12, depthWrite: false });
const BLOB_GEO = new THREE.PlaneGeometry(1, 1);
const GLOBAL_GEOS = [BLOB_GEO];
function addBlob(parent, x, z, sx, sz, mat, y) {
  const m = new THREE.Mesh(BLOB_GEO, mat);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(sx, sz, 1);
  m.position.set(x, y || 0.03, z);
  parent.add(m);
  return m;
}

/* ============================================================
 * 三维构件
 * ============================================================ */
const winMats = [];
function facadeMat(opts) {
  const t = makeFacadeTexture(opts);
  const m = new THREE.MeshStandardMaterial({
    map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff,
    emissiveIntensity: 0, roughness: 0.88, metalness: 0.02
  });
  winMats.push(m);
  return m;
}
function glassMat(seed) {
  const t = makeGlassFacadeTexture(seed);
  const m = new THREE.MeshStandardMaterial({
    map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff,
    emissiveIntensity: 0, roughness: 0.3, metalness: 0.35
  });
  winMats.push(m);
  return m;
}

function buildHill(key) {
  const hc = HILLS[key];
  if (!hc) return null;
  const g = new THREE.Group();
  const fr = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.35, hc.h, 4, 1, false, Math.PI / 4), MAT.hill);
  fr.scale.set(hc.a, 1, hc.b);
  fr.position.set(hc.c[0], hc.h / 2, hc.c[1]);
  fr.receiveShadow = true; fr.castShadow = true;
  g.add(fr);
  const st = hc.stairs;
  if (st) {
    const sg = new THREE.Group();
    for (let k = 0; k < st.n; k++) {
      const hgt = hc.h - k * st.stepH;
      if (hgt <= 0.05) break;
      const s = new THREE.Mesh(new THREE.BoxGeometry(st.stepD, hgt, st.w), MAT.stone);
      s.position.set(k * st.stepD + st.stepD / 2, hgt / 2, 0);
      s.castShadow = true; s.receiveShadow = true;
      sg.add(s);
    }
    sg.position.set(st.pos[0], 0, st.pos[1]);
    sg.rotation.y = st.rotY;
    g.add(sg);
  }
  return g;
}

/* 跑道内沿立体道牙（IAAF 标准凸起缘石，白色） */
function buildCurbRing() {
  const hs = TRACK.hs, ro = TRACK.rInner + 0.08, ri = TRACK.rInner - 0.28;
  const shape = new THREE.Shape();
  shape.moveTo(-hs, -ro);
  shape.lineTo(hs, -ro);
  shape.absarc(hs, 0, ro, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-hs, ro);
  shape.absarc(-hs, 0, ro, Math.PI / 2, Math.PI * 1.5, false);
  const hole = new THREE.Path();
  hole.moveTo(-hs, -ri);
  hole.lineTo(hs, -ri);
  hole.absarc(hs, 0, ri, -Math.PI / 2, Math.PI / 2, false);
  hole.lineTo(-hs, ri);
  hole.absarc(-hs, 0, ri, Math.PI / 2, Math.PI * 1.5, false);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false, curveSegments: 48 });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, MAT.curb);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* 四点网片（自定义四边形，避免平面旋转对齐的歧义） */
function netQuad(a, b, c, d) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array([
    a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
    a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z
  ]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, MAT.net);
}
/* 圆管支撑杆（两点之间） */
function strut(g, p1, p2, r, mat) {
  const dir = new THREE.Vector3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
  m.position.set((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  g.add(m);
  return m;
}
/* 真实足球门：门柱横梁 + 后斜网箱 + 顶网 + 侧网 + 斜撑与后底杠 */
function buildGoal(side, L) {
  const g = new THREE.Group();
  const s = side, H = 2.44, hw = 3.66;   /* 半宽 */
  const topBack = 1.25, gndBack = 2.05;  /* 顶网进深 / 后底杠进深 */
  const V = (x, y, z) => ({ x: s * x, y: y, z: z });
  /* 门柱 + 横梁 */
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, H, 12);
  const p1 = new THREE.Mesh(postGeo, MAT.white); p1.position.set(0, H / 2, -hw); p1.castShadow = true;
  const p2 = new THREE.Mesh(postGeo, MAT.white); p2.position.set(0, H / 2, hw); p2.castShadow = true;
  g.add(p1, p2);
  strut(g, V(0, H, -hw), V(0, H, hw), 0.06, MAT.white);                       /* 横梁 */
  strut(g, V(gndBack, 0.05, -hw), V(gndBack, 0.05, hw), 0.04, MAT.white);     /* 后底杠 */
  for (const zz of [-hw, hw]) {
    strut(g, V(0, H, zz), V(gndBack, 0.05, zz), 0.04, MAT.white);             /* 斜撑 */
    strut(g, V(0, H, zz), V(topBack, H, zz), 0.035, MAT.white);               /* 顶网侧梁 */
  }
  /* 网：顶网（水平）+ 背网（后斜）+ 两侧网 */
  g.add(netQuad(V(0, H - 0.02, -hw), V(0, H - 0.02, hw), V(topBack, H - 0.02, hw), V(topBack, H - 0.02, -hw)));
  g.add(netQuad(V(topBack, H - 0.02, -hw), V(topBack, H - 0.02, hw), V(gndBack, 0.06, hw), V(gndBack, 0.06, -hw)));
  for (const zz of [-hw, hw]) {
    g.add(netQuad(V(0, 0.02, zz), V(0, H - 0.02, zz), V(topBack, H - 0.02, zz), V(gndBack, 0.02, zz)));
  }
  g.position.x = side * L / 2;
  return g;
}

function buildCornerFlags(L, W) {
  const g = new THREE.Group();
  const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6);
  const flagGeo = new THREE.PlaneGeometry(0.55, 0.36);
  flagGeo.translate(0.27, 0, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(poleGeo, MAT.white);
      p.position.set(sx * L / 2, 0.75, sz * W / 2);
      const f = new THREE.Mesh(flagGeo, MAT.cornerFlag);
      f.position.set(sx * L / 2, 1.32, sz * W / 2);
      f.rotation.y = Math.atan2(-sx, -sz);
      g.add(p, f);
    }
  }
  return g;
}

function buildAdBoards(L, W) {
  const g = new THREE.Group();
  const mk = (len, x, z, rotY) => {
    const t = makeAdTexture();
    t.repeat.set(Math.max(1, Math.round(len / 11)), 1);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.02 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.13), m);
    b.position.set(x, 0.48, z);
    b.rotation.y = rotY;
    b.castShadow = true;
    g.add(b);
  };
  mk(L + 12, 0, W / 2 + 2.4, 0);
  mk(L + 12, 0, -W / 2 - 2.4, 0);
  mk(W + 9, L / 2 + 2.8, 0, Math.PI / 2);
  mk(W + 9, -L / 2 - 2.8, 0, Math.PI / 2);
  return g;
}

function buildStand(len, rows, theme, roof) {
  const g = new THREE.Group();
  const seatColor = new THREE.Color(theme);
  const seatLight = seatColor.clone().lerp(new THREE.Color(0xffffff), 0.36);
  for (let i = 0; i < rows; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 1.1), MAT.concrete);
    step.position.set(0, 0.25 + i * 0.5, i * 1.05);
    step.castShadow = true; step.receiveShadow = true;
    g.add(step);
  }
  const backH = rows * 0.5 + 2.2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(len, backH, 0.55), MAT.concreteDark);
  back.position.set(0, backH / 2, rows * 1.05 + 0.55);
  back.castShadow = true;
  g.add(back);
  /* 通道口（深色洞） */
  for (const ax of [-len * 0.22, len * 0.22]) {
    const vom = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 0.2), new THREE.MeshBasicMaterial({ color: 0x14161a }));
    vom.position.set(ax, 1.15, rows * 1.05 + 0.2);
    g.add(vom);
  }
  /* 实例化座椅：坐板 + 靠背 */
  const perRow = Math.floor(len / 0.64);
  const aisle1 = -len * 0.22, aisle2 = len * 0.22;
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < perRow; i++) {
      const x = -len / 2 + 0.5 + i * 0.64;
      if (Math.abs(x - aisle1) < 0.75 || Math.abs(x - aisle2) < 0.75) continue;
      count++;
    }
  }
  const panMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.09, 0.44), MAT.seatBase, count);
  const backMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.46, 0.09), MAT.seatBase, count);
  panMesh.castShadow = true; backMesh.castShadow = true;
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const seatPos = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < perRow; i++) {
      const x = -len / 2 + 0.5 + i * 0.64;
      if (Math.abs(x - aisle1) < 0.75 || Math.abs(x - aisle2) < 0.75) continue;
      const y = 0.56 + r * 0.5, z = r * 1.05 + 0.08;
      m4.makeTranslation(x, y, z);
      panMesh.setMatrixAt(idx, m4);
      m4.makeTranslation(x, y + 0.27, z + 0.21);
      backMesh.setMatrixAt(idx, m4);
      col.copy((Math.floor(x * 0.8) + r) % 6 === 0 ? seatLight : seatColor);
      panMesh.setColorAt(idx, col);
      backMesh.setColorAt(idx, col);
      seatPos.push({ x: x, y: y, z: z });
      idx++;
    }
  }
  panMesh.instanceMatrix.needsUpdate = true;
  backMesh.instanceMatrix.needsUpdate = true;
  if (panMesh.instanceColor) panMesh.instanceColor.needsUpdate = true;
  if (backMesh.instanceColor) backMesh.instanceColor.needsUpdate = true;
  g.add(panMesh, backMesh);
  /* 观众：实例化小人（约六成上座，服装配色随机） */
  const crowdRnd = mulberry32(Math.floor(len * 97 + rows * 13));
  const occ = seatPos.filter(() => crowdRnd() < Q.crowd);
  if (occ.length) {
    const palette = [0x9d1f35, 0xf2f2f2, 0x2b3a55, 0x8a8f98, 0x22252a, 0x6f9fd8, 0xc94f6d, 0xe8c25a, 0x3f7a4a];
    const bodyMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.5, 0.24), MAT.seatBase, occ.length);
    const headMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.125, 1), MAT.seatBase, occ.length);
    bodyMesh.castShadow = Q.crowdShadow;
    const mm = new THREE.Matrix4(), cc = new THREE.Color();
    for (let ci = 0; ci < occ.length; ci++) {
      const sp2 = occ[ci];
      mm.makeTranslation(sp2.x, sp2.y + 0.3, sp2.z - 0.02);
      bodyMesh.setMatrixAt(ci, mm);
      mm.makeTranslation(sp2.x, sp2.y + 0.64, sp2.z - 0.02);
      headMesh.setMatrixAt(ci, mm);
      cc.setHex(palette[Math.floor(crowdRnd() * palette.length)]);
      bodyMesh.setColorAt(ci, cc);
      cc.setHex(crowdRnd() > 0.5 ? 0xd9a06e : 0xc08a5c);
      headMesh.setColorAt(ci, cc);
    }
    bodyMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
    g.add(bodyMesh, headMesh);
  }
  addBlob(g, 0, rows * 0.5, len + 10, rows * 1.05 + 10, MAT.blobC, 0.02);
  /* 前排栏杆 */
  const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), MAT.steel);
  rail.position.set(0, 1.05, -0.45);
  const rail2 = rail.clone(); rail2.position.y = 0.62;
  g.add(rail, rail2);
  for (let i = 0; i <= Math.floor(len / 6); i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.05, 6), MAT.steel);
    post.position.set(-len / 2 + i * 6, 0.53, -0.45);
    g.add(post);
  }
  /* 顶棚 */
  if (roof) {
    const roofY = rows * 0.5 + 4.2;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(len + 6, 0.3, rows * 1.05 + 6), MAT.concreteDark);
    canopy.position.set(0, roofY, rows * 0.52 + 1.6);
    canopy.castShadow = true;
    g.add(canopy);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(len + 6, 0.9, 0.28), MAT.concreteDark);
    fascia.position.set(0, roofY - 0.55, rows * 0.52 + 1.6 - (rows * 1.05 + 6) / 2);
    g.add(fascia);
    for (const px of [-len / 2 + 3, -len / 5, len / 5, len / 2 - 3]) {
      const colm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, roofY, 8), MAT.pole);
      colm.position.set(px, roofY / 2, rows * 1.05 + 0.3);
      colm.castShadow = true;
      g.add(colm);
    }
  }
  return g;
}

const spotRefs = [];
const emissiveRefs = [];
const glowSprites = [];
const coneRefs = [];
const flagStates = [];
const lakeRipples = [];
let players = [], ballState = null, petalSys = null;
let ballCarrier = -1, ballSwitchAt = 0;
function pickCarrier(t) {
  const cands = [];
  for (let i = 0; i < players.length; i++) if (!players[i].gk) cands.push(i);
  if (!cands.length) { ballCarrier = -1; ballSwitchAt = t + 5; return; }
  ballCarrier = cands[Math.floor(Math.random() * cands.length)];
  ballSwitchAt = t + 4 + Math.random() * 5;   /* 4~9 秒换一次球权 */
}

function buildFloodlight(x, z) {
  const g = new THREE.Group();
  const yaw = Math.atan2(-x, -z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.2, 21.8, 6), MAT.steel);
    leg.position.set(sx * 0.62, 10.9, sz * 0.62);
    leg.rotation.z = sx * 0.055; leg.rotation.x = -sz * 0.055;
    leg.castShadow = true;
    g.add(leg);
  }
  for (let k = 1; k <= 4; k++) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(2.0 - k * 0.18, 0.09, 2.0 - k * 0.18), MAT.steel);
    brace.position.y = k * 4.3;
    g.add(brace);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.7, 2.7), MAT.concreteDark);
  base.position.y = 0.35; base.castShadow = true;
  g.add(base);
  addBlob(g, 0, 0, 5.5, 5.5, MAT.blobB, 0.02);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.24, 2.7), MAT.steel);
  frame.position.y = 22.2;
  frame.rotation.y = yaw;
  g.add(frame);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x2b2f35, emissive: 0xfff2c8, emissiveIntensity: 0.1 });
  emissiveRefs.push(headMat);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.5, 0.95), headMat);
    const off = new THREE.Vector3((c - 1) * 1.66, 22.62, (r - 0.5) * 1.08);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    panel.position.copy(off);
    panel.rotation.y = yaw;
    panel.rotation.x = 0.55;
    g.add(panel);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialTexture('rgba(255,246,220,0.95)', 'rgba(255,228,158,0.3)'),
    transparent: true, depthWrite: false, opacity: 0, fog: false
  }));
  glow.scale.set(30, 30, 1);
  glow.position.y = 22.5;
  g.add(glow);
  glowSprites.push(glow);
  g.position.set(x, 0, z);
  const sp = new THREE.SpotLight(0xfff2cc, 0, 380, 0.6, 0.55, 1);
  sp.position.set(x, 22, z);
  sp.target.position.set(x * 0.12, 0, z * 0.12);
  g.userData.spot = sp;
  const apex = new THREE.Vector3(x, 22, z);
  const target = new THREE.Vector3(x * 0.12, 0, z * 0.12);
  const coneLen = apex.distanceTo(target);
  const coneGeo = new THREE.ConeGeometry(12.5, coneLen, 24, 1, true);
  coneGeo.translate(0, -coneLen / 2, 0);
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
    color: 0xffe9b0, transparent: true, opacity: 0, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  }));
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), target.clone().sub(apex).normalize());
  cone.position.copy(apex);
  cone.renderOrder = 3;
  g.add(cone);
  g.userData.cone = cone;
  return g;
}

/* 有机树冠：顶点扰动的细分二十面体 */
function canopyGeo(rnd, r) {
  const geo = new THREE.IcosahedronGeometry(r, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 0.8 + rnd() * 0.4;
    pos.setXYZ(i, x * n, y * n * 0.88, z * n);
  }
  geo.computeVertexNormals();
  return geo;
}
function buildTree(x, z, s, rnd, cherry) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.38 * s, 3.6 * s, 7), MAT.trunk);
  trunk.position.y = 1.8 * s; trunk.castShadow = true;
  trunk.rotation.z = (rnd() - 0.5) * 0.09;
  const mat = cherry ? (rnd() > 0.5 ? MAT.cherryA : MAT.cherryB) : (rnd() > 0.5 ? MAT.leafA : MAT.leafB);
  const c1 = new THREE.Mesh(canopyGeo(rnd, 2.7 * s), mat);
  c1.position.y = 4.7 * s; c1.castShadow = true;
  const c2 = new THREE.Mesh(canopyGeo(rnd, 1.85 * s), mat);
  c2.position.set(1.0 * s, 6.2 * s, -0.5 * s); c2.castShadow = true;
  const c3 = new THREE.Mesh(canopyGeo(rnd, 1.4 * s), mat);
  c3.position.set(-0.9 * s, 5.5 * s, 0.6 * s); c3.castShadow = true;
  g.add(trunk, c1, c2, c3);
  addBlob(g, 0, 0, 5.4 * s, 5.4 * s, MAT.blobA, 0.04);
  g.position.set(x, 0, z);
  g.rotation.y = rnd() * Math.PI * 2;
  return g;
}

function buildFlagpole(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 9.5, 8), MAT.white);
  pole.position.y = 4.75; pole.castShadow = true;
  const geo = new THREE.PlaneGeometry(2.5, 1.55, 16, 9);
  geo.translate(1.25, 0, 0);
  const flag = new THREE.Mesh(geo, MAT.flag);
  flag.position.set(0.1, 8.5, 0);
  flag.castShadow = true;
  g.add(pole, flag);
  g.position.set(x, 0, z);
  return { group: g, flag: flag, base: geo.attributes.position.array.slice(0) };
}

function buildBench(x, z, rotY) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.14, 1.5), MAT.benchBlue);
  seat.position.y = 0.5; g.add(seat);
  const backr = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.9, 0.12), MAT.benchBlue);
  backr.position.set(0, 1.0, -0.7); g.add(backr);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(7, 0.12, 2.1), MAT.benchTop);
  canopy.position.y = 2.25; g.add(canopy);
  for (const px of [-3.2, 3.2]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.25, 6), MAT.steel);
    leg.position.set(px, 1.12, 0); g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

function buildScoreboard() {
  const g = new THREE.Group();
  for (const sx of [-6.5, 6.5]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 12, 8), MAT.pole);
    pole.position.set(sx, 6, 0); pole.castShadow = true; g.add(pole);
  }
  const tex = makeScoreTexture();
  const boardMat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0, roughness: 0.6 });
  winMats.push(boardMat);
  const board = new THREE.Mesh(new THREE.BoxGeometry(18, 9, 0.7), boardMat);
  board.position.y = 15.5; board.castShadow = true; g.add(board);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(19, 0.5, 1.5), MAT.concreteDark);
  cap.position.y = 20.3; g.add(cap);
  g.position.set(0, 0, -66);
  return g;
}

/* 庑殿顶（琉璃瓦 + 檐板 + 正脊 + 脊饰） */
function hipRoof(w, d, h, y, x) {
  const g = new THREE.Group();
  const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 1.8, 0.5, d + 1.8), MAT.eave);
  eave.position.y = y; eave.castShadow = true; g.add(eave);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, h, 4, 1, false, Math.PI / 4), MAT.roof);
  roof.scale.set((w + 1.4) * 0.707, 1, (d + 1.4) * 0.707);
  roof.position.y = y + h / 2 + 0.15;
  roof.castShadow = true;
  g.add(roof);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w * 0.34, 2), 0.35, 0.55), MAT.ridge);
  ridge.position.y = y + h + 0.12; g.add(ridge);
  for (const sx of [-1, 1]) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), MAT.ridge);
    orb.position.set(sx * Math.max(w * 0.17, 1), y + h + 0.3, 0);
    g.add(orb);
  }
  g.position.x = x || 0;
  return g;
}

function buildLandmark(kind) {
  const g = new THREE.Group();
  if (kind === 'admin') {
    /* 行政楼：台基+台阶、双翼、中央塔楼、柱廊 */
    const wall = facadeMat({ wall: '#8a867e', arch: true, floors: 3, bays: 10, seed: hashStr('admin'), lit: 0.4 });
    const wallT = facadeMat({ wall: '#8d8981', arch: true, floors: 4, bays: 4, seed: hashStr('adminT'), lit: 0.5 });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(80, 2, 27), MAT.stone);
    plinth.position.y = 1; plinth.receiveShadow = true; g.add(plinth);
    for (let s = 0; s < 3; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(20, 0.42, 1.0), MAT.stone);
      step.position.set(0, 0.21 + s * 0.42, 15.8 - s * 1.0);
      g.add(step);
    }
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(24, 12, 16), wall);
      wing.position.set(sx * 24, 8, 0); wing.castShadow = true; g.add(wing);
      const cor = new THREE.Mesh(new THREE.BoxGeometry(24.8, 0.7, 16.8), MAT.stone);
      cor.position.set(sx * 24, 14.3, 0); g.add(cor);
      g.add(hipRoof(24, 16, 5.6, 14.8, sx * 24));
      const endp = new THREE.Mesh(new THREE.BoxGeometry(8, 15.5, 11), wallT);
      endp.position.set(sx * 35, 9.75, 0); endp.castShadow = true; g.add(endp);
      g.add(hipRoof(8.6, 11.6, 3.8, 17.8, sx * 35));
    }
    const mid = new THREE.Mesh(new THREE.BoxGeometry(22, 17, 17.5), wall);
    mid.position.set(0, 10.5, 1); mid.castShadow = true; g.add(mid);
    const midCor = new THREE.Mesh(new THREE.BoxGeometry(22.8, 0.7, 18.3), MAT.stone);
    midCor.position.set(0, 19.3, 1); g.add(midCor);
    for (let i = 0; i < 7; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.64, 13, 14), MAT.stone);
      col.position.set(-7.5 + i * 2.5, 8.5, 10.6);
      col.castShadow = true; g.add(col);
    }
    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(21.5, 0.8, 4.8), MAT.eave);
    porchRoof.position.set(0, 15.5, 10.8); g.add(porchRoof);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(13.5, 9, 13.5), wallT);
    tower.position.set(0, 24, 0); tower.castShadow = true; g.add(tower);
    g.add(hipRoof(14, 14, 3.0, 28.8, 0));
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 6.0, 3.2, 8), wallT);
    drum.position.y = 33.2; drum.castShadow = true; g.add(drum);
    const topRoof = new THREE.Mesh(new THREE.ConeGeometry(7.8, 8.8, 8), MAT.roof);
    topRoof.position.y = 39.2; topRoof.castShadow = true; g.add(topRoof);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), MAT.ridge);
    finial.position.y = 43.9; g.add(finial);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 2.6, 6), MAT.ridge);
    spire.position.y = 45.6; g.add(spire);
    g.rotation.y = Math.PI / 2;
    g.position.set(-110, 7, 0);
  } else if (kind === 'songqing') {
    /* 宋卿体育馆：回廊柱 + 三重檐 + 门廊 */
    const wall = facadeMat({ wall: '#928274', arch: true, floors: 2, bays: 7, seed: hashStr('songqing'), lit: 0.35 });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(36, 1.6, 44), MAT.stone);
    plinth.position.y = 0.8; plinth.receiveShadow = true; g.add(plinth);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(22, 12, 30), wall);
    hall.position.y = 7.6; hall.castShadow = true; g.add(hall);
    for (let i = 0; i < 9; i++) {
      for (const sx of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 8, 12), MAT.stone);
        col.position.set(sx * 15.2, 5.6, -16.8 + i * 4.2);
        col.castShadow = true; g.add(col);
      }
    }
    for (let i = 0; i < 6; i++) {
      for (const sz of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 8, 12), MAT.stone);
        col.position.set(-12.5 + i * 5, 5.6, sz * 19.2);
        col.castShadow = true; g.add(col);
      }
    }
    for (const rz of [18.0, -18.0]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5, 4.6), MAT.eave);
      r.position.set(0, 9.9, rz); g.add(r);
    }
    for (const rx of [16.0, -16.0]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 40.6), MAT.eave);
      r.position.set(rx, 9.9, 0); g.add(r);
    }
    g.add(hipRoof(24, 32, 4.6, 14.4, 0));
    g.add(hipRoof(17, 23, 4.2, 19.0, 0));
    g.add(hipRoof(10, 14, 5.2, 23.2, 0));
    const porch = new THREE.Mesh(new THREE.BoxGeometry(8, 6.5, 9), wall);
    porch.position.set(0, 4.85, 19); g.add(porch);
    const pr = hipRoof(8.6, 9.6, 2.6, 8.4, 0); pr.position.z = 19; g.add(pr);
    g.position.set(104, 3, -8);
    g.rotation.y = -Math.PI / 2;
  } else if (kind === 'gym') {
    /* 工学部体育馆：基座 + 幕墙 + 拱形金属屋面 */
    const podium = new THREE.Mesh(new THREE.BoxGeometry(32, 8, 52),
      facadeMat({ wall: '#888f99', arch: false, floors: 2, bays: 10, seed: hashStr('gymL'), lit: 0.5 }));
    podium.position.y = 4; podium.castShadow = true; g.add(podium);
    const arena = new THREE.Mesh(new THREE.BoxGeometry(30.6, 14, 50), glassMat(hashStr('gym')));
    arena.position.y = 15; arena.castShadow = true; g.add(arena);
    const vaultMat = new THREE.MeshStandardMaterial({ color: 0xaeb8c2, roughness: 0.35, metalness: 0.6 });
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(15.1, 15.1, 50.4, 30), vaultMat);
    vault.rotation.x = Math.PI / 2;
    vault.position.y = 22; vault.castShadow = true; g.add(vault);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 5.4), MAT.concreteDark);
    canopy.position.set(0, 5.4, 28.4); g.add(canopy);
    for (const sx of [-6, 6]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 5.2, 8), MAT.pole);
      col.position.set(sx, 2.7, 30.4); g.add(col);
    }
    g.rotation.y = Math.PI / 2;
    g.position.set(-102, 4, 0);
  } else if (kind === 'library') {
    /* 信息学部图书馆：裙楼 + 玻璃塔楼 + 竖线条 */
    const podium = new THREE.Mesh(new THREE.BoxGeometry(34, 9, 30),
      facadeMat({ wall: '#8a939e', arch: false, floors: 2, bays: 9, seed: hashStr('libP'), lit: 0.5 }));
    podium.position.y = 4.5; podium.castShadow = true; g.add(podium);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(22, 34, 22), glassMat(hashStr('lib')));
    tower.position.y = 26; tower.castShadow = true; g.add(tower);
    for (let i = 0; i < 8; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 34, 1.1), MAT.concreteDark);
      fin.position.set(-8.75 + i * 2.5, 26, 11.4); g.add(fin);
      const fin2 = fin.clone(); fin2.position.z = -11.4; g.add(fin2);
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(24, 1.8, 24), MAT.concreteDark);
    cap.position.y = 44; g.add(cap);
    const attic = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 8), MAT.concrete);
    attic.position.y = 46.4; g.add(attic);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(12, 0.45, 4.5), MAT.concreteDark);
    canopy.position.set(0, 5.4, 16.8); g.add(canopy);
    g.position.set(16, 3, -82);
  } else if (kind === 'science') {
    /* 老理学院：主楼 + 中央塔楼 + 穹顶 */
    const wall = facadeMat({ wall: '#87827a', arch: true, floors: 3, bays: 9, seed: hashStr('sci'), lit: 0.4 });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(52, 1.6, 21), MAT.stone);
    plinth.position.y = 0.8; g.add(plinth);
    const body = new THREE.Mesh(new THREE.BoxGeometry(48, 12, 18), wall);
    body.position.y = 7.6; body.castShadow = true; g.add(body);
    g.add(hipRoof(48, 18, 5.2, 14.0, 0));
    const mid = new THREE.Mesh(new THREE.BoxGeometry(14, 16.5, 14), wall);
    mid.position.y = 9.85; mid.castShadow = true; g.add(mid);
    g.add(hipRoof(14.6, 14.6, 3.4, 18.4, 0));
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.0, 5, 8), wall);
    drum.position.y = 24.2; drum.castShadow = true; g.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5.2, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.roof);
    dome.position.y = 26.8; dome.castShadow = true; g.add(dome);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), MAT.ridge);
    finial.position.y = 32.3; g.add(finial);
    g.rotation.y = -Math.PI / 2;
    g.position.set(112, 9, 4);
  }
  return g;
}

function buildBasketball(x, z) {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(30, 17), new THREE.MeshStandardMaterial({ color: 0x5c8a66, roughness: 0.9 }));
  slab.rotation.x = -Math.PI / 2; slab.position.y = 0.06; slab.receiveShadow = true;
  g.add(slab);
  const rect = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(28, 15)), new THREE.LineBasicMaterial({ color: 0xffffff }));
  rect.rotation.x = -Math.PI / 2; rect.position.y = 0.1; g.add(rect);
  const circ = new THREE.Mesh(new THREE.RingGeometry(1.78, 1.92, 26), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  circ.rotation.x = -Math.PI / 2; circ.position.y = 0.1; g.add(circ);
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 8), MAT.pole);
    pole.position.set(s * 14, 1.7, 0); g.add(pole);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.15, 2), MAT.white);
    board.position.set(s * 13.3, 2.95, 0); g.add(board);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 22), new THREE.MeshStandardMaterial({ color: 0xe65100, roughness: 0.5 }));
    hoop.rotation.x = Math.PI / 2; hoop.position.set(s * 12.5, 3.05, 0); g.add(hoop);
  }
  g.position.set(x, 0, z);
  return g;
}

function buildLake() {
  const g = new THREE.Group();
  const lake = new THREE.Mesh(new THREE.CircleGeometry(15, 44), MAT.water);
  lake.rotation.x = -Math.PI / 2;
  lake.scale.set(1.35, 0.85, 1);
  lake.position.y = 0.08;
  const rim = new THREE.Mesh(new THREE.RingGeometry(14.7, 15.6, 44), MAT.lakeRim);
  rim.rotation.x = -Math.PI / 2;
  rim.scale.set(1.35, 0.85, 1);
  rim.position.y = 0.09;
  g.add(lake, rim);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 34), MAT.ripple.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.set((i - 1) * 9, 0.12, (i % 2 ? 5 : -6));
    g.add(ring);
    lakeRipples.push({ m: ring, ph: i * 0.33 });
  }
  g.position.set(-70, 0, -66);
  return g;
}

/* 樱花花瓣飘落（912 限定） */
function buildPetals() {
  const N = Q.petals;
  const pos = new Float32Array(N * 3);
  const spd = new Float32Array(N);
  const phs = new Float32Array(N);
  const rnd = mulberry32(20260728);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = -85 + rnd() * 170;
    pos[i * 3 + 1] = rnd() * 44;
    pos[i * 3 + 2] = -80 + rnd() * 115;
    spd[i] = 0.7 + rnd() * 1.2;
    phs[i] = rnd() * 6.283;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size: 0.62, map: makePetalTexture(), transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = 2;
  petalSys = { pts: pts, spd: spd, phs: phs, n: N };
  return pts;
}
function updatePetals(dt, t) {
  if (!petalSys) return;
  const attr = petalSys.pts.geometry.attributes.position;
  const arr = attr.array;
  for (let i = 0; i < petalSys.n; i++) {
    arr[i * 3 + 1] -= petalSys.spd[i] * dt;
    arr[i * 3] += Math.sin(t * 1.5 + petalSys.phs[i]) * dt * 0.9;
    arr[i * 3 + 2] += Math.cos(t * 1.1 + petalSys.phs[i]) * dt * 0.5;
    if (arr[i * 3 + 1] < 0.2) {
      arr[i * 3 + 1] = 38 + Math.random() * 8;
      arr[i * 3] = -85 + Math.random() * 170;
      arr[i * 3 + 2] = -80 + Math.random() * 115;
    }
  }
  attr.needsUpdate = true;
}

/* ============================================================
 * 场地组装
 * ============================================================ */
const world = new THREE.Group();
scene.add(world);

const bigGround = new THREE.Mesh(
  new THREE.PlaneGeometry(3000, 3000),
  new THREE.MeshStandardMaterial({ color: 0x3a6b33, roughness: 1 })
);
bigGround.rotation.x = -Math.PI / 2;
bigGround.position.y = -0.05;
scene.add(bigGround);
const GRASS_DAY = new THREE.Color(0x3a6b33), GRASS_NIGHT = new THREE.Color(0x1b3020);

function disposeGroup(g) {
  g.traverse(o => {
    if (o.shadow && o.shadow.dispose) o.shadow.dispose();
    if (o.geometry && GLOBAL_GEOS.indexOf(o.geometry) === -1) o.geometry.dispose();
    if (o.material && !Object.values(MAT).includes(o.material)) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(m => {
        if (m.map) m.map.dispose();
        if (m.emissiveMap && m.emissiveMap !== m.map) m.emissiveMap.dispose();
        m.dispose();
      });
    }
  });
  while (g.children.length) g.remove(g.children[0]);
}

function buildVenue(v) {
  disposeGroup(world);
  spotRefs.length = 0;
  emissiveRefs.length = 0;
  glowSprites.length = 0;
  coneRefs.length = 0;
  winMats.length = 0;
  flagStates.length = 0;
  lakeRipples.length = 0;
  players = [];
  ballState = null;
  petalSys = null;
  ballCarrier = -1;

  const cfg = CFG[v.id] || { theme: '#94070a', trees: 12, stand: 'main' };
  const lw = pitchLW(v.pitch);
  const L = lw.L, W = lw.W;
  const rnd = mulberry32(hashStr(v.id));

  /* 地面（含 bump 凹凸） */
  const tex = makeGroundTexture(v, cfg);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 210),
    new THREE.MeshStandardMaterial({ map: tex, bumpMap: NOISE_TEX, bumpScale: 0.26, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  /* 足球 */
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 22, 16), MAT.ball);
  ball.castShadow = true;
  world.add(ball);
  ballState = { mesh: ball, x: 0, z: 0, tx: 4, tz: 2 };

  /* 球门 / 角旗 / 广告牌 */
  world.add(buildGoal(1, L), buildGoal(-1, L));
  safe('cornerFlags', () => world.add(buildCornerFlags(L, W)));
  safe('curb', () => world.add(buildCurbRing()));
  safe('adBoards', () => world.add(buildAdBoards(L, W)));

  /* 看台 */
  if (cfg.stand === 'double') {
    const s1 = buildStand(134, 8, cfg.theme, true); s1.position.set(0, 0, 51); world.add(s1);
    const s2 = buildStand(134, 8, cfg.theme, true); s2.position.set(0, 0, -51); s2.rotation.y = Math.PI; world.add(s2);
  } else if (cfg.stand === 'small') {
    const s = buildStand(64, 3, cfg.theme, false); s.position.set(0, 0, 51); world.add(s);
  } else {
    const s = buildStand(114, 6, cfg.theme, true); s.position.set(0, 0, 51); world.add(s);
  }
  safe('scoreboard', () => { if (cfg.scoreboard) world.add(buildScoreboard()); });

  /* 替补席 */
  safe('benches', () => {
    world.add(buildBench(-34, 48.6, Math.PI));
    world.add(buildBench(34, 48.6, Math.PI));
  });

  /* 灯塔 */
  for (const pos of [[94, 62], [-94, 62], [94, -62], [-94, -62]]) {
    const fl = buildFloodlight(pos[0], pos[1]);
    world.add(fl);
    world.add(fl.userData.spot);
    world.add(fl.userData.spot.target);
    spotRefs.push(fl.userData.spot);
    coneRefs.push(fl.userData.cone);
  }

  /* 旗杆（东侧） */
  safe('flagpoles', () => {
    for (const fp of [[96, 56], [102, 57.5], [108, 56]]) {
      const st = buildFlagpole(fp[0], fp[1]);
      world.add(st.group);
      flagStates.push(st);
    }
  });

  /* 岗地 + 地标建筑 */
  safe('hills', () => {
    if (cfg.landmark) { const hl = buildHill(cfg.landmark); if (hl) world.add(hl); }
    if (cfg.landmark2) { const h2 = buildHill(cfg.landmark2); if (h2) world.add(h2); }
  });
  safe('landmark', () => { if (cfg.landmark) world.add(buildLandmark(cfg.landmark)); });
  safe('landmark2', () => { if (cfg.landmark2) world.add(buildLandmark(cfg.landmark2)); });
  for (const lm of [cfg.landmark, cfg.landmark2]) {
    if (lm && LANDMARK_BOX[lm]) {
      const bx = LANDMARK_BOX[lm];
      addBlob(world, bx[0], bx[1], bx[2] * 2.5, bx[3] * 2.5, MAT.blobC, 0.025);
    }
  }

  /* 篮球场 / 星湖（信部） */
  safe('bball', () => { if (cfg.bball) world.add(buildBasketball(76, 64)); });
  safe('lake', () => { if (cfg.lake) world.add(buildLake()); });

  /* 树木（有机树冠），912 加樱花道 */
  const ex = [];
  if (cfg.landmark && LANDMARK_BOX[cfg.landmark]) ex.push(LANDMARK_BOX[cfg.landmark]);
  if (cfg.landmark2 && LANDMARK_BOX[cfg.landmark2]) ex.push(LANDMARK_BOX[cfg.landmark2]);
  if (cfg.lake) ex.push([-70, -66, 24, 17]);
  if (cfg.bball) ex.push([76, 64, 20, 13]);
  let placed = 0, guard = 0;
  const treeTarget = Math.max(4, Math.round(cfg.trees * Q.trees));
  while (placed < treeTarget && guard < 400) {
    guard++;
    const a = rnd() * Math.PI * 2;
    const rx = 100 + rnd() * 22, rz = 62 + rnd() * 13;
    const x = Math.cos(a) * rx, z = Math.sin(a) * rz;
    if (Math.abs(x) < 96 && Math.abs(z) < 53) continue;                 /* 跑道内 */
    if (Math.abs(x) < 78 && z > 46 && z < 70) continue;                 /* 主看台带 */
    if (Math.abs(x) < 78 && z < -46 && z > -66 && cfg.stand === 'double') continue;
    if (Math.abs(Math.abs(x) - 94) < 6 && Math.abs(Math.abs(z) - 62) < 6) continue;  /* 灯塔 */
    if (x > 88 && z > 48 && z < 66) continue;                           /* 旗杆带（东） */
    if (ex.some(b => Math.abs(x - b[0]) < b[2] && Math.abs(z - b[1]) < b[3])) continue;
    if (cfg.scoreboard && Math.abs(x) < 14 && z < -58 && z > -76) continue;
    world.add(buildTree(x, z, 0.85 + rnd() * 0.55, rnd, false));
    placed++;
  }
  if (cfg.cherry) {
    for (let i = 0; i < cfg.cherry; i++) {
      const x = -66 + i * (132 / (cfg.cherry - 1));
      world.add(buildTree(x + (rnd() - 0.5) * 4, -56 - rnd() * 5, 0.85 + rnd() * 0.4, rnd, true));
    }
    world.add(buildPetals());
  }

  /* 球员 7v7：发型/三色球衣套装/两段式腿部/摆臂，门将专属配色 */
  safe('players', () => {
    const skinMats = [0xd9a06e, 0xc98d5e, 0xe8b88a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x221a12, roughness: 0.95 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6 });
    const kits = {
      A:  { shirt: 0x9d1f35, shorts: 0xf2f2f2, socks: 0xf0f0f0 },
      B:  { shirt: 0xeef1f5, shorts: 0x26282e, socks: 0xe4e4e4 },
      GA: { shirt: 0x1f8a4c, shorts: 0x1c1e24, socks: 0x1f8a4c },
      GB: { shirt: 0xf2b705, shorts: 0x1c1e24, socks: 0xf2b705 }
    };
    const kitMat = {};
    Object.keys(kits).forEach(k => {
      kitMat[k] = {
        shirt: new THREE.MeshStandardMaterial({ color: kits[k].shirt, roughness: 0.75 }),
        shorts: new THREE.MeshStandardMaterial({ color: kits[k].shorts, roughness: 0.8 }),
        socks: new THREE.MeshStandardMaterial({ color: kits[k].socks, roughness: 0.85 })
      };
    });
    const mk = (kitKey, skinIdx) => {
      const km = kitMat[kitKey];
      const g = new THREE.Group();
      /* 腿：大腿(短裤色) + 小腿(球袜色) + 球鞋，髋/膝两级枢轴 */
      const mkLeg = (hx) => {
        const hip = new THREE.Group(); hip.position.set(hx, 0.86, 0);
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.42, 0.16), km.shorts);
        thigh.position.y = -0.21; thigh.castShadow = true;
        const knee = new THREE.Group(); knee.position.y = -0.42;
        const shin = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.34, 0.13), km.socks);
        shin.position.y = -0.17; shin.castShadow = true;
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.26), bootMat);
        foot.position.set(0, -0.38, 0.05);
        knee.add(shin, foot);
        hip.add(thigh, knee);
        g.add(hip);
        return { hip: hip, knee: knee };
      };
      const legL = mkLeg(-0.085), legR = mkLeg(0.085);
      /* 手臂：上臂(球衣色) + 前臂(肤色)，肩/肘两级枢轴 */
      const mkArm = (sx) => {
        const sh = new THREE.Group(); sh.position.set(sx * 0.24, 1.34, 0);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.1), km.shirt);
        upper.position.y = -0.15; upper.castShadow = true;
        const el = new THREE.Group(); el.position.y = -0.3;
        const fore = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.09), skinMats[skinIdx]);
        fore.position.y = -0.14;
        el.add(fore);
        sh.add(upper, el);
        g.add(sh);
        return { sh: sh, el: el };
      };
      const armL = mkArm(-1), armR = mkArm(1);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.34, 3, 10), km.shirt);
      torso.position.y = 1.12; torso.castShadow = true;
      const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.18, 0.2), km.shorts);
      shorts.position.y = 0.88;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), skinMats[skinIdx]);
      head.position.y = 1.52; head.castShadow = true;
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.142, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
      hair.position.y = 1.535;
      g.add(torso, shorts, head, hair);
      g.userData = { legL: legL, legR: legR, armL: armL, armR: armR, torso: torso };
      return g;
    };
    const formations = [
      [-0.46, 0], [-0.36, -0.3], [-0.36, 0.3], [-0.2, -0.14], [-0.2, 0.14], [-0.06, -0.32], [-0.06, 0.32]
    ];
    formations.forEach((f, i) => {
      const gk = (i === 0);
      const xa = f[0] * L - 2, za = f[1] * W;
      const pa = mk(gk ? 'GA' : 'A', i % 3); pa.position.set(xa, 0, za); world.add(pa);
      players.push({ mesh: pa, x: xa, z: za, zx: xa, zy: za, rx: gk ? 1.6 : L * 0.14, rz: gk ? W * 0.2 : W * 0.38, tx: xa, tz: gk ? za + 2 : za, vx: 0, vz: 0, sp: 1.4, ph: i * 1.7, gk: gk, face: Math.PI / 2, fixedYaw: Math.PI / 2, pauseUntil: 0 });
      const xb = -f[0] * L + 2, zb = -f[1] * W;
      const pb = mk(gk ? 'GB' : 'B', (i + 1) % 3); pb.position.set(xb, 0, zb); world.add(pb);
      players.push({ mesh: pb, x: xb, z: zb, zx: xb, zy: zb, rx: gk ? 1.6 : L * 0.14, rz: gk ? W * 0.2 : W * 0.38, tx: xb, tz: gk ? zb + 2 : zb, vx: 0, vz: 0, sp: 1.4, ph: i * 2.3 + 1, gk: gk, face: -Math.PI / 2, fixedYaw: -Math.PI / 2, pauseUntil: 0 });
    });
  });
}

/* ============================================================
 * 动画
 * ============================================================ */
function updatePlayers(dt, t) {
  if (ballCarrier < 0 || t > ballSwitchAt) pickCarrier(t);
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    let desX = 0, desZ = 0;
    /* 目标决策：到点后选新目标（走/慢跑/冲刺三档），偶尔原地停顿 */
    if (t >= p.pauseUntil) {
      const dx = p.tx - p.x, dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.8) {
        if (p.gk) { p.tx = p.zx; p.tz = p.zy + (Math.random() - 0.5) * 2 * p.rz; }
        else { p.tx = p.zx + (Math.random() - 0.5) * 2 * p.rx; p.tz = p.zy + (Math.random() - 0.5) * 2 * p.rz; }
        const roll = Math.random();
        p.sp = roll < 0.45 ? 1.0 + Math.random() * 0.7
             : roll < 0.85 ? 2.4 + Math.random() * 1.2
             : 4.8 + Math.random() * 2.2;
        if (!p.gk && Math.random() < 0.3) p.pauseUntil = t + 0.8 + Math.random() * 2.2;
      } else {
        desX = dx / d * p.sp;
        desZ = dz / d * p.sp;
      }
    }
    /* 速度惯性：加速/减速渐进，不再瞬移 */
    const kk = Math.min(1, dt * 3.2);
    p.vx += (desX - p.vx) * kk;
    p.vz += (desZ - p.vz) * kk;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const sp = Math.hypot(p.vx, p.vz);
    const moving = sp > 0.25;
    /* 朝向平滑插值（转身有过程）；门将始终面向场内 */
    if (p.gk) {
      p.face = p.fixedYaw;
    } else if (moving) {
      const target = Math.atan2(p.vx, p.vz);
      let diff = target - p.face;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.face += diff * Math.min(1, dt * 7);
    } else if (t < p.pauseUntil) {
      p.face += Math.sin(t * 0.6 + p.ph) * dt * 0.35;   /* 停顿观望 */
    }
    p.mesh.rotation.y = p.face;
    /* 步态参数随速度缩放：走=小步低频、跑=大幅高频、冲刺=高抬膝 */
    const run = sp > 1.8, sprint = sp > 3.6;
    const freq = sprint ? 12.5 : run ? 9.5 : 5.4;
    const amp = moving ? Math.min(0.8, 0.1 + sp * 0.13) : 0;
    const cad = t * freq + p.ph;
    const s1 = Math.sin(cad), s2 = -s1;
    const u = p.mesh.userData;
    u.legL.hip.rotation.x = s1 * amp;
    u.legR.hip.rotation.x = s2 * amp;
    const kneeK = moving ? (run ? 1.7 : 0.6) : 0.06;
    u.legL.knee.rotation.x = -(Math.max(0, Math.cos(cad)) * amp * kneeK + 0.05);
    u.legR.knee.rotation.x = -(Math.max(0, -Math.cos(cad)) * amp * kneeK + 0.05);
    /* 手臂：摆幅随速度，肘部保持弯曲（冲刺时更屈） */
    const armAmp = moving ? Math.min(0.85, 0.12 + sp * 0.16) : 0.03;
    u.armL.sh.rotation.x = moving ? s2 * armAmp : Math.sin(t * 1.3 + p.ph) * 0.03;
    u.armR.sh.rotation.x = moving ? s1 * armAmp : Math.sin(t * 1.3 + p.ph + 2) * 0.03;
    u.armL.el.rotation.x = -(0.3 + armAmp * 1.1 + (run ? Math.max(0, s2) * 0.25 : 0));
    u.armR.el.rotation.x = -(0.3 + armAmp * 1.1 + (run ? Math.max(0, s1) * 0.25 : 0));
    /* 躯干：前倾随速度 + 跑动时肩髋反向微旋；站立时呼吸起伏 */
    u.torso.rotation.x = Math.min(0.2, sp * 0.033) + (moving ? 0 : Math.sin(t * 1.4 + p.ph) * 0.012);
    u.torso.rotation.y = moving ? -s1 * (run ? 0.1 : 0.04) : 0;
    p.mesh.position.set(p.x, moving ? Math.abs(Math.sin(cad)) * Math.min(0.07, sp * 0.014) : 0, p.z);
  }
  /* 足球：跟随当前持球队员脚下盘带，换人瞬间形成"传球" */
  if (ballState) {
    const b = ballState;
    let bx = 0, bz = 0;
    if (ballCarrier >= 0 && ballCarrier < players.length) {
      const c = players[ballCarrier];
      bx = c.x + Math.sin(c.face) * 1.05 + Math.sin(t * 7 + c.ph) * 0.18;
      bz = c.z + Math.cos(c.face) * 1.05 + Math.cos(t * 6.3 + c.ph) * 0.18;
    }
    const dx = bx - b.x, dz = bz - b.z;
    const d = Math.hypot(dx, dz);
    const follow = Math.min(1, dt * (d > 3 ? 4.5 : 9));
    const mx = dx * follow, mz = dz * follow;
    b.x += mx; b.z += mz;
    const moved = Math.hypot(mx, mz) / Math.max(dt, 1e-4);
    b.mesh.position.set(b.x, 0.35 + (d > 1.5 ? Math.abs(Math.sin(t * 6)) * 0.1 : 0), b.z);
    b.mesh.rotation.x += dt * moved / 0.35;      /* 按滚动距离自旋 */
    b.mesh.rotation.z -= dt * 0.5;
  }
}
function updateFlags(t) {
  for (const fs of flagStates) {
    const pos = fs.flag.geometry.attributes.position;
    const base = fs.base;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3];
      const amp = Math.max(0, bx) / 2.5;
      pos.setZ(i, Math.sin(t * 5 + bx * 2.2) * 0.17 * amp + Math.sin(t * 8.6 + bx * 4.1) * 0.05 * amp);
    }
    pos.needsUpdate = true;
  }
}
function updateClouds(t) {
  for (const c of clouds) {
    let x = c.x0 + t * c.spd;
    x = ((x + 900) % 1800) - 900;
    c.g.position.x = x;
  }
}
function updateLake(t) {
  for (const r of lakeRipples) {
    const f = ((t * 0.16) + r.ph) % 1;
    const s = 0.4 + f * 3.6;
    r.m.scale.set(1.35 * s, 0.85 * s, 1);
    r.m.material.opacity = Math.sin(f * Math.PI) * 0.28;
  }
}

/* ============================================================
 * UI：chips / 面板 / 按钮 / 机位
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
  if (setHash) { try { history.replaceState(null, '', '#' + v.id); } catch (e) { /* file:// */ } }
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
const viewBtns = document.querySelectorAll('#viewbtns button');
function applyView(key) {
  const vv = VIEWS[key] || VIEWS.pano;
  camera.position.set(vv.pos[0], vv.pos[1], vv.pos[2]);
  controls.target.set(vv.tgt[0], vv.tgt[1], vv.tgt[2]);
  viewBtns.forEach(b => b.classList.toggle('on', b.dataset.view === key));
}
document.getElementById('btnReset').addEventListener('click', () => applyView('pano'));
viewBtns.forEach(b => b.addEventListener('click', () => applyView(b.dataset.view)));

window.addEventListener('hashchange', () => selectVenue(location.hash.slice(1), false));
window.addEventListener('resize', () => {
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
});

/* ============================================================
 * 主循环（日夜插值 + 动画 + 后期）
 * ============================================================ */
const DAY = { amb: 0.45, hemi: 1.0, dir: 2.9, fill: 0.6, spot: 0, emis: 0.1, fogNear: 460, fogFar: 1800 };
const NIGHT = { amb: 0.13, hemi: 0.17, dir: 0.1, fill: 0.06, spot: 1300, emis: 2.0, fogNear: 230, fogFar: 1250 };
const FOG_DAY = new THREE.Color(0xd5e5f0), FOG_NIGHT = new THREE.Color(0x0a0f22);
let nightT = 0, nightTarget = 0;
scene.fog = new THREE.Fog(FOG_DAY.clone(), DAY.fogNear, DAY.fogFar);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  nightT += (nightTarget - nightT) * 0.045;
  const k = nightT, dk = 1 - nightT;
  ambient.intensity = THREE.MathUtils.lerp(DAY.amb, NIGHT.amb, k);
  hemi.intensity = THREE.MathUtils.lerp(DAY.hemi, NIGHT.hemi, k);
  sun.intensity = THREE.MathUtils.lerp(DAY.dir, NIGHT.dir, k);
  sun.color.setHex(k > 0.5 ? 0xbcc9e8 : 0xfff1d6);
  fill.intensity = THREE.MathUtils.lerp(DAY.fill, NIGHT.fill, k);
  scene.fog.color.copy(FOG_DAY).lerp(FOG_NIGHT, k);
  scene.fog.near = THREE.MathUtils.lerp(DAY.fogNear, NIGHT.fogNear, k);
  scene.fog.far = THREE.MathUtils.lerp(DAY.fogFar, NIGHT.fogFar, k);
  bigGround.material.color.copy(GRASS_DAY).lerp(GRASS_NIGHT, k);
  if (skyNight) skyNight.material.opacity = k;
  if (starMat) starMat.opacity = Math.max(0, k * 1.15 - 0.08);
  if (sunSprite) sunSprite.material.opacity = dk * 0.9;
  if (moonSprite) moonSprite.material.opacity = k * 0.8;
  if (cloudMat) cloudMat.opacity = THREE.MathUtils.lerp(0.6, 0.05, k);
  const spI = THREE.MathUtils.lerp(DAY.spot, NIGHT.spot, k);
  spotRefs.forEach(sp => { sp.intensity = spI; });
  const em = THREE.MathUtils.lerp(DAY.emis, NIGHT.emis, k);
  emissiveRefs.forEach(m => { m.emissiveIntensity = em; });
  glowSprites.forEach(s => { s.material.opacity = k * 0.75; });
  coneRefs.forEach(c => { c.material.opacity = k * 0.042; });
  winMats.forEach(m => { m.emissiveIntensity = k * 1.08; });
  if (bloomPass) bloomPass.strength = THREE.MathUtils.lerp(0.09, 0.4, k);

  updatePlayers(dt, t);
  updateFlags(t);
  updateClouds(t);
  updateLake(t);
  updatePetals(dt, t);

  controls.update();
  if (useComposer && composer) {
    try { composer.render(); }
    catch (e) { useComposer = false; composer = null; renderer.render(scene, camera); }
  } else {
    renderer.render(scene, camera);
  }
}

/* ---------- 启动 ---------- */
const initial = (location.hash.slice(1) && VENUES.some(v => v.id === location.hash.slice(1)))
  ? location.hash.slice(1) : VENUES[0].id;
selectVenue(initial, false);
animate();
window.__threeBooted = true;

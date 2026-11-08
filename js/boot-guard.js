/* ============================================================
 * 振兴杯球场巡礼 · 3D 页启动看门狗
 * 若 three-app.js 因 vendor 库缺失或场景初始化失败而未置位
 * window.__threeBooted，则在 12 秒后把失败原因显示在加载层上。
 * 契约：
 *   window.__threeBooted —— 由 js/three-app.js 末尾置为 true
 *   window.__bootTimer   —— 本文件的定时器 id，启动成功后由 three-app.js 清除
 * 顺序：必须在 js/three-app.js 之前加载（见 3d.html 脚本顺序）。
 * ============================================================ */
(function () {
  'use strict';

  const BOOT_TIMEOUT_MS = 12000;

  window.__bootTimer = setTimeout(function () {
    if (window.__threeBooted) {
      return;
    }
    const el = document.getElementById('loading');
    if (el && !el.classList.contains('done')) {
      el.innerHTML =
        '⚠️ 3D 场景初始化超时<br><small>请确认 js/vendor/three.min.js 与 ' +
        'js/vendor/OrbitControls.js 文件存在且完整，<br>然后刷新本页（本地库无需联网）。</small>';
    }
  }, BOOT_TIMEOUT_MS);
})();

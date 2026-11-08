# 贡献与代码规范

本文件是 `whu-football-viz` 的代码规范唯一出处。**改代码前先读「硬性约定」一节**；`README.md` 只保留功能与使用说明。

## 0. 前提：没有构建步骤

本站是纯静态站点：**源文件即发布产物**。`index.html` / `3d.html` 双击即可运行（`file://`），全部第三方库已本地化在 `js/vendor`、`css/vendor`。因此任何规范都不能引入构建、转译或打包步骤，也不能改用 ES Module —— 这条前提优先于本文其它所有约定。

## 1. 目录职责

| 路径                           | 职责            | 允许放什么                                                        |
| ------------------------------ | --------------- | ----------------------------------------------------------------- |
| `index.html` / `3d.html`       | 页面骨架        | 只放结构，内容由 JS 渲染；**不写内联 `<script>` / `<style>`**     |
| `js/data.js`                   | 全部站点数据    | 只放数据与 `window.WHU_FOOTBALL` 导出，**不放逻辑、不产生副作用** |
| `js/app.js`                    | 主站逻辑        | 地图、卡片渲染、筛选、灯箱、校准、足迹、测验                      |
| `js/three-app.js`              | 3D 场景         | three.js 建模与交互；实现包在 IIFE 内                             |
| `js/boot-guard.js`             | 3D 页启动看门狗 | 仅启动超时提示                                                    |
| `css/style.css` / `css/3d.css` | 样式            | 只放第一方样式                                                    |
| `js/vendor`、`css/vendor`      | 第三方库        | **不修改、不 lint、不格式化**                                     |
| `data/`、`_verify/`            | 研究中间产物    | 已写入 `.gitignore`，可随时删除                                   |
| `_baseline/`                   | 本地回退备份    | 已写入 `.gitignore`，确认无误后删除                               |

## 2. 工具链（可选，仅供本地检查）

检查工具**不参与运行**，不安装也能直接打开页面：

```bash
npm install            # 安装 devDependencies：eslint / @eslint/js / globals / prettier
npm run lint           # ESLint 检查 js/ 下第一方脚本
npm run lint:fix       # 自动修复可机械修复的问题
npm run format         # Prettier 统一格式（.prettierignore 已排除 vendor 与原始数据）
npm run format:check   # 只检查、不改写
npm run serve          # python -m http.server 8000
```

配置：`.editorconfig`（缩进与换行）、`.prettierrc.json`、`.prettierignore`、`eslint.config.mjs`、`.gitattributes`。

## 3. 硬性约定

### 通用

| 项目 | 约定                                                                                         |
| ---- | -------------------------------------------------------------------------------------------- |
| 编码 | UTF-8，无 BOM                                                                                |
| 换行 | LF；文件末尾保留一个空行；行尾不留空格                                                       |
| 缩进 | 2 空格，禁止 Tab                                                                             |
| 引号 | JS 用单引号；HTML 属性用双引号；字符串内含单引号时改用双引号                                 |
| 分号 | 必须写                                                                                       |
| 行宽 | 建议 ≤ 120 字符（长 URL、中文长句不受此限）                                                  |
| 注释 | 文件头 banner（`/* ===...=== */`）+ 分节注释（`/* ---------- 分节 ---------- */`），中文书写 |
| 命名 | DOM id / CSS 类 kebab-case；JS 变量与函数 camelCase；模块级常量 UPPER_SNAKE_CASE             |

### JavaScript

| 项目     | 约定                                                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 语法基线 | **ES2017**。可用 `const/let`、箭头函数、模板字符串、解构、展开、`async/await`；**不用** `?.`、`??`、`BigInt`、顶层 `await` —— 保证老版微信内置浏览器可用                                                                             |
| 声明     | 一律 `const`，需要重新赋值才用 `let`；**新代码禁止 `var`**                                                                                                                                                                           |
| 脚本形态 | 传统脚本（非 ES Module）；对外只暴露必要的 `window.*` 契约                                                                                                                                                                           |
| 全局污染 | 文件内部实现必须包在 IIFE 里（`(function () { ... })();`）；目前允许的全局只有 4 个：`window.WHU_FOOTBALL`（数据）、`window.__threeBooted`（3D 启动标记）、`window.__bootTimer`（启动看门狗定时器）、`window.__whu3d`（3D 调试句柄） |
| 严格模式 | 新增文件在 IIFE 内首行写 `'use strict';`                                                                                                                                                                                             |
| 相等判断 | 用 `===` / `!==`（`== null` 判空除外）                                                                                                                                                                                               |
| 兜底     | 允许 `try/catch` 降级，但**不允许空 catch**：要么注释说明为何忽略，要么 `console.warn`                                                                                                                                               |
| 调试残留 | 不提交 `console.log`；`console.warn` / `console.error` 可以保留                                                                                                                                                                      |
| 硬编码   | 颜色、尺寸、localStorage 键、场地 id 等重复出现的值提为模块级常量                                                                                                                                                                    |

### HTML

- `<!DOCTYPE html>`、`<html lang="zh-CN">`、`<meta charset="UTF-8">` 必备。
- `<head>` 顺序固定：`charset` → `viewport` → `title` → `description` → `og:*` → `favicon` → 样式表。
- 两个页面的 `viewport` 写法保持一致；不禁止用户缩放（不加 `maximum-scale` / `user-scalable=no`）。
- 图片必须有 `alt`；纯装饰图用 `alt=""`。
- 交互元素用 `<button>`，不用带 `onclick` 的 `<div>`；**不写内联事件属性**。
- 脚本放 `</body>` 前。`js/data.js` 无依赖可以最先加载，vendor 库必须排在消费它的逻辑脚本之前：`index.html` 为 vendor → data → app；`3d.html` 为 data → vendor → boot-guard → three-app。

### CSS

- 类名 kebab-case，语义化（`.venue-card`，不用 `.vc2`）。
- 颜色、圆角、阴影提为 `:root` 变量；新增颜色必须先进变量表。
- `z-index` 分两档管理，不允许随意取值：
  - **全局浮层**：`900` 内容层 / `1200` 页头 / `2000` 海报弹层 / `3000` 灯箱。新增全屏遮罩一律落在 2000–3000，**必须高于 `1200` 的吸顶导航**。
  - **组件内部的局部层级**（`.vc-dots`、`#viewbtns`、`#loading` 等，同处一个层叠上下文）允许使用 `2`–`10` 的小值。
  - 历史缺陷：`.poster-modal` 原为 `120`，打开海报时会被页头压住，已修正为 `2000`。
- 断点值：主站 `900px` / `700px`（`css/style.css`），3D 页 `700px` / `400px`（`css/3d.css`）。**新增媒体查询必须按宽度降序排列，同一宽度不允许出现两个块**（现存源序错乱问题见 6.2 第 1 条）。
- `@media (prefers-reduced-motion: reduce)` 兜底已加在 `css/style.css` 末尾；3D 页的动效在 WebGL 内部，CSS 兜底覆盖不到，需 JS 侧读 `matchMedia`（见 6.3「3D 页动效不响应 reduced-motion」）。
- 避免 `!important`；确需使用时在该行上方注释原因。
- 注意：现存 `css/*.css` 采用「同一规则的多条声明写在一行」的紧凑写法。首次执行 `npm run format` 时 Prettier 会展开为「一行一条声明」——这属于一次性纯格式变更，请目视核对后再提交。

## 4. 数据规范（`js/data.js`）

- 一个顶层对象 `WHU_FOOTBALL`，末尾统一导出：`window.WHU_FOOTBALL = WHU_FOOTBALL;`。
- 数据分两种**形状**，不要互相混用：
  - **`venues[]`（比赛球场，15 键，全部必填）**：`id` / `name` / `alias` / `en` / `campus` / `campusKey` / `cupVenue` / `cupNote` / `tags` / `wgs` / `pitch` / `intro` / `facts` / `photos` / `sources`。新增球场必须补齐全部字段，没有内容用空数组/空字符串，**不要省略键**。
  - **`supplemental[]`（其他运动场地，轻量 POI）**：只有 `id` / `name` / `note` / `wgs`。它对应 index.html 的「其他运动场地」区块（DOM 里叫 `#more` / `suppGrid`），是另一种类型，别按 venue 的字段要求它。
- **`pitch` 是必填**：`three-app.js` 无条件读取它（`pitchLW(v.pitch)`），少一个 `pitch` 会让 3D 页直接黑屏；主站虽然用 `if (v.pitch)` 兜底省略草坪框，也不要依赖这个兜底。
- 坐标一律 WGS-84，键名统一 `lat` / `lng`，保留 **5 位小数**（≈1 米，与矢量源精度一致，不要写 6 位伪精度）。`pitch.lat` / `pitch.lng` 是足球场草坪多边形的**质心**，`pitch.w` / `pitch.h` 为**米**：`w` 是东西向宽（对应经度方向），`h` 是南北向长（对应纬度方向）。
- `photos[]` 目前用 `f`（文件名）/ `c`（图注）/ `cr`（来源）/ `src`（来源网页链接），而 `sources[]`、`credits[]` 用 `label` / `url`——同一语义两套字段名属于历史遗留，新增数据请**沿用所在集合的既有字段**，不要中途改名（统一重命名见第 6 节待办）。
- 日期：面向读者的文案用「2025 年 12 月 6 日」；机器可读的元数据用 `YYYY-MM`。
- 每条照片必须带 `cr`（来源）与来源链接，符合 README 的版权声明。

## 5. 3D 页专项（`js/three-app.js`）

- 文件顶层实现全部包在 **IIFE** 内，首行写 `'use strict';`。需要跨脚本或供调试的可见状态只能走显式 `window.*`，当前仅有两个：`window.__threeBooted`（启动标记）与 `window.__whu3d`（调试句柄，暴露 `scene` / `camera` / `renderer` / `world` / `MAT` / `selectVenue` 等）。
- 每个增强部件都用 `safe('部件名', () => { ... })` 包裹，保证单点失败不中断整场初始化（`safe()` 在成功路径上是直通调用，不改变行为）。
- 移动端画质分级集中在 `Q` 常量，不在各处散写 `IS_MOBILE` 判断。
- 场景对象用完必须 `dispose()`（几何/材质/纹理），切换球场不允许泄漏 GPU 资源。
- 所有随机数使用固定种子的 `mulberry32`，保证同一场地每次渲染一致；**不要混用 `Math.random()`**。
- **同一位置只能有一个来源**：场地布局坐标（灯塔、星湖、篮球场、记分牌、地标、岗地）不得在多处硬编码数值。
- 校园主题色由场地的 `campusKey` 派生，不在 `CFG` 里按 `id` 重复写死颜色。

## 6. 待办清单

本节来自一次完整静态审计（`js/app.js`、`js/three-app.js`、`js/data.js`、两个 HTML、两个 CSS）。结论：**格式问题只占一小部分，主体在结构层**，因此按「先高风险、后风格」分层排列，每条都标注位置。行号是**整改前**的位置，本轮增删行之后个别行号会有 ±1~2 偏移，定位时以代码内容为准。

### 6.1 本轮已完成的规范修正

| 内容                                                                                                                                                                               | 位置                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 补齐 lint / format / 编辑器配置与 npm 脚本                                                                                                                                         | `.editorconfig`、`.prettierrc.json`、`.prettierignore`、`eslint.config.mjs`、`.gitattributes`、`package.json` |
| 约 120 个顶层绑定收进 IIFE 并加 `'use strict'`（原先全部污染 `window`：`D`、`Q`、`CFG`、`HILLS`、`safe`、`world`……）                                                               | `js/three-app.js`                                                                                             |
| 补调试句柄 `window.__whu3d`（IIFE 封装后 devtools 仍可访问场景与主要接口）                                                                                                         | `js/three-app.js` 末尾                                                                                        |
| 启动成功后回收看门狗定时器 `clearTimeout(window.__bootTimer)`                                                                                                                      | `js/three-app.js` 末尾                                                                                        |
| `buildVenue` 调用与看台段包进 `safe()`：任一处抛错不再导致页面停在 12 秒启动超时提示上（更细的部件级包裹见 6.3「safe() 细粒度化」）                                                | `js/three-app.js` `selectVenue` / 看台                                                                        |
| 删除零引用的死材质与死分支（`MAT.greenRoof`/`glass`/`skin`/`shorts`/`teamA`/`teamB`；`cfg.stand === 'small'`）                                                                     | `js/three-app.js`                                                                                             |
| 内联启动看门狗外提为独立脚本，HTML 里不再有内联 `<script>`                                                                                                                         | `js/boot-guard.js` + `3d.html`                                                                                |
| 入口补 `data.js` 存在性守卫；文件头 banner 补全实际职责                                                                                                                            | `js/app.js`                                                                                                   |
| 海报弹层被吸顶导航压住（`z-index:120` < `1200`）                                                                                                                                   | `css/style.css` `.poster-modal`                                                                               |
| 删除已反查确认无人引用的死选择器与死声明（后者按「保持当前实际渲染」处理）                                                                                                         | `css/style.css` `.vc-main-photo`、`.q-result .vt-actions`；700px 块的 `#map{height:400px}`、`.nav{gap:9px}`   |
| 补 `:focus-visible` 键盘焦点样式；`prefers-reduced-motion` 动效兜底                                                                                                                | `css/style.css`、`css/3d.css`                                                                                 |
| 去掉 3D 页视口禁止缩放、补 `meta description` 与 `og:type`                                                                                                                         | `3d.html`                                                                                                     |
| 地图容器补 `role="region"` + `tabindex="0"`（可被读屏识别并支持键盘平移）                                                                                                          | `index.html`                                                                                                  |
| 忽略 `node_modules/` 与 `_baseline/`；README 目录结构同步                                                                                                                          | `.gitignore`、`README.md`                                                                                     |
| 分节注释统一为单行 `/* ---------- 分节 ---------- */`（`three-app.js` 10 处三行等号块、`app.js` 2 处；另收敛 `three-app.js` 的 2 处 `//` 行尾注释。`js/data.js` 原本已合规，未动） | `js/three-app.js`、`js/app.js`                                                                                |

### 6.2 P1 · 行为性修复（改完必须用浏览器/真机核对）

1. **CSS `@media` 源序错乱**（`css/style.css`）：900px 块出现两次（:358、:501），700px 块三次（:365、:435、:570）。同特异度下后出现的胜出，于是 `#map{height:400px}`(:372) 与 `.nav{gap:9px}`(:374) 成了死声明。本轮按「保持当前实际渲染」处理（删掉这两条死声明，移动端地图维持 460px、导航 gap 维持 10px）；**若原意是 400px，把 :507 的 460px 改回 400px**，并把所有媒体查询按降序重整一次。
2. **锚点被吸顶导航遮挡**（`css/style.css:364` `section[id]{scroll-margin-top:64px}`）：≤700px 时导航缩字号后会折 2–3 行，真实页头高度远超 64px。建议由 JS 量测页头高度写入 `--header-h`，CSS 改用 `var(--header-h)`。
3. **转义策略不统一**（`js/app.js`）：部分位置已用 `esc()`，但 `:105-114`、`:143`、`:221`、`:500` 仍把 `v.name`、`s.url`、`c.url` 等直接拼进 `innerHTML`（含属性上下文，且无协议白名单）。建议统一 `esc()`，URL 再做 `http/https/相对路径` 校验。
4. **数据缺守卫**（`js/app.js:41` 起）：`data.js` 加载失败时整个 IIFE 抛错、页面全白（入口守卫已加）；`D.overview.nightPhoto`(:462-468) 等深层字段仍建议加守卫或分段 `try/catch`，避免一处抛错连带时间线、足迹、测验全部不渲染。
5. **触屏判定**（`js/app.js:671`）：用 `!('ontouchstart' in window)` 判断并决定提示文案，触屏 + 鼠标的混合设备会判错；建议改用 `(hover: hover)` / `(pointer: coarse)` 或 `matchMedia`。
6. **两套滑动实现**（`js/app.js:294-330` 轮播 6px 阈值 vs `:375-384` 灯箱 50px 阈值）：建议统一为单一 Pointer Events 工具函数。
7. **模态可访问性**（`index.html:209`、`:220`）：`aria-hidden="true"` 容器里含可聚焦按钮，且缺 `role="dialog"` / `aria-modal` / 焦点陷阱 / Esc 关闭。建议改用 `hidden` 属性控制显隐并补齐 ARIA。
8. **移动端视口与滚动**：`.lightbox`(:299) 无滚动区、`:306/379/492/494` 用 `vh`（地址栏伸缩会跳动）；`3d.css:133` 的 `.panel` 在 `body{overflow:hidden}` 下可能超出可视区且滚不到。建议改 `dvh` 并允许内部滚动。
9. **`backdrop-filter` 前缀不齐**（`style.css:34`、`:326`、`3d.css:80` 缺 `-webkit-`，而 `:423` 有）：面向微信内置浏览器需补前缀。
10. **`3d.html` 视口禁止缩放**已移除（WCAG 1.4.4），若确认要锁缩放请说明理由。
11. **渲染循环静默降级**（`js/three-app.js:1878-1880`）：composer 抛错后 `catch` 无日志、无一次性标记，且 `bloomPass`(:1869) 仍被每帧写入。建议抽 `disableComposer(reason)`，warn 一次并置 `bloomPass = null`。
12. **`innerHTML` 未转义**（`js/three-app.js:1772`、`1781-1790`）：面板与 chips 直接拼 `v.name` / `v.alias` / `v.tags` / `cfg.note` / `v.facts[0]`；`js/app.js:179` 已有 `esc()`，复用即可（与 6.2.3 同一类问题）。
13. **两种随机源并存**（`js/three-app.js:1017-1018`、`1404-1406`、`1661-1667`、`1691` 用 `Math.random()`）：同一场地两次进入的动作不可复现，与 `mulberry32(seed)` 的约定冲突；建议把 `rnd` 传进 `update*` 系列函数。
14. **`IS_MOBILE` 只在加载时算一次**（`js/three-app.js:21`，而 resize 处理在 :1823）：尺寸变化后画质档不更新；且「短边 < 760」会把窄窗口的桌面用户降到移动画质（关 bloom、dpr 1.5、阴影 1024）。建议改成可重算函数或加注释说明取舍。
15. **切场地时的材质白名单靠隐式约定**（`js/three-app.js:1431` 的 `Object.values(MAT).includes(o.material)`）：新增共享材质若忘记登记进 `MAT`，切场地时会被错误 dispose；而 `MAT.ripple.clone()`(:1363) 又恰好依赖「不在 `MAT` 表中」这一反向事实。建议改为显式 `Set` 登记并注明契约。

### 6.3 P2 · 结构重构（风险中等，提升可维护性）

1. **三份海报绘制样板去重**（`js/app.js:583-668`、`859-917`、`1065-1122`）：750×1200 画布、字体串、渐变 + 双圆弧 + 上下金线、页脚口号与年月三处重复约 30 行 → 抽 `createPosterCanvas()` / `drawPosterFrame()` 与常量。
2. **事件委托分散**（`js/app.js:385`、`391`、`423`、`481`、`692`）：2 个 document `keydown` + 3 个 document `click` 并存，每次点击要过三遍 `closest` → 合并为单一分发器。
3. **DOM expando 传状态**（`js/app.js:273`、`340`、`399` 的 `root._st`）→ 改用 `WeakMap`。
4. **静态数据内联在视图文件里**（`js/app.js:699-761` QUIZ、`924-988` VTEST/VINFO、`533-539` FP_RANKS，约 260 行）→ 迁入 `js/data.js` 挂到 `WHU_FOOTBALL`。
5. **`var` → `const/let`**（`js/app.js` 全文）：该文件是「ES5 写法 + 现代 API」混搭，`eslint --fix` 无法自动修 `no-var`，需手工或脚本迁移并做浏览器回归。
6. **3D 页动效不响应 `prefers-reduced-motion`**（`js/three-app.js` 的 `controls.autoRotate`、云/花瓣/球员/水面动画）：`css/style.css` 的 CSS 兜底覆盖不到 WebGL 内部动效。建议在 `three-app.js` 里读 `matchMedia('(prefers-reduced-motion: reduce)')`，命中时关闭自动旋转与装饰性动画（球场几何本身不受影响）。原「补 `'use strict'`」一条已在本轮完成（见 6.1）。
7. **硬编码与魔数收敛**：`'venue-'` 前缀（app.js 4 处）、`'images/'`（6 处）、默认场地 `'912'`、`images/912-aerial-1.jpg`（`index.html:9`、`css/style.css:53`、`app.js:1132` 三处各写一次）、轮播 4200ms、滑动阈值、坐标换算 110540/111320、海报 750×1200 → 抽常量表 / `CONFIG`。
8. **CSS 死 token 与重复样式**（`css/style.css`）：`--wl/--gx/--xx`(:14-16) 零引用；`#ffd67a` 出现 7 次、`rgba(148,7,10,*)` 6 次；卡片表面样式重复 5 处、胶囊按钮重复 5 处；两套 `:root` 中 `--card` / `--line` **同名不同义** → 建议抽 `css/tokens.css` 或改名。
9. **按钮字体未统一继承**（`style.css` 的 `.chip`、`.layer-switch button`、`.btn-mini`、`.supp-locate`、`.lb-*`；`3d.css` 的 `.tools button`、`.chips button`、`#viewbtns button`）→ 建议全局 `button, input { font: inherit; }`（会改变按钮字形，需目视核对）。
10. **HTML 数据硬编码**（`index.html`）：首屏统计 `4/41/872`(:51-54) 与「0 / 8 座」(:126)、四张 `event-card` 的全部事实(:81-102)、`#venue-xinxi`(:74)、页脚年份(:203) → 纳入 `data.js` 由 JS 渲染。
11. **场地布局坐标三个来源互相失真**（`js/three-app.js`）：树木排斥区裸数(:1551-1557) 与灯塔(:388、:1502)、星湖(:1542)、篮球场(:1535、:1543)、记分牌(:1160) 互相绑定；地标世界坐标写在 `buildLandmark` 内部(:1231、:1267、:1287、:1306、:1325)，与 `LANDMARK_BOX`(:38-44)、`HILLS`(:45-51) 重复表达同一位置且数值不一致（admin 岗地 23×62 vs 避让盒 26×63）→ 合并为单一 `SITE` / `LANDMARKS` 常量表。
12. **超长函数**：`buildVenue` 204 行(:1443-1646)、`makeGroundTexture` 164 行(:357-520)、`buildLandmark` 144 行(:1185-1328)、`buildStand` 115 行、`updatePlayers` 86 行 → 拆子函数；其中 `buildVenue` 开头 :1444-1455 的 7 个状态数组重置顺序是隐性契约（`disposeGroup(world)` 必须先于任何新对象创建），拆分时必须加注释。
13. **跑道与球场标线全裸数**（`js/three-app.js:423-497`：26、`24 - k*4.6`、1.2/4.5/7.5、16.5/40.32/9.15/7.32…）→ 新增与 `TRACK`(:54) 同级的 `PITCH` 常量对象。
14. **材质与纹理工厂骨架重复**（`js/three-app.js:732-749` 的 `facadeMat`/`glassMat` 仅差 roughness/metalness；`:523-569` 与 `:585-608` 两个 facade 纹理工厂的「日间 canvas + 自发光 canvas」骨架相同）→ 抽 `makeEmissivePair()` / `surfaceFromPair()`。
15. **校园主题色三处同源重复**：`three-app.js` 的 `CFG` 按 `id` 写死、`app.js:42` 的 `CAMPUS_COLOR` 按 `campusKey`、`css/style.css:14-16` 的 `--wl/--gx/--xx`（且零 `var()` 引用）；兜底色 `#94070a` 又在 `three-app.js:1457`、`1772`、`1782` 各写一遍 → 统一由 `data.js` 的 `campusKey` 派生，`CFG` 缺项时 `console.warn`（目前是静默降级，新增场地会没有岗地/地标/樱花）。
16. **单位与命名歧义**（`js/three-app.js`）：`hs` 在 `stadiumPath` 表示「像素半直道」、在 `buildCurbRing` 表示「米」；`W/H` 在 facade 纹理是画布像素、在 `buildVenue` 是场地米；`sp` 兼指 SpotLight / 速度 / `spI`；`mk` 是两个不同工厂；画布上下文有 `c` / `ctx` / `d` / `e` 四种叫法 → 建议 `hsM`/`hsPx`、`Wpx`/`Hpx`、上下文统一 `ctx`。
17. **`disposeGroup` 逐个移除子对象**（`js/three-app.js` 的 `while (g.children.length) g.remove(...)`，O(n²)；r147 已提供 `Object3D.clear()`，且其中 `o.shadow.dispose` 判断对非灯光对象恒为假）→ 改用 `clear()` 并显式回收灯光。
18. **事件回调写法不统一**（`js/three-app.js` 的日夜/旋转按钮用 `function () {}` 取 `this`，其余用箭头函数）→ 统一箭头函数 + `e.currentTarget`。
19. **数字与颜色字面量风格**（`js/three-app.js` 的 `1.0` vs `1`、`6.283` 应写 `Math.PI * 2`、`0x…` / `'#…'` / `'rgba(…)'` 三种颜色写法并存）→ 统一。
20. **DOM 查询与查找未缓存**（`js/app.js`）：同一选择器重复查询、每次筛选全量重查 `.venue-card`、反复线性 `find` → 启动时缓存 NodeList 并建 `venueById` 索引（注意卡片 flip 交替在筛选后不再连续，需一并处理）。
21. **定时器与观察者无生命周期**（`js/app.js` 的轮播定时器链与 `IntersectionObserver`）：轮播无终止条件（页面隐藏时仍每 4.2s 自唤醒）、观察者只 observe 不 unobserve 且是局部变量无法销毁 → 用 `visibilitychange` 统一暂停/恢复并暴露销毁入口。
22. **JS 里写内联样式**（`js/app.js` 的卡片/海报 HTML 串）：渐变、圆角、字号、颜色写在 HTML 字符串里，属 CSS 职责越界 → 移入 `css/style.css` 的类。
23. **占位注释不统一**（`index.html`：部分渲染容器有 `<!-- JS 渲染 -->` 标注，部分没有）→ 统一标注。
24. **`safe()` 细粒度化**（`js/three-app.js`）：目前只在 `selectVenue` 层包了 `buildVenue`，另有看台段单独包裹；球门、灯塔、树木、樱花道/花瓣等部件仍是「一处失败跳过整段」。若要按部件独立降级，可在 `buildVenue` 内对每类构件各包一层 `safe()`（成功路径行为不变，仅是失败粒度更细）。

### 6.4 P3 · 数据模型与 SEO

1. `cup.y2025` 把年份写进键名（`js/data.js:23`，6 个消费点）→ 改为 `cup.seasons[{ year, … }]` 或 `cup.byYear['2025']` + `cup.currentYear`。
2. `og:image` 与图片路径为相对路径，分享卡片需要绝对 URL（部署后处理，见 README「发布到微信公众号」）。
3. `3d.html` 已补 `og:type`；两页仍缺 `canonical` / `og:url` / `twitter:card` / `theme-color`；favicon 的 data URI 未做百分号编码。
4. `photos[].src` 实为来源网页链接且全项目无人消费 → 改名 `pageUrl` 或删除。
5. `timeline[].y` 混用 `'1930s'` / `'1936'` / `'1958.9.12'` / `'2023.11'` → 拆成机器可读 `date` + 展示用 `label`。
6. 同一概念四个名字：`supplemental` / 「其他运动场地」 / `#more` / `suppGrid` → 统一。
7. 未被任何数据引用的图片：`912-aerial-2.jpg`、`912-aerial-4.jpg`、`gongcao-4.jpg`、`songyuan-cse-2.jpg`、`zxb-award.jpg`、`zxb-men-a.jpg`、`zxb-venue2.jpg` → 补进 `data.js` 或移出发布目录；`_verify/tiles` 属调试产物，可删。

## 7. 提交前自查

- [ ] 双击 `index.html` 与 `3d.html` 均能打开，控制台无报错（`file://` 下）。
- [ ] `npm run lint` 无 error、`npm run format:check` 通过。
- [ ] 手机宽度（≤ 420px）下布局不错位；3D 页移动端能正常进入低画质档。
- [ ] 新增照片已补 `credit` / `source`，且图片经过压缩（单张建议 < 500 KB）。

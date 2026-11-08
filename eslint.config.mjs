/* ============================================================
 * 振兴杯球场巡礼 · ESLint 扁平配置（ESLint 9）
 * 规范全文见 CONTRIBUTING.md。要点：
 * - 全部脚本都是传统脚本（非 ES Module），语法基线 ES2017，
 *   以保证 file:// 双击打开与微信内置浏览器可用，不使用 ?. / ?? / BigInt
 * - 新代码一律 const / let，不使用 var
 * - js/vendor、css/vendor 是第三方库，不参与检查
 * ============================================================ */
import js from '@eslint/js';
import globals from 'globals';

/* 由 vendor 库以全局变量形式提供的对象 */
const libraryGlobals = {
  L: 'readonly', // Leaflet（js/vendor/leaflet.js）
  THREE: 'readonly' // three.js r147（js/vendor/three.min.js）
};

export default [
  {
    ignores: ['js/vendor/**', 'css/vendor/**', 'data/**', '_verify/**', '_baseline/**']
  },

  js.configs.recommended,

  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2017,
      sourceType: 'script',
      globals: { ...globals.browser, ...libraryGlobals }
    },
    rules: {
      /* 语言基线 */
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'no-implicit-globals': 'error',
      'no-eq-null': 'error',
      'no-undef-init': 'error',
      'no-shadow-restricted-names': 'error',

      /* 可读性。curly 必须是 all：Prettier 会把超过行宽的单行 if/for 折成两行，
         用 multi-line 模式的话，格式化之后反而会新增一批 curly 报错（实测踩到过）。 */
      curly: ['error', 'all'],
      'no-else-return': 'warn',
      'dot-notation': 'warn',
      'object-shorthand': ['warn', 'properties'],
      'no-lonely-if': 'warn',

      /* 明显问题。caughtErrors: 'none' —— 本项目允许「带注释的空 catch」作为既定降级写法
         （见 CONTRIBUTING「JavaScript」一节），因此不把未使用的 catch 形参算作问题。 */
      'no-unused-vars': ['warn', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-fallthrough': 'error',
      'no-prototype-builtins': 'warn'
    }
  },

  {
    /* 存量文件：仍是 ES5 写法（var），迁移为 const/let 属 backlog（见 CONTRIBUTING 第 6 节）。
       这里**刻意不用 no-var**：它是「可自动修复」规则，而其修复器只避让块作用域变化，
       不避让「先使用后声明」——实测 `x = 1; var x;` 会被改写成 `let x` 并在运行时报
       ReferenceError（TDZ）；`typeof y; var y;` 同理。改用不可自动修复的
       no-restricted-syntax 记录待办，这样 `npm run lint:fix` 不会悄悄改变 app.js 的语义。
       object-shorthand / dot-notation 的自动修复会引入 ES2015 简写，故同样关闭。 */
    files: ['js/app.js'],
    rules: {
      'no-var': 'off',
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'VariableDeclaration[kind="var"]',
          message:
            '存量 ES5 写法：迁移为 const/let 属待办（CONTRIBUTING 第 6 节），需先核对 TDZ 与循环变量被闭包捕获的情况，再手动迁移。'
        }
      ],
      'prefer-const': 'off',
      'object-shorthand': 'off',
      'dot-notation': 'off'
    }
  }
];

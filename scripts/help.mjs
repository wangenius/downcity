/**
 * 仓库级 npm scripts 帮助输出。
 *
 * 关键点（中文）
 * - `package.json` 的 scripts 本身没有原生 description 字段，因此用单独脚本集中输出说明。
 * - 这里只展示根仓库最常用、最需要解释的命令，避免把帮助信息做成噪音。
 * - 输出内容面向当前仓库协作者，不面向 npm 通用生态。
 */

/**
 * 单条脚本说明。
 *
 * @typedef {object} ScriptHelpItem
 * @property {string} name 脚本名称，即 `npm run <name>` 中的 `<name>`。
 * @property {string} summary 一句话说明脚本用途。
 * @property {string} detail 更具体的执行范围、构建顺序或副作用说明。
 */

/** @type {ScriptHelpItem[]} */
const HELP_ITEMS = [
  {
    name: "help",
    summary: "显示根仓库常用 npm scripts 说明。",
    detail: "用于快速查看各脚本职责，避免反复翻 package.json。",
  },
  {
    name: "build",
    summary: "完整构建整个仓库。",
    detail:
      "等价于 `build:all`，会构建 downcity-ui、homepage、console、packages/downcity，并刷新全局 CLI。",
  },
  {
    name: "build:all",
    summary: "执行完整仓库构建链路。",
    detail:
      "会自动对 packages/downcity 做 patch 版本自增，随后完成全量构建并执行全局安装。",
  },
  {
    name: "build:downcity",
    summary: "只构建 downcity 交付链路。",
    detail:
      "先构建 console 并输出到 packages/downcity/public，再构建 packages/downcity。",
  },
  {
    name: "build:homepage",
    summary: "只构建 homepage。",
    detail: "适合单独验证官网改动，不会触发 downcity CLI 构建。",
  },
  {
    name: "build:extension",
    summary: "构建 chrome-extension。",
    detail: "走独立扩展构建脚本，不参与 downcity CLI 交付链路。",
  },
  {
    name: "install:ws",
    summary: "安装整个 workspace 依赖。",
    detail: "等价于在仓库根目录执行 `pnpm install`。",
  },
  {
    name: "dev:ui-sdk",
    summary: "启动 packages/downcity-ui 的开发模式。",
    detail: "用于单独开发 UI SDK，不会自动启动 homepage 或 console。",
  },
  {
    name: "dev:homepage",
    summary: "启动 homepage 开发模式。",
    detail: "等价于 `homepage`，都会执行 `pnpm -C homepage dev`。",
  },
  {
    name: "homepage",
    summary: "启动 homepage 开发模式。",
    detail: "保留一个更短的命令入口，便于日常使用。",
  },
  {
    name: "console",
    summary: "启动 console 开发模式。",
    detail: "执行 console 的 Vite dev server，用于调试控制台前端。",
  },
  {
    name: "publish",
    summary: "执行 downcity 发布脚本。",
    detail: "用于仓库级发布流程，不建议在日常开发中随手执行。",
  },
  {
    name: "publish:ui",
    summary: "执行 UI 发布脚本。",
    detail: "用于 UI 相关发布流程，与 downcity 主 CLI 发布分离。",
  },
];

const nameWidth = Math.max(...HELP_ITEMS.map((item) => item.name.length));

console.log("Downcity root scripts\n");

for (const item of HELP_ITEMS) {
  const paddedName = item.name.padEnd(nameWidth, " ");
  console.log(`- ${paddedName}  ${item.summary}`);
  console.log(`  ${item.detail}`);
}

/**
 * Homepage 的 Vite 配置。
 *
 * 关键说明（中文）
 * - homepage 运行在 monorepo 内部，需要直接消费 workspace 包源码。
 * - Vercel 在构建 homepage 时不会自动先构建 `packages/ui/dist`。
 * - 因此这里显式把 `@downcity/ui` 解析到源码入口，避免依赖未生成的 dist 产物。
 */
import { reactRouter } from "@react-router/dev/vite";
import mdx from "fumadocs-mdx/vite";
import * as MdxConfig from "./source.config";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  base: "/",
  plugins: [tailwindcss(), mdx(MdxConfig), reactRouter()],
  optimizeDeps: {
    // pnpm 严格隔离下，fumadocs-ui 的 transitive @radix-ui 包不会提升到 homepage/node_modules。
    // 排除这些包，让 Vite 按正常模块解析从 fumadocs-ui 的 node_modules 加载，避免预构建阶段 ENOENT。
    exclude: [
      "@radix-ui/react-accordion",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-direction",
      "@radix-ui/react-dialog",
      "@radix-ui/react-navigation-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-presence",
      "@radix-ui/react-avatar",
      "@radix-ui/react-arrow",
      "@radix-ui/react-collection",
      "@radix-ui/react-compose-refs",
      "@radix-ui/react-context",
      "@radix-ui/react-dismissable-layer",
      "@radix-ui/react-focus-guards",
      "@radix-ui/react-focus-scope",
      "@radix-ui/react-id",
      "@radix-ui/react-popper",
      "@radix-ui/react-portal",
      "@radix-ui/react-primitive",
      "@radix-ui/react-roving-focus",
      "@radix-ui/react-slot",
      "@radix-ui/react-use-callback-ref",
      "@radix-ui/react-use-controllable-state",
      "@radix-ui/react-use-escape-keydown",
      "@radix-ui/react-use-layout-effect",
      "@radix-ui/react-use-previous",
      "@radix-ui/react-use-rect",
      "@radix-ui/react-use-size",
      "@radix-ui/react-visually-hidden",
      "@radix-ui/number",
      "@radix-ui/primitive",
    ],
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom"],
    alias: [
      {
        find: /^@\//,
        replacement: path.resolve(__dirname, "./app/") + "/",
      },
      {
        find: /^~\//,
        replacement: path.resolve(__dirname, "./app/") + "/",
      },
      {
        find: "@/.source",
        replacement: path.resolve(__dirname, "./.source/server"),
      },
      {
        find: "@downcity/ui/source.css",
        replacement: path.resolve(
          __dirname,
          "../packages/ui/src/source.css",
        ),
      },
      {
        find: "@downcity/ui/styles.css",
        replacement: path.resolve(
          __dirname,
          "../packages/ui/src/styles.css",
        ),
      },
      {
        find: /^@downcity\/ui$/,
        replacement: path.resolve(
          __dirname,
          "../packages/ui/src/index.ts",
        ),
      },
    ],
  },
});

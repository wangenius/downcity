/**
 * Chrome Extension 构建配置。
 *
 * 关键点（中文）：
 * - 使用 Vite + React 构建扩展弹窗与 options 两个页面。
 * - Manifest 与静态资源放在 public/，构建时自动复制到 dist/。
 */
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
        input: {
          popup: path.resolve(__dirname, "index.html"),
          options: path.resolve(__dirname, "options.html"),
          background: path.resolve(__dirname, "src/background/main.ts"),
          contentScript: path.resolve(__dirname, "src/inline-composer/main.ts"),
          contentScriptStyle: path.resolve(
            __dirname,
            "src/inline-composer/content-script.css",
          ),
        },
      output: {
        entryFileNames(chunkInfo) {
          if (chunkInfo.name === "contentScript") {
            return "content-script.js";
          }
          if (chunkInfo.name === "background") {
            return "background.js";
          }
          return "assets/[name]-[hash].js";
        },
        assetFileNames(assetInfo) {
          const names = Array.isArray(assetInfo.names)
            ? assetInfo.names
            : assetInfo.name
              ? [assetInfo.name]
              : [];
          if (
            names.some((name) =>
              /content-script\.css$|contentScriptStyle\.css$/u.test(String(name)),
            )
          ) {
            return "content-script.css";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});

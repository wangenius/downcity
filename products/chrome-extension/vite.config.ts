/**
 * Chrome Extension 构建配置。
 *
 * 关键点（中文）：
 * - 使用 Vite + React 构建扩展弹窗、options、side panel 与 background。
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
        sidepanel: path.resolve(__dirname, "sidepanel.html"),
        background: path.resolve(__dirname, "src/background.ts"),
        "page-selection": path.resolve(__dirname, "src/page-selection.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === "background"
            ? "assets/background.js"
            : chunkInfo.name === "page-selection"
              ? "assets/page-selection.js"
            : "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});

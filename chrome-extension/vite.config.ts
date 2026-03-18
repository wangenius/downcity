/**
 * Chrome Extension 构建配置。
 *
 * 关键点（中文）：
 * - 使用 Vite + React 构建 popup 与 options 两个页面。
 * - Manifest 与静态资源放在 public/，构建时自动复制到 dist/。
 */
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, "index.html"),
        options: path.resolve(__dirname, "options.html"),
      },
    },
  },
});

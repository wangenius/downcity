/**
 * Chrome Extension 构建配置。
 *
 * 关键点（中文）：
 * - 使用 Vite + React 构建 popup 页面。
 * - Manifest 与静态资源放在 public/，构建时自动复制到 dist/。
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

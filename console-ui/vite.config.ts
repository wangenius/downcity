/**
 * Console UI（React）构建配置。
 *
 * 关键点（中文）
 * - 直接输出到 `package/public`，作为 `sma console ui` 的静态资源目录。
 * - 固定入口文件名，兼容现有网关默认加载路径。
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET =
  String(process.env.CONSOLE_UI_API_TARGET || "").trim() ||
  "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 关键点（中文）：开发模式下把 API 请求代理到 `sma console ui` 网关。
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/health": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../package/public",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: "app.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const name = String(assetInfo.name || "");
          if (name.endsWith(".css")) return "styles.css";
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});

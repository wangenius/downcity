/**
 * Console UI（React）构建配置。
 *
 * 关键点（中文）
 * - 直接输出到 `packages/downcity/public`，作为 `city console ui` 的静态资源目录。
 * - 开发模式下代理 API 到 console 网关。
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const API_TARGET =
  String(process.env.CONSOLE_UI_API_TARGET || "").trim() ||
  "http://127.0.0.1:5315";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
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
    outDir: "../packages/downcity/public",
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

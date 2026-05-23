import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  // 站点默认启用 SSR，保证营销页与文档页都可以走服务端渲染。
  ssr: true,
  // 接入 Vercel 官方 preset，让平台正确识别 React Router 的路由结构与函数边界。
  presets: [vercelPreset()],
  // 仅预渲染稳定入口；其他页面在生产环境交给 SSR 动态处理。
  async prerender() {
    return ["/", "/docs"];
  },
} satisfies Config;

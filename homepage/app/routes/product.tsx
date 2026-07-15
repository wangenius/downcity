import { Outlet } from "react-router";
import { Footer } from "@/components/sections/Footer";
import { product } from "@/lib/product";
import { create_page_meta, get_path_locale } from "@/lib/seo";
import type { Route } from "./+types/product";

/**
 * Product 路由容器。
 * 说明：
 * 1. 统一承载 product 子页面（overview/sdk/agent-sdk/ui-sdk）。
 * 2. 与 resources/community 保持一致，页面底部复用全站 Footer。
 */
export function meta({ location }: Route.MetaArgs) {
  const is_chinese = get_path_locale(location.pathname) === "zh";
  const title = `${product.productName} — ${is_chinese ? "产品" : "Product"}`;
  const description = is_chinese
    ? "了解 Downcity Agent 基础设施产品矩阵：Downcity CLI、City SDK、Agent SDK 和 Downcity UI SDK。"
    : "Product matrix for Downcity agent infrastructure: Downcity CLI, City SDK, Agent SDK, and Downcity UI SDK.";

  return create_page_meta({
    title,
    description,
    pathname: location.pathname,
    twitter_card: "summary_large_image",
    localized: true,
  });
}

export default function ProductLayout() {
  return (
    <div className="min-h-screen">
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

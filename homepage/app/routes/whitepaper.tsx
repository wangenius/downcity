import { Footer } from "@/components/sections/Footer";
import { WhitepaperSection } from "@/components/sections/WhitepaperSection";
import { product } from "@/lib/product";
import { create_page_meta, get_path_locale } from "@/lib/seo";
import type { Route } from "./+types/whitepaper";

/**
 * 白皮书独立页面路由。
 * 说明：
 * 1. 承载完整白皮书正文，避免与首页营销信息混杂。
 * 2. 保持与全站一致的 SEO 元信息与页面结构。
 */
export function meta({ location }: Route.MetaArgs) {
  const is_chinese = get_path_locale(location.pathname) === "zh";
  const title = `${product.productName} — ${is_chinese ? "白皮书" : "Whitepaper"}`;
  const description = is_chinese
    ? "阅读 Downcity 关于生产级 Agent、治理边界与人机协作的白皮书。"
    : "Read the Downcity whitepaper on production agents, governance boundaries, and human-agent collaboration.";

  return create_page_meta({
    title,
    description,
    pathname: location.pathname,
    open_graph_type: "article",
    twitter_card: "summary_large_image",
    localized: true,
  });
}

export default function WhitepaperPage() {
  return (
    <div className="min-h-screen">
      <main>
        <WhitepaperSection />
      </main>
      <Footer />
    </div>
  );
}

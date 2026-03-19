import { Footer } from "@/components/sections/Footer";
import { WhitepaperSection } from "@/components/sections/WhitepaperSection";
import { product } from "@/lib/product";

/**
 * 白皮书独立页面路由。
 * 说明：
 * 1. 承载完整白皮书正文，避免与首页营销信息混杂。
 * 2. 保持与全站一致的 SEO 元信息与页面结构。
 */
export function meta() {
  const baseUrl = product.homepage || "https://downcity.ai";
  const title = `${product.productName} — Whitepaper`;
  const description =
    "Read the Downcity whitepaper on production agents, governance boundaries, and human-agent collaboration.";

  return [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },
    { property: "og:url", content: `${baseUrl}/whitepaper` },
    { name: "twitter:card", content: "summary_large_image" },
    { tagName: "link", rel: "canonical", href: `${baseUrl}/whitepaper` },
  ];
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

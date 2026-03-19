import { Outlet } from "react-router";
import { Footer } from "@/components/sections/Footer";
import { product } from "@/lib/product";

/**
 * Product 路由容器。
 * 说明：
 * 1. 统一承载 product 子页面（overview/console-ui/chrome-extension/sdk/ui-sdk）。
 * 2. 与 resources/community 保持一致，页面底部复用全站 Footer。
 */
export function meta() {
  const baseUrl = product.homepage || "https://downcity.ai";
  const title = `${product.productName} — Product`;
  const description = "Product matrix: Console UI, Chrome Extension, Downcity SDK, and Downcity UI SDK.";

  return [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: `${baseUrl}/product` },
    { name: "twitter:card", content: "summary_large_image" },
    { tagName: "link", rel: "canonical", href: `${baseUrl}/product` },
  ];
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

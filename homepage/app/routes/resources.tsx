import { Outlet } from "react-router";
import { Footer } from "@/components/sections/Footer";
import { product } from "@/lib/product";
import { create_page_meta, get_path_locale } from "@/lib/seo";
import type { Route } from "./+types/resources";

export function meta({ location }: Route.MetaArgs) {
  const is_chinese = get_path_locale(location.pathname) === "zh";
  const title = `${product.productName} — ${is_chinese ? "资源" : "Resources"}`;
  const description = is_chinese
    ? "查找 Downcity Skills、Agent Marketplace 和托管资源。"
    : "Skills, marketplace, and hosting resources for Downcity";

  return create_page_meta({
    title,
    description,
    pathname: location.pathname,
    twitter_card: "summary_large_image",
    localized: true,
  });
}

export default function Resources() {
  return (
    <div className="min-h-screen">
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

import { Outlet } from "react-router";
import { Footer } from "@/components/sections/Footer";
import { product } from "@/lib/product";
import { create_page_meta, get_path_locale } from "@/lib/seo";
import type { Route } from "./+types/community";

export function meta({ location }: Route.MetaArgs) {
  const is_chinese = get_path_locale(location.pathname) === "zh";
  const title = `${product.productName} — ${is_chinese ? "社区" : "Community"}`;
  const description = is_chinese
    ? "加入 Downcity 社区，与开发者交流并参与项目贡献。"
    : "Join the Downcity community, connect with developers, and contribute.";

  return create_page_meta({
    title,
    description,
    pathname: location.pathname,
    twitter_card: "summary_large_image",
    localized: true,
  });
}

export default function Community() {
  return (
    <div className="min-h-screen">
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

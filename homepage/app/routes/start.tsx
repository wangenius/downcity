import { StartGuideSection } from "@/components/sections/StartGuideSection";
import { Footer } from "@/components/sections/Footer";
import { product } from "@/lib/product";
import { create_page_meta, get_path_locale } from "@/lib/seo";
import type { Route } from "./+types/start";

export function meta({ location }: Route.MetaArgs) {
  const is_chinese = get_path_locale(location.pathname) === "zh";
  const title = `${product.productName} — ${is_chinese ? "快速开始" : "Quick Start"}`;
  const description = is_chinese
    ? "通过清晰的步骤和可直接运行的命令开始使用 Downcity。"
    : "Start Downcity quickly with an article-style walkthrough and runnable commands.";

  return create_page_meta({
    title,
    description,
    pathname: location.pathname,
    twitter_card: "summary_large_image",
    localized: true,
  });
}

export default function Start() {
  return (
    <div className="min-h-screen">
      <main>
        <StartGuideSection />
      </main>
      <Footer />
    </div>
  );
}

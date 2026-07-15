
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { CodePreviewSection } from "@/components/sections/CodePreviewSection";
import { CTASection } from "@/components/sections/CTASection";
import { Footer } from "@/components/sections/Footer";
import { product } from "@/lib/product";
import { create_page_meta, get_path_locale } from "@/lib/seo";
import type { Route } from "./+types/features";

export function meta({ location }: Route.MetaArgs) {
  const is_chinese = get_path_locale(location.pathname) === "zh";
  const title = `${product.productName} — ${is_chinese ? "功能" : "Features"}`;
  const description = is_chinese
    ? "了解 Downcity 为 Agent 产品提供的运行时、工具、任务、记忆、权限和多端部署能力。"
    : "Explore all features of Downcity";

  return create_page_meta({
    title,
    description,
    pathname: location.pathname,
    twitter_card: "summary_large_image",
    localized: true,
  });
}

export default function Features() {
  return (
    <div className="min-h-screen">
      <main>
        <FeaturesSection />
        <CodePreviewSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}

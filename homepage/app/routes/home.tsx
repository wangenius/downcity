import { HomeHeroSection } from "@/components/sections/HomeHeroSection";
import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { CTASection } from "@/components/sections/CTASection";
import { Footer } from "@/components/sections/Footer";
import { Navbar } from "@/components/sections/navbar";
import { product } from "@/lib/product";

/**
 * 首页营销落地页路由。
 * 说明：
 * 1. 采用 Vibecape 式“产品演示为核心”的首页结构：Navbar + Hero Demo + Features + CTA + Footer。
 * 2. Hero Demo 直接展示 Downcity 的真实使用路径（CLI / SDK / Console），避免抽象文案。
 * 3. 文案与元信息对齐当前 City / Downcity 命名与 quickstart 文档。
 */
export function meta() {
  const baseUrl = product.homepage || "https://downcity.ai";
  const title = `${product.productName} — Agent Infrastructure for AI Builders`;
  const description = product.description;
  const socialImage = `${baseUrl}/social-icon.png`;

  return [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { title },
    {
      name: "description",
      content: description,
    },
    {
      name: "keywords",
      content:
        "AI agents, agent collaboration, agent management, multi-agent workflow, task automation, chat-driven execution, Downcity",
    },
    {
      property: "og:title",
      content: title,
    },
    {
      property: "og:description",
      content: description,
    },
    {
      property: "og:type",
      content: "website",
    },
    {
      property: "og:url",
      content: baseUrl,
    },
    {
      property: "og:image",
      content: socialImage,
    },
    {
      property: "og:image:type",
      content: "image/png",
    },
    {
      property: "og:image:width",
      content: "512",
    },
    {
      property: "og:image:height",
      content: "512",
    },
    {
      property: "og:image:alt",
      content: "Downcity - Agent Infrastructure for AI Builders",
    },
    {
      name: "twitter:card",
      content: "summary",
    },
    {
      name: "twitter:url",
      content: baseUrl,
    },
    {
      name: "twitter:title",
      content: title,
    },
    {
      name: "twitter:description",
      content: description,
    },
    {
      name: "twitter:image",
      content: socialImage,
    },
    {
      name: "twitter:image:width",
      content: "512",
    },
    {
      name: "twitter:image:height",
      content: "512",
    },
    {
      name: "twitter:image:alt",
      content: "Downcity - Agent Infrastructure for AI Builders",
    },
    {
      tagName: "link",
      rel: "canonical",
      href: baseUrl,
    },
  ];
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-1">
        <HomeHeroSection />
        <FeaturesSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}

import { HomeRebuildSection } from "@/components/sections/HomeRebuildSection";
import { product } from "@/lib/product";

/**
 * 首页营销落地页路由。
 * 说明：
 * 1. 首页文案直接对齐当前 City / Downcity 命名与 quickstart 文档，避免能力描述失真。
 * 2. 采用“用户目标 -> runtime 逻辑”映射方式呈现，不堆砌开发细节。
 */
export function meta() {
  const baseUrl = product.homepage || "https://downcity.ai";
  const title = `${product.productName} — Agent Infrastructure for AI Builders`;
  const description = product.description;

  const social_image = `${baseUrl}/social-icon.png`;

  return [
    // Essential meta tags (required, not inherited from parent)
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
      content: social_image,
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
    // X / Twitter
    // social-icon.png 为不透明高对比图片，避免 X 把透明 logo 放到深色背景后不可见。
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
      content: social_image,
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
    <div className="min-h-full">
      <main>
        <HomeRebuildSection />
      </main>
    </div>
  );
}

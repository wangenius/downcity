import { HomeRebuildSection } from "@/components/sections/HomeRebuildSection";
import { product } from "@/lib/product";

/**
 * 首页营销落地页路由。
 * 说明：
 * 1. 首页文案直接对齐 package 与 quickstart 文档，避免能力描述失真。
 * 2. 采用“用户目标 -> package 逻辑”映射方式呈现，不堆砌开发细节。
 */
export function meta() {
  const baseUrl = product.homepage || "https://downcity.ai";
  const title = `${product.productName} — The Operating City for AI Agents`;
  const description = product.description;

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
      content: `${baseUrl}/og-image.png`,
    },
    {
      property: "og:image:alt",
      content: "Downcity - The Operating City for AI Agents",
    },
    {
      name: "twitter:card",
      content: "summary_large_image",
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
      content: `${baseUrl}/twitter-image.png`,
    },
    {
      name: "twitter:image:alt",
      content: "Downcity - The Operating City for AI Agents",
    },
    {
      tagName: "link",
      rel: "canonical",
      href: baseUrl,
    },
  ];
}

export default function Home() {
  return <HomeRebuildSection />;
}

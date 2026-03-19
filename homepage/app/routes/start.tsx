import { StartGuideSection } from "@/components/sections/StartGuideSection";
import { product } from "@/lib/product";

export function meta() {
  const baseUrl = product.homepage || "https://downcity.ai";
  const title = `${product.productName} — Quick Start`;
  const description =
    "Start Downcity quickly with an article-style walkthrough and runnable commands.";

  return [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: `${baseUrl}/start` },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

export default function Start() {
  return (
    <div className="min-h-screen">
      <main>
        <StartGuideSection />
      </main>
    </div>
  );
}


import { FeaturesSection } from "@/components/sections/FeaturesSection";
import { CodePreviewSection } from "@/components/sections/CodePreviewSection";
import { CTASection } from "@/components/sections/CTASection";
import { Footer } from "@/components/sections/Footer";
import { product } from "@/lib/product";

export function meta() {
  const baseUrl = product.homepage || "https://downcity.ai";
  const title = `${product.productName} — Features`;
  const description = "Explore all features of Downcity";

  return [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { title },
    {
      name: "description",
      content: description,
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
      content: `${baseUrl}/features`,
    },
    {
      name: "twitter:card",
      content: "summary_large_image",
    },
    {
      tagName: "link",
      rel: "canonical",
      href: `${baseUrl}/features`,
    },
  ];
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

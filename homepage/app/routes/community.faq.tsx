import { useState } from "react";
import { useTranslation } from "react-i18next";
import { COMMUNITY_LINKS } from "@/lib/community-links";
import { product } from "@/lib/product";
import { marketingTheme } from "@/lib/marketing-theme";
import {
  MarketingPanel,
  marketingFilterButtonClass,
} from "@/components/shared/marketing-elements";

export function meta() {
  const title = `${product.productName} — FAQ`;
  const description = "Frequently asked questions about Downcity";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
}

const faqs = [
  { id: "modify-code", category: "security" },
  { id: "llm-models", category: "technical" },
  { id: "remote-deployment", category: "deployment" },
  { id: "comparison-copilot", category: "general" },
  { id: "memory", category: "features" },
  { id: "multi-agent", category: "features" },
  { id: "custom-services", category: "service" },
  { id: "pricing", category: "general" },
] as const;

const categories = [...new Set(faqs.map((faq) => faq.category))];

export default function FAQ() {
  const { i18n, t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const docsPath = i18n.language.toLowerCase().startsWith("zh") ? "/zh/docs" : "/en/docs";
  const discussionsUrl = COMMUNITY_LINKS.telegram;

  const filteredFAQs = selectedCategory
    ? faqs.filter((faq) => faq.category === selectedCategory)
    : faqs;

  return (
    <div className={marketingTheme.pageNarrow}>
      <header className="space-y-3">
        <span className={marketingTheme.badge}>
          FAQ
        </span>
        <h1 className={marketingTheme.pageTitle}>{t("nav.faq")}</h1>
        <p className={marketingTheme.lead}>
          {t("community:faqPage.subtitle")}
        </p>
      </header>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={marketingFilterButtonClass({ active: selectedCategory === null })}
        >
          {t("community:faqPage.all")}
        </button>
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={marketingFilterButtonClass({ active: selectedCategory === category })}
          >
            {t(`community:faqPage.categories.${category}`)}
          </button>
        ))}
      </div>

      <section className="mt-6 space-y-3">
        {filteredFAQs.map((faq, index) => (
          <MarketingPanel key={faq.id} className="overflow-hidden">
            <button
              onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-[0.66rem] uppercase tracking-[0.1em] text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-medium md:text-base">
                  {t(`community:faqPage.items.${faq.id}.question`)}
                </span>
              </span>
              <span className="font-mono text-sm text-muted-foreground">{openId === faq.id ? "close" : "open"}</span>
            </button>
            {openId === faq.id ? (
              <div className="border-t border-border/75 px-5 pb-4 pt-3 text-sm leading-7 text-muted-foreground">
                {t(`community:faqPage.items.${faq.id}.answer`)}
              </div>
            ) : null}
          </MarketingPanel>
        ))}
      </section>

      <MarketingPanel className="mt-8 p-6">
        <h3 className="text-lg font-semibold">{t("community:faqPage.callout.title")}</h3>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          {t("community:faqPage.callout.description")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href={discussionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={marketingTheme.primaryButton}
          >
            {t("community:faqPage.callout.askGithub")}
          </a>
          <a
            href={docsPath}
            className={marketingTheme.secondaryButton}
          >
            {t("community:faqPage.callout.readDocs")}
          </a>
        </div>
      </MarketingPanel>
    </div>
  );
}

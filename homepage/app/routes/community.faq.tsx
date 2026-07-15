import { useState } from "react";
import { useTranslation } from "react-i18next";
import { COMMUNITY_LINKS } from "@/lib/community-links";
import { product } from "@/lib/product";
import { cn } from "@/lib/utils";
import { create_page_meta, get_path_locale } from "@/lib/seo";
import type { Route } from "./+types/community.faq";

export function meta({ location }: Route.MetaArgs) {
  const is_chinese = get_path_locale(location.pathname) === "zh";
  const title = `${product.productName} — ${is_chinese ? "常见问题" : "FAQ"}`;
  const description = is_chinese
    ? "查看关于 Downcity 的常见问题与解答。"
    : "Frequently asked questions about Downcity";
  return create_page_meta({
    title,
    description,
    pathname: location.pathname,
    localized: true,
  });
}

const faqs = [
  { id: "modify-code", category: "security" },
  { id: "llm-models", category: "technical" },
  { id: "remote-deployment", category: "deployment" },
  { id: "comparison-copilot", category: "general" },
  { id: "memory", category: "features" },
  { id: "multi-agent", category: "features" },
  { id: "custom-services", category: "features" },
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
    <div className="mx-auto max-w-[1320px] px-5 py-16 md:px-8 md:py-24 lg:px-20">
      <header className="space-y-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-text-soft">
          FAQ
        </span>
        <h1 className="font-serif text-[clamp(1.875rem,4vw,2.25rem)] font-bold leading-[1.12] tracking-[-0.02em] text-foreground">
          {t("nav.faq")}
        </h1>
        <p className="max-w-2xl text-base leading-[1.65] text-text-soft">{t("community:faqPage.subtitle")}</p>
      </header>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={cn(
            "inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors",
            selectedCategory === null
              ? "border-line-strong bg-surface-soft text-foreground"
              : "border-line bg-surface text-text-soft hover:bg-surface-soft hover:text-foreground",
          )}
        >
          {t("community:faqPage.all")}
        </button>
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors",
              selectedCategory === category
                ? "border-line-strong bg-surface-soft text-foreground"
                : "border-line bg-surface text-text-soft hover:bg-surface-soft hover:text-foreground",
            )}
          >
            {t(`community:faqPage.categories.${category}`)}
          </button>
        ))}
      </div>

      <section className="mt-6 space-y-3">
        {filteredFAQs.map((faq, index) => (
          <article
            key={faq.id}
            className="overflow-hidden rounded-[14px] border border-line bg-card shadow-sm"
          >
            <button
              onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span className="flex items-center gap-3">
                <span className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.06em] text-text-subtle">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold text-foreground md:text-base">
                  {t(`community:faqPage.items.${faq.id}.question`)}
                </span>
              </span>
              <span className="font-mono text-xs text-text-subtle">
                {openId === faq.id ? "close" : "open"}
              </span>
            </button>
            {openId === faq.id ? (
              <div className="border-t border-line px-5 pb-4 pt-3 text-sm leading-7 text-text-soft">
                {t(`community:faqPage.items.${faq.id}.answer`)}
              </div>
            ) : null}
          </article>
        ))}
      </section>

      <section className="mt-8 rounded-[14px] border border-line bg-card p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground">{t("community:faqPage.callout.title")}</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-soft">
          {t("community:faqPage.callout.description")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href={discussionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-76"
          >
            {t("community:faqPage.callout.askGithub")}
          </a>
          <a
            href={docsPath}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-foreground/[0.05] px-5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.08]"
          >
            {t("community:faqPage.callout.readDocs")}
          </a>
        </div>
      </section>
    </div>
  );
}

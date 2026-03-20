import { useTranslation } from "react-i18next";
import { COMMUNITY_LINKS } from "@/lib/community-links";
import { product } from "@/lib/product";
import { marketingTheme } from "@/lib/marketing-theme";

export function meta() {
  const title = `${product.productName} — Agent Marketplace`;
  const description = "Discover and share community-built agents";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
}

const comingSoonAgents = [
  { id: "codeReviewer", categoryKey: "development" },
  { id: "docsGenerator", categoryKey: "documentation" },
  { id: "depManager", categoryKey: "maintenance" },
  { id: "testRunner", categoryKey: "testing" },
] as const;

const marketplaceFeatures = [
  { id: "discover" },
  { id: "share" },
  { id: "install" },
  { id: "ratings" },
] as const;

export default function Marketplace() {
  const { t } = useTranslation();
  const repoUrl =
    product.homepage?.includes("github.com") === true
      ? product.homepage
      : "https://github.com/wangenius/downcity";
  const discussionsUrl = COMMUNITY_LINKS.telegram;

  return (
    <div className={marketingTheme.pageNarrow}>
      <header className="space-y-3">
        <span className={marketingTheme.badge}>
          {t("resources:marketplacePage.badge")}
        </span>
        <h1 className={marketingTheme.pageTitle}>{t("nav.agentMarketplace")}</h1>
        <p className={marketingTheme.lead}>
          {t("resources:marketplacePage.subtitle")}
        </p>
      </header>

      <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {marketplaceFeatures.map((feature, index) => (
          <article
            key={feature.id}
            className={`${marketingTheme.panel} p-5`}
          >
            <p className={marketingTheme.eyebrow}>
              {String(index + 1).padStart(2, "0")}
            </p>
            <h2 className="mt-3 font-serif text-[1.28rem] font-semibold tracking-[-0.03em] text-foreground">
              {t(`resources:marketplacePage.features.${feature.id}.title`)}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {t(`resources:marketplacePage.features.${feature.id}.description`)}
            </p>
          </article>
        ))}
      </section>

      <section className={`${marketingTheme.panel} mt-8 p-6`}>
        <h2 className={marketingTheme.sectionTitle}>{t("resources:marketplacePage.previewTitle")}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {comingSoonAgents.map((agent) => (
            <article key={agent.id} className={`${marketingTheme.panelSoft} p-4`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">
                  {t(`resources:marketplacePage.agents.${agent.id}.name`)}
                </h3>
                <span className={marketingTheme.badge}>
                  {t("resources:marketplacePage.soon")}
                </span>
              </div>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {t(`resources:marketplacePage.agents.${agent.id}.description`)}
              </p>
              <p className="mt-2 text-[0.75rem] text-muted-foreground">
                {t(`resources:marketplacePage.categories.${agent.categoryKey}`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${marketingTheme.panel} mt-8 p-6`}>
        <h2 className={marketingTheme.sectionTitle}>{t("resources:marketplacePage.howItWorksTitle")}</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          {(["browse", "install", "customize"] as const).map((step, index) => (
            <li key={step} className={`${marketingTheme.panelSoft} p-4`}>
              <p className={marketingTheme.eyebrow}>
                Step {index + 1}
              </p>
              <p className="mt-2 text-sm font-semibold">
                {t(`resources:marketplacePage.howItWorks.${step}.title`)}
              </p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {t(`resources:marketplacePage.howItWorks.${step}.description`)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${marketingTheme.panel} mt-8 p-6`}>
        <h3 className="text-lg font-semibold">{t("resources:marketplacePage.cta.title")}</h3>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          {t("resources:marketplacePage.cta.description")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={marketingTheme.primaryButton}
          >
            {t("resources:marketplacePage.cta.star")}
          </a>
          <a
            href={discussionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={marketingTheme.secondaryButton}
          >
            {t("resources:marketplacePage.cta.joinDiscussions")}
          </a>
        </div>
      </section>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { COMMUNITY_LINKS } from "@/lib/community-links";
import { product } from "@/lib/product";
import { marketingTheme } from "@/lib/marketing-theme";

export function meta() {
  const title = `${product.productName} — Hosting`;
  const description = "Managed hosting for Downcity agents";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
}

const hostingFeatures = [
  { id: "deploy" },
  { id: "updates" },
  { id: "observability" },
  { id: "security" },
] as const;

export default function Hosting() {
  const { t } = useTranslation();
  const discussionsUrl = COMMUNITY_LINKS.telegram;

  return (
    <div className={marketingTheme.pageNarrow}>
      <header className="space-y-3">
        <span className={marketingTheme.badge}>
          {t("resources:hostingPage.badge")}
        </span>
        <h1 className={marketingTheme.pageTitle}>{t("nav.hosting")}</h1>
        <p className={marketingTheme.lead}>
          {t("resources:hostingPage.subtitle")}
        </p>
      </header>

      <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {hostingFeatures.map((feature, index) => (
          <article
            key={feature.id}
            className={`${marketingTheme.panel} p-5`}
          >
            <p className={marketingTheme.eyebrow}>
              {String(index + 1).padStart(2, "0")}
            </p>
            <h2 className="mt-3 font-serif text-[1.28rem] font-semibold tracking-[-0.03em] text-foreground">
              {t(`resources:hostingPage.features.${feature.id}.title`)}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {t(`resources:hostingPage.features.${feature.id}.description`)}
            </p>
          </article>
        ))}
      </section>

      <section className={`${marketingTheme.panel} mt-8 p-6`}>
        <h3 className="text-lg font-semibold">{t("resources:hostingPage.cta.title")}</h3>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          {t("resources:hostingPage.cta.description")}
        </p>
        <a
          href={discussionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-4 ${marketingTheme.primaryButton}`}
        >
          {t("resources:hostingPage.cta.button")}
        </a>
      </section>
    </div>
  );
}

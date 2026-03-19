import { useTranslation } from "react-i18next";
import { product } from "@/lib/product";
import { IconBuildingFactory, IconRocket, IconSparkles } from "@tabler/icons-react";
import { marketingTheme } from "@/lib/marketing-theme";

export function meta() {
  const title = `${product.productName} — Roadmap`;
  const description = "See what we are building next";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
}

const roadmap = [
  {
    version: "v1",
    status: "current",
    icon: IconRocket,
    features: [
      { id: "coreRuntime", status: "completed" },
      { id: "constitution", status: "completed" },
      { id: "telegram", status: "completed" },
      { id: "tasks", status: "completed" },
      { id: "docs", status: "in-progress" },
    ],
  },
  {
    version: "v2",
    status: "planned",
    icon: IconBuildingFactory,
    features: [
      { id: "slack", status: "pending" },
      { id: "snapshot", status: "pending" },
      { id: "githubApp", status: "pending" },
      { id: "multiAgent", status: "pending" },
      { id: "remoteDeploy", status: "pending" },
    ],
  },
  {
    version: "v3",
    status: "exploring",
    icon: IconSparkles,
    features: [
      { id: "marketplace", status: "pending" },
      { id: "remoteHosting", status: "pending" },
      { id: "webIde", status: "pending" },
      { id: "sso", status: "pending" },
      { id: "analytics", status: "pending" },
    ],
  },
] as const;

const STATUS_CLASS: Record<string, string> = {
  completed: "text-emerald-700",
  "in-progress": "text-blue-700",
  pending: "text-muted-foreground",
};

export default function Roadmap() {
  const { t } = useTranslation();
  const repoUrl =
    product.homepage?.includes("github.com") === true
      ? product.homepage
      : "https://github.com/wangenius/downcity";
  const issuesUrl = `${repoUrl}/issues`;

  return (
    <div className={marketingTheme.pageNarrow}>
      <header className="space-y-3">
        <span className={marketingTheme.badge}>
          Roadmap
        </span>
        <h1 className={marketingTheme.pageTitle}>{t("nav.roadmap")}</h1>
        <p className={marketingTheme.lead}>
          {t("community:roadmap.description")}
        </p>
      </header>

      <section className="mt-8 space-y-4">
        {roadmap.map((version, index) => (
          <article
            key={version.version}
            className={`${marketingTheme.panel} p-5 md:p-6`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <version.icon className="size-4 text-muted-foreground" stroke={1.8} />
              <span className="font-mono text-[0.66rem] uppercase tracking-[0.1em] text-muted-foreground">
                {version.version}
              </span>
              <span className={`${marketingTheme.badge} px-2.5 py-0.5`}>
                {t(`community:roadmapPage.phases.${version.status}`)}
              </span>
            </div>

            <h2 className="mt-3 font-serif text-[1.55rem] font-semibold tracking-[-0.03em] text-foreground">
              {t(`community:roadmapPage.versions.${version.version}.title`)}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {t(`community:roadmapPage.versions.${version.version}.description`)}
            </p>

            <ul className="mt-4 grid gap-2">
              {version.features.map((feature) => (
                <li
                  key={feature.id}
                  className={`${marketingTheme.panelSoft} px-3 py-2`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-[0.66rem] uppercase tracking-[0.1em] ${STATUS_CLASS[feature.status]}`}>
                      {feature.status}
                    </span>
                    <span className="text-sm font-medium">
                      {t(`community:roadmapPage.versions.${version.version}.features.${feature.id}.name`)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">
                    {t(`community:roadmapPage.versions.${version.version}.features.${feature.id}.desc`)}
                  </p>
                </li>
              ))}
            </ul>

            {index !== roadmap.length - 1 ? <div className="mt-4 border-b border-border/70" /> : null}
          </article>
        ))}
      </section>

      <section className={`${marketingTheme.panel} mt-8 p-6`}>
        <h3 className="text-lg font-semibold">{t("community:roadmapPage.cta.title")}</h3>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          {t("community:roadmapPage.cta.description")}
        </p>
        <a
          href={issuesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-4 ${marketingTheme.primaryButton}`}
        >
          {t("community:roadmapPage.cta.button")}
        </a>
      </section>
    </div>
  );
}

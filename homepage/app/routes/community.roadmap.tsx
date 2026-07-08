import { useTranslation } from "react-i18next";
import { IconBuildingFactory, IconRocket, IconSparkles } from "@tabler/icons-react";
import { product } from "@/lib/product";
import { cn } from "@/lib/utils";

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

const STATUS_DOT: Record<string, string> = {
  completed: "bg-success",
  "in-progress": "bg-info",
  pending: "bg-text-subtle",
};

export default function Roadmap() {
  const { t } = useTranslation();
  const repoUrl =
    product.homepage?.includes("github.com") === true
      ? product.homepage
      : "https://github.com/wangenius/downcity";
  const issuesUrl = `${repoUrl}/issues`;

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-16 md:px-8 md:py-24 lg:px-20">
      <header className="space-y-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-text-soft">
          Roadmap
        </span>
        <h1 className="font-serif text-[clamp(1.875rem,4vw,2.25rem)] font-bold leading-[1.12] tracking-[-0.02em] text-foreground">
          {t("nav.roadmap")}
        </h1>
        <p className="max-w-2xl text-base leading-[1.65] text-text-soft">{t("community:roadmap.description")}</p>
      </header>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {roadmap.map((version, index) => (
          <article
            key={version.version}
            className="rounded-[14px] border border-line bg-card p-5 shadow-sm md:p-6"
          >
            <div className="flex flex-wrap items-center gap-2">
              <version.icon className="size-4 text-text-subtle" stroke={1.8} />
              <span className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.06em] text-text-subtle">
                {version.version}
              </span>
              <span className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.1em] text-text-soft">
                {t(`community:roadmapPage.phases.${version.status}`)}
              </span>
            </div>

            <h2 className="mt-4 font-serif text-[1.55rem] font-semibold tracking-[-0.03em] text-foreground">
              {t(`community:roadmapPage.versions.${version.version}.title`)}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-text-soft">
              {t(`community:roadmapPage.versions.${version.version}.description`)}
            </p>

            <ul className="mt-5 space-y-2">
              {version.features.map((feature) => (
                <li
                  key={feature.id}
                  className="rounded-xl border border-line bg-surface-soft px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("size-1.5 rounded-full", STATUS_DOT[feature.status])} />
                    <span className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.08em] text-text-subtle">
                      {feature.status}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {t(`community:roadmapPage.versions.${version.version}.features.${feature.id}.name`)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-text-soft">
                    {t(`community:roadmapPage.versions.${version.version}.features.${feature.id}.desc`)}
                  </p>
                </li>
              ))}
            </ul>

            {index !== roadmap.length - 1 ? null : null}
          </article>
        ))}
      </section>

      <section className="mt-8 rounded-[14px] border border-line bg-card p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground">{t("community:roadmapPage.cta.title")}</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-soft">
          {t("community:roadmapPage.cta.description")}
        </p>
        <a
          href={issuesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-76"
        >
          {t("community:roadmapPage.cta.button")}
        </a>
      </section>
    </div>
  );
}

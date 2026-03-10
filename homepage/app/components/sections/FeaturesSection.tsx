import type { FC } from "react";
import { useTranslation } from "react-i18next";
import {
  IconLayersIntersect,
  IconBrain,
  IconBolt,
  IconShieldCheck,
  IconHistory,
  IconTools,
} from "@tabler/icons-react";

const features = [
  {
    id: "repo",
    index: "01",
    kickerZh: "以仓库为中心",
    kickerEn: "Repo-Centered",
    titleKey: "features:features.repo.title",
    descriptionKey: "features:features.repo.description",
    icon: IconLayersIntersect,
  },
  {
    id: "interactive",
    index: "02",
    kickerZh: "主动执行",
    kickerEn: "Proactive Execution",
    titleKey: "features:features.interactive.title",
    descriptionKey: "features:features.interactive.description",
    icon: IconBrain,
  },
  {
    id: "schedule",
    index: "03",
    kickerZh: "关键操作可控",
    kickerEn: "Controlled Actions",
    titleKey: "features:features.schedule.title",
    descriptionKey: "features:features.schedule.description",
    icon: IconShieldCheck,
  },
  {
    id: "audit",
    index: "04",
    kickerZh: "过程可追溯",
    kickerEn: "Traceable Process",
    titleKey: "features:features.audit.title",
    descriptionKey: "features:features.audit.description",
    icon: IconHistory,
  },
  {
    id: "skills",
    index: "05",
    kickerZh: "能力按需扩展",
    kickerEn: "Extensible Skills",
    titleKey: "features:features.skills.title",
    descriptionKey: "features:features.skills.description",
    icon: IconTools,
  },
] as const;

export const FeaturesSection: FC = () => {
  const { i18n, t } = useTranslation();
  const isZh = i18n.language === "zh";

  return (
    <section className="py-12 md:py-24 lg:py-32">
      <div className="mx-auto w-full max-w-4xl px-4 md:px-6">
        <header className="space-y-4">
          <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <IconBolt className="size-3.5" />
            {t("features:sectionLabel")}
          </p>
          <h1 className="text-balance font-serif text-4xl leading-[1.12] tracking-tight md:text-5xl">
            {t("features:title")}{" "}
            <span className="text-primary italic">{t("features:titleItalic")}</span>
          </h1>
          <p className="max-w-3xl text-base leading-8 text-muted-foreground md:text-lg">
            {t("features:description")}
          </p>
        </header>

        <div className="mt-10 space-y-3">
          {features.map((feature) => (
            <article
              key={feature.id}
              className="rounded-lg border border-border/60 px-4 py-4 md:px-5"
            >
              <div className="flex items-start gap-4">
                <div className="flex w-12 shrink-0 flex-col items-center gap-1 pt-0.5">
                  <span className="text-xs font-mono tracking-wider text-muted-foreground">
                    {feature.index}
                  </span>
                  <feature.icon className="size-4 text-primary" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {isZh ? feature.kickerZh : feature.kickerEn}
                  </p>
                  <h2 className="font-serif text-2xl leading-tight tracking-tight text-foreground md:text-[1.7rem]">
                    {t(feature.titleKey as any)}
                  </h2>
                  <p className="text-sm leading-7 text-muted-foreground md:text-base">
                    {t(feature.descriptionKey as any)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-border/60 px-4 py-4 md:px-5">
          <p className="text-sm leading-7 text-muted-foreground md:text-base">
            {isZh
              ? "这套能力不是“替代人”，而是让你在熟悉的工程路径里，把执行速度、治理能力和可持续协作同时拉起来。"
              : "These capabilities are not about replacing humans; they raise execution speed, governance, and sustainable collaboration inside familiar engineering workflows."}
          </p>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;

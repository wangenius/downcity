import type { FC } from "react";
import { useTranslation } from "react-i18next";
import {
  IconBolt,
  IconBrain,
  IconHistory,
  IconLayersIntersect,
  IconShieldCheck,
  IconTools,
} from "@tabler/icons-react";

const features = [
  {
    id: "repo",
    index: "01",
    titleKey: "features:features.repo.title",
    descriptionKey: "features:features.repo.description",
    icon: IconLayersIntersect,
  },
  {
    id: "interactive",
    index: "02",
    titleKey: "features:features.interactive.title",
    descriptionKey: "features:features.interactive.description",
    icon: IconBrain,
  },
  {
    id: "schedule",
    index: "03",
    titleKey: "features:features.schedule.title",
    descriptionKey: "features:features.schedule.description",
    icon: IconShieldCheck,
  },
  {
    id: "audit",
    index: "04",
    titleKey: "features:features.audit.title",
    descriptionKey: "features:features.audit.description",
    icon: IconHistory,
  },
  {
    id: "skills",
    index: "05",
    titleKey: "features:features.skills.title",
    descriptionKey: "features:features.skills.description",
    icon: IconTools,
  },
] as const;

/**
 * 首页功能模块（高级双栏版）。
 * 说明：
 * 1. 左侧展示产品主张与治理原则，右侧展示能力清单。
 * 2. 通过非对称分栏提升信息节奏，避免模板化卡片墙。
 */
export const FeaturesSection: FC = () => {
  const { i18n, t } = useTranslation();
  const isZh = i18n.language === "zh";

  return (
    <section className="home-divider py-16 md:py-20">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <div className="home-reveal mb-8 space-y-3">
          <p className="home-kicker">
            <IconBolt className="size-3.5" />
            {t("features:sectionLabel")}
          </p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            {t("features:title")}{" "}
            <span className="text-foreground/72 italic">{t("features:titleItalic")}</span>
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
            {t("features:description")}
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="home-panel home-reveal home-reveal-delay-1 rounded-xl p-5 md:p-6 lg:sticky lg:top-24">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Design Principle
            </p>
            <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight">
              {isZh ? "执行速度与治理边界同时成立" : "Execution speed with governance boundaries."}
            </h3>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {isZh
                ? "Downcity 不把能力建立在黑盒替代之上，而是把 Agent 放进你已有的工程语境里，让每一次自动化都可解释、可中止、可接管。"
                : "Downcity does not optimize for black-box replacement. It embeds agents inside existing engineering context so automation remains explainable, interruptible, and recoverable."}
            </p>
            <div className="mt-5 space-y-2 border-t border-border/70 pt-4">
              {[
                isZh ? "Repo 是控制面，不是数据来源之一" : "Repo is the control plane, not just a data source",
                isZh ? "审计日志即治理资产" : "Audit logs are governance assets",
                isZh ? "路径贴合优先于平台迁移" : "Path-fit beats platform migration",
              ].map((line) => (
                <div key={line} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-1 inline-flex h-1.5 w-1.5 rounded-full bg-foreground/55" />
                  <p>{line}</p>
                </div>
              ))}
            </div>
          </aside>

          <div className="home-panel home-reveal home-reveal-delay-2 overflow-hidden rounded-xl">
            {features.map((feature, index) => (
              <article
                key={feature.id}
                className={`grid gap-3 px-4 py-4 md:grid-cols-[4.5rem_minmax(0,1fr)] md:gap-5 md:px-5 ${
                  index !== features.length - 1 ? "border-b border-border/70" : ""
                }`}
              >
                <div className="flex items-center gap-2 md:flex-col md:items-start md:gap-1">
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    {feature.index}
                  </span>
                  <feature.icon className="size-4 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold tracking-tight">
                    {t(feature.titleKey as never)}
                  </h3>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {t(feature.descriptionKey as never)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;

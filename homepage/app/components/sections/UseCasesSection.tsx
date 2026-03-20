import type { FC } from "react";
import { useTranslation } from "react-i18next";
import {
  IconBrandYoutube,
  IconBriefcase,
  IconBuildingSkyscraper,
  IconChartCandle,
  IconDatabase,
  IconNews,
  IconSchool,
  IconTerminal2,
  IconUserCircle,
} from "@tabler/icons-react";
import { marketingTheme } from "@/lib/marketing-theme";

const USE_CASE_GROUPS = [
  {
    id: "builder",
    items: [
      { id: "coding", icon: IconTerminal2 },
      { id: "data", icon: IconDatabase },
      { id: "office", icon: IconBuildingSkyscraper },
    ],
  },
  {
    id: "insight",
    items: [
      { id: "research", icon: IconSchool },
      { id: "news", icon: IconNews },
      { id: "content", icon: IconBrandYoutube },
    ],
  },
  {
    id: "growth",
    items: [
      { id: "business", icon: IconBriefcase },
      { id: "finance", icon: IconChartCandle },
      { id: "career", icon: IconUserCircle },
    ],
  },
] as const;

/**
 * 首页应用场景模块（高级分组版）。
 * 说明：
 * 1. 将场景按能力路径分为三条“工作流通道”，提升叙事性。
 * 2. 每条通道使用统一列表结构，避免重复卡片造成视觉疲劳。
 */
export const UseCasesSection: FC = () => {
  const { i18n, t } = useTranslation();
  const isZh = i18n.language === "zh";
  const panelClass = marketingTheme.panel;
  const kickerClass = marketingTheme.badge;

  const laneTitles: Record<(typeof USE_CASE_GROUPS)[number]["id"], string> = {
    builder: isZh ? "构建与执行" : "Build & Execute",
    insight: isZh ? "研究与洞察" : "Research & Insight",
    growth: isZh ? "业务与增长" : "Business & Growth",
  };

  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <header className="space-y-3">
          <span className={kickerClass}>{t("usecases:title")}</span>
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
            {t("usecases:description")}
          </p>
        </header>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {USE_CASE_GROUPS.map((group, groupIndex) => (
            <article
              key={group.id}
              className={`rounded-xl p-4 md:p-5 ${panelClass} ${
                groupIndex === 1 ? "lg:-mt-4" : ""
              } ${groupIndex === 2 ? "lg:mt-4" : ""}`}
            >
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {laneTitles[group.id]}
              </p>
              <div className="space-y-3">
                {group.items.map((item, index) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border border-border bg-background/85 p-3 ${
                      index !== group.items.length - 1 ? "" : ""
                    }`}
                  >
                    <div className="mb-2 inline-flex rounded-md border border-border bg-muted/45 p-1.5 text-muted-foreground">
                      <item.icon size={14} />
                    </div>
                    <h3 className="text-sm font-semibold leading-tight">
                      {t(`usecases:cases.${item.id}.title`)}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      {t(`usecases:cases.${item.id}.description`)}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <p className="mt-6 text-sm leading-7 text-muted-foreground">
          {t("usecases:bottom_text")}
        </p>
      </div>
    </section>
  );
};

export default UseCasesSection;

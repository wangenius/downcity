import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { IconArrowUpRight, IconBuildingStore, IconCloud, IconTools } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { marketingTheme } from "@/lib/marketing-theme";
import { MarketingPanel } from "@/components/shared/marketing-elements";

const resources = [
  {
    titleKey: "resources:skills.title",
    descriptionKey: "resources:skills.description",
    icon: IconTools,
    path: "/skills",
  },
  {
    titleKey: "resources:marketplace.title",
    descriptionKey: "resources:marketplace.description",
    icon: IconBuildingStore,
    path: "/marketplace",
  },
  {
    titleKey: "resources:hosting.title",
    descriptionKey: "resources:hosting.description",
    icon: IconCloud,
    path: "/hosting",
  },
] as const;

/**
 * 资源入口模块。
 * 说明：
 * 1. 用纵向入口列表替代松散卡片网格，让路径更清晰。
 * 2. 每个入口只保留标题、说明与去向，保持极简。
 */
export const ResourcesSection: FC = () => {
  const { i18n, t } = useTranslation();
  const basePath = i18n.language.toLowerCase().startsWith("zh") ? "/zh/resources" : "/resources";
  const isZh = i18n.language.toLowerCase().startsWith("zh");

  return (
    <section className={marketingTheme.pageNarrow}>
      <header className="space-y-4">
        <span className={marketingTheme.badge}>Resources</span>
        <h1 className={marketingTheme.pageTitle}>{t("resources:title")}</h1>
        <p className={marketingTheme.lead}>{t("resources:subtitle")}</p>
      </header>

      <MarketingPanel className="mt-8 overflow-hidden">
        {resources.map((item, index) => (
          <a
            key={item.path}
            href={`${basePath}${item.path}`}
            className={cn(
              "grid gap-4 px-5 py-5 transition-colors hover:bg-background/74 md:grid-cols-[3rem_minmax(0,1fr)_auto] md:items-center md:px-7",
              index !== resources.length - 1 && "border-b border-border/68",
            )}
          >
            <div className="flex items-center gap-2 md:block">
              <p className={marketingTheme.eyebrow}>{String(index + 1).padStart(2, "0")}</p>
              <item.icon className="size-4 text-muted-foreground md:mt-3" />
            </div>
            <div>
              <h2 className="font-serif text-[1.35rem] font-semibold tracking-[-0.035em] text-foreground">
                {t(item.titleKey)}
              </h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{t(item.descriptionKey)}</p>
            </div>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              {isZh ? "进入" : "Open"}
              <IconArrowUpRight className="size-4" />
            </span>
          </a>
        ))}
      </MarketingPanel>
    </section>
  );
};

export default ResourcesSection;

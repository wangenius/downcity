import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { IconArrowUpRight, IconHelp, IconMap2, IconMessageCircle } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { COMMUNITY_LINKS } from "@/lib/community-links";
import { marketingTheme } from "@/lib/marketing-theme";
import { MarketingPanel } from "@/components/shared/marketing-elements";

const communityLinks = [
  {
    titleKey: "community:faq.title",
    descriptionKey: "community:faq.description",
    icon: IconHelp,
    path: "/faq",
  },
  {
    titleKey: "community:roadmap.title",
    descriptionKey: "community:roadmap.description",
    icon: IconMap2,
    path: "/roadmap",
  },
  {
    titleKey: "community:discussions.title",
    descriptionKey: "community:discussions.description",
    icon: IconMessageCircle,
    href: COMMUNITY_LINKS.telegram,
    external: true,
  },
] as const;

/**
 * 社区首页模块。
 * 说明：
 * 1. 用单列入口把 FAQ、Roadmap 与 Discussions 组织成同一条路径。
 * 2. 视觉上与资源页保持同构，减少页面切换的断裂感。
 */
export const CommunitySection: FC = () => {
  const { i18n, t } = useTranslation();
  const basePath = i18n.language.toLowerCase().startsWith("zh") ? "/zh/community" : "/community";

  return (
    <section className={marketingTheme.pageNarrow}>
      <header className="space-y-4">
        <span className={marketingTheme.badge}>Community</span>
        <h1 className={marketingTheme.pageTitle}>{t("community:title")}</h1>
        <p className={marketingTheme.lead}>{t("community:subtitle")}</p>
      </header>

      <MarketingPanel className="mt-8 overflow-hidden">
        {communityLinks.map((item, index) => (
          (() => {
            const isExternal = "external" in item && item.external === true;
            const href = "href" in item ? item.href : `${basePath}${item.path}`;

            return (
              <a
                key={item.titleKey}
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className={cn(
                  "grid gap-4 px-5 py-5 transition-colors hover:bg-background/74 md:grid-cols-[3rem_minmax(0,1fr)_auto] md:items-center md:px-7",
                  index !== communityLinks.length - 1 && "border-b border-border/68",
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
                  {i18n.language.toLowerCase().startsWith("zh") ? "进入" : "Open"}
                  <IconArrowUpRight className="size-4" />
                </span>
              </a>
            );
          })()
        ))}
      </MarketingPanel>
    </section>
  );
};

export default CommunitySection;

"use client";

import type * as React from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import {
  IconArrowUpRight,
  IconBook,
  IconBox,
  IconBrandGithub,
  IconBrandX,
  IconBriefcase,
  IconBuildingSkyscraper,
  IconBuildingStore,
  IconCheck,
  IconChevronDown,
  IconCloud,
  IconCode,
  IconCreditCard,
  IconDeviceDesktop,
  IconFileText,
  IconHelp,
  IconLanguage,
  IconLayoutDashboard,
  IconMap,
  IconMenu2,
  IconMessageCircle,
  IconMoon,
  IconPalette,
  IconPuzzle,
  IconRobot,
  IconServer,
  IconSun,
  IconSunMoon,
  IconTools,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTheme } from "fumadocs-ui/provider/base";
import { setLang } from "@/lib/locales";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COMMUNITY_LINKS } from "@/lib/community-links";
import { cn } from "@/lib/utils";

/**
 * 顶部导航模块（Vibecape 风格，Popover 分组）。
 * 说明：
 * 1. 粘性毛玻璃导航，60px 高度，干净简洁。
 * 2. 桌面端分组入口使用带图标的 Popover 面板，比下拉菜单更优雅。
 * 3. 移动端所有入口合并到一个 DropdownMenu。
 */

type NavItem =
  | { label: string; description: string; path: string; icon: typeof IconBox }
  | { label: string; description: string; href: string; external: true; icon: typeof IconBox };

type NavGroup = {
  kind: "group";
  label: string;
  activePaths: readonly string[];
  items: readonly NavItem[];
  width?: "default" | "wide";
};

export function Navbar() {
  const { i18n, t } = useTranslation();
  const location = useLocation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");

  const homePath = isZh ? "/zh" : "/";
  const startPath = isZh ? "/zh/start" : "/start";
  const docsPath = isZh ? "/zh/docs" : "/en/docs";
  const citySdkDocsPath = isZh ? "/zh/city-sdk-docs" : "/en/city-sdk-docs";
  const agentSdkDocsPath = isZh ? "/zh/agent-sdk-docs" : "/en/agent-sdk-docs";
  const paymentsPath = isZh ? "/zh/payments" : "/en/payments";
  const pluginsDocsPath = isZh ? "/zh/plugins-docs" : "/en/plugins-docs";
  const uiSdkDocsPath = isZh ? "/zh/ui-sdk-docs" : "/en/ui-sdk-docs";
  const productBasePath = isZh ? "/zh/product" : "/product";
  const whitepaperPath = isZh ? "/zh/whitepaper" : "/whitepaper";
  const featuresPath = isZh ? "/zh/features" : "/features";
  const resourcesBasePath = isZh ? "/zh/resources" : "/resources";
  const productSdkPath = isZh ? "/zh/product/sdk" : "/product/sdk";
  const productAgentSdkPath = isZh ? "/zh/product/agent-sdk" : "/product/agent-sdk";
  const productUiSdkPath = isZh ? "/zh/product/ui-sdk" : "/product/ui-sdk";
  const resourcesSkillsPath = isZh ? "/zh/resources/skills" : "/resources/skills";
  const resourcesMarketplacePath = isZh ? "/zh/resources/marketplace" : "/resources/marketplace";
  const resourcesHostingPath = isZh ? "/zh/resources/hosting" : "/resources/hosting";
  const communityBasePath = isZh ? "/zh/community" : "/community";
  const communityFaqPath = isZh ? "/zh/community/faq" : "/community/faq";
  const communityRoadmapPath = isZh ? "/zh/community/roadmap" : "/community/roadmap";
  const twitterUrl = "https://x.com/downcity_ai";
  const githubUrl = "https://github.com/wangenius/downcity";
  const discussionsUrl = COMMUNITY_LINKS.telegram;

  const featuresLink = { kind: "link", label: t("nav.features"), path: featuresPath } as const;
  const quickStartLink = { kind: "link", label: t("nav.quickStart"), path: startPath } as const;

  const productGroup: NavGroup = {
    kind: "group",
    label: t("nav.product"),
    activePaths: [productBasePath],
    width: "wide",
    items: [
      { label: t("nav.productOverview"), description: isZh ? "完整产品矩阵" : "Full product index", path: productBasePath, icon: IconLayoutDashboard },
      { label: t("nav.productSdk"), description: isZh ? "接入 City SDK" : "Embed City SDK", path: productSdkPath, icon: IconBuildingSkyscraper },
      { label: t("nav.productAgentSdk"), description: isZh ? "把本地 Agent、Session、Plugin 嵌入应用" : "Embed local agents, sessions, and plugins", path: productAgentSdkPath, icon: IconRobot },
      { label: t("nav.productUiSdk"), description: isZh ? "复用 Downcity 界面语言" : "Reuse the Downcity UI layer", path: productUiSdkPath, icon: IconPalette },
    ],
  };

  const docsGroup: NavGroup = {
    kind: "group",
    label: t("nav.docs"),
    activePaths: [docsPath, citySdkDocsPath, agentSdkDocsPath, paymentsPath, pluginsDocsPath, uiSdkDocsPath],
    width: "wide",
    items: [
      { label: "Downcity Docs", description: isZh ? "核心文档空间" : "Core documentation space", path: docsPath, icon: IconBook },
      { label: "City SDK", description: isZh ? "City SDK 文档空间" : "City SDK documentation space", path: citySdkDocsPath, icon: IconServer },
      { label: "Agent SDK", description: isZh ? "Agent SDK 文档空间" : "Agent SDK documentation space", path: agentSdkDocsPath, icon: IconRobot },
      { label: "Payments", description: isZh ? "Payments 文档空间" : "Payments documentation space", path: paymentsPath, icon: IconCreditCard },
      { label: "Agent Plugins Docs", description: isZh ? "Agent Plugins Docs 文档空间" : "Agent Plugins Docs documentation space", path: pluginsDocsPath, icon: IconPuzzle },
      { label: "UI SDK", description: isZh ? "UI SDK 文档空间" : "UI SDK documentation space", path: uiSdkDocsPath, icon: IconPalette },
    ],
  };

  const blogGroup: NavGroup = {
    kind: "group",
    label: t("nav.blog"),
    activePaths: [whitepaperPath],
    items: [
      { label: t("nav.whitepaper"), description: isZh ? "Downcity 方法论与白皮书" : "Concepts and system whitepaper", path: whitepaperPath, icon: IconFileText },
    ],
  };

  const resourcesGroup: NavGroup = {
    kind: "group",
    label: t("nav.resources"),
    activePaths: [resourcesBasePath],
    items: [
      { label: t("nav.skills"), description: t("nav.skillsDesc"), path: resourcesSkillsPath, icon: IconTools },
      { label: t("nav.agentMarketplace"), description: t("nav.agentMarketplaceDesc"), path: resourcesMarketplacePath, icon: IconBuildingStore },
      { label: t("nav.hosting"), description: t("nav.hostingDesc"), path: resourcesHostingPath, icon: IconCloud },
      { label: t("nav.examples"), description: t("nav.examplesDesc"), path: resourcesBasePath, icon: IconCode },
      { label: t("nav.useCases"), description: t("nav.useCasesDesc"), path: resourcesBasePath, icon: IconBriefcase },
    ],
  };

  const communityGroup: NavGroup = {
    kind: "group",
    label: t("nav.community"),
    activePaths: [communityBasePath],
    items: [
      { label: t("nav.faq"), description: t("nav.faqDesc"), path: communityFaqPath, icon: IconHelp },
      { label: t("nav.roadmap"), description: t("nav.roadmapDesc"), path: communityRoadmapPath, icon: IconMap },
      { label: t("nav.discussions"), description: t("nav.discussionsDesc"), href: discussionsUrl, external: true, icon: IconMessageCircle },
    ],
  };

  const navEntries = [productGroup, featuresLink, quickStartLink, docsGroup, blogGroup, resourcesGroup, communityGroup] as const;
  const groupedLinks = [productGroup, docsGroup, blogGroup, resourcesGroup, communityGroup] as const;
  const directLinks = [featuresLink, quickStartLink] as const;

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);
  const isAnyActive = (paths: readonly string[]) => paths.some((path) => isActive(path));

  const dropdownContentClass =
    "min-w-[17rem] rounded-xl border border-line bg-surface-overlay p-1.5 shadow-[var(--shadow-popover)] backdrop-blur-xl";
  const dropdownItemClass =
    "min-h-9 rounded-lg px-3 py-2 text-[0.9rem] font-medium text-foreground transition-colors focus:bg-surface-hover focus:text-foreground";
  const menuSelectItemClass =
    "flex min-h-9 items-center justify-between rounded-lg px-3 py-2 text-[0.9rem] font-medium text-foreground transition-colors focus:bg-surface-hover focus:text-foreground";

  const popoverPanelClass =
    "rounded-[14px] border border-line bg-card p-2 shadow-[0_10px_30px_rgb(27_27_24_/_0.06)] backdrop-blur-xl";

  const renderNavGroup = (group: NavGroup) => {
    const active = isAnyActive(group.activePaths);
    return (
      <Popover key={group.label}>
        <PopoverTrigger
          className={cn(
            "group inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors outline-none",
            active ? "bg-foreground/[0.04] text-foreground" : "text-text-soft hover:bg-foreground/[0.04] hover:text-foreground"
          )}
        >
          <span>{group.label}</span>
          <IconChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className={cn(popoverPanelClass, group.width === "wide" ? "w-[20rem]" : "w-[17rem]")}
        >
          <div className="grid gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const content = (
                <>
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-soft text-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                      {"external" in item && <IconArrowUpRight className="size-3 text-text-subtle" />}
                    </div>
                    <p className="text-[0.75rem] leading-4 text-text-soft">{item.description}</p>
                  </div>
                </>
              );

              return "path" in item ? (
                <Link
                  key={item.path}
                  to={item.path}
                  className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-surface-hover"
                >
                  {content}
                </Link>
              ) : (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-surface-hover"
                >
                  {content}
                </a>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const renderDirectLink = (item: (typeof directLinks)[number]) => (
    <Link
      key={item.path}
      to={item.path}
      className={cn(
        "inline-flex h-8 items-center rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors",
        isActive(item.path)
          ? "bg-foreground/[0.04] text-foreground"
          : "text-text-soft hover:bg-foreground/[0.04] hover:text-foreground"
      )}
    >
      {item.label}
    </Link>
  );

  const iconButtonClass =
    "inline-flex size-8 items-center justify-center rounded-md text-text-soft transition-colors hover:bg-foreground/[0.04] hover:text-foreground";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-line/60 bg-background/[0.86] backdrop-blur-[16px]">
      <div className="mx-auto flex h-[60px] max-w-[1320px] items-center justify-between gap-4 px-5 md:px-8 lg:px-20">
        <Link to={homePath} className="inline-flex items-center gap-2.5 text-[0.9375rem] font-semibold text-foreground">
          <img src="/icon.svg" alt="Downcity" className="brand-logo block h-6 w-6 shrink-0 object-contain" />
          <span>Downcity</span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {navEntries.map((entry) =>
            entry.kind === "group" ? renderNavGroup(entry) : renderDirectLink(entry)
          )}
        </nav>

        <div className="hidden items-center gap-0.5 lg:flex">
          <a href={twitterUrl} target="_blank" rel="noreferrer" aria-label="X" title="X" className={iconButtonClass}>
            <IconBrandX className="size-4" />
          </a>
          <a href={githubUrl} target="_blank" rel="noreferrer" aria-label="GitHub" title="GitHub" className={iconButtonClass}>
            <IconBrandGithub className="size-4" />
          </a>
          <ThemeSwitcher is_zh={isZh} button_class={iconButtonClass} dropdown_content_class={dropdownContentClass} dropdown_item_class={menuSelectItemClass} />
          <LanguageSwitcher is_zh={isZh} button_class={iconButtonClass} dropdown_content_class={dropdownContentClass} dropdown_item_class={menuSelectItemClass} />
        </div>

        <div className="flex items-center justify-end lg:hidden">
          <MobileMenu
            is_zh={isZh}
            grouped_links={groupedLinks}
            direct_links={directLinks}
            twitter_url={twitterUrl}
            github_url={githubUrl}
            icon_button_class={iconButtonClass}
            dropdown_content_class={dropdownContentClass}
            dropdown_item_class={dropdownItemClass}
            menu_select_item_class={menuSelectItemClass}
          />
        </div>
      </div>
    </header>
  );
}

function LanguageSwitcher({
  is_zh,
  button_class,
  dropdown_content_class,
  dropdown_item_class,
}: {
  is_zh: boolean;
  button_class: string;
  dropdown_content_class: string;
  dropdown_item_class: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={is_zh ? "切换语言" : "Switch language"} title={is_zh ? "切换语言" : "Switch language"} className={button_class}>
        <IconLanguage className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className={dropdown_content_class}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 py-2 text-[0.65rem] uppercase tracking-[0.12em] text-text-soft">
            {is_zh ? "语言" : "Language"}
          </DropdownMenuLabel>
          <DropdownMenuItem className={dropdown_item_class} onClick={() => setLang("en")}>
            <span>English</span>
            {!is_zh ? <IconCheck className="size-4 text-text-soft" /> : <span className="size-4" />}
          </DropdownMenuItem>
          <DropdownMenuItem className={dropdown_item_class} onClick={() => setLang("zh")}>
            <span>中文</span>
            {is_zh ? <IconCheck className="size-4 text-text-soft" /> : <span className="size-4" />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const theme_options = [
  { value: "light", icon: IconSun, en_label: "Light", zh_label: "Light" },
  { value: "dark", icon: IconMoon, en_label: "Dark", zh_label: "Dark" },
  { value: "system", icon: IconDeviceDesktop, en_label: "System", zh_label: "System" },
] as const;

type ThemeMode = (typeof theme_options)[number]["value"];

function ThemeSwitcher({
  is_zh,
  button_class,
  dropdown_content_class,
  dropdown_item_class,
}: {
  is_zh: boolean;
  button_class: string;
  dropdown_content_class: string;
  dropdown_item_class: string;
}) {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={is_zh ? "切换主题" : "Switch theme"} title={is_zh ? "切换主题" : "Switch theme"} className={button_class}>
        {mounted && resolvedTheme === "dark" ? (
          <IconMoon className="size-4" />
        ) : mounted && resolvedTheme === "light" ? (
          <IconSun className="size-4" />
        ) : (
          <IconSunMoon className="size-4" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className={dropdown_content_class}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 py-2 text-[0.65rem] uppercase tracking-[0.12em] text-text-soft">
            {is_zh ? "主题" : "Theme"}
          </DropdownMenuLabel>
          <ThemeMenuItems is_zh={is_zh} item_class={dropdown_item_class} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeMenuItems({ is_zh, item_class }: { is_zh: boolean; item_class: string }) {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const current_theme = isThemeMode(theme) ? theme : "system";

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      {theme_options.map((option) => {
        const Icon = option.icon;
        const selected = mounted && current_theme === option.value;
        return (
          <DropdownMenuItem key={option.value} className={item_class} onClick={() => setTheme(option.value)}>
            <span className="flex items-center gap-2">
              <Icon className="size-4 text-text-soft" />
              <span>{is_zh ? option.zh_label : option.en_label}</span>
            </span>
            {selected ? <IconCheck className="size-4 text-text-soft" /> : <span className="size-4" />}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

function isThemeMode(value: string | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function MobileMenu({
  is_zh,
  grouped_links,
  direct_links,
  twitter_url,
  github_url,
  icon_button_class,
  dropdown_content_class,
  dropdown_item_class,
  menu_select_item_class,
}: {
  is_zh: boolean;
  grouped_links: readonly NavGroup[];
  direct_links: readonly { kind: "link"; label: string; path: string }[];
  twitter_url: string;
  github_url: string;
  icon_button_class: string;
  dropdown_content_class: string;
  dropdown_item_class: string;
  menu_select_item_class: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={is_zh ? "菜单" : "Menu"} title={is_zh ? "菜单" : "Menu"} className={icon_button_class}>
        <IconMenu2 className="size-[1.125rem]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={dropdown_content_class}>
        <div className="px-3 py-2 text-[0.65rem] uppercase tracking-[0.12em] text-text-soft">Downcity</div>
        {grouped_links.map((group) => (
          <DropdownMenuGroup key={group.label}>
            <DropdownMenuLabel className="px-3 pb-1 pt-2 text-[0.65rem] uppercase tracking-[0.1em] text-text-soft">
              {group.label}
            </DropdownMenuLabel>
            {group.items.map((item) =>
              "path" in item ? (
                <DropdownMenuItem
                  key={item.path}
                  className={dropdown_item_class}
                  render={(itemProps: React.ComponentPropsWithoutRef<"a">) => <Link {...itemProps} to={item.path}>{item.label}</Link>}
                />
              ) : (
                <DropdownMenuItem
                  key={item.href}
                  className={dropdown_item_class}
                  render={(itemProps: React.ComponentPropsWithoutRef<"a">) => (
                    <a {...itemProps} href={item.href} target="_blank" rel="noreferrer">
                      <span className="flex items-center gap-1.5">
                        <span>{item.label}</span>
                        <IconArrowUpRight className="size-3.5 text-text-soft" />
                      </span>
                    </a>
                  )}
                />
              )
            )}
            <DropdownMenuSeparator />
          </DropdownMenuGroup>
        ))}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 pb-1 pt-2 text-[0.65rem] uppercase tracking-[0.1em] text-text-soft">
            {is_zh ? "直达" : "Direct"}
          </DropdownMenuLabel>
          {direct_links.map((item) => (
            <DropdownMenuItem
              key={item.path}
              className={dropdown_item_class}
              render={(itemProps: React.ComponentPropsWithoutRef<"a">) => <Link {...itemProps} to={item.path}>{item.label}</Link>}
            />
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className={dropdown_item_class}
          render={(itemProps: React.ComponentPropsWithoutRef<"a">) => <a {...itemProps} href={twitter_url} target="_blank" rel="noreferrer">X</a>}
        />
        <DropdownMenuItem
          className={dropdown_item_class}
          render={(itemProps: React.ComponentPropsWithoutRef<"a">) => <a {...itemProps} href={github_url} target="_blank" rel="noreferrer">GitHub</a>}
        />
        <DropdownMenuItem className={dropdown_item_class} onClick={() => setLang(is_zh ? "en" : "zh")}>
          {is_zh ? "Switch to English" : "切换到中文"}
        </DropdownMenuItem>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 pb-1 pt-2 text-[0.65rem] uppercase tracking-[0.1em] text-text-soft">
            {is_zh ? "主题" : "Theme"}
          </DropdownMenuLabel>
          <ThemeMenuItems is_zh={is_zh} item_class={menu_select_item_class} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

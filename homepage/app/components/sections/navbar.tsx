"use client";

import type * as React from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import {
  IconArrowUpRight,
  IconBrandGithub,
  IconBrandX,
  IconCheck,
  IconChevronDown,
  IconDeviceDesktop,
  IconLanguage,
  IconMenu2,
  IconMoon,
  IconSun,
  IconSunMoon,
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
import { COMMUNITY_LINKS } from "@/lib/community-links";
import { marketingTheme } from "@/lib/marketing-theme";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * 顶部导航模块。
 * 说明：
 * 1. 导航按产品信息架构而不是按钮类型组织，保证桌面端与移动端都遵循同一套入口顺序。
 * 2. 顶层只分为“直达链接”和“带二级信息的分组”，其中带 `/` 的栏目统一用 Popover 表达。
 * 3. 所有 hover 态都提供明确背景反馈，让交互感来自面，而不是只依赖文字颜色变化。
 */

/**
 * 全站导航组件。
 */
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
  const communityBasePath = isZh ? "/zh/community" : "/community";
  const whitepaperPath = isZh ? "/zh/whitepaper" : "/whitepaper";
  const featuresPath = isZh ? "/zh/features" : "/features";
  const resourcesBasePath = isZh ? "/zh/resources" : "/resources";
  const productSdkPath = isZh ? "/zh/product/sdk" : "/product/sdk";
  const productAgentSdkPath = isZh ? "/zh/product/agent-sdk" : "/product/agent-sdk";
  const productUiSdkPath = isZh ? "/zh/product/ui-sdk" : "/product/ui-sdk";
  const resourcesSkillsPath = isZh ? "/zh/resources/skills" : "/resources/skills";
  const resourcesMarketplacePath = isZh ? "/zh/resources/marketplace" : "/resources/marketplace";
  const resourcesHostingPath = isZh ? "/zh/resources/hosting" : "/resources/hosting";
  const resourcesExamplesPath = isZh ? "/zh/resources/examples" : "/resources/examples";
  const resourcesUseCasesPath = isZh ? "/zh/resources/use-cases" : "/resources/use-cases";
  const communityFaqPath = isZh ? "/zh/community/faq" : "/community/faq";
  const communityRoadmapPath = isZh ? "/zh/community/roadmap" : "/community/roadmap";
  const twitterUrl = "https://x.com/downcity_ai";
  const githubUrl = "https://github.com/wangenius/downcity";
  const discussionsUrl = COMMUNITY_LINKS.telegram;

  const featuresLink = { kind: "link", label: isZh ? "特性" : t("nav.features"), path: featuresPath } as const;
  const quickStartLink = { kind: "link", label: t("nav.quickStart"), path: startPath } as const;

  const productGroup = {
    kind: "group",
    label: t("nav.product"),
    activePaths: [productBasePath],
    items: [
      { label: t("nav.productOverview"), description: isZh ? "完整产品矩阵" : "Full product index", path: productBasePath },
      { label: t("nav.productSdk"), description: isZh ? "接入 City SDK" : "Embed City SDK", path: productSdkPath },
      { label: t("nav.productAgentSdk"), description: isZh ? "把本地 Agent、Session、Plugin 嵌入应用" : "Embed local agents, sessions, and plugins", path: productAgentSdkPath },
      { label: t("nav.productUiSdk"), description: isZh ? "复用 Downcity 界面语言" : "Reuse the Downcity UI layer", path: productUiSdkPath },
    ],
  } as const;

  const docsGroup = {
    kind: "group",
    label: t("nav.docs"),
    activePaths: [
      docsPath,
      citySdkDocsPath,
      agentSdkDocsPath,
      paymentsPath,
      pluginsDocsPath,
      uiSdkDocsPath,
    ],
    items: [
      { label: "Downcity Docs", description: isZh ? "核心文档空间" : "Core documentation space", path: docsPath },
      { label: "City SDK", description: isZh ? "City SDK 文档空间" : "City SDK documentation space", path: citySdkDocsPath },
      {
        label: "Agent SDK",
        description: isZh ? "Agent SDK 文档空间" : "Agent SDK documentation space",
        path: agentSdkDocsPath,
      },
      {
        label: "Payments",
        description: isZh ? "Payments 文档空间" : "Payments documentation space",
        path: paymentsPath,
      },
      {
        label: "Agent Plugins Docs",
        description: isZh ? "Agent Plugins Docs 文档空间" : "Agent Plugins Docs documentation space",
        path: pluginsDocsPath,
      },
      {
        label: "UI SDK",
        description: isZh ? "UI SDK 文档空间" : "UI SDK documentation space",
        path: uiSdkDocsPath,
      },
    ],
  } as const;

  const blogGroup = {
    kind: "group",
    label: t("nav.blog"),
    activePaths: [whitepaperPath],
    items: [
      { label: t("nav.whitepaper"), description: isZh ? "Downcity 方法论与白皮书" : "Concepts and system whitepaper", path: whitepaperPath },
    ],
  } as const;

  const resourcesGroup = {
    kind: "group",
    label: t("nav.resources"),
    activePaths: [resourcesBasePath],
    items: [
      { label: t("nav.skills"), description: t("nav.skillsDesc"), path: resourcesSkillsPath },
      { label: t("nav.agentMarketplace"), description: t("nav.agentMarketplaceDesc"), path: resourcesMarketplacePath },
      { label: t("nav.hosting"), description: t("nav.hostingDesc"), path: resourcesHostingPath },
      { label: t("nav.examples"), description: t("nav.examplesDesc"), path: resourcesExamplesPath },
      { label: t("nav.useCases"), description: t("nav.useCasesDesc"), path: resourcesUseCasesPath },
    ],
  } as const;

  const communityGroup = {
    kind: "group",
    label: t("nav.community"),
    activePaths: [communityBasePath],
    items: [
      { label: t("nav.faq"), description: t("nav.faqDesc"), path: communityFaqPath },
      { label: t("nav.roadmap"), description: t("nav.roadmapDesc"), path: communityRoadmapPath },
      { label: t("nav.discussions"), description: t("nav.discussionsDesc"), href: discussionsUrl, external: true },
    ],
  } as const;

  /**
   * 顶层导航顺序直接对齐产品 IA，避免“同类控件放一起”破坏阅读顺序。
   */
  const navEntries = [
    productGroup,
    featuresLink,
    quickStartLink,
    docsGroup,
    blogGroup,
    resourcesGroup,
    communityGroup,
  ] as const;

  const groupedLinks = [
    productGroup,
    docsGroup,
    blogGroup,
    resourcesGroup,
    communityGroup,
  ] as const;

  const directLinks = [featuresLink, quickStartLink] as const;

  const dropdownContentClass =
    "min-w-[18rem] rounded-[20px] border border-line bg-surface-overlay p-1.5 shadow-[var(--shadow-popover)] backdrop-blur-xl";
  const dropdownItemClass =
    "min-h-10 rounded-[12px] px-3 py-2 text-[0.92rem] font-medium text-foreground transition-colors focus:bg-surface-hover focus:text-foreground";
  const desktopNavItemClass =
    "inline-flex h-10 items-center gap-1.5 rounded-[12px] px-4 text-[0.78rem] font-medium tracking-[0.08em] text-text-soft transition-colors";
  const desktopNavItemInactiveClass = "hover:bg-surface-hover hover:text-foreground";
  const desktopNavItemActiveClass = "bg-surface-hover text-foreground";
  const popoverContentClass =
    "w-[18.75rem] rounded-[20px] border border-line bg-surface-overlay p-2 shadow-[var(--shadow-popover)] backdrop-blur-xl";
  const popoverItemClass =
    "grid gap-1 rounded-[12px] px-3 py-3 transition-colors hover:bg-surface-hover";
  const utilityButtonClass =
    "inline-flex size-9 items-center justify-center rounded-[11px] text-text-soft transition-colors hover:bg-surface-hover hover:text-foreground";
  const languageButtonClass =
    "inline-flex size-9 items-center justify-center rounded-[11px] text-text-soft transition-colors hover:bg-surface-hover hover:text-foreground";
  const menuSelectItemClass =
    "flex min-h-10 items-center justify-between rounded-[12px] px-3 py-2 text-[0.92rem] font-medium text-foreground transition-colors focus:bg-surface-hover focus:text-foreground";

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const isAnyActive = (paths: readonly string[]) => paths.some((path) => isActive(path));

  const renderNavGroup = (group: (typeof groupedLinks)[number]) => {
    const active = isAnyActive(group.activePaths);

    return (
      <Popover key={group.label}>
        <PopoverTrigger
          render={(triggerProps: React.ComponentPropsWithoutRef<"button">) => (
            <button
              type="button"
              {...triggerProps}
              className={cn(
                desktopNavItemClass,
                active ? desktopNavItemActiveClass : desktopNavItemInactiveClass,
                triggerProps.className,
              )}
            >
              <span>{group.label}</span>
              <IconChevronDown className="size-3.5" />
            </button>
          )}
        />
        <PopoverContent align="start" sideOffset={10} className={popoverContentClass}>
          <div className="space-y-1">
            {group.items.map((item) =>
              "path" in item ? (
                <Link key={item.path} to={item.path} className={popoverItemClass}>
                  <span className="text-[0.94rem] font-medium text-foreground">{item.label}</span>
                  <span className="text-[0.78rem] leading-5 text-text-soft">{item.description}</span>
                </Link>
              ) : (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className={popoverItemClass}
                >
                  <span className="flex items-center gap-1.5 text-[0.94rem] font-medium text-foreground">
                    <span>{item.label}</span>
                    <IconArrowUpRight className="size-3.5 text-text-soft" />
                  </span>
                  <span className="text-[0.78rem] leading-5 text-text-soft">{item.description}</span>
                </a>
              ),
            )}
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
        desktopNavItemClass,
        isActive(item.path) ? desktopNavItemActiveClass : desktopNavItemInactiveClass,
      )}
    >
      {item.label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-50 bg-transparent backdrop-blur-md">
      <div className="mx-auto flex min-h-[64px] max-w-7xl items-center justify-between gap-4 px-3 md:px-5">
        <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-[12px]">
          <img src="/icon.svg" alt="Downcity" className="brand-logo block h-7 w-7 shrink-0 object-contain opacity-95" />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {navEntries.map((entry) =>
            entry.kind === "group" ? renderNavGroup(entry) : renderDirectLink(entry),
          )}
        </nav>

        <div className="hidden items-center gap-1 lg:flex">
          <a
            href={twitterUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="X"
            title="X"
            className={utilityButtonClass}
          >
            <IconBrandX className="size-4" />
          </a>
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            title="GitHub"
            className={utilityButtonClass}
          >
            <IconBrandGithub className="size-4" />
          </a>
          <ThemeSwitcher
            is_zh={isZh}
            button_class={languageButtonClass}
            dropdown_content_class={dropdownContentClass}
            dropdown_item_class={menuSelectItemClass}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={isZh ? "切换语言" : "Switch language"}
              title={isZh ? "切换语言" : "Switch language"}
              className={languageButtonClass}
            >
              <IconLanguage className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={10} className={dropdownContentClass}>
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-3 py-2 text-[0.62rem] uppercase tracking-[0.18em] text-text-soft">
                  {isZh ? "语言" : "Language"}
                </DropdownMenuLabel>
                <DropdownMenuItem className={menuSelectItemClass} onClick={() => setLang("en")}>
                  <span>English</span>
                  {!isZh ? <IconCheck className="size-4 text-text-soft" /> : <span className="size-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem className={menuSelectItemClass} onClick={() => setLang("zh")}>
                  <span>中文</span>
                  {isZh ? <IconCheck className="size-4 text-text-soft" /> : <span className="size-4" />}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center justify-end lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={isZh ? "菜单" : "Menu"}
              title={isZh ? "菜单" : "Menu"}
              className={utilityButtonClass}
            >
              <IconMenu2 className="size-4.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={dropdownContentClass}>
              <div className="px-3 py-2 text-[0.62rem] uppercase tracking-[0.18em] text-text-soft">
                Downcity
              </div>
              {groupedLinks.map((group) => (
                <DropdownMenuGroup key={group.label}>
                  <DropdownMenuLabel className="px-3 pb-1 pt-2 text-[0.62rem] uppercase tracking-[0.14em] text-text-soft">
                    {group.label}
                  </DropdownMenuLabel>
                  {group.items.map((item) =>
                    "path" in item ? (
                      <DropdownMenuItem
                        key={item.path}
                        className={dropdownItemClass}
                        render={(itemProps: React.ComponentPropsWithoutRef<"a">) => <Link {...itemProps} to={item.path}>{item.label}</Link>}
                      />
                    ) : (
                      <DropdownMenuItem
                        key={item.href}
                        className={dropdownItemClass}
                        render={(itemProps: React.ComponentPropsWithoutRef<"a">) => (
                          <a {...itemProps} href={item.href} target="_blank" rel="noreferrer">
                            <span className="flex items-center gap-1.5">
                              <span>{item.label}</span>
                              <IconArrowUpRight className="size-3.5 text-text-soft" />
                            </span>
                          </a>
                        )}
                      />
                    ),
                  )}
                  <DropdownMenuSeparator />
                </DropdownMenuGroup>
              ))}
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-3 pb-1 pt-2 text-[0.62rem] uppercase tracking-[0.14em] text-text-soft">
                  {isZh ? "直达" : "Direct"}
                </DropdownMenuLabel>
                {directLinks.map((item) => (
                  <DropdownMenuItem
                    key={item.path}
                    className={dropdownItemClass}
                    render={(itemProps: React.ComponentPropsWithoutRef<"a">) => <Link {...itemProps} to={item.path}>{item.label}</Link>}
                  />
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={dropdownItemClass}
                render={(itemProps: React.ComponentPropsWithoutRef<"a">) => <a {...itemProps} href={twitterUrl} target="_blank" rel="noreferrer">X</a>}
              />
              <DropdownMenuItem
                className={dropdownItemClass}
                render={(itemProps: React.ComponentPropsWithoutRef<"a">) => <a {...itemProps} href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>}
              />
              <DropdownMenuItem className={dropdownItemClass} onClick={() => setLang(isZh ? "en" : "zh")}>
                {isZh ? "Switch to English" : "切换到中文"}
              </DropdownMenuItem>
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-3 pb-1 pt-2 text-[0.62rem] uppercase tracking-[0.14em] text-text-soft">
                  {isZh ? "主题" : "Theme"}
                </DropdownMenuLabel>
                <ThemeMenuItems
                  is_zh={isZh}
                  item_class={menuSelectItemClass}
                />
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

/**
 * 主题选项配置。
 * 说明：主题能力由 Fumadocs RootProvider 内置的 next-themes 提供，这里只负责站点 Header 的用户入口。
 */
const theme_options = [
  {
    value: "light",
    icon: IconSun,
    en_label: "Light",
    zh_label: "Light",
  },
  {
    value: "dark",
    icon: IconMoon,
    en_label: "Dark",
    zh_label: "Dark",
  },
  {
    value: "system",
    icon: IconDeviceDesktop,
    en_label: "System",
    zh_label: "System",
  },
] as const;

type ThemeMode = (typeof theme_options)[number]["value"];

/**
 * Header 主题切换器。
 */
function ThemeSwitcher({
  is_zh,
  button_class,
  dropdown_content_class,
  dropdown_item_class,
}: {
  /** 当前界面是否为中文。 */
  is_zh: boolean;
  /** 触发按钮样式。 */
  button_class: string;
  /** 下拉面板样式。 */
  dropdown_content_class: string;
  /** 下拉选项样式。 */
  dropdown_item_class: string;
}) {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={is_zh ? "切换主题" : "Switch theme"}
        title={is_zh ? "切换主题" : "Switch theme"}
        className={button_class}
      >
        {mounted && resolvedTheme === "dark" ? (
          <IconMoon className="size-4" />
        ) : mounted && resolvedTheme === "light" ? (
          <IconSun className="size-4" />
        ) : (
          <IconSunMoon className="size-4" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className={dropdown_content_class}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 py-2 text-[0.62rem] uppercase tracking-[0.18em] text-text-soft">
            {is_zh ? "主题" : "Theme"}
          </DropdownMenuLabel>
          <ThemeMenuItems
            is_zh={is_zh}
            item_class={dropdown_item_class}
          />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 主题菜单选项。
 */
function ThemeMenuItems({
  is_zh,
  item_class,
}: {
  /** 当前界面是否为中文。 */
  is_zh: boolean;
  /** 菜单选项样式。 */
  item_class: string;
}) {
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
          <DropdownMenuItem
            key={option.value}
            className={item_class}
            onClick={() => setTheme(option.value)}
          >
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

/**
 * 判断主题字符串是否为 Header 支持的三种模式。
 */
function isThemeMode(value: string | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

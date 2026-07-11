"use client";

import type * as React from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
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
import { cn } from "@/lib/utils";
import {
  IconArrowUpRight,
  IconBook,
  IconBrandGithub,
  IconBrandX,
  IconCheck,
  IconChevronDown,
  IconDeviceDesktop,
  IconLanguage,
  IconLayoutDashboard,
  IconMenu2,
  IconMoon,
  IconPuzzle,
  IconRobot,
  IconServer,
  IconSun,
  IconSunMoon,
} from "@tabler/icons-react";

/**
 * 顶部导航模块（Vibecape 式极简）。
 * 说明：
 * 1. 粘性毛玻璃导航，60px 高度，信息密度低。
 * 2. 桌面端仅保留 Products / Docs / Community 三个下拉分组 + GitHub 直达。
 * 3. 分组面板使用简洁的 DropdownMenu，而非 mega-menu popover。
 * 4. 移动端所有入口合并到一个 DropdownMenu。
 */

type NavLinkItem =
  | { label: string; description: string; path: string; icon: typeof IconBook }
  | { label: string; description: string; href: string; external: true; icon: typeof IconBook };

type NavGroup = {
  label: string;
  activePaths: readonly string[];
  items: readonly NavLinkItem[];
};

const GITHUB_URL = "https://github.com/wangenius/downcity";
const TWITTER_URL = "https://x.com/downcity_ai";

export function Navbar() {
  const { i18n, t } = useTranslation("common");
  const location = useLocation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");

  const homePath = isZh ? "/zh" : "/";
  const productPath = isZh ? "/zh/product" : "/product";
  const featuresPath = isZh ? "/zh/features" : "/features";
  const docsPath = isZh ? "/zh/docs" : "/en/docs";
  const citySdkDocsPath = isZh ? "/zh/city-sdk-docs" : "/en/city-sdk-docs";
  const agentSdkDocsPath = isZh ? "/zh/agent-sdk-docs" : "/en/agent-sdk-docs";
  const pluginsDocsPath = isZh ? "/zh/plugins-docs" : "/en/plugins-docs";
  const uiSdkDocsPath = isZh ? "/zh/ui-sdk-docs" : "/en/ui-sdk-docs";
  const paymentsPath = isZh ? "/zh/payments" : "/en/payments";
  const communityPath = isZh ? "/zh/community" : "/community";
  const faqPath = isZh ? "/zh/community/faq" : "/community/faq";
  const roadmapPath = isZh ? "/zh/community/roadmap" : "/community/roadmap";

  const productGroup: NavGroup = {
    label: t("nav.product"),
    activePaths: [productPath, featuresPath],
    items: [
      { label: t("nav.productOverview"), description: isZh ? "完整产品矩阵" : "Full product index", path: productPath, icon: IconLayoutDashboard },
      { label: t("nav.productSdk"), description: isZh ? "City SDK" : "City SDK", path: productPath, icon: IconServer },
      { label: t("nav.productAgentSdk"), description: isZh ? "Agent SDK" : "Agent SDK", path: productPath, icon: IconRobot },
      { label: t("nav.productUiSdk"), description: isZh ? "UI SDK" : "UI SDK", path: productPath, icon: IconLayoutDashboard },
      { label: t("nav.features"), description: isZh ? "核心能力一览" : "Core capabilities", path: featuresPath, icon: IconLayoutDashboard },
    ],
  };

  const docsGroup: NavGroup = {
    label: t("nav.docs"),
    activePaths: [docsPath, citySdkDocsPath, agentSdkDocsPath, pluginsDocsPath, uiSdkDocsPath, paymentsPath],
    items: [
      { label: "Downcity Docs", description: isZh ? "核心文档" : "Core docs", path: docsPath, icon: IconBook },
      { label: "City SDK", description: isZh ? "City SDK 文档" : "City SDK docs", path: citySdkDocsPath, icon: IconServer },
      { label: "Agent SDK", description: isZh ? "Agent SDK 文档" : "Agent SDK docs", path: agentSdkDocsPath, icon: IconRobot },
      { label: "Plugins", description: isZh ? "Plugins 文档" : "Plugins docs", path: pluginsDocsPath, icon: IconPuzzle },
      { label: "UI SDK", description: isZh ? "UI SDK 文档" : "UI SDK docs", path: uiSdkDocsPath, icon: IconLayoutDashboard },
      { label: "Services", description: isZh ? "Services 文档" : "Services docs", path: paymentsPath, icon: IconLayoutDashboard },
    ],
  };

  const communityGroup: NavGroup = {
    label: t("nav.community"),
    activePaths: [communityPath],
    items: [
      { label: t("nav.faq"), description: isZh ? "常见问题" : "Frequently asked questions", path: faqPath, icon: IconBook },
      { label: t("nav.roadmap"), description: isZh ? "产品路线图" : "Product roadmap", path: roadmapPath, icon: IconBook },
      { label: "GitHub", description: isZh ? "源码与 Issues" : "Source & issues", href: GITHUB_URL, external: true, icon: IconBrandGithub },
      { label: "X", description: isZh ? "官方账号" : "Official account", href: TWITTER_URL, external: true, icon: IconBrandX },
    ],
  };

  const groups = [productGroup, docsGroup, communityGroup] as const;

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);
  const isAnyActive = (paths: readonly string[]) => paths.some((path) => isActive(path));

  const linkBaseClass =
    "inline-flex h-8 items-center rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors";
  const linkInactiveClass = "text-text-soft hover:bg-foreground/[0.04] hover:text-foreground";
  const linkActiveClass = "bg-foreground/[0.04] text-foreground";

  const iconButtonClass =
    "inline-flex size-8 items-center justify-center rounded-md text-text-soft transition-colors hover:bg-foreground/[0.04] hover:text-foreground";

  const dropdownContentClass =
    "rounded-[18px] border border-line bg-surface-overlay p-1.5 backdrop-blur-xl";
  const dropdownItemClass =
    "group relative flex items-start gap-3 rounded-lg px-3 py-2.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-foreground/[0.04] focus:bg-foreground/[0.04] data-[highlighted]:bg-foreground/[0.04] outline-none";
  const menuSelectItemClass =
    "flex h-9 items-center justify-between rounded-lg px-2.5 text-[0.8125rem] font-medium text-text-soft transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus:bg-foreground/[0.04] focus:text-foreground";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-line/60 bg-background/[0.86] backdrop-blur-[16px]">
      <div className="mx-auto flex h-[60px] max-w-[1320px] items-center justify-between gap-4 px-5 md:px-8 lg:px-20">
        <Link to={homePath} className="inline-flex items-center gap-2.5 text-[0.9375rem] font-semibold text-foreground">
          <img src="/icon.svg" alt="Downcity" className="brand-logo block h-6 w-6 shrink-0 object-contain" />
          <span>Downcity</span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {groups.map((group) => {
            const active = isAnyActive(group.activePaths);
            return (
              <DropdownMenu key={group.label}>
                <DropdownMenuTrigger
                  className={cn(
                    "group inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[0.8125rem] font-medium outline-none transition-colors",
                    active ? "bg-foreground/[0.04] text-foreground" : "text-text-soft hover:bg-foreground/[0.04] hover:text-foreground"
                  )}
                >
                  <span>{group.label}</span>
                  <IconChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={8}
                  className={cn(dropdownContentClass, group.items.length > 4 ? "w-[22rem]" : "w-[18rem]")}
                >
                  <DropdownMenuGroup className="grid gap-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isExternal = "external" in item;
                      return "path" in item ? (
                        <DropdownMenuItem
                          key={item.path}
                          className={dropdownItemClass}
                          render={(itemProps: React.ComponentPropsWithoutRef<"a">) => (
                            <Link {...itemProps} to={item.path} className={cn("flex items-start gap-3", itemProps.className)}>
                              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-foreground">
                                <Icon className="size-4" strokeWidth={1.5} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[0.8125rem] font-semibold text-foreground">{item.label}</span>
                                  {isExternal && <IconArrowUpRight className="size-3.5 text-text-subtle" />}
                                </div>
                                <p className="mt-1 text-[0.75rem] leading-[1.45] text-text-soft group-focus:text-text-soft! group-data-[highlighted]:text-text-soft!">{item.description}</p>
                              </div>
                            </Link>
                          )}
                        />
                      ) : (
                        <DropdownMenuItem
                          key={item.href}
                          className={dropdownItemClass}
                          render={(itemProps: React.ComponentPropsWithoutRef<"a">) => (
                            <a {...itemProps} href={item.href} target="_blank" rel="noreferrer" className={cn("flex items-start gap-3", itemProps.className)}>
                              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-foreground">
                                <Icon className="size-4" strokeWidth={1.5} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[0.8125rem] font-semibold text-foreground">{item.label}</span>
                                  <IconArrowUpRight className="size-3.5 text-text-subtle" />
                                </div>
                                <p className="mt-1 text-[0.75rem] leading-[1.45] text-text-soft group-focus:text-text-soft! group-data-[highlighted]:text-text-soft!">{item.description}</p>
                              </div>
                            </a>
                          )}
                        />
                      );
                    })}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(linkBaseClass, linkInactiveClass, "gap-1.5")}
          >
            <IconBrandGithub className="size-4" />
            <span>GitHub</span>
          </a>
        </nav>

        <div className="hidden items-center gap-0.5 lg:flex">
          <a href={TWITTER_URL} target="_blank" rel="noreferrer" aria-label="X" title="X" className={iconButtonClass}>
            <IconBrandX className="size-4" />
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="GitHub" title="GitHub" className={iconButtonClass}>
            <IconBrandGithub className="size-4" />
          </a>
          <ThemeSwitcher is_zh={isZh} button_class={iconButtonClass} dropdown_content_class={dropdownContentClass} dropdown_item_class={menuSelectItemClass} />
          <LanguageSwitcher is_zh={isZh} button_class={iconButtonClass} dropdown_content_class={dropdownContentClass} dropdown_item_class={menuSelectItemClass} />
        </div>

        <div className="flex items-center justify-end lg:hidden">
          <MobileMenu
            is_zh={isZh}
            groups={groups}
            github_url={GITHUB_URL}
            twitter_url={TWITTER_URL}
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
  groups,
  github_url,
  twitter_url,
  icon_button_class,
  dropdown_content_class,
  dropdown_item_class,
  menu_select_item_class,
}: {
  is_zh: boolean;
  groups: readonly NavGroup[];
  github_url: string;
  twitter_url: string;
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
        {groups.map((group) => (
          <DropdownMenuGroup key={group.label}>
            <DropdownMenuLabel className="px-3 pb-1 pt-2 text-[0.65rem] uppercase tracking-[0.1em] text-text-soft">
              {group.label}
            </DropdownMenuLabel>
            {group.items.map((item) =>
              "path" in item ? (
                <DropdownMenuItem
                  key={item.path}
                  className={dropdown_item_class}
                  render={(itemProps: React.ComponentPropsWithoutRef<"a">) => (
                    <Link {...itemProps} to={item.path}>{item.label}</Link>
                  )}
                />
              ) : (
                <DropdownMenuItem
                  key={item.href}
                  className={dropdown_item_class}
                  render={(itemProps: React.ComponentPropsWithoutRef<"a">) => (
                    <a {...itemProps} href={item.href} target="_blank" rel="noreferrer" className={cn("flex items-center justify-between gap-2", itemProps.className)}>
                      <span>{item.label}</span>
                      <IconArrowUpRight className="size-3 text-text-subtle" />
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
            {is_zh ? "链接" : "Links"}
          </DropdownMenuLabel>
          <DropdownMenuItem
            className={dropdown_item_class}
            render={(itemProps: React.ComponentPropsWithoutRef<"a">) => (
              <a {...itemProps} href={github_url} target="_blank" rel="noreferrer">GitHub</a>
            )}
          />
          <DropdownMenuItem
            className={dropdown_item_class}
            render={(itemProps: React.ComponentPropsWithoutRef<"a">) => (
              <a {...itemProps} href={twitter_url} target="_blank" rel="noreferrer">X</a>
            )}
          />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
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

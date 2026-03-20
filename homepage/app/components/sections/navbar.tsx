"use client";

import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import {
  IconArrowUpRight,
  IconBrandGithub,
  IconBrandX,
  IconCheck,
  IconChevronDown,
  IconLanguage,
  IconMenu2,
} from "@tabler/icons-react";
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
  const productBasePath = isZh ? "/zh/product" : "/product";
  const communityBasePath = isZh ? "/zh/community" : "/community";
  const whitepaperPath = isZh ? "/zh/whitepaper" : "/whitepaper";
  const featuresPath = isZh ? "/zh/features" : "/features";
  const resourcesBasePath = isZh ? "/zh/resources" : "/resources";
  const productConsoleUiPath = isZh ? "/zh/product/console-ui" : "/product/console-ui";
  const productChromeExtensionPath = isZh ? "/zh/product/chrome-extension" : "/product/chrome-extension";
  const productSdkPath = isZh ? "/zh/product/sdk" : "/product/sdk";
  const productUiSdkPath = isZh ? "/zh/product/ui-sdk" : "/product/ui-sdk";
  const docsQuickstartPath = isZh ? "/zh/docs/quickstart/getting-started" : "/en/docs/quickstart/getting-started";
  const docsCliPath = isZh ? "/zh/docs/reference/cli" : "/en/docs/reference/cli";
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
      { label: t("nav.productConsoleUi"), description: isZh ? "浏览器里的 Agent 控制台" : "Agent control surface", path: productConsoleUiPath },
      { label: t("nav.productChromeExtension"), description: isZh ? "把网页上下文送入 Agent" : "Send live web context", path: productChromeExtensionPath },
      { label: t("nav.productSdk"), description: isZh ? "把 runtime 接入产品流程" : "Embed runtime flows", path: productSdkPath },
      { label: t("nav.productUiSdk"), description: isZh ? "复用 Downcity 界面语言" : "Reuse the Downcity UI layer", path: productUiSdkPath },
    ],
  } as const;

  const docsGroup = {
    kind: "group",
    label: t("nav.docs"),
    activePaths: [docsPath],
    items: [
      { label: t("nav.docs"), description: isZh ? "完整文档目录" : "Full documentation index", path: docsPath },
      { label: isZh ? "快速开始文档" : "Quick Start Guide", description: isZh ? "从最短路径开始" : "Start with the shortest path", path: docsQuickstartPath },
      { label: "CLI", description: isZh ? "命令入口与参数" : "Command entry points and flags", path: docsCliPath },
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
    "min-w-[18rem] rounded-[20px] border border-[#E7E7EB] bg-[#FAFAFA]/98 p-1.5 shadow-[0_10px_26px_rgba(24,24,27,0.045)] backdrop-blur-xl";
  const dropdownItemClass =
    "min-h-10 rounded-[12px] px-3 py-2 text-[0.92rem] font-medium text-[#18181B] transition-colors focus:bg-[#F1F1F3] focus:text-[#18181B]";
  const desktopNavItemClass =
    "inline-flex h-10 items-center gap-1.5 rounded-[12px] px-4 text-[0.78rem] font-medium tracking-[0.08em] text-[#5F6672] transition-colors";
  const desktopNavItemInactiveClass = "hover:bg-[#F1F1F3] hover:text-[#18181B]";
  const desktopNavItemActiveClass = "bg-[#F1F1F3] text-[#18181B]";
  const popoverContentClass =
    "w-[18.75rem] rounded-[20px] border border-[#E7E7EB] bg-[#FAFAFA]/98 p-2 shadow-[0_10px_26px_rgba(24,24,27,0.045)] backdrop-blur-xl";
  const popoverItemClass =
    "grid gap-1 rounded-[12px] px-3 py-3 transition-colors hover:bg-[#F1F1F3]";
  const utilityButtonClass =
    "inline-flex size-9 items-center justify-center rounded-[11px] text-[#5F6672] transition-colors hover:bg-[#F1F1F3] hover:text-[#18181B]";
  const languageButtonClass =
    "inline-flex size-9 items-center justify-center rounded-[11px] text-[#5F6672] transition-colors hover:bg-[#F1F1F3] hover:text-[#18181B]";
  const languageDropdownItemClass =
    "flex min-h-10 items-center justify-between rounded-[12px] px-3 py-2 text-[0.92rem] font-medium text-[#18181B] transition-colors focus:bg-[#F1F1F3] focus:text-[#18181B]";

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const isAnyActive = (paths: readonly string[]) => paths.some((path) => isActive(path));

  const renderNavGroup = (group: (typeof groupedLinks)[number]) => {
    const active = isAnyActive(group.activePaths);

    return (
      <Popover key={group.label}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              desktopNavItemClass,
              active ? desktopNavItemActiveClass : desktopNavItemInactiveClass,
            )}
          >
            <span>{group.label}</span>
            <IconChevronDown className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={10} className={popoverContentClass}>
          <div className="space-y-1">
            {group.items.map((item) =>
              "path" in item ? (
                <Link key={item.path} to={item.path} className={popoverItemClass}>
                  <span className="text-[0.94rem] font-medium text-[#18181B]">{item.label}</span>
                  <span className="text-[0.78rem] leading-5 text-[#71717A]">{item.description}</span>
                </Link>
              ) : (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className={popoverItemClass}
                >
                  <span className="flex items-center gap-1.5 text-[0.94rem] font-medium text-[#18181B]">
                    <span>{item.label}</span>
                    <IconArrowUpRight className="size-3.5 text-[#71717A]" />
                  </span>
                  <span className="text-[0.78rem] leading-5 text-[#71717A]">{item.description}</span>
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
        <Link to={homePath} className="flex h-10 w-10 items-center justify-center rounded-[12px]">
          <img src="/icon-192.png" alt="Downcity" className="block h-7 w-7 shrink-0 object-contain opacity-95" />
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
                <DropdownMenuLabel className="px-3 py-2 text-[0.62rem] uppercase tracking-[0.18em] text-[#71717A]">
                  {isZh ? "语言" : "Language"}
                </DropdownMenuLabel>
                <DropdownMenuItem className={languageDropdownItemClass} onClick={() => setLang("en")}>
                  <span>English</span>
                  {!isZh ? <IconCheck className="size-4 text-[#71717A]" /> : <span className="size-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem className={languageDropdownItemClass} onClick={() => setLang("zh")}>
                  <span>中文</span>
                  {isZh ? <IconCheck className="size-4 text-[#71717A]" /> : <span className="size-4" />}
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
              <DropdownMenuLabel className="px-3 py-2 text-[0.62rem] uppercase tracking-[0.18em] text-[#71717A]">
                Downcity
              </DropdownMenuLabel>
              {groupedLinks.map((group) => (
                <div key={group.label}>
                  <DropdownMenuLabel className="px-3 pb-1 pt-2 text-[0.62rem] uppercase tracking-[0.14em] text-[#71717A]">
                    {group.label}
                  </DropdownMenuLabel>
                  {group.items.map((item) =>
                    "path" in item ? (
                      <DropdownMenuItem key={item.path} className={dropdownItemClass} asChild>
                        <Link to={item.path}>{item.label}</Link>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem key={item.href} className={dropdownItemClass} asChild>
                        <a href={item.href} target="_blank" rel="noreferrer">
                          <span className="flex items-center gap-1.5">
                            <span>{item.label}</span>
                            <IconArrowUpRight className="size-3.5 text-[#71717A]" />
                          </span>
                        </a>
                      </DropdownMenuItem>
                    ),
                  )}
                  <DropdownMenuSeparator />
                </div>
              ))}
              <DropdownMenuLabel className="px-3 pb-1 pt-2 text-[0.62rem] uppercase tracking-[0.14em] text-[#71717A]">
                {isZh ? "直达" : "Direct"}
              </DropdownMenuLabel>
              {directLinks.map((item) => (
                <DropdownMenuItem key={item.path} className={dropdownItemClass} asChild>
                  <Link to={item.path}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className={dropdownItemClass} asChild>
                <a href={twitterUrl} target="_blank" rel="noreferrer">
                  X
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem className={dropdownItemClass} asChild>
                <a href={githubUrl} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem className={dropdownItemClass} onClick={() => setLang(isZh ? "en" : "zh")}>
                {isZh ? "Switch to English" : "切换到中文"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

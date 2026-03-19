"use client";

import { Link, useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  IconBrandGithub,
  IconBrandX,
  IconChevronDown,
  IconLanguage,
  IconMenu2,
} from "@tabler/icons-react";
import { setLang } from "@/lib/locales";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * 全站统一导航模块。
 * 说明：
 * 1. 宽度与首页主内容对齐（max-w-6xl）。
 * 2. 采用 console-ui 风格的细边框与低对比背景。
 * 3. 提供白皮书独立入口，保证首页与长文内容分层清晰。
 */
export function Navbar() {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isZh = i18n.language === "zh";

  const homePath = isZh ? "/zh" : "/";
  const startPath = isZh ? "/zh/start" : "/start";
  const whitepaperPath = isZh ? "/zh/whitepaper" : "/whitepaper";
  const docsPath = isZh ? "/zh/docs" : "/en/docs";
  const featuresPath = isZh ? "/zh/features" : "/features";
  const productBasePath = isZh ? "/zh/product" : "/product";
  const resourcesBasePath = isZh ? "/zh/resources" : "/resources";
  const resourcesPath = `${resourcesBasePath}/skills`;
  const communityPath = isZh ? "/zh/community" : "/community";
  const isHomeActive = location.pathname === homePath;
  const isStartActive = location.pathname === startPath;
  const isWhitepaperActive = location.pathname === whitepaperPath;

  const navItemClass = cn(
    buttonVariants({ variant: "ghost", size: "sm" }),
    "h-9 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-muted/65 hover:text-foreground",
  );

  const iconButtonClass = cn(
    buttonVariants({ variant: "ghost", size: "icon" }),
    "size-9 rounded-md text-muted-foreground hover:bg-muted/65 hover:text-foreground",
  );
  const homeItemClass = cn(
    navItemClass,
    isHomeActive ? "border border-border bg-background text-foreground" : undefined,
  );
  const quickStartClass = cn(
    navItemClass,
    isStartActive ? "border border-border bg-background text-foreground" : undefined,
  );
  const whitepaperClass = cn(
    navItemClass,
    isWhitepaperActive ? "border border-border bg-background text-foreground" : undefined,
  );
  const dropdownContentClass = "w-52 p-1.5 border-border/80 bg-card";
  const dropdownItemClass = "min-h-10 px-3 py-2 text-sm";

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
        <div className="flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <nav className="hidden items-center gap-0.5 sm:flex">
              <Link to={homePath} className={homeItemClass}>
                {t("nav.home")}
              </Link>
              <Link to={startPath} className={quickStartClass}>
                {t("nav.quickStart")}
              </Link>
              <Link to={whitepaperPath} className={whitepaperClass}>
                {t("nav.whitepaper")}
              </Link>
              <Link to={featuresPath} className={navItemClass}>
                {t("nav.features")}
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger className={cn(navItemClass, "gap-1")}>
                  {t("nav.product")}
                  <IconChevronDown className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className={dropdownContentClass}>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(productBasePath)}
                  >
                    {t("nav.productOverview")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(`${productBasePath}/console-ui`)}
                  >
                    {t("nav.productConsoleUi")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(`${productBasePath}/chrome-extension`)}
                  >
                    {t("nav.productChromeExtension")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(`${productBasePath}/sdk`)}
                  >
                    {t("nav.productSdk")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(`${productBasePath}/ui-sdk`)}
                  >
                    {t("nav.productUiSdk")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Link to={docsPath} className={navItemClass}>
                {t("nav.docs")}
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger className={cn(navItemClass, "gap-1")}>
                  {t("nav.resources")}
                  <IconChevronDown className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className={dropdownContentClass}>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(`${resourcesBasePath}/skills`)}
                  >
                    {t("nav.skills")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(`${resourcesBasePath}/marketplace`)}
                  >
                    {t("nav.agentMarketplace")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(`${resourcesBasePath}/hosting`)}
                  >
                    {t("nav.hosting")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger className={cn(navItemClass, "gap-1")}>
                  {t("nav.community")}
                  <IconChevronDown className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className={dropdownContentClass}>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(communityPath)}
                  >
                    {t("nav.joinCommunity")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(`${communityPath}/faq`)}
                  >
                    {t("nav.faq")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(`${communityPath}/roadmap`)}
                  >
                    {t("nav.roadmap")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => window.open("https://t.me/+iozIHyXr-BJhNjE1", "_blank")}
                  >
                    {t("nav.discussions")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>

          <div className="inline-flex shrink-0 items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={isZh ? "菜单" : "Menu"}
                title={isZh ? "菜单" : "Menu"}
                className={cn(iconButtonClass, "sm:hidden")}
              >
                <IconMenu2 className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={cn(dropdownContentClass, "sm:hidden")}
              >
                <DropdownMenuItem
                  className={dropdownItemClass}
                  onClick={() => navigate(homePath)}
                >
                  {t("nav.home")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={dropdownItemClass}
                  onClick={() => navigate(startPath)}
                >
                  {t("nav.quickStart")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={dropdownItemClass}
                  onClick={() => navigate(whitepaperPath)}
                >
                  {t("nav.whitepaper")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={dropdownItemClass}
                  onClick={() => navigate(featuresPath)}
                >
                  {t("nav.features")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={dropdownItemClass}
                  onClick={() => navigate(productBasePath)}
                >
                  {t("nav.product")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={dropdownItemClass}
                  onClick={() => navigate(`${productBasePath}/console-ui`)}
                >
                  {t("nav.productConsoleUi")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={dropdownItemClass}
                  onClick={() => navigate(`${productBasePath}/chrome-extension`)}
                >
                  {t("nav.productChromeExtension")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={dropdownItemClass}
                  onClick={() => navigate(`${productBasePath}/sdk`)}
                >
                  {t("nav.productSdk")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={dropdownItemClass}
                  onClick={() => navigate(`${productBasePath}/ui-sdk`)}
                >
                  {t("nav.productUiSdk")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={dropdownItemClass}
                  onClick={() => navigate(docsPath)}
                >
                  {t("nav.docs")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={dropdownItemClass}
                  onClick={() => navigate(resourcesPath)}
                >
                  {t("nav.resources")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={dropdownItemClass}
                  onClick={() => navigate(communityPath)}
                >
                  {t("nav.community")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <a
              href="https://x.com/downcity"
              target="_blank"
              rel="noreferrer"
              aria-label="X"
              title="X"
              className={iconButtonClass}
            >
              <IconBrandX className="size-4" />
            </a>

            <a
              href="https://github.com/wangenius/downcity"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              title="GitHub"
              className={iconButtonClass}
            >
              <IconBrandGithub className="size-4" />
            </a>

            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={isZh ? "切换语言" : "Switch language"}
                title={isZh ? "切换语言" : "Switch language"}
                className={iconButtonClass}
              >
                <IconLanguage className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32 p-1.5">
                <DropdownMenuItem className={dropdownItemClass} onClick={() => setLang("en")}>
                  EN
                </DropdownMenuItem>
                <DropdownMenuItem className={dropdownItemClass} onClick={() => setLang("zh")}>
                  中文
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}

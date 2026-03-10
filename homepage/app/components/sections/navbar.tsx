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
 * 全站统一极简 Header。
 * 说明：
 * 1. 宽度与 home 主内容对齐（max-w-4xl）。
 * 2. 保留必要入口，并通过下拉收敛次级导航。
 * 3. 顶部只保留一个 Header，避免重复导航。
 */
export function Navbar() {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isZh = i18n.language === "zh";

  const homePath = isZh ? "/zh" : "/";
  const startPath = isZh ? "/zh/start" : "/start";
  const docsPath = isZh ? "/zh/docs" : "/en/docs";
  const featuresPath = isZh ? "/zh/features" : "/features";
  const resourcesPath = isZh ? "/zh/resources" : "/resources";
  const communityPath = isZh ? "/zh/community" : "/community";
  const isHomeActive = location.pathname === homePath;
  const isStartActive = location.pathname === startPath;

  const navItemClass = cn(
    buttonVariants({ variant: "ghost", size: "sm" }),
    "h-10 px-3 text-sm text-muted-foreground hover:text-foreground",
  );

  const iconButtonClass = cn(
    buttonVariants({ variant: "ghost", size: "icon" }),
    "size-10 text-muted-foreground hover:text-foreground",
  );
  const homeItemClass = cn(
    navItemClass,
    isHomeActive ? "text-foreground bg-muted/60" : undefined,
  );
  const quickStartClass = cn(
    navItemClass,
    isStartActive ? "text-foreground bg-muted/60" : undefined,
  );
  const dropdownContentClass = "w-52 p-1.5";
  const dropdownItemClass = "min-h-10 px-3 py-2 text-sm";

  return (
    <header className="sticky top-0 z-50 px-4 md:px-6">
      <div className="mx-auto w-full max-w-4xl bg-background/92 px-2 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <nav className="hidden items-center gap-0.5 sm:flex">
              <Link to={homePath} className={homeItemClass}>
                {t("nav.home")}
              </Link>
              <Link to={startPath} className={quickStartClass}>
                {t("nav.quickStart")}
              </Link>
              <Link to={docsPath} className={navItemClass}>
                {t("nav.docs")}
              </Link>
              <Link to={featuresPath} className={navItemClass}>
                {t("nav.features")}
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger className={cn(navItemClass, "gap-1")}>
                  {t("nav.resources")}
                  <IconChevronDown className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className={dropdownContentClass}>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(resourcesPath)}
                  >
                    {t("nav.viewAllResources")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(`${resourcesPath}/skills`)}
                  >
                    {t("nav.skillsAndMcp")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(`${resourcesPath}/marketplace`)}
                  >
                    {t("nav.agentMarketplace")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={dropdownItemClass}
                    onClick={() => navigate(`${resourcesPath}/hosting`)}
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
                  onClick={() => navigate(docsPath)}
                >
                  {t("nav.docs")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={dropdownItemClass}
                  onClick={() => navigate(featuresPath)}
                >
                  {t("nav.features")}
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
              href="https://x.com/shipmyagent"
              target="_blank"
              rel="noreferrer"
              aria-label="X"
              title="X"
              className={iconButtonClass}
            >
              <IconBrandX className="size-4" />
            </a>

            <a
              href="https://github.com/wangenius/shipmyagent"
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

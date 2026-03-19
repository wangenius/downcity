"use client";

import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { IconBrandGithub, IconBrandX, IconMenu2 } from "@tabler/icons-react";
import { setLang } from "@/lib/locales";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { marketingTheme } from "@/lib/marketing-theme";

/**
 * 全站导航模块。
 * 说明：
 * 1. Header 保持克制，但恢复完整主导航，确保关键信息架构可见。
 * 2. 页眉分隔线使用更轻的 hairline，避免出现过重的底边框感。
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
  const twitterUrl = "https://x.com/downcity_ai";
  const githubUrl = "https://github.com/wangenius/downcity";

  const desktopLinks = [
    { label: t("nav.product"), path: productBasePath },
    { label: t("nav.quickStart"), path: startPath },
    { label: t("nav.docs"), path: docsPath },
    { label: t("nav.whitepaper"), path: whitepaperPath },
    { label: t("nav.features"), path: featuresPath },
    { label: t("nav.resources"), path: resourcesBasePath },
    { label: t("nav.community"), path: communityBasePath },
  ] as const;

  const compactLinks = [
    { label: t("nav.product"), path: productBasePath },
    { label: t("nav.quickStart"), path: startPath },
    { label: t("nav.docs"), path: docsPath },
  ] as const;

  const menuLinks = [
    ...desktopLinks,
  ] as const;

  const dropdownContentClass = `${marketingTheme.panelSoft} min-w-72 p-1.5`;
  const dropdownItemClass =
    "min-h-10 rounded-none px-3 py-2 text-sm text-[#111113] transition-colors focus:bg-[#F5F5F6] focus:text-[#111113]";

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <header className="sticky top-0 z-50 bg-[#FCFCFD]/90 backdrop-blur-sm">
      <div className="mx-auto flex min-h-[60px] max-w-7xl items-center justify-between gap-4 px-3 md:px-5">
        <Link to={homePath} className="flex min-w-0 items-center gap-3">
          <img src="/icon-192.png" alt="Downcity" className="block h-7 w-7 shrink-0 object-contain opacity-95" />
          <span
            className="truncate text-[1rem] leading-none tracking-[-0.045em] text-[#111113]"
            style={{ fontFamily: "Fraunces, serif", fontWeight: 900 }}
          >
            Downcity
          </span>
        </Link>

        <nav className="hidden items-center gap-4 xl:flex">
          {desktopLinks.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`inline-flex items-center py-1 text-[0.61rem] uppercase tracking-[0.22em] transition-colors ${
                isActive(item.path) ? "text-[#111113]" : "text-[#6B7280] hover:text-[#111113]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <nav className="hidden items-center gap-5 lg:flex xl:hidden">
          {compactLinks.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`inline-flex items-center py-1 text-[0.61rem] uppercase tracking-[0.22em] transition-colors ${
                isActive(item.path) ? "text-[#111113]" : "text-[#6B7280] hover:text-[#111113]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <a
            href={twitterUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Twitter"
            title="Twitter"
            className="inline-flex items-center gap-1.5 py-1 text-[0.61rem] uppercase tracking-[0.22em] text-[#6B7280] transition-colors hover:text-[#111113]"
          >
            <IconBrandX className="size-3.5" />
            Twitter
          </a>
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            title="GitHub"
            className="inline-flex items-center gap-1.5 py-1 text-[0.61rem] uppercase tracking-[0.22em] text-[#6B7280] transition-colors hover:text-[#111113]"
          >
            <IconBrandGithub className="size-3.5" />
            GitHub
          </a>
          <button
            type="button"
            onClick={() => setLang(isZh ? "en" : "zh")}
            className="inline-flex items-center py-1 text-[0.61rem] uppercase tracking-[0.22em] text-[#6B7280] transition-colors hover:text-[#111113]"
          >
            {isZh ? "EN" : "中文"}
          </button>
        </div>

        <div className="flex items-center justify-end lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={isZh ? "菜单" : "Menu"}
              title={isZh ? "菜单" : "Menu"}
              className="inline-flex h-9 w-9 items-center justify-center text-[#6B7280] transition-colors hover:text-[#111113]"
            >
              <IconMenu2 className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={dropdownContentClass}>
              <DropdownMenuLabel className="px-3 py-2 text-[0.58rem] uppercase tracking-[0.24em] text-[#6B7280]">
                Downcity
              </DropdownMenuLabel>
              {menuLinks.map((item) => (
                <DropdownMenuItem key={item.path} className={dropdownItemClass} asChild>
                  <Link to={item.path}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className={dropdownItemClass} asChild>
                <a href={twitterUrl} target="_blank" rel="noreferrer">
                  X / Twitter
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
      <div className="mx-auto h-px max-w-7xl bg-black/6" />
    </header>
  );
}

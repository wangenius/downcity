/**
 * 文档布局路由模块。
 * 说明：
 * 1. 文档页使用 Fumadocs 自身导航结构，并与主站统一为纯 Logo 品牌露出。
 * 2. 这里负责根据 URL 切换语言树，不再输出额外品牌文字。
 */
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useEffect } from "react";
import type { Route } from "./+types/layout";
import type { Root as PageTreeRoot } from "fumadocs-core/page-tree";
import { i18n } from "@/lib/i18n";
import i18next from "@/lib/locales";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const lang =
    url.pathname.startsWith("/zh/") || url.pathname === "/zh" ? "zh" : "en";

  return {
    tree: source.pageTree[lang],
    lang,
  };
}

export default function Layout({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = loaderData;

  useEffect(() => {
    if (typeof window !== "undefined") {
      // On first load, check localStorage for saved language preference
      const savedLang = localStorage.getItem("downcity-lang") as "en" | "zh" | null;
      if (savedLang && i18next.language !== savedLang) {
        i18next.changeLanguage(savedLang);
      } else if (i18next.language !== lang) {
        // Sync with URL path and save to localStorage
        i18next.changeLanguage(lang);
        localStorage.setItem("downcity-lang", lang);
      }
    }

    // Redirect from old /docs/ to new /en/docs/
    if (location.pathname === "/docs" || location.pathname === "/docs/") {
      navigate("/en/docs", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DocsLayout
      key={`${lang}:${location.pathname}`}
      tree={loaderData.tree as PageTreeRoot}
      nav={{
        title: (
          <div className="flex h-10 w-10 items-center justify-center">
            <img
              src="/icon-192.png"
              width={32}
              height={32}
              alt="Downcity"
              className="h-8 w-8 object-contain"
            />
          </div>
        ),
      }}
      sidebar={{
        defaultOpenLevel: 0,
      }}
      i18n={i18n}
    >
      <Outlet />
    </DocsLayout>
  );
}

/**
 * UI SDK 文档布局路由模块。
 * 说明：
 * 1. `ui-sdk-docs` 与 `docs`、`devdocs` 平级存在，单独承载 UI SDK 开发文档。
 * 2. 顶部品牌样式对齐 `docs`，保持纯 Logo 露出，不额外显示文档系统名称。
 */
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { uiSdkDocsSource } from "@/lib/ui-sdk-docs-source";
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
    tree: uiSdkDocsSource.pageTree[lang],
    lang,
  };
}

export default function Layout({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = loaderData;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedLang = localStorage.getItem("downcity-lang") as "en" | "zh" | null;
      if (savedLang && i18next.language !== savedLang) {
        i18next.changeLanguage(savedLang);
      } else if (i18next.language !== lang) {
        i18next.changeLanguage(lang);
        localStorage.setItem("downcity-lang", lang);
      }
    }

    if (location.pathname === "/ui-sdk-docs" || location.pathname === "/ui-sdk-docs/") {
      navigate("/en/ui-sdk-docs", { replace: true });
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

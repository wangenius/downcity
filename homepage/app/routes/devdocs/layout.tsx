/**
 * 开发者文档布局路由模块。
 * 说明：
 * 1. `devdocs` 与用户文档平行存在，但使用独立 source 树。
 * 2. 顶部品牌保持一致，避免开发文档成为第二套站点。
 */
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { devSource } from "@/lib/dev-source";
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
    tree: devSource.pageTree[lang],
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

    if (location.pathname === "/devdocs" || location.pathname === "/devdocs/") {
      navigate("/en/devdocs", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DocsLayout
      key={`${lang}:${location.pathname}`}
      tree={loaderData.tree as PageTreeRoot}
      nav={{
        title: (
          <div className="flex h-10 items-center gap-3">
            <img
              src="/icon-192.png"
              width={32}
              height={32}
              alt="Downcity"
              className="h-8 w-8 object-contain"
            />
            <span className="text-sm font-medium tracking-[-0.02em] text-foreground">
              Devdocs
            </span>
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

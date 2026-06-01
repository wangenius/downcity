/**
 * City Services Docs 文档布局路由模块。
 * 说明：
 * 1. `services-sdk-docs` 与 `city-sdk-docs`、`agent-sdk-docs`、`plugins-docs` 平级存在，单独承载 City Services Docs 文档。
 * 2. 这里仅负责语言切换与 Fumadocs 布局装配，不承载业务逻辑。
 */
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { servicesSdkDocsSource } from "@/lib/services-sdk-docs-source";
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
    tree: servicesSdkDocsSource.pageTree[lang],
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

    if (location.pathname === "/services-sdk-docs" || location.pathname === "/services-sdk-docs/") {
      navigate("/en/services-sdk-docs", { replace: true });
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
              src="/icon.svg"
              width={32}
              height={32}
              alt="Downcity"
              className="brand-logo h-8 w-8 object-contain"
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

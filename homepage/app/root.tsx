import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import { RootProvider } from "fumadocs-ui/provider/react-router";
import { I18nextProvider } from "react-i18next";
import { defineI18nUI } from "fumadocs-ui/i18n";
import { useEffect, useState } from "react";

import type { Route } from "./+types/root";
import stylesheet from "./app.css?url";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/sections/navbar";
import i18next from "@/lib/locales"; // naming conflict with fumadocs i18n
import { i18n } from "@/lib/i18n";
import { product } from "@/lib/product";

const favicon_version = "20260601";

const { provider } = defineI18nUI(i18n, {
  translations: {
    en: {
      search: "Search",
      toc: "Table of Contents",
      lastUpdate: "Last updated on",
      chooseLanguage: "Choose a language",
      nextPage: "Next",
      previousPage: "Previous",
    },
    zh: {
      search: "搜索文档",
      toc: "目录",
      lastUpdate: "最后更新于",
      chooseLanguage: "选择语言",
      nextPage: "下一页",
      previousPage: "上一页",
    },
  },
});

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  // favicon 使用自包含 SVG 区分明暗色，ico/png 作为旧浏览器兜底。
  { rel: "icon", href: `/favicon.ico?v=${favicon_version}`, type: "image/x-icon" },
  { rel: "shortcut icon", href: `/favicon.ico?v=${favicon_version}`, type: "image/x-icon" },
  { rel: "icon", href: `/favicon-32x32.png?v=${favicon_version}`, type: "image/png", sizes: "32x32" },
  { rel: "icon", href: `/favicon-16x16.png?v=${favicon_version}`, type: "image/png", sizes: "16x16" },
  {
    rel: "icon",
    href: `/favicon.svg?v=${favicon_version}`,
    type: "image/svg+xml",
    sizes: "any",
    media: "(prefers-color-scheme: light)",
  },
  {
    rel: "icon",
    href: `/favicon-dark.svg?v=${favicon_version}`,
    type: "image/svg+xml",
    sizes: "any",
    media: "(prefers-color-scheme: dark)",
  },
  { rel: "apple-touch-icon", href: "/icon-192.png", sizes: "180x180" },
  { rel: "manifest", href: "/site.webmanifest" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Silkscreen:wght@400;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap",
  },
];

export const meta: Route.MetaFunction = ({ location }) => {
  const title = "Downcity - Agent Infrastructure for AI Builders";
  const description =
    "Downcity gives AI builders one reusable runtime for agents, models, tools, tasks, memory, services, permissions, usage, billing, and control surfaces.";
  // X/Twitter、LinkedIn、Discord 等抓取 Open Graph 图片时必须使用绝对 URL。
  const site_origin = product.homepage ?? "https://www.downcity.ai";
  const canonical_url = `${site_origin}${location.pathname}${location.search}`;
  const og_image = `${site_origin}/icon-512.png`;

  return [
    { title },
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    {
      name: "description",
      content: description,
    },
    {
      name: "keywords",
      content:
        "AI agent infrastructure, agent runtime, AI builders, agent products, agent operations, AI workflow automation, developer tools",
    },
    { name: "author", content: "Downcity" },
    // Open Graph / Facebook
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Downcity" },
    {
      property: "og:title",
      content: title,
    },
    {
      property: "og:description",
      content: description,
    },
    { property: "og:image", content: og_image },
    { property: "og:url", content: canonical_url },
    { tagName: "link", rel: "canonical", href: canonical_url },

    // Twitter
    // icon-512.png 为 1:1 正方形，summary 卡片比 summary_large_image 更适合展示 logo。
    { name: "twitter:card", content: "summary" },
    { name: "twitter:site", content: "@downcity_ai" },
    {
      name: "twitter:title",
      content: title,
    },
    {
      name: "twitter:description",
      content: description,
    },
    { name: "twitter:image", content: og_image },

    // Additional SEO
    { name: "robots", content: "index, follow" },
    { name: "googlebot", content: "index, follow" },
    { name: "language", content: "English" },
  ];
};

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const path = location.pathname;

  // 根据路径判断语言前缀；无前缀路径（如 /）将跟随本地语言偏好。
  const pathLang: "en" | "zh" =
    path.includes("/zh/") || path.endsWith("/zh") ? "zh" : "en";
  const hasLangPrefix =
    path === "/zh" ||
    path === "/en" ||
    path.startsWith("/zh/") ||
    path.startsWith("/en/");
  const [lang, setLang] = useState<"en" | "zh">(pathLang);

  // 文档页使用 fumadocs 自身导航，不展示站点全局 Header。
  const isDocsPath =
    path === "/docs" ||
    path === "/city-sdk-docs" ||
    path === "/agent-sdk-docs" ||
    path === "/services-sdk-docs" ||
    path === "/plugins-docs" ||
    path === "/ui-sdk-docs" ||
    path.startsWith("/docs/") ||
    path.startsWith("/city-sdk-docs/") ||
    path.startsWith("/agent-sdk-docs/") ||
    path.startsWith("/services-sdk-docs/") ||
    path.startsWith("/plugins-docs/") ||
    path.startsWith("/ui-sdk-docs/") ||
    path.startsWith("/en/docs") ||
    path.startsWith("/zh/docs") ||
    path.startsWith("/en/city-sdk-docs") ||
    path.startsWith("/zh/city-sdk-docs") ||
    path.startsWith("/en/agent-sdk-docs") ||
    path.startsWith("/zh/agent-sdk-docs") ||
    path.startsWith("/en/services-sdk-docs") ||
    path.startsWith("/zh/services-sdk-docs") ||
    path.startsWith("/en/plugins-docs") ||
    path.startsWith("/zh/plugins-docs") ||
    path.startsWith("/en/ui-sdk-docs") ||
    path.startsWith("/zh/ui-sdk-docs");
  const showGlobalChrome = !isDocsPath;

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    // favicon 跟随实际主题 class，而不是只跟随系统色彩偏好。
    const update_favicon = () => {
      const is_dark = document.documentElement.classList.contains("dark");
      const favicon_href = is_dark
        ? `/favicon-dark.svg?v=${favicon_version}`
        : `/favicon.svg?v=${favicon_version}`;
      let theme_favicon = document.querySelector<HTMLLinkElement>(
        'link[data-theme-favicon="true"]',
      );

      if (!theme_favicon) {
        theme_favicon = document.createElement("link");
        theme_favicon.rel = "icon";
        theme_favicon.type = "image/svg+xml";
        theme_favicon.sizes = "any";
        theme_favicon.dataset.themeFavicon = "true";
        document.head.appendChild(theme_favicon);
      }

      theme_favicon.href = favicon_href;
    };

    update_favicon();

    const observer = new MutationObserver(update_favicon);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // Sync i18n language with localStorage (only on client side)
  useEffect(() => {
    if (typeof window !== "undefined") {
      // 语言优先级：显式路径前缀 > 本地保存偏好 > 路径推导默认值。
      const savedLang = localStorage.getItem("downcity-lang") as "en" | "zh" | null;
      const resolvedLang: "en" | "zh" = hasLangPrefix ? pathLang : (savedLang ?? pathLang);

      if (i18next.language !== resolvedLang) {
        i18next.changeLanguage(resolvedLang);
      }
      localStorage.setItem("downcity-lang", resolvedLang);
      setLang(resolvedLang);

      const handleLanguageChanged = (next: string) => {
        const normalized: "en" | "zh" = next.startsWith("zh") ? "zh" : "en";
        setLang(normalized);
        localStorage.setItem("downcity-lang", normalized);
        document.documentElement.lang = normalized;
      };

      i18next.on("languageChanged", handleLanguageChanged);
      return () => {
        i18next.off("languageChanged", handleLanguageChanged);
      };
    }
    return undefined;
  }, [hasLangPrefix, pathLang]);

  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <I18nextProvider i18n={i18next}>
          <RootProvider i18n={provider(lang)}>
            <div className="relative flex min-h-screen flex-col">
              {showGlobalChrome ? (
                <>
                  <div
                    aria-hidden
                    className="marketing-backdrop-glow pointer-events-none absolute inset-0 -z-20"
                  />
                  <div
                    aria-hidden
                    className="marketing-backdrop-grid pointer-events-none absolute inset-0 -z-10"
                  />
                </>
              ) : null}
              <Toaster theme="system" richColors position="top-center" />
              {showGlobalChrome ? <Navbar /> : null}
              <div className="relative flex-1">{children}</div>
            </div>
          </RootProvider>
        </I18nextProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = i18next.t("errors.oops");
  let details = i18next.t("errors.unexpected");
  let stack: string | undefined;
  const homePath = i18next.language === "zh" ? "/zh" : "/";
  const heading =
    isRouteErrorResponse(error) && error.status === 404
      ? i18next.t("errors.pageNotFound")
      : i18next.t("errors.error");

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : i18next.t("errors.error");
    details =
      error.status === 404
        ? i18next.t("errors.notFoundDetails")
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div
        aria-hidden
        className="marketing-backdrop-glow pointer-events-none absolute inset-0 -z-20"
      />
      <div
        aria-hidden
        className="marketing-backdrop-grid pointer-events-none absolute inset-0 -z-10"
      />
      <main className="flex flex-1 flex-col items-center justify-center p-4 text-center">
        <div className="mx-auto max-w-md space-y-6">
          <h1 className="select-none font-mono text-9xl tracking-[-0.08em] text-foreground/88">
            {message}
          </h1>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-[-0.04em]">
              {heading}
            </h2>
            <p className="text-muted-foreground text-lg">{details}</p>
          </div>
          <div className="pt-4">
            <Link
              to={homePath}
              className="inline-flex min-h-11 items-center gap-2 rounded-[0.38rem] border border-primary bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-88"
            >
              {i18next.t("errors.backToHome")}
            </Link>
          </div>
        </div>

        {stack && (
          <div className="mx-auto mt-12 w-full max-w-4xl overflow-x-auto rounded-[0.48rem] border border-border/80 bg-surface/78 p-4 text-left">
            <pre className="text-xs font-mono text-muted-foreground">
              {stack}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}

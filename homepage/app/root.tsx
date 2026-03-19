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
  { rel: "icon", href: "/icon.png", type: "image/png", sizes: "400x400" },
  { rel: "icon", href: "/icon-192.png", type: "image/png", sizes: "192x192" },
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

export const meta: Route.MetaFunction = () => {
  return [
    { title: "Downcity - The Repo IS The Agent" },
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    {
      name: "description",
      content:
        "Downcity - Deploy your repository directly as a conversational, executable AI Agent. No extra orchestration required—just ship it.",
    },
    {
      name: "keywords",
      content:
        "AI agent, GitHub, repository, automation, developer tools, AI assistant, code automation, repo as agent",
    },
    { name: "author", content: "Downcity" },
    { name: "theme-color", content: "#f5f4ef" },

    // Open Graph / Facebook
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Downcity" },
    {
      property: "og:title",
      content: "Downcity - The Repo IS The Agent",
    },
    {
      property: "og:description",
      content:
        "Deploy your repository directly as a conversational, executable AI Agent. No extra orchestration required—just ship it.",
    },
    { property: "og:image", content: "/icon-512.png" },

    // Twitter
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: "@downcity_ai" },
    {
      name: "twitter:title",
      content: "Downcity - The Repo IS The Agent",
    },
    {
      name: "twitter:description",
      content:
        "Deploy your repository directly as a conversational, executable AI Agent. No extra orchestration required—just ship it.",
    },
    { name: "twitter:image", content: "/icon-512.png" },

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
    path.startsWith("/docs/") ||
    path.startsWith("/en/docs") ||
    path.startsWith("/zh/docs");
  const isHomeLandingPath = path === "/" || path === "/zh";
  const showGlobalChrome = !isDocsPath && !isHomeLandingPath;

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
                    className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(70%_52%_at_50%_20%,rgba(255,255,255,0.5),transparent_56%),linear-gradient(to_bottom,rgba(255,255,255,0.08),transparent_18%)]"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(17,17,17,0.022)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,17,17,0.022)_1px,transparent_1px)] bg-[size:88px_88px] [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]"
                  />
                </>
              ) : null}
              <Toaster theme="light" richColors position="top-center" />
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
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(70%_52%_at_50%_20%,rgba(255,255,255,0.5),transparent_56%),linear-gradient(to_bottom,rgba(255,255,255,0.08),transparent_18%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(17,17,17,0.022)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,17,17,0.022)_1px,transparent_1px)] bg-[size:88px_88px] [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]"
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
              className="inline-flex min-h-11 items-center gap-2 rounded-[0.38rem] border border-black bg-black px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-88"
            >
              {i18next.t("errors.backToHome")}
            </Link>
          </div>
        </div>

        {stack && (
          <div className="mx-auto mt-12 w-full max-w-4xl overflow-x-auto rounded-[0.48rem] border border-black/8 bg-[rgba(245,244,239,0.78)] p-4 text-left">
            <pre className="text-xs font-mono text-muted-foreground">
              {stack}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}

import type { Route } from "./+types/page";
import type { MDXComponents } from "mdx/types";
import type { ComponentType } from "react";
import type { TOCItemType } from "fumadocs-core/toc";
import React from "react";
import { redirect } from "react-router";
import { uiSdkDocsSource } from "@/lib/ui-sdk-docs-source";
import {
  DocsPage,
  DocsBody,
  DocsTitle,
  DocsDescription,
} from "fumadocs-ui/page";
import { getMDXComponents } from "@/components/docs/mdx-components";
import browserCollections from "fumadocs-mdx:collections/browser";

type PageTreeNode = {
  type?: string;
  url?: string;
  children?: PageTreeNode[];
};

/**
 * 递归按侧边栏顺序收集 UI SDK 文档 URL，用于目录页跳转。
 */
function collectPageUrls(node: PageTreeNode | undefined, out: string[]) {
  if (!node) return;
  if (node.type === "page" && typeof node.url === "string") {
    out.push(node.url);
  }
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    collectPageUrls(child, out);
  }
}

/**
 * 当请求的是目录路径时，返回该目录下第一个子文档 URL。
 */
function findFirstChildDocUrl(lang: "en" | "zh", slugs: string[]) {
  if (slugs.length === 0) return undefined;
  const tree = uiSdkDocsSource.getPageTree(lang) as PageTreeNode | undefined;
  if (!tree) return undefined;

  const urls: string[] = [];
  collectPageUrls(tree, urls);

  const prefix = `/${lang}/ui-sdk-docs/${slugs.join("/")}/`;
  return urls.find((item) => item.startsWith(prefix));
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const rawPath = params["*"] ?? "";
  const lang =
    url.pathname.startsWith("/zh/") || url.pathname === "/zh" ? "zh" : "en";

  const slugs = rawPath.split("/").filter((v) => v.length > 0);
  const langIndex = slugs.findIndex((s) => s === "en" || s === "zh");
  const cleanSlugs = langIndex >= 0 ? slugs.slice(langIndex + 1) : slugs;

  const firstChild = findFirstChildDocUrl(lang, cleanSlugs);
  if (firstChild) {
    throw redirect(`${firstChild}${url.search}${url.hash}`, { status: 302 });
  }

  const page = uiSdkDocsSource.getPage(cleanSlugs, lang);
  if (!page) {
    throw new Response("Not found", { status: 404 });
  }

  return {
    path: page.path,
    title: page.data.title ?? "UI SDK Docs",
    description: page.data.description ?? "",
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [];

  const baseUrl = "https://downcity.ai";
  const title = `${loaderData.title} — Downcity UI SDK Docs`;
  const description = loaderData.description || "Downcity UI SDK documentation";
  const url = `${baseUrl}${loaderData.path}`;

  return [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { title },
    {
      name: "description",
      content: description,
    },
    {
      name: "keywords",
      content: "Downcity, UI SDK, ui-sdk-docs, components, tailwind, react",
    },
    {
      property: "og:title",
      content: title,
    },
    {
      property: "og:description",
      content: description,
    },
    {
      property: "og:type",
      content: "website",
    },
    {
      property: "og:url",
      content: url,
    },
    {
      property: "og:image",
      content: `${baseUrl}/og-image.png`,
    },
    {
      property: "og:site_name",
      content: "Downcity",
    },
    {
      name: "twitter:card",
      content: "summary",
    },
    {
      name: "twitter:url",
      content: url,
    },
    {
      name: "twitter:title",
      content: title,
    },
    {
      name: "twitter:description",
      content: description,
    },
    {
      name: "twitter:image",
      content: `${baseUrl}/twitter-image.png`,
    },
    {
      tagName: "link",
      rel: "canonical",
      href: url,
    },
  ];
}

const clientLoader = browserCollections.uiSdkDocs.createClientLoader({
  id: "uiSdkDocs",
  component: ({
    default: Mdx,
    frontmatter,
    toc,
  }: {
    default: ComponentType<{ components?: MDXComponents }>;
    frontmatter: { title?: string; description?: string };
    toc?: TOCItemType[];
  }) => (
    <DocsPage toc={Array.isArray(toc) ? toc : []}>
      <DocsTitle>{frontmatter.title}</DocsTitle>
      <DocsDescription>{frontmatter.description}</DocsDescription>
      <DocsBody>
        <Mdx components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  ),
});

export default function Page({ loaderData }: Route.ComponentProps) {
  const { path } = loaderData;
  const Content: any = clientLoader.getComponent(path);

  return React.createElement(Content);
}

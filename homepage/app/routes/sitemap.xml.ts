import { source } from "@/lib/source";
import { citySdkDocsSource } from "@/lib/city-sdk-docs-source";
import { agentSdkDocsSource } from "@/lib/agent-sdk-docs-source";
import { servicesSdkDocsSource } from "@/lib/services-sdk-docs-source";
import { pluginsDocsSource } from "@/lib/plugins-docs-source";
import { uiSdkDocsSource } from "@/lib/ui-sdk-docs-source";
import { product } from "@/lib/product";

export const loader = async () => {
  const baseUrl = product.homepage || "https://downcity.ai";

  // Get all documentation pages
  const pages = source.getPages();
  const citySdkPages = citySdkDocsSource.getPages();
  const agentSdkPages = agentSdkDocsSource.getPages();
  const servicesSdkPages = servicesSdkDocsSource.getPages();
  const pluginsDocsPages = pluginsDocsSource.getPages();
  const uiSdkPages = uiSdkDocsSource.getPages();

  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date().toISOString(),
      changeFrequency: "daily" as const,
      priority: 1.0,
    },
    {
      url: `${baseUrl}/features`,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/product`,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/product/sdk`,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/product/agent-sdk`,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/product/ui-sdk`,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/whitepaper`,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date().toISOString(),
      changeFrequency: "yearly" as const,
      priority: 0.4,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date().toISOString(),
      changeFrequency: "yearly" as const,
      priority: 0.4,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: new Date().toISOString(),
      changeFrequency: "daily" as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/city-sdk-docs`,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/agent-sdk-docs`,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/services-sdk-docs`,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/plugins-docs`,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/ui-sdk-docs`,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
  ];

  // Add documentation pages
  const docsPages = pages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: new Date().toISOString(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const citySdkDocumentationPages = citySdkPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: new Date().toISOString(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const agentSdkDocumentationPages = agentSdkPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: new Date().toISOString(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const servicesSdkDocumentationPages = servicesSdkPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: new Date().toISOString(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const pluginsDocumentationPages = pluginsDocsPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: new Date().toISOString(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const uiSdkDocumentationPages = uiSdkPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: new Date().toISOString(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const allPages = [
    ...staticPages,
    ...docsPages,
    ...citySdkDocumentationPages,
    ...agentSdkDocumentationPages,
    ...servicesSdkDocumentationPages,
    ...pluginsDocumentationPages,
    ...uiSdkDocumentationPages,
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (page) => `  <url>
    <loc>${page.url}</loc>
    <lastmod>${page.lastModified}</lastmod>
    <changefreq>${page.changeFrequency}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new Response(sitemap, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
};

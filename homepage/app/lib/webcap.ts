/**
 * WebCap：目标网站公开元数据解析工具。
 *
 * 关键说明（中文）
 * - 类似 Twitter / Discord 的 link preview，抓取 title、description、og:image、favicon。
 * - 服务端运行，无 CORS 限制。
 * - 解析失败时返回部分可用字段，不抛异常。
 */

export type WebCapMetadata = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
};

function resolve_url(base: string, relative: string | null): string | null {
  if (!relative) return null;
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}

function parse_metadata(html: string, base_url: string): WebCapMetadata {
  const title_match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = title_match ? title_match[1].trim() : null;

  const meta_regex = /<meta[^>]+(?:name|property)=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
  const meta: Record<string, string> = {};
  let match: RegExpExecArray | null;
  while ((match = meta_regex.exec(html)) !== null) {
    meta[match[1].toLowerCase()] = match[2].trim();
  }

  const description = meta["description"] || meta["og:description"] || meta["twitter:description"] || null;
  const image = resolve_url(base_url, meta["og:image"] || meta["twitter:image"] || null);

  const favicon_match = html.match(/<link[^>]+rel=["'](?:shortcut\s+icon|icon)["'][^>]+href=["']([^"']+)["'][^>]*>/i);
  const favicon = resolve_url(base_url, favicon_match ? favicon_match[1] : "/favicon.ico");

  return {
    url: base_url,
    title,
    description,
    image,
    favicon,
  };
}

/**
 * 抓取并解析目标网站的公开元数据。
 *
 * @param url 目标站点 URL
 * @returns 解析后的元数据
 */
export async function fetch_webcap_metadata(url: string): Promise<WebCapMetadata> {
  const target_url = new URL(url);

  const response = await fetch(target_url.href, {
    headers: {
      "User-Agent": "Downcity-WebCap/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Target returned ${response.status}`);
  }

  const content_type = response.headers.get("content-type") || "";
  if (!content_type.includes("text/html")) {
    throw new Error("Target is not HTML");
  }

  const html = await response.text();
  return parse_metadata(html, target_url.href);
}

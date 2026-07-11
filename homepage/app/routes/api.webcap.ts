import type { LoaderFunctionArgs } from "react-router";
import { fetch_webcap_metadata, type WebCapMetadata } from "@/lib/webcap";

export type { WebCapMetadata };

/**
 * WebCap API：解析目标网站的公开元数据。
 *
 * 关键说明（中文）
 * - 类似 Twitter / Discord 的 link preview，返回目标站点的 title、description、og:image、favicon。
 * - 底层复用 `fetch_webcap_metadata`，供页面 loader 与外部调用共用。
 */

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return Response.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }

  try {
    const metadata = await fetch_webcap_metadata(url);
    return Response.json(metadata);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Fetch failed" },
      { status: 500 }
    );
  }
}

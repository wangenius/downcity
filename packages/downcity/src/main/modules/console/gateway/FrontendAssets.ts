/**
 * Console 前端静态资源服务辅助。
 *
 * 关键点（中文）
 * - 统一处理静态文件 Content-Type 与 SPA fallback。
 * - 不直接依赖网关类，便于后续继续拆分网关入口。
 */

import type { Context } from "hono";
import fs from "fs-extra";
import path from "node:path";

/**
 * 根据路径推断静态资源 MIME。
 */
export function resolveConsoleContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") {
    return "application/javascript; charset=utf-8";
  }
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".webp") return "image/webp";
  if (ext === ".map") return "application/json; charset=utf-8";
  if (ext === ".woff") return "font/woff";
  if (ext === ".woff2") return "font/woff2";
  return "application/octet-stream";
}

/**
 * 返回 Console 前端文件或 SPA fallback。
 */
export async function serveConsoleFrontendPath(params: {
  context: Context;
  publicDir: string;
  requestPath: string;
}): Promise<Response> {
  const cleanPath = params.requestPath === "/" ? "/index.html" : params.requestPath;
  const safePath = cleanPath.startsWith("/") ? cleanPath.slice(1) : cleanPath;
  const candidatePath = path.resolve(params.publicDir, safePath);
  const publicRoot = path.resolve(params.publicDir);
  const isInsidePublic =
    candidatePath === publicRoot ||
    candidatePath.startsWith(`${publicRoot}${path.sep}`);
  if (!isInsidePublic) {
    return params.context.text("Forbidden", 403);
  }

  if (await fs.pathExists(candidatePath)) {
    const stat = await fs.stat(candidatePath);
    if (stat.isFile()) {
      const content = await fs.readFile(candidatePath);
      return params.context.body(content, 200, {
        "Content-Type": resolveConsoleContentType(candidatePath),
        "Cache-Control": safePath.startsWith("assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
    }
  }

  const indexPath = path.join(params.publicDir, "index.html");
  if (!(await fs.pathExists(indexPath))) {
    return params.context.text(
      "Console frontend not found. Build console first.",
      503,
    );
  }
  const html = await fs.readFile(indexPath, "utf-8");
  return params.context.body(html, 200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
}

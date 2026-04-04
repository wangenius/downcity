/**
 * 静态资源路由模块。
 *
 * 职责说明：
 * 1. 提供根目录前端静态文件访问。
 * 2. 提供 `.downcity/public` 的受限文件暴露。
 * 3. 只处理静态资源协议，不承载业务逻辑。
 */

import { Hono } from "hono";
import fs from "fs-extra";
import path from "path";
import { getDowncityPublicDirPath } from "@/city/runtime/env/Paths.js";
import { getAgentState } from "@/city/runtime/agent/AgentState.js";

/**
 * 静态资源路由。
 */
export const staticRouter = new Hono();

staticRouter.get("/", async (c) => {
  const indexPath = path.join(getAgentState().rootPath, "public", "index.html");
  if (await fs.pathExists(indexPath)) {
    const content = await fs.readFile(indexPath, "utf-8");
    return c.body(content, 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
  }
  return c.text("Downcity Agent Server", 200);
});

staticRouter.get("/styles.css", async (c) => {
  const cssPath = path.join(getAgentState().rootPath, "public", "styles.css");
  if (await fs.pathExists(cssPath)) {
    const content = await fs.readFile(cssPath, "utf-8");
    return c.body(content, 200, {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "no-cache",
    });
  }
  return c.text("Not Found", 404);
});

staticRouter.get("/app.js", async (c) => {
  const jsPath = path.join(getAgentState().rootPath, "public", "app.js");
  if (await fs.pathExists(jsPath)) {
    const content = await fs.readFile(jsPath, "utf-8");
    return c.body(content, 200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
    });
  }
  return c.text("Not Found", 404);
});

staticRouter.get("/downcity/public/*", async (c) => {
  const root = getDowncityPublicDirPath(getAgentState().rootPath);
  const prefix = "/downcity/public/";
  const requestPath = c.req.path;
  const rel = requestPath.startsWith(prefix)
    ? requestPath.slice(prefix.length)
    : "";
  if (!rel) return c.text("Not Found", 404);

  const full = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
    return c.text("Forbidden", 403);
  }

  try {
    const stat = await fs.stat(full);
    if (!stat.isFile()) return c.text("Not Found", 404);
  } catch {
    return c.text("Not Found", 404);
  }

  const ext = path.extname(full).toLowerCase();
  const contentType =
    ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".css"
        ? "text/css; charset=utf-8"
        : ext === ".js"
          ? "application/javascript; charset=utf-8"
          : ext === ".json"
            ? "application/json; charset=utf-8"
            : ext === ".txt" || ext === ".md"
              ? "text/plain; charset=utf-8"
              : ext === ".pdf"
                ? "application/pdf"
                : ext === ".png"
                  ? "image/png"
                  : ext === ".jpg" || ext === ".jpeg"
                    ? "image/jpeg"
                    : "application/octet-stream";

  const buf = await fs.readFile(full);
  return c.body(buf, 200, {
    "Content-Type": contentType,
    "Cache-Control": "no-cache",
  });
});

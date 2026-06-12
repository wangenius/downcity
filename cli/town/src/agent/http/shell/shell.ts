/**
 * Shell HTTP 路由。
 *
 * 关键点（中文）
 * - shell 已经是 Agent 内建能力，不再通过 plugin action 审批。
 * - 这里只暴露前端/RemoteAgent 需要的 approval 操作。
 */

import { Hono } from "hono";
import type { Shell } from "@downcity/shell";

type ShellRouterOptions = {
  /**
   * 读取当前 Shell。
   */
  getShell: () => Shell | undefined;
};

function requireShell(options: ShellRouterOptions): Shell {
  const shell = options.getShell();
  if (!shell) {
    throw new Error("Shell is not configured");
  }
  return shell;
}

/**
 * 创建 shell approval router。
 */
export function createShellRouter(options: ShellRouterOptions): Hono {
  const router = new Hono();

  router.get("/api/shell/approvals", (c) => {
    const shell = requireShell(options);
    return c.json({
      success: true,
      approvals: shell.approvals(),
    });
  });

  router.post("/api/shell/approve", async (c) => {
    const body = await c.req.json().catch(() => null);
    const approval_id = String(body?.approval_id || body?.approvalId || "").trim();
    if (!approval_id) {
      return c.json({ success: false, error: "approval_id is required" }, 400);
    }
    const shell = requireShell(options);
    const result = await shell.approve({ approval_id });
    return c.json(result, result.success ? 200 : 404);
  });

  router.post("/api/shell/deny", async (c) => {
    const body = await c.req.json().catch(() => null);
    const approval_id = String(body?.approval_id || body?.approvalId || "").trim();
    if (!approval_id) {
      return c.json({ success: false, error: "approval_id is required" }, 400);
    }
    const shell = requireShell(options);
    const result = await shell.deny({ approval_id });
    return c.json(result, result.success ? 200 : 404);
  });

  return router;
}

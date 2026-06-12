/**
 * Shell HTTP 路由。
 *
 * 关键点（中文）
 * - shell 已经是 Agent 内建能力，不再通过 plugin action 审批。
 * - 这里只暴露前端/RemoteAgent 需要的 approval 操作。
 */

import { Hono } from "hono";
import type { Shell } from "@downcity/shell";
import type { ShellApprovalMode } from "@downcity/shell";

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

  router.get("/api/shell/approval-modes", (c) => {
    const shell = requireShell(options);
    return c.json({
      success: true,
      modes: shell.approval_modes(),
    });
  });

  router.get("/api/shell/approval-mode", (c) => {
    const session_id = String(c.req.query("session_id") || c.req.query("sessionId") || "").trim();
    if (!session_id) {
      return c.json({ success: false, error: "session_id is required" }, 400);
    }
    const shell = requireShell(options);
    return c.json({
      success: true,
      ...shell.approval_mode({ session_id }),
    });
  });

  router.post("/api/shell/approval-mode", async (c) => {
    const body = await c.req.json().catch(() => null);
    const session_id = String(body?.session_id || body?.sessionId || "").trim();
    const mode = String(body?.mode || "").trim() as ShellApprovalMode;
    if (!session_id) {
      return c.json({ success: false, error: "session_id is required" }, 400);
    }
    if (mode !== "ask" && mode !== "always-allow") {
      return c.json({ success: false, error: "mode must be ask or always-allow" }, 400);
    }
    const shell = requireShell(options);
    return c.json(shell.set_approval_mode({ session_id, mode }));
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

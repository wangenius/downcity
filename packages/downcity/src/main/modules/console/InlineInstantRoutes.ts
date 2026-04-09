/**
 * InlineInstantRoutes：Inline Composer 即时模式路由。
 *
 * 关键点（中文）
 * - 统一暴露 `/api/ui/inline/instant-run`，避免扩展直接区分 model/acp 两套后端路径。
 * - 接口层只做轻量参数校验，具体临时 session 执行逻辑下沉到 service。
 */

import type { Hono } from "hono";
import type { ConsoleAgentOption } from "@/shared/types/Console.js";
import type {
  ConsoleInlineInstantRunInput,
  ConsoleInlineInstantService,
  InlineInstantExecutorType,
} from "@/shared/types/InlineInstant.js";
import { InlineInstantSessionService } from "@/main/modules/console/InlineInstantSessionService.js";

function normalizeExecutorType(input: unknown): InlineInstantExecutorType | "" {
  const value = String(input || "").trim();
  if (value === "model" || value === "acp") return value;
  return "";
}

/**
 * 注册 Inline Composer 即时模式路由。
 */
export function registerConsoleInlineInstantRoutes(params: {
  app: Hono;
  resolveAgentById: (requestedAgentId: string) => Promise<ConsoleAgentOption | null>;
  instantSessionService?: ConsoleInlineInstantService;
}): void {
  const service =
    params.instantSessionService ||
    new InlineInstantSessionService({
      resolveAgentById: (agentId) => params.resolveAgentById(agentId),
    });

  params.app.post("/api/ui/inline/instant-run", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as Partial<ConsoleInlineInstantRunInput>;
      const executorType = normalizeExecutorType(body.executorType);
      if (!executorType) {
        return c.json({ success: false, error: "Missing or invalid executorType" }, 400);
      }

      const prompt = String(body.prompt || "").trim();
      if (!prompt) {
        return c.json({ success: false, error: "Missing prompt" }, 400);
      }

      if (executorType === "model" && !String(body.modelId || "").trim()) {
        return c.json({ success: false, error: "Missing modelId" }, 400);
      }
      if (executorType === "acp" && !String(body.agentId || "").trim()) {
        return c.json({ success: false, error: "Missing agentId" }, 400);
      }

      const payload = await service.run({
        executorType,
        prompt,
        system: String(body.system || "").trim(),
        pageContext: String(body.pageContext || "").trim(),
        modelId: String(body.modelId || "").trim(),
        agentId: String(body.agentId || "").trim(),
      });
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}

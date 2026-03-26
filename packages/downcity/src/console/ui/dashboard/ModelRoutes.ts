/**
 * Dashboard 模型路由。
 *
 * 关键点（中文）
 * - 仅承接 agent runtime 视角下的当前模型展示与切换。
 * - Console 全局模型池管理仍由 `/api/ui/model*` 处理。
 */

import fs from "fs-extra";
import { getDowncityJsonPath } from "@/console/env/Paths.js";
import { ConsoleStore } from "@utils/store/index.js";
import type { DashboardRouteRegistrationParams } from "@/types/DashboardRoutes.js";

/**
 * 注册模型相关路由。
 */
export function registerDashboardModelRoutes(
  params: DashboardRouteRegistrationParams,
): void {
  const { app } = params;

  app.get("/api/dashboard/model", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const agentPrimaryModelId = String(runtime.config.model?.primary || "").trim();
      const store = new ConsoleStore();
      const models = store.listModels();
      const providers = await store.listProviders();
      const providerMap = new Map(providers.map((x) => [x.id, x] as const));
      const activeModel = agentPrimaryModelId
        ? models.find((x) => x.id === agentPrimaryModelId)
        : undefined;
      const providerKey = String(activeModel?.providerId || "").trim();
      const provider = providerKey ? providerMap.get(providerKey) : undefined;
      const availableModels = models.map((model) => {
        const providerConfig = providerMap.get(model.providerId);
        return {
          id: model.id,
          name: model.name,
          providerKey: model.providerId,
          providerType: String(providerConfig?.type || "").trim(),
        };
      });
      store.close();

      return c.json({
        success: true,
        model: {
          primaryModelId: agentPrimaryModelId,
          primaryModelName: String(activeModel?.name || "").trim(),
          providerKey,
          providerType: String(provider?.type || "").trim(),
          baseUrl: String(provider?.baseUrl || "").trim(),
          agentPrimaryModelId,
          availableModels,
        },
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/dashboard/model/switch", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const body = (await c.req.json().catch(() => ({}))) as {
        primaryModelId?: string;
      };
      const nextPrimaryModelId = String(body.primaryModelId || "").trim();
      if (!nextPrimaryModelId) {
        return c.json({ success: false, error: "Missing primaryModelId" }, 400);
      }
      const store = new ConsoleStore();
      const targetModel = store.getModel(nextPrimaryModelId);
      store.close();
      if (!targetModel) {
        return c.json(
          { success: false, error: `Model not found: ${nextPrimaryModelId}` },
          400,
        );
      }

      const shipJsonPath = getDowncityJsonPath(runtime.rootPath);
      const agentShip = (await fs.readJson(shipJsonPath)) as {
        model?: { primary?: string };
      };
      if (!agentShip.model || typeof agentShip.model !== "object") {
        agentShip.model = { primary: nextPrimaryModelId };
      } else {
        agentShip.model.primary = nextPrimaryModelId;
      }
      await fs.writeJson(shipJsonPath, agentShip, { spaces: 2 });

      if (!runtime.config.model || typeof runtime.config.model !== "object") {
        runtime.config.model = { primary: nextPrimaryModelId };
      } else {
        runtime.config.model.primary = nextPrimaryModelId;
      }

      return c.json({
        success: true,
        primaryModelId: nextPrimaryModelId,
        restartRequired: true,
        message: "Agent primary model updated. Restart agent to fully apply runtime model instance.",
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}

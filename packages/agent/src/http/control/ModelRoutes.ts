/**
 * Control 模型路由。
 *
 * 关键点（中文）
 * - 仅承接当前 agent 视角下的模型展示与切换。
 * - 控制面全局模型池管理仍由 `/api/ui/model*` 处理。
 */

import fs from "fs-extra";
import { getDowncityJsonPath } from "@/config/Paths.js";
import { PlatformStore } from "@shared/utils/store/index.js";
import type { ControlRouteRegistrationParams } from "@/shared/types/ControlRoutes.js";
import { buildControlRouteAliases } from "@/http/control/CommonHelpers.js";

/**
 * 注册模型相关路由。
 */
export function registerControlModelRoutes(
  params: ControlRouteRegistrationParams,
): void {
  const { app } = params;

  for (const routePath of buildControlRouteAliases("/model")) {
    app.get(routePath, async (c) => {
      try {
        const agentState = params.getAgentRuntime();
        const agentPrimaryModelId = String(agentState.config.execution?.type === "api" ? agentState.config.execution.modelId || "" : "").trim();
        const store = new PlatformStore();
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
  }

  for (const routePath of buildControlRouteAliases("/model/switch")) {
    app.post(routePath, async (c) => {
      try {
        const agentState = params.getAgentRuntime();
        const body = (await c.req.json().catch(() => ({}))) as {
          primaryModelId?: string;
        };
        const nextPrimaryModelId = String(body.primaryModelId || "").trim();
        if (!nextPrimaryModelId) {
          return c.json({ success: false, error: "Missing primaryModelId" }, 400);
        }
        const store = new PlatformStore();
        const targetModel = store.getModel(nextPrimaryModelId);
        store.close();
        if (!targetModel) {
          return c.json(
            { success: false, error: `Model not found: ${nextPrimaryModelId}` },
            400,
          );
        }

        const shipJsonPath = getDowncityJsonPath(agentState.rootPath);
        const agentShip = (await fs.readJson(shipJsonPath)) as {
          execution?: { type?: string; modelId?: string };
        };
        agentShip.execution = { type: "api", modelId: nextPrimaryModelId };
        await fs.writeJson(shipJsonPath, agentShip, { spaces: 2 });

        agentState.config.execution = { type: "api", modelId: nextPrimaryModelId };

        return c.json({
          success: true,
          primaryModelId: nextPrimaryModelId,
          restartRequired: true,
          message: "Agent primary model updated. Restart agent to fully apply the new model instance.",
        });
      } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
      }
    });
  }
}

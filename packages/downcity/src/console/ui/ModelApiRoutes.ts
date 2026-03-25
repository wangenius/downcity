/**
 * Console UI 模型管理路由。
 *
 * 关键点（中文）
 * - 聚合 `/api/ui/model*` 路由，避免网关主文件过长。
 * - 统一承接模型池 CRUD、测试、发现与 agent 绑定切换。
 */

import type { Hono } from "hono";
import fs from "fs-extra";
import { getShipJsonPath } from "@/console/env/Paths.js";
import { ConsoleStore } from "@/utils/store/index.js";
import type { ConsoleUiAgentOption } from "@/types/ConsoleUI.js";
import { ModelPoolService } from "@/console/ui/ModelPoolService.js";

type ShipJsonLike = {
  model?: {
    primary?: unknown;
  };
};

export function registerConsoleUiModelRoutes(params: {
  app: Hono;
  readRequestedAgentId: (request: Request) => string;
  resolveSelectedAgent: (requestedAgentId: string) => Promise<ConsoleUiAgentOption | null>;
  buildModelResponse: (requestedAgentId: string) => Promise<{
    success: boolean;
    model: {
      primaryModelId: string;
      primaryModelName: string;
      providerKey: string;
      providerType: string;
      baseUrl: string;
      agentPrimaryModelId: string;
      availableModels: Array<{
        id: string;
        name: string;
        providerKey: string;
        providerType: string;
        isPaused: boolean;
      }>;
    };
  }>;
}): void {
  const modelPoolService = new ModelPoolService();
  const { app, readRequestedAgentId, resolveSelectedAgent, buildModelResponse } = params;

  app.get("/api/ui/model", async (c) => {
    try {
      const requestedAgentId = readRequestedAgentId(c.req.raw);
      const payload = await buildModelResponse(requestedAgentId);
      return c.json(payload);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/model/switch", async (c) => {
    try {
      const requestedAgentId = readRequestedAgentId(c.req.raw);
      const selectedAgent = await resolveSelectedAgent(requestedAgentId);
      if (!selectedAgent) {
        return c.json(
          {
            success: false,
            error: "No running agent selected. Start/select an agent first.",
          },
          400,
        );
      }

      const body = (await c.req.json().catch(() => ({}))) as {
        primaryModelId?: string;
      };
      const nextPrimaryModelId = String(body.primaryModelId || "").trim();
      if (!nextPrimaryModelId) {
        return c.json({ success: false, error: "Missing primaryModelId" }, 400);
      }

      const store = new ConsoleStore();
      try {
        const targetModel = store.getModel(nextPrimaryModelId);
        if (!targetModel) {
          return c.json(
            { success: false, error: `Model not found: ${nextPrimaryModelId}` },
            400,
          );
        }
        if (targetModel.isPaused === true) {
          return c.json(
            { success: false, error: `Model is paused: ${nextPrimaryModelId}` },
            400,
          );
        }
      } finally {
        store.close();
      }

      const shipJsonPath = getShipJsonPath(selectedAgent.projectRoot);
      if (!(await fs.pathExists(shipJsonPath))) {
        return c.json(
          { success: false, error: `downcity.json not found: ${shipJsonPath}` },
          400,
        );
      }

      const agentShip = (await fs.readJson(shipJsonPath)) as ShipJsonLike;
      if (!agentShip.model || typeof agentShip.model !== "object") {
        agentShip.model = { primary: nextPrimaryModelId };
      } else {
        agentShip.model.primary = nextPrimaryModelId;
      }
      await fs.writeJson(shipJsonPath, agentShip, { spaces: 2 });

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

  app.get("/api/ui/model/pool", async (c) => {
    try {
      const payload = await modelPoolService.listPool();
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/model/provider/upsert", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        id?: string;
        type?: string;
        baseUrl?: string;
        apiKey?: string;
        clearBaseUrl?: boolean;
        clearApiKey?: boolean;
      };
      const providerId = String(body.id || "").trim();
      if (!providerId) {
        return c.json({ success: false, error: "Missing provider id" }, 400);
      }
      const providerType = String(body.type || "").trim();
      if (!providerType) {
        return c.json({ success: false, error: "Missing provider type" }, 400);
      }
      const payload = await modelPoolService.upsertProvider({
        id: providerId,
        type: providerType,
        baseUrl: body.baseUrl,
        apiKey: body.apiKey,
        clearBaseUrl: body.clearBaseUrl === true,
        clearApiKey: body.clearApiKey === true,
      });
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/model/provider/remove", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        providerId?: string;
      };
      const providerId = String(body.providerId || "").trim();
      if (!providerId) {
        return c.json({ success: false, error: "Missing providerId" }, 400);
      }
      await modelPoolService.removeProvider(providerId);
      return c.json({ success: true, providerId });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/model/provider/test", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        providerId?: string;
      };
      const providerId = String(body.providerId || "").trim();
      if (!providerId) {
        return c.json({ success: false, error: "Missing providerId" }, 400);
      }
      const payload = await modelPoolService.testProvider(providerId);
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/model/provider/discover", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        providerId?: string;
        autoAdd?: boolean;
        prefix?: string;
      };
      const providerId = String(body.providerId || "").trim();
      if (!providerId) {
        return c.json({ success: false, error: "Missing providerId" }, 400);
      }
      const payload = await modelPoolService.discoverProvider({
        providerId,
        autoAdd: body.autoAdd === true,
        prefix: String(body.prefix || "").trim(),
      });
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/model/model/upsert", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        id?: string;
        providerId?: string;
        name?: string;
        temperature?: unknown;
        maxTokens?: unknown;
        topP?: unknown;
        frequencyPenalty?: unknown;
        presencePenalty?: unknown;
        anthropicVersion?: string;
        isPaused?: boolean;
      };
      const modelId = String(body.id || "").trim();
      if (!modelId) {
        return c.json({ success: false, error: "Missing model id" }, 400);
      }
      const payload = await modelPoolService.upsertModel({
        id: modelId,
        providerId: String(body.providerId || "").trim(),
        name: String(body.name || "").trim(),
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        topP: body.topP,
        frequencyPenalty: body.frequencyPenalty,
        presencePenalty: body.presencePenalty,
        anthropicVersion: body.anthropicVersion,
        isPaused: body.isPaused === true,
      });
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/model/model/remove", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        modelId?: string;
      };
      const modelId = String(body.modelId || "").trim();
      if (!modelId) {
        return c.json({ success: false, error: "Missing modelId" }, 400);
      }
      await modelPoolService.removeModel(modelId);
      return c.json({ success: true, modelId });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/model/model/pause", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        modelId?: string;
        isPaused?: boolean;
      };
      const modelId = String(body.modelId || "").trim();
      if (!modelId) {
        return c.json({ success: false, error: "Missing modelId" }, 400);
      }
      await modelPoolService.setModelPaused(modelId, body.isPaused === true);
      return c.json({ success: true, modelId, isPaused: body.isPaused === true });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/model/model/test", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        modelId?: string;
        prompt?: string;
      };
      const modelId = String(body.modelId || "").trim();
      if (!modelId) {
        return c.json({ success: false, error: "Missing modelId" }, 400);
      }
      const payload = await modelPoolService.testModel(
        modelId,
        String(body.prompt || "").trim(),
      );
      return c.json({ success: true, ...payload });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}


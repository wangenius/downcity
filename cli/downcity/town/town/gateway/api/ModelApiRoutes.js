/**
 * City AIService 模型路由。
 *
 * 关键点（中文）
 * - 聚合 `/api/ui/model*` 路由，避免网关主文件过长。
 * - Town 不再提供模型池 CRUD，只负责读取 City AIService 模型目录与更新 agent 绑定。
 */
import fs from "fs-extra";
import { getDowncityJsonPath } from "../../../config/Paths.js";
import { assertCityAiModelReady, listCityAiServiceModelsForUser, } from "../../city-model/CityAiServiceBinding.js";
export function registerPlatformModelRoutes(params) {
    const { app, readRequestedAgentId, resolveSelectedAgent, buildModelResponse } = params;
    app.get("/api/ui/model", async (c) => {
        try {
            const requestedAgentId = readRequestedAgentId(c.req.raw);
            const payload = await buildModelResponse(requestedAgentId);
            return c.json(payload);
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.post("/api/ui/model/switch", async (c) => {
        try {
            const requestedAgentId = readRequestedAgentId(c.req.raw);
            const selectedAgent = await resolveSelectedAgent(requestedAgentId);
            if (!selectedAgent) {
                return c.json({
                    success: false,
                    error: "No running agent selected. Start/select an agent first.",
                }, 400);
            }
            const body = (await c.req.json().catch(() => ({})));
            const nextPrimaryModelId = String(body.primaryModelId || "").trim();
            if (!nextPrimaryModelId) {
                return c.json({ success: false, error: "Missing primaryModelId" }, 400);
            }
            await assertCityAiModelReady(nextPrimaryModelId);
            const shipJsonPath = getDowncityJsonPath(selectedAgent.projectRoot);
            if (!(await fs.pathExists(shipJsonPath))) {
                return c.json({ success: false, error: `downcity.json not found: ${shipJsonPath}` }, 400);
            }
            const agentShip = (await fs.readJson(shipJsonPath));
            agentShip.execution = {
                type: "api",
                modelId: nextPrimaryModelId,
            };
            await fs.writeJson(shipJsonPath, agentShip, { spaces: 2 });
            return c.json({
                success: true,
                primaryModelId: nextPrimaryModelId,
                restartRequired: true,
                message: "Agent primary model updated. Restart agent to fully apply the new model instance.",
            });
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.get("/api/ui/model/pool", async (c) => {
        try {
            const models = await listCityAiServiceModelsForUser();
            return c.json({
                success: true,
                providers: [],
                models: models.map((model) => ({
                    id: model.id,
                    providerId: "city",
                    name: model.name,
                    isPaused: false,
                    modalities: model.modalities,
                    tags: model.tags,
                    meta: model.meta,
                })),
                providerIds: [],
                modelIds: models.map((model) => model.id),
            });
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
}
//# sourceMappingURL=ModelApiRoutes.js.map
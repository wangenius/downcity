/**
 * CreateRuntimeModel：City 宿主侧模型工厂。
 *
 * 关键点（中文）
 * - City 不再实现 provider/model 模型池。
 * - `execution.modelId` 只表示 City AIService 中暴露的 model id。
 * - 真实 provider、密钥、endpoint 与模型实现都由 City 的 AIService 负责。
 */
import { getLogger } from "@downcity/agent";
import { normalizeAgentModel } from "@downcity/agent/internal/model/CityModelAdapter.js";
import { createCityAiAgentModel } from "../../../city/runtime/city-model/CityAiServiceBinding.js";
function normalizeRuntimeEnv(env) {
    const resolved = {};
    if (!env)
        return resolved;
    for (const [key, value] of Object.entries(env)) {
        const normalizedKey = String(key || "").trim();
        if (!normalizedKey || value === undefined || value === null)
            continue;
        resolved[normalizedKey] = String(value);
    }
    return resolved;
}
function readProjectExecutionBinding(config) {
    const execution = config.execution;
    if (!execution || typeof execution !== "object")
        return null;
    if (execution.type !== "api")
        return null;
    const modelId = String(execution.modelId || "").trim();
    if (!modelId)
        return null;
    return {
        type: "api",
        modelId,
    };
}
/**
 * 创建 Agent 可直接使用的模型实例。
 */
export async function createRuntimeModel(input) {
    const logger = getLogger();
    const execution = readProjectExecutionBinding(input.config);
    if (!execution) {
        await logger.log("warn", "No agent execution configured");
        throw new Error("No agent execution configured");
    }
    const model = await createCityAiAgentModel({
        modelId: execution.modelId,
        env: normalizeRuntimeEnv(input.env),
    });
    await logger.log("info", `[city] city ai model ready: ${execution.modelId}`, {
        kind: "city_ai_model_ready",
        modelId: execution.modelId,
        ...(input.getSessionRunScope?.()?.sessionId
            ? { sessionId: input.getSessionRunScope?.()?.sessionId }
            : {}),
    });
    return normalizeAgentModel(model);
}
//# sourceMappingURL=CreateRuntimeModel.js.map
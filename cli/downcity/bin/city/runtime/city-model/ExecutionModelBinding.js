/**
 * ExecutionModelBinding：City 宿主侧 City AIService 模型绑定辅助。
 *
 * 职责说明（中文）
 * - 统一读取 City AIService 模型目录。
 * - 校验项目 `execution.modelId` 是否能在 City AIService 中找到。
 * - City 只保存 model id，不保存 provider、key 或 endpoint。
 */
import fs from "fs-extra";
import { assertProjectExecutionTarget } from "@downcity/agent";
import { getDowncityJsonPath } from "../../config/Paths.js";
import { assertCityAiModelReady, listCityAiModelChoices, } from "./CityAiServiceBinding.js";
import { mergeProcessEnvWithPlatformGlobalEnv } from "../../env/ProcessEnv.js";
/**
 * 读取 City AIService 模型候选列表。
 */
export async function listPlatformModelChoices() {
    return await listCityAiModelChoices(mergeProcessEnvWithPlatformGlobalEnv());
}
/**
 * 断言指定模型可用于 agent execution。
 */
export async function assertPlatformModelReady(modelId) {
    await assertCityAiModelReady(modelId, mergeProcessEnvWithPlatformGlobalEnv());
}
/**
 * 断言项目 execution 绑定已声明且目标模型可用。
 */
export async function assertProjectExecutionModelReady(projectRoot) {
    const config = readProjectDowncityConfig(projectRoot);
    assertProjectExecutionTarget(config);
    const primaryModelId = String(config.execution?.type === "api" ? config.execution.modelId || "" : "").trim();
    if (!primaryModelId) {
        throw new Error('Invalid downcity.json: "execution" is required and must be { "type": "api", "modelId": "..." }');
    }
    await assertPlatformModelReady(primaryModelId);
}
function readProjectDowncityConfig(projectRoot) {
    const shipJsonPath = getDowncityJsonPath(projectRoot);
    return fs.readJsonSync(shipJsonPath);
}
//# sourceMappingURL=ExecutionModelBinding.js.map
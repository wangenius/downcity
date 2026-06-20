/**
 * `city agent reset`：重新配置 Agent 的执行绑定。
 *
 * 关键点（中文）
 * - 当 agent 启动失败（如 model not found）时，不必删除重建，直接重选模型。
 * - 从 City AIService 中选择可用模型，更新 downcity.json.execution.modelId。
 * - 仅修改 execution.modelId，不触碰 PROFILE.md / SOUL.md / channels 等其他配置。
 */
import path from "node:path";
import fs from "fs-extra";
import prompts from "../../city/tui/Prompts.js";
import { getDowncityJsonPath } from "../../city/config/Paths.js";
import { emitCliBlock } from "../../shared/CliReporter.js";
import { CliError } from "../../shared/CliError.js";
import { resolveAgentId } from "../../shared/IndexSupport.js";
import { listPlatformModelChoices } from "../../city/runtime/city-model/ExecutionModelBinding.js";
/**
 * 读取当前 agent 的 execution.modelId。
 */
function readCurrentModelId(projectRoot) {
    const shipJsonPath = getDowncityJsonPath(projectRoot);
    if (!fs.existsSync(shipJsonPath)) {
        throw new Error(`downcity.json not found: ${shipJsonPath}`);
    }
    const raw = fs.readJsonSync(shipJsonPath);
    const current = String(raw?.execution && typeof raw.execution === "object"
        ? raw.execution.modelId || ""
        : "").trim();
    return { shipJsonPath, current };
}
/**
 * 执行 `city agent reset` 交互流程。
 */
export async function agentResetCommand(cwd = ".") {
    const projectRoot = path.resolve(cwd);
    // 1) 校验项目文件存在
    const shipJsonPath = getDowncityJsonPath(projectRoot);
    if (!fs.existsSync(shipJsonPath)) {
        throw new CliError({
            title: "downcity.json not found",
            note: `project: ${projectRoot}`,
            fix: "city agent create <path>",
        });
    }
    // 2) 读取当前 modelId
    const { current } = readCurrentModelId(projectRoot);
    // 3) 获取可用模型列表
    const choices = await listPlatformModelChoices();
    if (choices.length === 0) {
        throw new CliError({
            title: "No models available in City AIService",
            note: "请先在 City AIService 注册模型，并确保当前 user_token 可调用",
            fix: "city",
        });
    }
    // 4) 交互选择模型
    const response = (await prompts({
        type: "select",
        name: "modelId",
        message: "选择 Agent 使用的模型",
        choices,
        initial: current ? Math.max(0, choices.findIndex((c) => c.value === current)) : 0,
    }));
    const nextModelId = String(response.modelId || "").trim();
    if (!nextModelId) {
        emitCliBlock({
            tone: "info",
            title: "Agent reset cancelled",
            summary: resolveAgentId(projectRoot),
        });
        return;
    }
    if (nextModelId === current) {
        emitCliBlock({
            tone: "info",
            title: "Model unchanged",
            summary: resolveAgentId(projectRoot),
            facts: [
                { label: "modelId", value: current },
                { label: "project", value: projectRoot },
            ],
        });
        return;
    }
    // 5) 写入 downcity.json
    const raw = fs.readJsonSync(shipJsonPath);
    raw.execution = { type: "api", modelId: nextModelId };
    fs.writeJsonSync(shipJsonPath, raw, { spaces: 2 });
    emitCliBlock({
        tone: "success",
        title: "Agent reconfigured",
        summary: resolveAgentId(projectRoot),
        facts: [
            { label: "previous", value: current || "(none)" },
            { label: "current", value: nextModelId },
            { label: "project", value: projectRoot },
        ],
    });
    // 关键点（中文）：检测控制面是否运行，决定能否即时重启。
    const { isCityRunning } = await import("../../city/process/registry/CityRuntime.js");
    const cityRuntimeRunning = await isCityRunning();
    if (!cityRuntimeRunning) {
        emitCliBlock({
            tone: "warning",
            title: "City runtime is not running",
            note: "请先启动 City runtime 再重启 agent",
            facts: [
                { label: "step 1", value: "city start" },
                { label: "step 2", value: `city agent restart ${projectRoot}` },
            ],
        });
        return;
    }
    const restartNow = (await prompts({
        type: "confirm",
        name: "restart",
        message: "立即重启 agent 使新模型生效？",
        initial: true,
    }));
    if (restartNow.restart === true) {
        const { restartCommand } = await import("../../city/agent/Restart.js");
        try {
            await restartCommand(projectRoot, {});
            return;
        }
        catch (error) {
            emitCliBlock({
                tone: "error",
                title: "Agent restart failed",
                note: error instanceof Error ? error.message : String(error),
            });
            return;
        }
    }
    emitCliBlock({
        tone: "info",
        title: "Agent not restarted",
        note: `run \`city agent restart ${projectRoot}\` to apply the new model`,
    });
}
//# sourceMappingURL=AgentReset.js.map
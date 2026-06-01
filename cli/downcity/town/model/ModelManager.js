/**
 * `town model` 交互式模型绑定器。
 *
 * 关键点（中文）
 * - Town 不管理模型池，只读取 City AIService 模型目录。
 * - 交互模式聚焦两个动作：查看可用模型、绑定模型到当前项目。
 */
import prompts from "prompts";
import { listCityAiModelChoices, } from "../model/runtime/CityAiServiceBinding.js";
import { resolveProjectRoot, setProjectPrimaryModel, } from "./ModelSupport.js";
import { emitCliBlock, emitCliList } from "../shared/CliReporter.js";
function isInteractiveTerminal() {
    return process.stdin.isTTY === true && process.stdout.isTTY === true;
}
async function chooseCityModelId() {
    const choices = await listCityAiModelChoices();
    if (choices.length === 0) {
        emitCliBlock({
            tone: "info",
            title: "No City AIService models found",
            note: "请先在 City AIService 注册模型，并确保当前 user_token 可调用。",
        });
        return null;
    }
    const response = (await prompts({
        type: "select",
        name: "modelId",
        message: "选择 City AIService 模型",
        choices,
        initial: 0,
    }));
    return String(response.modelId || "").trim() || null;
}
async function showCityModels() {
    const choices = await listCityAiModelChoices();
    emitCliList({
        tone: "info",
        title: "City AIService Models",
        items: choices.map((item) => ({
            title: item.model.id,
            summary: item.model.name,
            facts: [
                {
                    label: "modalities",
                    value: item.model.modalities.join(", ") || "-",
                },
            ],
        })),
    });
}
async function bindModelToProject(modelId) {
    const response = (await prompts({
        type: "text",
        name: "projectPath",
        message: "目标项目路径",
        initial: ".",
    }));
    if (response.projectPath === undefined) {
        emitCliBlock({
            tone: "info",
            title: "Model binding cancelled",
        });
        return;
    }
    const projectRoot = resolveProjectRoot(response.projectPath);
    const changed = setProjectPrimaryModel(projectRoot, modelId);
    emitCliBlock({
        tone: "success",
        title: `Model ${modelId}`,
        summary: "bound",
        facts: [
            {
                label: "source",
                value: "City AIService",
            },
            {
                label: "project",
                value: projectRoot,
            },
            {
                label: "previous",
                value: changed.previousPrimary || "none",
            },
            {
                label: "current",
                value: changed.nextPrimary,
            },
        ],
    });
}
/**
 * 运行 `town model` 交互式管理器。
 */
export async function runInteractiveModelManager() {
    if (!isInteractiveTerminal())
        return;
    while (true) {
        const response = (await prompts({
            type: "select",
            name: "action",
            message: "City AIService model",
            choices: [
                {
                    title: "查看模型",
                    description: "列出当前 user_token 可调用的 City AIService 模型",
                    value: "list",
                },
                {
                    title: "绑定到项目",
                    description: "选择模型并写入 downcity.json.execution.modelId",
                    value: "use",
                },
                {
                    title: "退出",
                    description: "关闭 model manager",
                    value: "exit",
                },
            ],
            initial: 0,
        }));
        if (!response.action || response.action === "exit") {
            emitCliBlock({
                tone: "info",
                title: "Model manager closed",
            });
            return;
        }
        try {
            if (response.action === "list") {
                await showCityModels();
                continue;
            }
            const modelId = await chooseCityModelId();
            if (modelId)
                await bindModelToProject(modelId);
        }
        catch (error) {
            emitCliBlock({
                tone: "error",
                title: "Model manager action failed",
                note: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
//# sourceMappingURL=ModelManager.js.map
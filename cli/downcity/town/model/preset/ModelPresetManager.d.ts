/**
 * ModelPresetManager：LLM 模型预设管理器。
 *
 * 关键点（中文）
 * - 统一管理 init 场景的“模型预设清单 + providerType 映射 + 自定义模型标记”。
 * - 避免命令层直接依赖硬编码常量，提升可维护性与一致性。
 */
import type { LlmProviderType } from "@downcity/agent";
/**
 * 单个模型预设定义。
 */
export type ModelPreset = {
    /**
     * 预设 ID（同时作为模型名称写入 `llm.models.<active>.name`，除自定义模型外）。
     */
    id: string;
    /**
     * 预设标题（用于 CLI 交互显示）。
     */
    title: string;
    /**
     * 对应 provider 类型（用于生成 `llm.providers.<id>.type`）。
     */
    providerTypes: readonly LlmProviderType[];
    /**
     * 是否属于“模型名由环境变量注入”的自定义模型类型。
     */
    useCustomModelName: boolean;
};
/**
 * init 模型选择解析结果。
 */
export type ResolvedInitModelPreset = {
    /**
     * 规范化后的模型预设 ID。
     */
    selectedModelId: string;
    /**
     * 选中的模型预设。
     */
    preset: ModelPreset;
};
/**
 * 模型预设管理器。
 */
export declare class ModelPresetManager {
    private readonly presets;
    private readonly presetsById;
    constructor();
    /**
     * 列出所有可选模型预设（按定义顺序）。
     */
    listPresets(): ModelPreset[];
    /**
     * 根据预设 ID 获取模型预设。
     */
    getPreset(id: string): ModelPreset | undefined;
    /**
     * 判断预设是否支持指定 provider 类型。
     */
    supportsProviderType(preset: ModelPreset, providerType: LlmProviderType): boolean;
    /**
     * 获取默认模型预设。
     */
    getDefaultPreset(): ModelPreset;
    /**
     * 解析 init 输入的模型选择，并返回稳定的预设结果。
     */
    resolveInitPreset(input?: string): ResolvedInitModelPreset;
}
//# sourceMappingURL=ModelPresetManager.d.ts.map
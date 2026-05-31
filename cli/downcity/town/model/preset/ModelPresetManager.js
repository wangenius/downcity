/**
 * ModelPresetManager：LLM 模型预设管理器。
 *
 * 关键点（中文）
 * - 统一管理 init 场景的“模型预设清单 + providerType 映射 + 自定义模型标记”。
 * - 避免命令层直接依赖硬编码常量，提升可维护性与一致性。
 */
const CUSTOM_MODEL_IDS = new Set(["open-compatible", "open-responses"]);
const MODEL_PRESETS = [
    // Claude 系列
    {
        id: "claude-sonnet-4-5",
        title: "Claude Sonnet 4",
        providerTypes: ["anthropic"],
        useCustomModelName: false,
    },
    {
        id: "claude-haiku",
        title: "Claude Haiku",
        providerTypes: ["anthropic"],
        useCustomModelName: false,
    },
    {
        id: "claude-3-5-sonnet-20241022",
        title: "Claude 3.5 Sonnet",
        providerTypes: ["anthropic"],
        useCustomModelName: false,
    },
    {
        id: "claude-3-opus-20240229",
        title: "Claude 3 Opus",
        providerTypes: ["anthropic"],
        useCustomModelName: false,
    },
    // OpenAI GPT 系列
    {
        id: "gpt-4",
        title: "GPT-4",
        providerTypes: ["openai"],
        useCustomModelName: false,
    },
    {
        id: "gpt-4-turbo",
        title: "GPT-4 Turbo",
        providerTypes: ["openai"],
        useCustomModelName: false,
    },
    {
        id: "gpt-4o",
        title: "GPT-4o",
        providerTypes: ["openai"],
        useCustomModelName: false,
    },
    {
        id: "gpt-3.5-turbo",
        title: "GPT-3.5 Turbo",
        providerTypes: ["openai"],
        useCustomModelName: false,
    },
    // DeepSeek
    {
        id: "deepseek-chat",
        title: "DeepSeek Chat",
        providerTypes: ["deepseek"],
        useCustomModelName: false,
    },
    // Gemini
    {
        id: "gemini-2.5-pro",
        title: "Gemini 2.5 Pro",
        providerTypes: ["gemini"],
        useCustomModelName: false,
    },
    {
        id: "gemini-2.5-flash",
        title: "Gemini 2.5 Flash",
        providerTypes: ["gemini"],
        useCustomModelName: false,
    },
    // xAI
    {
        id: "grok-3",
        title: "xAI Grok 3",
        providerTypes: ["xai"],
        useCustomModelName: false,
    },
    // HuggingFace Router
    {
        id: "meta-llama/Llama-3.1-8B-Instruct",
        title: "HF Llama 3.1 8B",
        providerTypes: ["huggingface"],
        useCustomModelName: false,
    },
    // OpenRouter
    {
        id: "openrouter/auto",
        title: "OpenRouter Auto",
        providerTypes: ["openrouter"],
        useCustomModelName: false,
    },
    // Moonshot(Kimi)
    {
        id: "kimi-k2.5",
        title: "Kimi K2.5",
        providerTypes: ["moonshot-cn", "moonshot-ai"],
        useCustomModelName: false,
    },
    {
        id: "kimi-for-coding",
        title: "Kimi For Coding",
        providerTypes: ["kimi-code"],
        useCustomModelName: false,
    },
    // OpenAI-compatible（Chat Completions）
    {
        id: "open-compatible",
        title: "Open-compatible model",
        providerTypes: ["open-compatible"],
        useCustomModelName: true,
    },
    // OpenAI-compatible（Responses）
    {
        id: "open-responses",
        title: "Open-responses model",
        providerTypes: ["open-responses"],
        useCustomModelName: true,
    },
];
const DEFAULT_MODEL_PRESET_ID = "claude-sonnet-4-5";
const FALLBACK_MODEL_PRESET_ID = "open-compatible";
/**
 * 模型预设管理器。
 */
export class ModelPresetManager {
    presets;
    presetsById;
    constructor() {
        this.presets = [...MODEL_PRESETS];
        this.presetsById = new Map(this.presets.map((preset) => [preset.id, preset]));
    }
    /**
     * 列出所有可选模型预设（按定义顺序）。
     */
    listPresets() {
        return [...this.presets];
    }
    /**
     * 根据预设 ID 获取模型预设。
     */
    getPreset(id) {
        const key = String(id || "").trim();
        if (!key)
            return undefined;
        return this.presetsById.get(key);
    }
    /**
     * 判断预设是否支持指定 provider 类型。
     */
    supportsProviderType(preset, providerType) {
        return preset.providerTypes.includes(providerType);
    }
    /**
     * 获取默认模型预设。
     */
    getDefaultPreset() {
        return (this.getPreset(DEFAULT_MODEL_PRESET_ID) ||
            this.getPreset(FALLBACK_MODEL_PRESET_ID) ||
            this.presets[0]);
    }
    /**
     * 解析 init 输入的模型选择，并返回稳定的预设结果。
     */
    resolveInitPreset(input) {
        const selectedModelId = String(input || "").trim();
        const preset = this.getPreset(selectedModelId) ||
            this.getPreset(FALLBACK_MODEL_PRESET_ID) ||
            this.getDefaultPreset();
        return {
            selectedModelId: selectedModelId || preset.id,
            preset: {
                ...preset,
                useCustomModelName: CUSTOM_MODEL_IDS.has(preset.id),
            },
        };
    }
}
//# sourceMappingURL=ModelPresetManager.js.map
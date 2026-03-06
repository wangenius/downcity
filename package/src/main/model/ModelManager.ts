/**
 * ModelManager：LLM 模型预设管理器。
 *
 * 关键点（中文）
 * - 统一管理 init 场景的“模型预设清单 + providerType 映射 + 自定义模型标记”。
 * - 避免命令层直接依赖硬编码常量，提升可维护性与一致性。
 */

import type { LlmProviderType } from "@main/types/LlmConfig.js";

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
  providerType: LlmProviderType;

  /**
   * 是否属于“模型名由环境变量注入”的自定义模型类型。
   */
  useCustomModelName: boolean;
};

const CUSTOM_MODEL_IDS = new Set<string>(["open-compatible", "open-responses"]);

const MODEL_PRESETS: ModelPreset[] = [
  // Claude 系列
  {
    id: "claude-sonnet-4-5",
    title: "Claude Sonnet 4",
    providerType: "anthropic",
    useCustomModelName: false,
  },
  {
    id: "claude-haiku",
    title: "Claude Haiku",
    providerType: "anthropic",
    useCustomModelName: false,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    title: "Claude 3.5 Sonnet",
    providerType: "anthropic",
    useCustomModelName: false,
  },
  {
    id: "claude-3-opus-20240229",
    title: "Claude 3 Opus",
    providerType: "anthropic",
    useCustomModelName: false,
  },
  // OpenAI GPT 系列
  {
    id: "gpt-4",
    title: "GPT-4",
    providerType: "openai",
    useCustomModelName: false,
  },
  {
    id: "gpt-4-turbo",
    title: "GPT-4 Turbo",
    providerType: "openai",
    useCustomModelName: false,
  },
  {
    id: "gpt-4o",
    title: "GPT-4o",
    providerType: "openai",
    useCustomModelName: false,
  },
  {
    id: "gpt-3.5-turbo",
    title: "GPT-3.5 Turbo",
    providerType: "openai",
    useCustomModelName: false,
  },
  // DeepSeek
  {
    id: "deepseek-chat",
    title: "DeepSeek Chat",
    providerType: "deepseek",
    useCustomModelName: false,
  },
  // Gemini
  {
    id: "gemini-2.5-pro",
    title: "Gemini 2.5 Pro",
    providerType: "gemini",
    useCustomModelName: false,
  },
  {
    id: "gemini-2.5-flash",
    title: "Gemini 2.5 Flash",
    providerType: "gemini",
    useCustomModelName: false,
  },
  // xAI
  {
    id: "grok-3",
    title: "xAI Grok 3",
    providerType: "xai",
    useCustomModelName: false,
  },
  // HuggingFace Router
  {
    id: "meta-llama/Llama-3.1-8B-Instruct",
    title: "HF Llama 3.1 8B",
    providerType: "huggingface",
    useCustomModelName: false,
  },
  // OpenRouter
  {
    id: "openrouter/auto",
    title: "OpenRouter Auto",
    providerType: "openrouter",
    useCustomModelName: false,
  },
  // Moonshot(Kimi)
  {
    id: "moonshot-v1-8k",
    title: "Moonshot v1 8k",
    providerType: "moonshot",
    useCustomModelName: false,
  },
  // OpenAI-compatible（Chat Completions）
  {
    id: "open-compatible",
    title: "Open-compatible model",
    providerType: "open-compatible",
    useCustomModelName: true,
  },
  // OpenAI-compatible（Responses）
  {
    id: "open-responses",
    title: "Open-responses model",
    providerType: "open-responses",
    useCustomModelName: true,
  },
];

const DEFAULT_MODEL_PRESET_ID = "claude-sonnet-4-5";
const FALLBACK_MODEL_PRESET_ID = "open-compatible";

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
export class ModelManager {
  private readonly presets: ModelPreset[];
  private readonly presetsById: Map<string, ModelPreset>;

  constructor() {
    this.presets = [...MODEL_PRESETS];
    this.presetsById = new Map(
      this.presets.map((preset) => [preset.id, preset] as const),
    );
  }

  /**
   * 列出所有可选模型预设（按定义顺序）。
   */
  listPresets(): ModelPreset[] {
    return [...this.presets];
  }

  /**
   * 根据预设 ID 获取模型预设。
   */
  getPreset(id: string): ModelPreset | undefined {
    const key = String(id || "").trim();
    if (!key) return undefined;
    return this.presetsById.get(key);
  }

  /**
   * 获取默认模型预设。
   */
  getDefaultPreset(): ModelPreset {
    return (
      this.getPreset(DEFAULT_MODEL_PRESET_ID) ||
      this.getPreset(FALLBACK_MODEL_PRESET_ID) ||
      this.presets[0]
    );
  }

  /**
   * 解析 init 输入的模型选择，并返回稳定的预设结果。
   */
  resolveInitPreset(input?: string): ResolvedInitModelPreset {
    const selectedModelId = String(input || "").trim();
    const preset =
      this.getPreset(selectedModelId) ||
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

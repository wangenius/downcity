/**
 * Voice Plugin / Asset 类型定义。
 *
 * 关键点（中文）
 * - 把 Voice 的“插件行为配置”和“转写资产配置”拆开。
 * - 插件层不再直接暴露模型目录、pip 包等实现细节；这些字段收敛到 Asset 配置。
 */

import type { JsonValue } from "@/types/Json.js";

/**
 * Voice Plugin 行为配置。
 */
export interface VoicePluginConfig {
  /**
   * 兼容统一结构化配置约束的索引签名。
   */
  [key: string]: JsonValue | undefined;
  /**
   * 是否启用 Voice Plugin。
   */
  enabled?: boolean;
  /**
   * 是否把转写结果注入 system/prompt 行为链。
   */
  injectPrompt?: boolean;
  /**
   * 是否在消息进入 Agent 前自动增强语音内容。
   */
  augmentMessage?: boolean;
}

/**
 * Voice 转写 Asset 配置。
 */
export interface VoiceTranscriberAssetConfig {
  /**
   * 兼容统一结构化配置约束的索引签名。
   */
  [key: string]: JsonValue | undefined;
  /**
   * 转写提供者类型。
   *
   * 说明（中文）
   * - `local`：使用内建本地模型与 Python Runner。
   * - `command`：使用用户自定义命令模板。
   */
  provider?: "local" | "command";
  /**
   * 本地模型 ID（可选）。
   *
   * 说明（中文）
   * - 这是 Asset 内部实现字段，不应由 Plugin 直接感知。
   */
  modelId?: string;
  /**
   * 模型根目录（可选）。
   */
  modelsDir?: string;
  /**
   * Python 可执行文件（可选）。
   */
  pythonBin?: string;
  /**
   * 自定义命令模板（可选）。
   */
  command?: string;
  /**
   * 默认语言提示（可选）。
   */
  language?: string;
  /**
   * 转写超时时间（毫秒，可选）。
   */
  timeoutMs?: number;
  /**
   * 本地推理策略（可选）。
   *
   * 说明（中文）
   * - `auto`：按模型自动选择 runner。
   * - `funasr` / `transformers-whisper`：固定使用对应 runner。
   * - `command`：使用自定义命令模板。
   */
  strategy?: "auto" | "funasr" | "transformers-whisper" | "command";
  /**
   * 已安装模型列表（可选）。
   *
   * 说明（中文）
   * - 仅作为状态快照使用，不应被 plugin 直接依赖。
   */
  installedModels?: string[];
}

/**
 * Voice 转写 Asset 安装输入。
 */
export interface VoiceTranscriberAssetInstallInput {
  /**
   * 兼容统一结构化配置约束的索引签名。
   */
  [key: string]: JsonValue | undefined;
  /**
   * 需要安装的模型 ID 列表（可选）。
   */
  modelIds?: string[];
  /**
   * 安装完成后激活的模型 ID（可选）。
   */
  activeModel?: string;
  /**
   * 是否强制覆盖已存在资源。
   */
  force?: boolean;
  /**
   * 模型目录（可选）。
   */
  modelsDir?: string;
  /**
   * Python 可执行文件（可选）。
   */
  pythonBin?: string;
  /**
   * 是否同时安装转写依赖。
   */
  installDeps?: boolean;
  /**
   * HuggingFace Token（可选）。
   */
  hfToken?: string;
}

/**
 * Voice 转写句柄。
 */
export interface VoiceTranscriberHandle {
  /**
   * 执行音频转写。
   */
  transcribe(input: {
    /**
     * 待转写音频路径。
     */
    audioPath: string;
    /**
     * 语言提示（可选）。
     */
    language?: string;
  }): Promise<{
    /**
     * 转写是否成功。
     */
    success: boolean;
    /**
     * 转写文本（可选）。
     */
    text?: string;
    /**
     * 错误信息（可选）。
     */
    error?: string;
  }>;
}

/**
 * Voice 模型目录与转写策略类型定义。
 *
 * 设计目标（中文）
 * - 统一描述 voice 领域里的稳定枚举类型。
 * - 让 plugin / asset / runtime 共用一套模型与策略定义。
 */

/**
 * Voice provider 类型。
 *
 * 说明（中文）
 * - `local`：使用本地模型目录与 Python runner。
 * - `command`：使用用户自定义命令模板。
 */
export type VoiceProvider = "local" | "command";

/**
 * 内置可选 STT 模型 ID。
 *
 * 说明（中文）
 * - 保持稳定字符串，避免未来重命名导致用户配置失效。
 */
export type VoiceModelId =
  | "SenseVoiceSmall"
  | "paraformer-zh-streaming"
  | "whisper-large-v3-turbo";

/**
 * Voice 转写执行策略。
 *
 * 说明（中文）
 * - `auto`：按激活模型自动选择内置 runner。
 * - `funasr`：强制使用 FunASR python runner。
 * - `transformers-whisper`：强制使用 Transformers Whisper python runner。
 * - `command`：使用自定义命令模板。
 */
export type VoiceTranscribeStrategy =
  | "auto"
  | "funasr"
  | "transformers-whisper"
  | "command";

/**
 * Voice 内置模型目录条目。
 */
export interface VoiceModelCatalogItem {
  /**
   * 模型稳定 ID（配置与命令唯一键）。
   */
  id: VoiceModelId;
  /**
   * CLI 展示名称。
   */
  label: string;
  /**
   * 模型描述（语言/特性/场景）。
   */
  description: string;
  /**
   * HuggingFace 仓库 ID（owner/repo）。
   */
  huggingfaceRepo: string;
  /**
   * 下载 revision（通常为 main）。
   */
  revision: string;
}

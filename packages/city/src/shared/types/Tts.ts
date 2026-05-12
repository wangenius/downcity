/**
 * TTS 模型目录与推理族类型定义。
 *
 * 设计目标（中文）
 * - 统一描述 TTS 领域里的稳定模型 ID、模型族与下载清单。
 * - 让 plugin / runtime / console 共用同一套目录元数据。
 */

/**
 * TTS provider 类型。
 *
 * 说明（中文）
 * - 当前仅保留 `local`，统一走本地模型目录与 Python runner。
 */
export type TtsProvider = "local";

/**
 * 内置可选 TTS 模型 ID。
 *
 * 说明（中文）
 * - 保持稳定字符串，避免后续改名破坏用户配置。
 */
export type TtsModelId =
  | "qwen3-tts-0.6b"
  | "kokoro-82m"
  | "qwen3-tts-1.7b";

/**
 * TTS 本地推理实现族。
 *
 * 说明（中文）
 * - `qwen3`：Qwen3-TTS 系列。
 * - `kokoro`：Kokoro 系列。
 */
export type TtsRuntimeFamily = "qwen3" | "kokoro";

/**
 * TTS 输出音频格式。
 *
 * 说明（中文）
 * - 当前仅保留本地 runner 稳定支持的格式。
 */
export type TtsAudioFormat = "wav" | "flac";

/**
 * 单个 HuggingFace 下载资源定义。
 */
export interface TtsModelAsset {
  /**
   * 资源仓库 ID（owner/repo）。
   */
  repoId: string;
  /**
   * 下载 revision（通常为 main）。
   */
  revision: string;
  /**
   * 仅下载这些文件（可选）。
   *
   * 说明（中文）
   * - 为空时表示下载该 repo 的全部文件。
   * - 用于像 Kokoro 这样只需要少量核心文件的场景。
   */
  files?: string[];
  /**
   * 下载到模型目录内的目标子目录（可选）。
   */
  targetSubdir?: string;
}

/**
 * TTS 内置模型目录条目。
 */
export interface TtsModelCatalogItem {
  /**
   * 模型稳定 ID（配置与命令唯一键）。
   */
  id: TtsModelId;
  /**
   * Console / CLI 展示名称。
   */
  label: string;
  /**
   * 面向用户的简要说明。
   */
  description: string;
  /**
   * 本地推理所对应的实现族。
   */
  family: TtsRuntimeFamily;
  /**
   * 是否作为优先推荐项展示。
   */
  recommended: boolean;
  /**
   * 模型安装时需要下载的资源列表。
   */
  assets: TtsModelAsset[];
}

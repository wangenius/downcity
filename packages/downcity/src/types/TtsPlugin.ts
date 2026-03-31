/**
 * TTS Plugin 类型定义。
 *
 * 关键点（中文）
 * - TTS 作为独立插件，只负责把文本生成语音文件。
 * - 不接入 chat 主链路，后续发送阶段复用现有 `<file type="audio">` 协议即可。
 */

import type { JsonValue } from "@/types/Json.js";

/**
 * TTS 输出音频格式。
 */
export type TtsAudioFormat = "mp3" | "wav" | "opus" | "aac" | "flac";

/**
 * TTS Plugin 配置。
 */
export interface TtsPluginConfig {
  /**
   * 兼容统一结构化配置约束的索引签名。
   */
  [key: string]: JsonValue | undefined;
  /**
   * 是否启用 TTS Plugin。
   */
  enabled?: boolean;
  /**
   * 用于语音合成的 console 模型池 modelId。
   */
  modelId?: string;
  /**
   * 语音音色 ID。
   */
  voice?: string;
  /**
   * 默认输出格式。
   */
  format?: TtsAudioFormat;
  /**
   * 语速倍率。
   */
  speed?: number;
  /**
   * 输出目录。
   *
   * 说明（中文）
   * - 可为相对项目根目录或绝对路径。
   * - 为空时默认写到 `.downcity/.cache/tts/`。
   */
  outputDir?: string;
}

/**
 * TTS 合成输入。
 */
export interface TtsSynthesizeInput {
  /**
   * 兼容统一结构化配置约束的索引签名。
   */
  [key: string]: JsonValue | undefined;
  /**
   * 需要合成的文本内容。
   */
  text?: string;
  /**
   * 覆盖当前使用的模型 ID。
   */
  modelId?: string;
  /**
   * 覆盖当前音色。
   */
  voice?: string;
  /**
   * 覆盖当前输出格式。
   */
  format?: TtsAudioFormat;
  /**
   * 覆盖当前语速倍率。
   */
  speed?: number;
  /**
   * 覆盖当前输出路径或目录。
   *
   * 说明（中文）
   * - 若传入带扩展名的路径，则直接写该文件。
   * - 若传入目录，则按默认命名生成文件。
   */
  output?: string;
}

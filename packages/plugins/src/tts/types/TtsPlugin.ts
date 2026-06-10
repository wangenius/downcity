/**
 * TtsPlugin 类型定义。
 *
 * 关键点（中文）
 * - TTS plugin 只定义 agent 侧协议，不绑定本地模型、Python 或 City 具体实现。
 * - 真实语音合成能力通过 constructor 的 `tts` 函数注入，推荐传入 `city.ai.tts`。
 * - action 最终统一返回 AI SDK UIMessage，便于 agent 统一处理音频 file part。
 */

import type { UIMessage } from "ai";
import type { JsonObject, JsonValue } from "@downcity/agent/internal/types/common/Json.js";

/**
 * TTS 输入。
 */
export interface TtsPluginInput {
  /**
   * 需要合成为语音的文本。
   */
  text: string;
  /**
   * 语言提示，例如 `auto`、`zh`、`en`。
   */
  language?: string;
  /**
   * 音色提示或上游 provider 的 voice id。
   */
  voice?: string;
  /**
   * 输出格式提示，例如 `wav`、`mp3`、`ogg`。
   */
  format?: string;
  /**
   * 语速倍率。
   */
  speed?: number;
  /**
   * Provider 私有参数。
   */
  provider_options?: JsonObject;
  /**
   * 允许外部 tts 函数接收其他 JSON 可序列化参数。
   */
  [key: string]: JsonValue | undefined;
}

/**
 * TTS 返回的标准 UIMessage。
 */
export type TtsPluginUiMessageResult = UIMessage;

/**
 * TTS 返回的简单音频结果。
 */
export interface TtsPluginSimpleAudioResult {
  /**
   * 音频 URL，可为远程 URL、本地路径或 data URL。
   */
  url?: string;
  /**
   * data URL 音频内容。
   */
  data_url?: string;
  /**
   * 本地音频文件路径。
   */
  audio_path?: string;
  /**
   * 音频 MIME 类型，例如 `audio/wav`。
   */
  media_type?: string;
  /**
   * 建议文件名。
   */
  filename?: string;
  /**
   * 可选说明文本。
   */
  text?: string;
  /**
   * 允许外部 tts 函数返回其他 JSON 可序列化字段。
   */
  [key: string]: JsonValue | undefined;
}

/**
 * TTS 输出。
 */
export type TtsPluginResult =
  | TtsPluginUiMessageResult
  | TtsPluginSimpleAudioResult;

/**
 * TtsPlugin 构造参数。
 */
export interface TtsPluginOptions {
  /**
   * Plugin 稳定名称，默认 `tts`。
   */
  name?: string;
  /**
   * Plugin 展示标题，默认 `TTS`。
   */
  title?: string;
  /**
   * Plugin 用途说明。
   */
  description?: string;
  /**
   * 真实 TTS 能力函数。
   *
   * 说明（中文）
   * - 推荐传入 `(input) => city.ai.tts(input)`。
   * - plugin 只负责调用该函数，不关心模型、provider、鉴权或运行依赖。
   */
  tts: (input: TtsPluginInput) => Promise<TtsPluginResult> | TtsPluginResult;
  /**
   * 默认语言提示。
   */
  language?: string;
  /**
   * 默认音色提示。
   */
  voice?: string;
  /**
   * 默认输出格式提示。
   */
  format?: string;
}

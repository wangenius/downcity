/**
 * AsrPlugin 类型定义。
 *
 * 关键点（中文）
 * - ASR plugin 只定义 agent 侧协议，不绑定本地模型、Python 或 City 具体实现。
 * - 真实转写能力通过 constructor 的 `asr` 函数注入，推荐传入 `city.ai.asr`。
 * - `auto` 只表示是否在 chat 入站时自动转写语音附件。
 */

import type { JsonObject, JsonValue } from "@downcity/agent/internal/types/common/Json.js";

/**
 * ASR 输入。
 */
export interface AsrPluginInput {
  /**
   * 本地音频文件路径。
   *
   * 说明（中文）
   * - chat runtime 下载附件后会传入本地路径。
   * - 显式 action 调用时也优先使用该字段。
   */
  audio_path?: string;
  /**
   * 远程音频 URL。
   */
  url?: string;
  /**
   * data URL 音频内容。
   */
  data_url?: string;
  /**
   * 语言提示，例如 `auto`、`zh`、`en`。
   */
  language?: string;
  /**
   * 音频 MIME 类型，例如 `audio/ogg`。
   */
  media_type?: string;
  /**
   * 原始文件名。
   */
  file_name?: string;
  /**
   * Provider 私有参数。
   */
  provider_options?: JsonObject;
  /**
   * 允许外部 asr 函数接收其他 JSON 可序列化参数。
   */
  [key: string]: JsonValue | undefined;
}

/**
 * ASR 输出。
 */
export interface AsrPluginResult {
  /**
   * 转写文本。
   */
  text: string;
  /**
   * 识别到的语言（可选）。
   */
  language?: string;
  /**
   * 结果置信度（可选）。
   */
  confidence?: number;
  /**
   * Provider 原始元信息（可选）。
   */
  metadata?: JsonObject;
  /**
   * 允许外部 asr 函数返回其他 JSON 可序列化字段。
   */
  [key: string]: JsonValue | undefined;
}

/**
 * AsrPlugin 构造参数。
 */
export interface AsrPluginOptions {
  /**
   * Plugin 稳定名称，默认 `asr`。
   */
  name?: string;
  /**
   * Plugin 展示标题，默认 `ASR`。
   */
  title?: string;
  /**
   * Plugin 用途说明。
   */
  description?: string;
  /**
   * 真实 ASR 能力函数。
   *
   * 说明（中文）
   * - 推荐传入 `(input) => city.ai.asr(input)`。
   * - plugin 只负责调用该函数，不关心模型、provider、鉴权或运行依赖。
   */
  asr: (input: AsrPluginInput) => Promise<AsrPluginResult> | AsrPluginResult;
  /**
   * 是否自动转写 chat 入站语音附件。
   *
   * 说明（中文）
   * - `true`：遇到 voice/audio 附件时自动调用 `asr`。
   * - `false`：仅保留显式 `transcribe` action。
   * - 默认 `false`，避免 agent 隐式调用外部 ASR 成本。
   */
  auto?: boolean;
  /**
   * 默认语言提示。
   */
  language?: string;
}


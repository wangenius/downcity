/**
 * TTS Plugin 类型定义。
 *
 * 关键点（中文）
 * - TTS 的行为配置与本地模型依赖统一收敛到 `plugins.tts`。
 * - Console 只需要理解 plugin setup，不需要理解底层 asset 细节。
 */

import type { JsonValue } from "@/shared/types/Json.js";
import type { TtsAudioFormat, TtsProvider } from "@/shared/types/Tts.js";

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
   * 语音合成 provider 类型。
   *
   * 说明（中文）
   * - 当前固定为 `local`。
   */
  provider?: TtsProvider;
  /**
   * 当前激活的本地模型 ID。
   */
  modelId?: string;
  /**
   * 本地模型根目录（可选）。
   */
  modelsDir?: string;
  /**
   * Python 可执行文件（可选）。
   */
  pythonBin?: string;
  /**
   * 默认语言提示（可选）。
   *
   * 说明（中文）
   * - `auto` / `zh` / `en` 等简短值即可。
   */
  language?: string;
  /**
   * 默认音色 ID（可选）。
   *
   * 说明（中文）
   * - 主要给运行时做覆盖；Console 默认不要求手动填写。
   */
  voice?: string;
  /**
   * 默认输出格式。
   */
  format?: TtsAudioFormat;
  /**
   * 默认语速倍率。
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
  /**
   * 单次合成超时时间（毫秒，可选）。
   */
  timeoutMs?: number;
  /**
   * 已安装模型列表（可选）。
   *
   * 说明（中文）
   * - 仅作为状态快照使用，不应作为真实安装判断唯一依据。
   */
  installedModels?: string[];
}

/**
 * TTS 安装输入。
 */
export interface TtsInstallInput {
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
   * 是否同时安装 Python 依赖。
   */
  installDeps?: boolean;
  /**
   * HuggingFace Token（可选）。
   */
  hfToken?: string;
  /**
   * 安装完成后默认输出格式（可选）。
   */
  format?: TtsAudioFormat;
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
   * 覆盖当前语言提示（可选）。
   */
  language?: string;
  /**
   * 覆盖当前音色（可选）。
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

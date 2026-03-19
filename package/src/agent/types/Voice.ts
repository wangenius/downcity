/**
 * Voice extension 配置与模型目录类型定义。
 *
 * 设计目标（中文）
 * - 统一描述 `extensions.voice` 的持久化结构，避免 CLI / extension / runtime 各自定义字段。
 * - 用稳定模型 ID 约束配置可选值，保证命令行与配置读写一致。
 */

/**
 * Voice extension provider 类型。
 *
 * 说明（中文）
 * - 当前仅支持 `local`（本地模型）。
 * - 后续扩展远端 provider 时，在此处增量加枚举值即可。
 */
export type VoiceProvider = "local";

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
 * Voice 转写执行器配置。
 */
export interface VoiceTranscribeConfig {
  /**
   * 转写策略。
   *
   * 说明（中文）
   * - 默认 `auto`。
   * - `command` 模式下需要配合 `command` 字段。
   */
  strategy?: VoiceTranscribeStrategy;
  /**
   * 自定义执行命令模板。
   *
   * 说明（中文）
   * - 仅在 `strategy=command` 时生效。
   * - 支持占位符：`{audioPath}`、`{modelDir}`、`{modelId}`、`{language}`。
   * - 命令 stdout 的最后一个非空行将作为转写文本。
   */
  command?: string;
  /**
   * 转写超时时间（毫秒）。
   *
   * 说明（中文）
   * - 默认 120000（2 分钟）。
   * - 超时会中断本次转写并回退为附件流程。
   */
  timeoutMs?: number;
  /**
   * Python 可执行文件路径。
   *
   * 说明（中文）
   * - 内置 `funasr` / `transformers-whisper` runner 会用该解释器执行。
   * - `city voice init` 在命中 PEP 668 时会自动写入 venv 的 python 路径。
   * - 未设置时默认使用 `python3`。
   */
  pythonBin?: string;
  /**
   * 默认语言提示。
   *
   * 说明（中文）
   * - 未在请求中显式传入 language 时使用该值。
   * - 示例：`zh`、`en`。
   */
  language?: string;
}

/**
 * `extensions.voice` 配置结构。
 */
export interface VoiceExtensionConfig {
  /**
   * Voice extension 是否启用。
   *
   * 说明（中文）
   * - `true`：语音识别能力可被 chat 等 service 调用。
   * - `false`：保留配置但不执行转写。
   */
  enabled?: boolean;
  /**
   * 语音识别 provider。
   *
   * 说明（中文）
   * - 当前固定 `local`。
   * - 为未来 provider 扩展预留。
   */
  provider?: VoiceProvider;
  /**
   * 当前激活模型 ID。
   *
   * 说明（中文）
   * - 应存在于 `installedModels` 列表。
   * - `city voice on` 默认把首个选择项写入该字段。
   */
  activeModel?: VoiceModelId;
  /**
   * 本地模型根目录。
   *
   * 说明（中文）
   * - 默认 `~/.ship/models/voice`（用户级共享目录）。
   * - 每个模型安装在 `<modelsDir>/<modelId>/`。
   */
  modelsDir?: string;
  /**
   * 已安装模型列表。
   *
   * 说明（中文）
   * - 仅记录模型 ID，不记录大文件细节。
   * - CLI/extension 写入时会去重并保持顺序稳定。
   */
  installedModels?: VoiceModelId[];
  /**
   * 转写执行器配置。
   *
   * 说明（中文）
   * - 控制本地转写时的策略、命令模板与超时。
   */
  transcribe?: VoiceTranscribeConfig;
}

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

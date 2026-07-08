/**
 * TtsPlugin：文本转语音插件。
 *
 * 关键点（中文）
 * - TTS 能力通过 constructor 注入，推荐传入 `city.ai.tts`。
 * - plugin 不负责本地模型、Python 依赖、provider 或项目配置。
 * - action 返回 AI SDK UIMessage，音频 file part 会由 plugin tool bridge 统一落盘到资源目录。
 */

import { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import { createAction } from "@downcity/agent/internal/plugin/core/PluginActionFactory.js";
import { z } from "zod";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type {
  JsonObject,
  JsonValue,
} from "@downcity/agent/internal/types/common/Json.js";
import type {
  TtsPluginInput,
  TtsPluginOptions,
  TtsPluginResult,
  TtsPluginSimpleAudioResult,
  TtsPluginUiMessageResult,
} from "@/tts/types/TtsPlugin.js";

const DEFAULT_TTS_PLUGIN_NAME = "tts";
const DEFAULT_TTS_PLUGIN_TITLE = "TTS";
const DEFAULT_TTS_PLUGIN_DESCRIPTION =
  "Synthesize speech through an injected TTS function and return assistant audio file parts.";
const DEFAULT_MEDIA_TYPE = "audio/wav";
const DEFAULT_FILENAME = "speech.wav";

/**
 * 判断值是否为普通对象。
 */
function to_record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * 归一化 action payload。
 */
function normalize_tts_payload(payload: JsonValue | undefined): TtsPluginInput {
  const record = to_record(payload ?? {});
  if (!record) {
    throw new TypeError("TtsPlugin.synthesize payload must be an object");
  }
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (!text) {
    throw new Error("TtsPlugin.synthesize requires text");
  }
  return {
    ...(record as TtsPluginInput),
    text,
  };
}

/**
 * 判断返回值是否已经是 AI SDK UIMessage。
 */
function is_ui_message_result(value: TtsPluginResult): value is TtsPluginUiMessageResult {
  const record = to_record(value);
  return Boolean(record && Array.isArray(record.parts));
}

/**
 * 读取简单音频结果中的 URL。
 */
function read_audio_url(record: Record<string, unknown>): string {
  const url =
    typeof record.url === "string"
      ? record.url.trim()
      : typeof record.data_url === "string"
        ? record.data_url.trim()
        : typeof record.audio_path === "string"
          ? record.audio_path.trim()
          : "";
  if (!url) {
    throw new TypeError(
      "TtsPlugin tts function must return a UIMessage or { url | data_url | audio_path }",
    );
  }
  return url;
}

/**
 * 把简单音频结果归一为 UIMessage。
 */
function simple_audio_to_ui_message(
  result: TtsPluginSimpleAudioResult,
): TtsPluginUiMessageResult {
  const record = to_record(result);
  if (!record) {
    throw new TypeError("TtsPlugin tts function returned an invalid result");
  }
  const url = read_audio_url(record);
  const media_type =
    typeof record.media_type === "string" && record.media_type.trim()
      ? record.media_type.trim()
      : DEFAULT_MEDIA_TYPE;
  const filename =
    typeof record.filename === "string" && record.filename.trim()
      ? record.filename.trim()
      : DEFAULT_FILENAME;
  const text = typeof record.text === "string" ? record.text.trim() : "";

  return {
    id: `tts:${Date.now()}`,
    role: "assistant",
    parts: [
      ...(text ? [{ type: "text" as const, text }] : []),
      {
        type: "file" as const,
        mediaType: media_type,
        filename,
        url,
      },
    ],
  };
}

/**
 * 校验并归一化 TTS 返回结果。
 */
function normalize_tts_result(result: TtsPluginResult): TtsPluginUiMessageResult {
  if (is_ui_message_result(result)) {
    return result;
  }
  return simple_audio_to_ui_message(result);
}

/**
 * Agent TTS 插件。
 */
export class TtsPlugin extends BasePlugin {
  /**
   * 当前 plugin 稳定名称。
   */
  readonly name: string;

  /**
   * 插件标题。
   */
  readonly title: string;

  /**
   * 插件说明。
   */
  readonly description: string;

  private readonly tts: TtsPluginOptions["tts"];
  private readonly language?: string;
  private readonly voice?: string;
  private readonly format?: string;

  constructor(options: TtsPluginOptions) {
    super();
    const name = String(options.name || DEFAULT_TTS_PLUGIN_NAME).trim();
    if (!name) {
      throw new Error("TtsPlugin requires a non-empty name");
    }
    if (typeof options.tts !== "function") {
      throw new Error("TtsPlugin requires a tts function");
    }
    this.name = name;
    this.title = String(options.title || DEFAULT_TTS_PLUGIN_TITLE).trim();
    this.description = String(
      options.description || DEFAULT_TTS_PLUGIN_DESCRIPTION,
    ).trim();
    this.tts = options.tts;
    this.language =
      typeof options.language === "string" && options.language.trim()
        ? options.language.trim()
        : undefined;
    this.voice =
      typeof options.voice === "string" && options.voice.trim()
        ? options.voice.trim()
        : undefined;
    this.format =
      typeof options.format === "string" && options.format.trim()
        ? options.format.trim()
        : undefined;
  }

  /**
   * TTS 插件给模型的使用说明。
   */
  system(_context: AgentContext): string {
    return [
      "# TTS Plugin",
      "",
      "Use this plugin when the user asks to create spoken audio, voice output, narration, or a reusable audio file.",
      "Do not call it for ordinary text replies unless the user explicitly wants audio.",
      "",
      "Call through `plugin_call`:",
      "",
      "```ts",
      "plugin_call({",
      `  plugin: "${this.name}",`,
      '  action: "synthesize",',
      "  payload: {",
      '    text: "...",',
      "  },",
      "});",
      "```",
      "",
      "Payload rules:",
      "- `text` is required.",
      "- Optional fields: `language`, `voice`, `format`, `speed`, `provider_options`.",
      "- The returned audio file part is saved under project `.downcity/resources` and attached to the final assistant message automatically.",
    ].join("\n");
  }

  /**
   * 执行一次 TTS 合成。
   */
  private async synthesize(input: TtsPluginInput): Promise<TtsPluginUiMessageResult> {
    const result = await this.tts({
      ...(this.language ? { language: this.language } : {}),
      ...(this.voice ? { voice: this.voice } : {}),
      ...(this.format ? { format: this.format } : {}),
      ...input,
    });
    return normalize_tts_result(result);
  }

  /**
   * 显式 action 集合。
   */
  readonly actions = {
    synthesize: createAction({
      description:
        "Synthesize speech from text. Returns a UIMessage whose audio file part is auto-saved under the project resources directory.",
      input_schema: {
        zod: z
          .object({
            text: z.string(),
            language: z.string().optional(),
            voice: z.string().optional(),
            format: z.string().optional(),
            speed: z.number().optional(),
            provider_options: z.record(z.string(), z.unknown()).optional(),
          })
          .passthrough(),
        json_schema: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string", description: "Text to synthesize." },
            language: { type: "string", description: "Language code, optional." },
            voice: { type: "string", description: "Voice, optional." },
            format: { type: "string", description: "Audio format, optional." },
            speed: { type: "number", description: "Speech speed, optional." },
          },
        },
      },
      examples: [
        { title: "Default voice", payload: { text: "Hello, world" } },
        {
          title: "Specific voice",
          payload: { text: "Welcome back", voice: "alloy", format: "mp3" },
        },
      ],
      execute: async ({ input }: { input: JsonValue }) => {
        try {
          const synth_input = normalize_tts_payload(input);
          const message = await this.synthesize(synth_input);
          return {
            success: true,
            data: message as unknown as JsonObject,
            message: "speech synthesized",
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
            message: String(error),
          };
        }
      },
    }),
  };
}

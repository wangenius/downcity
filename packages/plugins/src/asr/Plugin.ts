/**
 * AsrPlugin：语音转写插件。
 *
 * 关键点（中文）
 * - ASR 能力通过 constructor 注入，推荐传入 `city.ai.asr`。
 * - plugin 不负责本地模型、Python 依赖、provider 或项目配置。
 * - `auto: true` 时会在 chat 入站阶段自动转写 voice/audio 附件，并把结果写入正文。
 */

import path from "node:path";
import { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type {
  JsonObject,
  JsonValue,
} from "@downcity/agent/internal/types/common/Json.js";
import { CHAT_PLUGIN_POINTS } from "@/chat/runtime/PluginPoints.js";
import type {
  ChatInboundAugmentInput,
  ChatPluginAttachment,
} from "@/chat/types/ChatPlugin.js";
import type {
  AsrPluginInput,
  AsrPluginOptions,
  AsrPluginResult,
} from "@/asr/types/AsrPlugin.js";

const DEFAULT_ASR_PLUGIN_NAME = "asr";
const DEFAULT_ASR_PLUGIN_TITLE = "ASR";
const DEFAULT_ASR_PLUGIN_DESCRIPTION =
  "Transcribe voice and audio attachments through an injected ASR function.";

/**
 * 判断值是否为普通对象。
 */
function to_record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * XML 文本转义。
 */
function escape_xml_text(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * XML 属性转义。
 */
function escape_xml_attr(value: string): string {
  return escape_xml_text(value).replace(/"/g, "&quot;");
}

/**
 * 归一化 action payload。
 */
function normalize_asr_payload(payload: JsonValue | undefined): AsrPluginInput {
  const record = to_record(payload ?? {});
  if (!record) {
    throw new TypeError("AsrPlugin.transcribe payload must be an object");
  }
  const audio_path =
    typeof record.audio_path === "string"
      ? record.audio_path.trim()
      : "";
  const url = typeof record.url === "string" ? record.url.trim() : "";
  const data_url = typeof record.data_url === "string" ? record.data_url.trim() : "";
  if (!audio_path && !url && !data_url) {
    throw new Error("AsrPlugin.transcribe requires audio_path, url, or data_url");
  }
  return {
    ...(record as AsrPluginInput),
    ...(audio_path ? { audio_path } : {}),
    ...(url ? { url } : {}),
    ...(data_url ? { data_url } : {}),
  };
}

/**
 * 校验 ASR 返回结果。
 */
function normalize_asr_result(result: AsrPluginResult): AsrPluginResult {
  const record = to_record(result);
  if (!record || typeof record.text !== "string") {
    throw new TypeError("AsrPlugin asr function must return { text: string }");
  }
  return {
    ...record,
    text: record.text.trim(),
  } as AsrPluginResult;
}

/**
 * 生成相对展示路径。
 */
function to_display_src(root_path: string, attachment: ChatPluginAttachment): string {
  const raw =
    typeof attachment.path === "string" && attachment.path.trim()
      ? attachment.path.trim()
      : attachment.fileName || attachment.attachmentId || attachment.kind;
  const normalized_root = path.resolve(root_path);
  const normalized_raw = path.isAbsolute(raw) ? path.resolve(raw) : raw;
  if (path.isAbsolute(normalized_raw) && normalized_raw.startsWith(`${normalized_root}${path.sep}`)) {
    return normalized_raw.slice(normalized_root.length + 1);
  }
  return raw;
}

/**
 * 把语音转写结果写入 bodyText。
 */
function append_voice_text(input: ChatInboundAugmentInput, voice_blocks: string[]): ChatInboundAugmentInput {
  const current = String(input.bodyText || "").trim();
  const addition = voice_blocks.map((item) => item.trim()).filter(Boolean).join("\n\n");
  if (!addition) return input;
  return {
    ...input,
    bodyText: [current, addition].filter(Boolean).join("\n\n"),
  };
}

/**
 * Agent ASR 插件。
 */
export class AsrPlugin extends BasePlugin {
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

  private readonly asr: AsrPluginOptions["asr"];
  private readonly auto: boolean;
  private readonly language?: string;

  constructor(options: AsrPluginOptions) {
    super();
    const name = String(options.name || DEFAULT_ASR_PLUGIN_NAME).trim();
    if (!name) {
      throw new Error("AsrPlugin requires a non-empty name");
    }
    if (typeof options.asr !== "function") {
      throw new Error("AsrPlugin requires an asr function");
    }
    this.name = name;
    this.title = String(options.title || DEFAULT_ASR_PLUGIN_TITLE).trim();
    this.description = String(
      options.description || DEFAULT_ASR_PLUGIN_DESCRIPTION,
    ).trim();
    this.asr = options.asr;
    this.auto = options.auto === true;
    this.language =
      typeof options.language === "string" && options.language.trim()
        ? options.language.trim()
        : undefined;
  }

  /**
   * ASR 插件给模型的使用说明。
   */
  system(_context: AgentContext): string {
    return [
      "# ASR Plugin",
      "",
      "Use this plugin when the user asks to transcribe, recognize, or understand voice/audio content.",
      this.auto
        ? "Inbound voice/audio chat attachments are automatically transcribed into `<voice src=\"...\">...</voice>` blocks in the user text."
        : "Automatic inbound voice transcription is disabled; call the plugin explicitly when transcription is needed.",
      "",
      "Call through `plugin_call`:",
      "",
      "```ts",
      "plugin_call({",
      `  plugin: "${this.name}",`,
      '  action: "transcribe",',
      "  payload: {",
      '    audio_path: "...",',
      "  },",
      "});",
      "```",
      "",
      "Payload rules:",
      "- Provide one of `audio_path`, `url`, or `data_url`.",
      "- Optional fields: `language`, `media_type`, `file_name`, `provider_options`.",
      "- Do not invent transcript text. If transcription fails, report the failure clearly.",
    ].join("\n");
  }

  /**
   * 执行一次 ASR 转写。
   */
  private async transcribe(input: AsrPluginInput): Promise<AsrPluginResult> {
    const result = await this.asr({
      ...(this.language ? { language: this.language } : {}),
      ...input,
    });
    return normalize_asr_result(result);
  }

  /**
   * 自动增强 chat 入站消息。
   */
  private async auto_transcribe_inbound(params: {
    context: AgentContext;
    value: JsonValue;
  }): Promise<JsonValue> {
    if (!this.auto) return params.value;
    const input = params.value as unknown as ChatInboundAugmentInput;
    const voice_attachments = (Array.isArray(input.attachments) ? input.attachments : []).filter(
      (item) =>
        (item.kind === "voice" || item.kind === "audio") &&
        typeof item.path === "string" &&
        item.path.trim(),
    );
    if (voice_attachments.length === 0) {
      return input as unknown as JsonValue;
    }

    const voice_blocks: string[] = [];
    for (const attachment of voice_attachments) {
      try {
        const result = await this.transcribe({
          audio_path: String(attachment.path || "").trim(),
          ...(attachment.contentType ? { media_type: attachment.contentType } : {}),
          ...(attachment.fileName ? { file_name: attachment.fileName } : {}),
        });
        if (!result.text) continue;
        const src = to_display_src(params.context.rootPath, attachment);
        voice_blocks.push(
          `<voice src="${escape_xml_attr(src)}">${escape_xml_text(result.text)}</voice>`,
        );
      } catch {
        // 关键点（中文）：自动转写失败不阻塞主消息链路。
      }
    }

    return append_voice_text(input, voice_blocks) as unknown as JsonValue;
  }

  /**
   * pipeline / action 扩展点。
   */
  readonly hooks = {
    pipeline: {
      [CHAT_PLUGIN_POINTS.augmentInbound]: [
        async ({ context, value }: { context: AgentContext; value: JsonValue }) => {
          return await this.auto_transcribe_inbound({ context, value });
        },
      ],
    },
  };

  /**
   * 显式 action 集合。
   */
  readonly actions = {
    transcribe: {
      execute: async ({ payload }: { payload: JsonValue }) => {
        try {
          const input = normalize_asr_payload(payload);
          const result = await this.transcribe(input);
          return {
            success: true,
            data: result as unknown as JsonObject,
            message: "audio transcribed",
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
            message: String(error),
          };
        }
      },
    },
  };
}

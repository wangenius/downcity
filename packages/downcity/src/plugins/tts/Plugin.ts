/**
 * TTS Plugin。
 *
 * 关键点（中文）
 * - 独立负责把文本转换为音频文件。
 * - 当前不接入 chat hooks，只保留显式 action 调用。
 * - 生成出的本地文件可直接通过 `<file type="audio">` 协议发送。
 */

import type { Plugin } from "@/types/Plugin.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { TtsPluginConfig, TtsSynthesizeInput } from "@/types/TtsPlugin.js";
import { persistProjectPluginConfig } from "@/main/plugin/ProjectConfigStore.js";
import { synthesizeSpeechFile } from "@/plugins/tts/runtime/Synthesizer.js";
import { ConsoleStore } from "@utils/store/index.js";

function toJsonObject(input: Record<string, unknown> | null | undefined): JsonObject | null {
  if (!input) return null;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value
        .filter((item) => item !== undefined)
        .map((item) => item as JsonValue);
      continue;
    }
    if (typeof value === "object") {
      out[key] = toJsonObject(value as Record<string, unknown>) || {};
    }
  }
  return out;
}

function getStringOpt(
  opts: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = opts[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function getBooleanOpt(
  opts: Record<string, JsonValue>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = opts[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  }
  return defaultValue;
}

function getNumberOpt(
  opts: Record<string, JsonValue>,
  key: string,
): number | undefined {
  const value = opts[key];
  return typeof value === "number" && Number.isFinite(value) && !Number.isNaN(value)
    ? value
    : undefined;
}

/**
 * 读取 TTS Plugin 配置。
 */
function readTtsPluginConfig(runtime: {
  config: {
    plugins?: Record<string, unknown>;
  };
}): TtsPluginConfig {
  const current = runtime.config.plugins?.tts;
  const normalized =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as TtsPluginConfig)
      : {};
  return {
    enabled:
      typeof normalized.enabled === "boolean" ? normalized.enabled : true,
    ...(typeof normalized.modelId === "string" ? { modelId: normalized.modelId } : {}),
    ...(typeof normalized.voice === "string" ? { voice: normalized.voice } : {}),
    ...(typeof normalized.format === "string" ? { format: normalized.format } : {}),
    ...(typeof normalized.speed === "number" ? { speed: normalized.speed } : {}),
    ...(typeof normalized.outputDir === "string" ? { outputDir: normalized.outputDir } : {}),
  };
}

/**
 * 写入完整 TTS Plugin 配置。
 */
async function writeTtsPluginConfig(params: {
  agentState: {
    rootPath: string;
    config: {
      plugins?: Record<string, unknown>;
    };
  };
  value: TtsPluginConfig;
}): Promise<void> {
  if (!params.agentState.config.plugins) {
    params.agentState.config.plugins = {};
  }
  params.agentState.config.plugins.tts = (toJsonObject(params.value) || {}) as JsonObject;
  await persistProjectPluginConfig({
    projectRoot: params.agentState.rootPath,
    sections: {
      plugins: params.agentState.config.plugins as Record<string, JsonObject>,
    },
  });
}

/**
 * ttsPlugin：文本转语音插件定义。
 */
export const ttsPlugin: Plugin = {
  name: "tts",
  title: "Text To Speech",
  description:
    "Generates speech audio files from plain text through a configured model, then returns a reusable audio file tag for downstream sending.",
  config: {
    plugin: "tts",
    scope: "project",
    defaultValue: {
      enabled: true,
      voice: "alloy",
      format: "mp3",
    },
  },
  setup: {
    mode: "configure",
    title: "配置语音合成",
    description: "尽量使用下拉选项完成模型、音色与输出格式配置。",
    fields: [
      {
        key: "modelId",
        label: "模型",
        type: "select",
        required: true,
        sourceAction: "models",
      },
      {
        key: "voice",
        label: "音色",
        type: "select",
        required: true,
        options: [
          { label: "Alloy", value: "alloy" },
          { label: "Ash", value: "ash" },
          { label: "Ballad", value: "ballad" },
          { label: "Coral", value: "coral" },
          { label: "Echo", value: "echo" },
          { label: "Fable", value: "fable" },
          { label: "Nova", value: "nova" },
          { label: "Onyx", value: "onyx" },
          { label: "Sage", value: "sage" },
          { label: "Shimmer", value: "shimmer" },
        ],
      },
      {
        key: "format",
        label: "输出格式",
        type: "select",
        required: true,
        options: [
          { label: "MP3", value: "mp3" },
          { label: "WAV", value: "wav" },
          { label: "Opus", value: "opus" },
          { label: "AAC", value: "aac" },
          { label: "FLAC", value: "flac" },
        ],
      },
    ],
    primaryAction: "configure",
    statusAction: "status",
  },
  async availability(context) {
    const config = readTtsPluginConfig(context);
    const reasons: string[] = [];
    if (config.enabled !== true) {
      reasons.push("tts plugin disabled");
    }
    if (!String(config.modelId || "").trim()) {
      reasons.push("tts modelId is missing");
    }
    return {
      enabled: config.enabled === true,
      available: reasons.length === 0,
      reasons,
    };
  },
  actions: {
    status: {
      allowWhenDisabled: true,
      command: {
        description: "查看 tts plugin 当前状态",
        mapInput() {
          return {};
        },
      },
      execute: async ({ context }) => {
        const config = readTtsPluginConfig(context);
        const availability = await ttsPlugin.availability!(context);
        return {
          success: true,
          data: {
            plugin: toJsonObject(config) || {},
            availability: {
              enabled: availability.enabled,
              available: availability.available,
              reasons: availability.reasons,
            },
          },
        };
      },
    },
    models: {
      allowWhenDisabled: true,
      command: {
        description: "列出可用于 tts 的模型",
        mapInput() {
          return {};
        },
      },
      execute: async () => {
        const store = new ConsoleStore();
        try {
          const options = store
            .listModels()
            .filter((model) => model.isPaused !== true)
            .map((model) => ({
              label: model.id,
              value: model.id,
              hint: model.name,
            }));
          return {
            success: true,
            data: {
              options,
            },
          };
        } finally {
          store.close();
        }
      },
    },
    configure: {
      allowWhenDisabled: true,
      execute: async ({ context, payload }) => {
        const current = readTtsPluginConfig(context);
        const next = {
          ...current,
          ...(payload && typeof payload === "object" && !Array.isArray(payload)
            ? payload
            : {}),
        };
        await writeTtsPluginConfig({
          agentState: context,
          value: next,
        });
        return {
          success: true,
          data: {
            plugin: toJsonObject(next) || {},
          },
        };
      },
    },
    on: {
      allowWhenDisabled: true,
      command: {
        description: "启用 tts plugin",
        mapInput() {
          return {};
        },
      },
      execute: async ({ context }) => {
        const next = {
          ...readTtsPluginConfig(context),
          enabled: true,
        };
        await writeTtsPluginConfig({
          agentState: context,
          value: next,
        });
        return {
          success: true,
          data: {
            plugin: toJsonObject(next) || {},
          },
        };
      },
    },
    off: {
      command: {
        description: "关闭 tts plugin",
        mapInput() {
          return {};
        },
      },
      execute: async ({ context }) => {
        const next = {
          ...readTtsPluginConfig(context),
          enabled: false,
        };
        await writeTtsPluginConfig({
          agentState: context,
          value: next,
        });
        return {
          success: true,
          data: {
            plugin: toJsonObject(next) || {},
          },
        };
      },
    },
    synthesize: {
      command: {
        description: "将文本生成语音文件",
        configure(command) {
          command
            .argument("<text>")
            .option("--model <modelId>", "语音模型 ID（来自 console 模型池）")
            .option("--voice <voice>", "音色 ID")
            .option("--format <format>", "输出格式（mp3/wav/opus/aac/flac）")
            .option("--speed <speed>", "语速倍率", Number)
            .option("--output <path>", "输出文件路径或目录（可选）");
        },
        mapInput({ args, opts }) {
          const text = String(args[0] || "").trim();
          if (!text) {
            throw new Error("text is required");
          }
          return {
            text,
            ...(getStringOpt(opts, "model")
              ? { modelId: getStringOpt(opts, "model") }
              : {}),
            ...(getStringOpt(opts, "voice")
              ? { voice: getStringOpt(opts, "voice") }
              : {}),
            ...(getStringOpt(opts, "format")
              ? { format: getStringOpt(opts, "format") }
              : {}),
            ...(typeof getNumberOpt(opts, "speed") === "number"
              ? { speed: getNumberOpt(opts, "speed") }
              : {}),
            ...(getStringOpt(opts, "output")
              ? { output: getStringOpt(opts, "output") }
              : {}),
          };
        },
      },
      execute: async ({ context, payload }) => {
        const config = readTtsPluginConfig(context);
        if (config.enabled !== true) {
          return {
            success: false,
            error: "tts plugin disabled",
            message: "tts plugin disabled",
          };
        }

        const input =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as TtsSynthesizeInput)
            : {};
        const result = await synthesizeSpeechFile({
          context,
          config,
          input,
        });
        return {
          success: true,
          data: {
            outputPath: result.outputPath,
            fileTag: result.fileTag,
            bytes: result.bytes,
          },
        };
      },
    },
  },
};

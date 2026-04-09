/**
 * TTS Plugin。
 *
 * 关键点（中文）
 * - TTS Plugin 现在自己内聚本地模型与 Python 依赖，不再依赖 console 模型池。
 * - Console 只通过 setup / action 与插件交互，保持极简统一。
 */

import type { Plugin } from "@/shared/types/Plugin.js";
import type { JsonObject, JsonValue } from "@/shared/types/Json.js";
import type {
  TtsInstallInput,
  TtsPluginConfig,
  TtsSynthesizeInput,
} from "@/shared/types/TtsPlugin.js";
import { isPluginEnabled } from "@/main/plugin/Activation.js";
import { setCityPluginEnabled } from "@/main/plugin/Lifecycle.js";
import {
  checkTtsSynthesizer,
  installTtsSynthesizer,
  listTtsModelOptions,
  readTtsPluginConfig,
  writeTtsPluginConfig,
} from "@/plugins/tts/Dependency.js";
import { resolveTtsModelId } from "@/plugins/tts/runtime/Catalog.js";
import { synthesizeSpeechFile } from "@/plugins/tts/runtime/Synthesizer.js";

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
 * ttsPlugin：文本转语音插件定义。
 */
export const ttsPlugin: Plugin = {
  name: "tts",
  title: "Text To Speech",
  description:
    "Generates local speech audio files from plain text through an installed TTS model, then returns a reusable audio file tag for downstream sending.",
  config: {
    plugin: "tts",
    scope: "project",
    defaultValue: {
      provider: "local",
      modelId: "qwen3-tts-0.6b",
      format: "wav",
      speed: 1,
    },
  },
  setup: {
    mode: "install-configure",
    title: "安装语音合成",
    description: "选择模型后直接完成模型下载、独立运行环境准备与配置写入。",
    fields: [
      {
        key: "modelId",
        label: "模型",
        type: "select",
        required: true,
        sourceAction: "models",
      },
      {
        key: "format",
        label: "输出格式",
        type: "select",
        required: true,
        options: [
          { label: "WAV", value: "wav" },
          { label: "FLAC", value: "flac" },
        ],
      },
    ],
    primaryAction: "install",
    statusAction: "status",
  },
  usage: {
    title: "配置语音合成",
    description: "设置当前 agent 默认使用的语音模型与输出参数。",
    fields: [
      {
        key: "modelId",
        label: "默认模型",
        type: "select",
        required: true,
        sourceAction: "models",
      },
      {
        key: "format",
        label: "输出格式",
        type: "select",
        required: true,
        options: [
          { label: "WAV", value: "wav", description: "兼容性最好，适合绝大多数渠道。" },
          { label: "FLAC", value: "flac", description: "体积更小，适合存档或传输。" },
        ],
      },
      {
        key: "speed",
        label: "默认语速",
        type: "number",
        placeholder: "1",
        description: "1 为正常语速，可按需要设置为 0.8、1.2 等。",
      },
      {
        key: "language",
        label: "默认语言提示",
        type: "string",
        placeholder: "auto / zh / en",
      },
      {
        key: "voice",
        label: "默认音色",
        type: "string",
        placeholder: "可选音色 ID",
      },
    ],
    saveAction: "configure",
    statusAction: "status",
  },
  async availability(context) {
    if (!isPluginEnabled({ plugin: ttsPlugin })) {
      return {
        enabled: false,
        available: false,
        reasons: ["tts plugin disabled in city config"],
      };
    }
    const dependencyStatus = await checkTtsSynthesizer(context);
    return {
      enabled: true,
      available: dependencyStatus.available,
      reasons: dependencyStatus.reasons,
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
        const synthesizer = await checkTtsSynthesizer(context);
        return {
          success: true,
          data: {
            plugin: toJsonObject(config) || {},
            availability: {
              enabled: availability.enabled,
              available: availability.available,
              reasons: availability.reasons,
            },
            synthesizer: {
              available: synthesizer.available,
              reasons: synthesizer.reasons,
              details: synthesizer.details || null,
            },
          },
        };
      },
    },
    doctor: {
      allowWhenDisabled: true,
      command: {
        description: "检查 tts plugin 依赖状态",
        mapInput() {
          return {};
        },
      },
      execute: async ({ context }) => {
        const result = await checkTtsSynthesizer(context);
        return {
          success: true,
          data: {
            available: result.available,
            reasons: result.reasons,
            details: result.details || null,
          },
        };
      },
    },
    models: {
      allowWhenDisabled: true,
      command: {
        description: "列出可用于 tts 的本地模型",
        mapInput() {
          return {};
        },
      },
      execute: async () => {
        return {
          success: true,
          data: {
            options: listTtsModelOptions(),
          },
        };
      },
    },
    install: {
      allowWhenDisabled: true,
      command: {
        description: "安装 tts 语音合成依赖",
        configure(command) {
          command
            .argument("[models...]")
            .option("--active-model <modelId>", "安装完成后设为当前模型")
            .option("--models-dir <path>", "模型目录（可选）")
            .option("--python <bin>", "Python 可执行文件（默认 python3）")
            .option("--no-install-deps", "跳过依赖安装")
            .option("--force", "强制覆盖已存在资源")
            .option("--hf-token <token>", "HuggingFace token（可选）")
            .option("--format <format>", "默认输出格式（wav/flac）");
        },
        mapInput({ args, opts }) {
          return {
            modelIds: args,
            ...(getStringOpt(opts, "activeModel")
              ? { activeModel: getStringOpt(opts, "activeModel") }
              : {}),
            ...(getStringOpt(opts, "modelsDir")
              ? { modelsDir: getStringOpt(opts, "modelsDir") }
              : {}),
            ...(getStringOpt(opts, "python")
              ? { pythonBin: getStringOpt(opts, "python") }
              : {}),
            installDeps: getBooleanOpt(opts, "installDeps", true),
            force: getBooleanOpt(opts, "force", false),
            ...(getStringOpt(opts, "hfToken")
              ? { hfToken: getStringOpt(opts, "hfToken") }
              : {}),
            ...(getStringOpt(opts, "format")
              ? { format: getStringOpt(opts, "format") }
              : {}),
          };
        },
      },
      execute: async ({ context, payload }) => {
        const result = await installTtsSynthesizer({
          context,
          input:
            payload && typeof payload === "object" && !Array.isArray(payload)
              ? (payload as TtsInstallInput)
              : undefined,
        });
        return {
          success: result.success,
          ...(result.message ? { message: result.message } : {}),
          ...(result.details !== undefined ? { data: result.details } : {}),
          ...(result.success ? {} : { error: result.message || "install failed" }),
        };
      },
    },
    configure: {
      allowWhenDisabled: true,
      execute: async ({ context, payload }) => {
        const payloadObject =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Partial<TtsPluginConfig> & Record<string, unknown>)
            : {};
        const { enabled: _ignoredEnabled, ...patch } = payloadObject;
        const current = readTtsPluginConfig(context);
        const next = {
          ...current,
          ...(patch as Partial<TtsPluginConfig>),
        } satisfies TtsPluginConfig;
        await writeTtsPluginConfig({
          context,
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
        description: "启用 tts plugin，并可选安装本地依赖",
        configure(command) {
          command
            .argument("[models...]")
            .option("--active-model <modelId>", "安装完成后设为当前模型")
            .option("--models-dir <path>", "模型目录（可选）")
            .option("--python <bin>", "Python 可执行文件（默认 python3）")
            .option("--no-install", "仅启用 plugin，不安装依赖")
            .option("--no-install-deps", "跳过依赖安装")
            .option("--force", "强制覆盖已存在资源")
            .option("--hf-token <token>", "HuggingFace token（可选）")
            .option("--format <format>", "默认输出格式（wav/flac）");
        },
        mapInput({ args, opts }) {
          return {
            modelIds: args,
            ...(getStringOpt(opts, "activeModel")
              ? { activeModel: getStringOpt(opts, "activeModel") }
              : {}),
            ...(getStringOpt(opts, "modelsDir")
              ? { modelsDir: getStringOpt(opts, "modelsDir") }
              : {}),
            ...(getStringOpt(opts, "python")
              ? { pythonBin: getStringOpt(opts, "python") }
              : {}),
            install: getBooleanOpt(opts, "install", true),
            installDeps: getBooleanOpt(opts, "installDeps", true),
            force: getBooleanOpt(opts, "force", false),
            ...(getStringOpt(opts, "hfToken")
              ? { hfToken: getStringOpt(opts, "hfToken") }
              : {}),
            ...(getStringOpt(opts, "format")
              ? { format: getStringOpt(opts, "format") }
              : {}),
          };
        },
      },
      execute: async ({ context, payload }) => {
        setCityPluginEnabled("tts", true);
        if ((payload as { install?: unknown }).install !== false) {
          const installResult = await installTtsSynthesizer({
            context,
            input:
              payload && typeof payload === "object" && !Array.isArray(payload)
                ? (payload as TtsInstallInput)
                : undefined,
          });
          if (!installResult.success) {
            return {
              success: false,
              error: installResult.message || "tts dependency install failed",
              message: installResult.message || "tts dependency install failed",
            };
          }
        }
        return {
          success: true,
          data: {
            plugin: toJsonObject(readTtsPluginConfig(context) as Record<string, unknown>) || {},
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
        setCityPluginEnabled("tts", false);
        return {
          success: true,
          data: {
            plugin: toJsonObject(readTtsPluginConfig(context) as Record<string, unknown>) || {},
          },
        };
      },
    },
    use: {
      allowWhenDisabled: true,
      command: {
        description: "切换 tts 当前模型",
        configure(command) {
          command.argument("<modelId>");
        },
        mapInput({ args }) {
          const modelId = String(args[0] || "").trim();
          if (!modelId) {
            throw new Error("modelId is required");
          }
          return {
            modelId,
          };
        },
      },
      execute: async ({ context, payload }) => {
        const modelId = String((payload as { modelId?: unknown }).modelId || "").trim();
        const resolvedModelId = resolveTtsModelId(modelId);
        if (!resolvedModelId) {
          return {
            success: false,
            error: `Unsupported tts model: ${modelId}`,
            message: `Unsupported tts model: ${modelId}`,
          };
        }
        const nextConfig = await writeTtsPluginConfig({
          context,
          value: {
            ...readTtsPluginConfig(context),
            modelId: resolvedModelId,
          },
        });
        return {
          success: true,
          data: {
            plugin: toJsonObject(nextConfig as Record<string, unknown>) || {},
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
            .option("--model <modelId>", "语音模型 ID")
            .option("--language <language>", "语言提示（可选，例如 zh / en）")
            .option("--voice <voice>", "音色 ID（可选）")
            .option("--format <format>", "输出格式（wav/flac）")
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
            ...(getStringOpt(opts, "language")
              ? { language: getStringOpt(opts, "language") }
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
        const pluginStatus = await ttsPlugin.availability!(context);
        if (!pluginStatus.enabled || !pluginStatus.available) {
          return {
            success: false,
            error: pluginStatus.reasons[0] || "tts plugin unavailable",
            message: pluginStatus.reasons[0] || "tts plugin unavailable",
          };
        }

        const input =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as TtsSynthesizeInput)
            : {};
        const result = await synthesizeSpeechFile({
          context,
          config: readTtsPluginConfig(context),
          input,
        });
        return {
          success: true,
          data: {
            outputPath: result.outputPath,
            fileTag: result.fileTag,
            bytes: result.bytes,
            ...(result.stderrSummary ? { stderr: result.stderrSummary } : {}),
          },
        };
      },
    },
  },
  system(context) {
    if (!isPluginEnabled({ plugin: ttsPlugin })) {
      return "";
    }
    return [
      "# TTS Plugin",
      "The agent can call the tts plugin to synthesize speech audio from plain text.",
      "Typical usage flow:",
      "1. Check availability with `city tts status` when you need to confirm whether the plugin and model are ready.",
      "2. Generate audio with `city tts synthesize <text>`.",
      "3. Optionally override synthesis parameters with `--voice`, `--language`, `--format`, `--speed`, and `--output`.",
      "Use the `tts.synthesize` action when the user asks to generate spoken audio or a reusable audio file tag.",
      "A successful synthesis returns a local output path and a reusable `<file type=\"audio\">...</file>` tag for downstream sending.",
      "If the Python runner prints non-fatal stderr, the command still succeeds and returns that stderr summary as extra context.",
      "Example: `city tts synthesize \"你好，欢迎来到 Downcity\" --format wav`",
    ].join("\n");
  },
};

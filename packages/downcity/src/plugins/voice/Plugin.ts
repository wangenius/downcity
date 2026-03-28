/**
 * Voice Plugin。
 *
 * 关键点（中文）
 * - Voice Plugin 现在自己内聚转写依赖，不再暴露独立依赖端口心智。
 * - 具体模型、依赖安装、命令模板等实现细节全部收敛到 plugin 内部 dependency helper。
 * - 当前作为 chat 入站消息增强中间件接入语音转写。
 */

import type { Plugin } from "@/types/Plugin.js";
import type { ChatInboundAugmentInput } from "@/types/ChatPlugin.js";
import type { VoicePluginConfig } from "@/types/VoicePlugin.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import { persistProjectPluginConfig } from "@/console/plugin/ProjectConfigStore.js";
import { CHAT_PLUGIN_POINTS } from "@services/chat/runtime/PluginPoints.js";
import {
  listVoiceModels,
  resolveVoicePluginModelId,
} from "@/plugins/voice/ModelCatalog.js";
import {
  checkVoiceTranscriber,
  installVoiceTranscriber,
  readVoiceTranscriberConfig,
  transcribeWithVoiceDependency,
  writeVoiceTranscriberConfig,
} from "@/plugins/voice/Dependency.js";

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

/**
 * 读取 Voice Plugin 配置。
 *
 * 关键点（中文）
 * - 行为配置与转写依赖配置统一收敛到 `plugins.voice`。
 */
function readVoicePluginConfig(runtime: {
  config: {
    plugins?: Record<string, unknown>;
  };
}): VoicePluginConfig {
  const current = runtime.config.plugins?.voice;
  const normalized =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as VoicePluginConfig)
      : {};
  return {
    enabled: normalized.enabled === true,
    injectPrompt:
      typeof normalized.injectPrompt === "boolean"
        ? normalized.injectPrompt
        : true,
    augmentMessage:
      typeof normalized.augmentMessage === "boolean"
        ? normalized.augmentMessage
        : true,
    provider:
      normalized.provider === "command" || normalized.provider === "local"
        ? normalized.provider
        : "local",
    ...(typeof normalized.modelId === "string" ? { modelId: normalized.modelId } : {}),
    ...(typeof normalized.modelsDir === "string" ? { modelsDir: normalized.modelsDir } : {}),
    ...(typeof normalized.pythonBin === "string" ? { pythonBin: normalized.pythonBin } : {}),
    ...(typeof normalized.command === "string" ? { command: normalized.command } : {}),
    ...(typeof normalized.language === "string" ? { language: normalized.language } : {}),
    ...(typeof normalized.timeoutMs === "number" ? { timeoutMs: normalized.timeoutMs } : {}),
    ...(typeof normalized.strategy === "string" ? { strategy: normalized.strategy } : {}),
    ...(Array.isArray(normalized.installedModels)
      ? { installedModels: normalized.installedModels }
      : {}),
  };
}

/**
 * 写入完整 voice plugin 配置。
 */
async function writeVoicePluginConfig(params: {
  runtime: {
    rootPath: string;
    config: {
      plugins?: Record<string, unknown>;
    };
  };
  value: VoicePluginConfig;
}): Promise<void> {
  if (!params.runtime.config.plugins) {
    params.runtime.config.plugins = {};
  }
  params.runtime.config.plugins.voice = (toJsonObject(params.value) || {}) as JsonObject;
  await persistProjectPluginConfig({
    projectRoot: params.runtime.rootPath,
    sections: {
      plugins: params.runtime.config.plugins as Record<string, JsonObject>,
    },
  });
}

/**
 * voicePlugin：声明式插件定义。
 */
export const voicePlugin: Plugin = {
  name: "voice",
  title: "Voice Message Transcription",
  description:
    "Detects voice and audio attachments in inbound chat messages, runs transcription through the configured voice dependency, and appends readable text so the agent can work with spoken input like normal message content.",
  config: {
    plugin: "voice",
    scope: "project",
    defaultValue: {
      enabled: false,
      injectPrompt: true,
      augmentMessage: true,
      provider: "local",
      modelId: "SenseVoiceSmall",
    },
  },
  async availability(runtime) {
    const config = readVoicePluginConfig(runtime);
    if (config.enabled !== true) {
      return {
        enabled: false,
        available: false,
        reasons: ["voice plugin disabled"],
      };
    }
    const dependencyStatus = await checkVoiceTranscriber(runtime);
    return {
      enabled: true,
      available: dependencyStatus.available,
      reasons: dependencyStatus.reasons,
    };
  },
  hooks: {
    pipeline: {
      [CHAT_PLUGIN_POINTS.augmentInbound]: [
        async ({ runtime, value }) => {
          const input = value as unknown as ChatInboundAugmentInput;
          const voiceAttachments = (Array.isArray(input.attachments) ? input.attachments : []).filter(
            (item) =>
              (item.kind === "voice" || item.kind === "audio") &&
              typeof item.path === "string" &&
              item.path.trim(),
          );
          if (voiceAttachments.length === 0) {
            return input as unknown as JsonValue;
          }

          const pluginSections = Array.isArray(input.pluginSections)
            ? [...input.pluginSections]
            : [];

          for (const attachment of voiceAttachments) {
            try {
              const result = await transcribeWithVoiceDependency({
                runtime,
                audioPath: String(attachment.path || "").trim(),
              });
              const text = typeof result.text === "string" ? result.text.trim() : "";
              if (!text) continue;

              const absPath = String(attachment.path || "").trim();
              const rel = absPath.startsWith(`${runtime.rootPath}/`)
                ? absPath.slice(runtime.rootPath.length + 1)
                : absPath;
              pluginSections.push(`【语音转写 ${attachment.kind}: ${rel}】\n${text}`);
            } catch {
              // 关键点（中文）：转写失败不阻塞主链路，保持 best-effort。
            }
          }

          return {
            ...input,
            pluginSections,
          } as unknown as JsonValue;
        },
      ],
    },
  },
  actions: {
    status: {
      command: {
        description: "查看 voice plugin 当前状态",
        mapInput() {
          return {};
        },
      },
      execute: async ({ runtime }) => {
        const config = readVoicePluginConfig(runtime);
        const availability = await voicePlugin.availability!(runtime);
        const transcriberConfig = readVoiceTranscriberConfig(runtime);
        return {
          success: true,
          data: {
            plugin: toJsonObject(config) || {},
            availability: {
              enabled: availability.enabled,
              available: availability.available,
              reasons: availability.reasons,
            },
            transcriber:
              toJsonObject((transcriberConfig || null) as Record<string, unknown> | null),
          },
        };
      },
    },
    install: {
      command: {
        description: "安装 voice 转写依赖",
        configure(command) {
          command
            .argument("[models...]")
            .option("--active-model <modelId>", "安装完成后设为当前模型")
            .option("--models-dir <path>", "模型目录（可选）")
            .option("--python <bin>", "Python 可执行文件（默认 python3）")
            .option("--no-install-deps", "跳过依赖安装")
            .option("--force", "强制覆盖已存在资源")
            .option("--hf-token <token>", "HuggingFace token（可选）");
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
          };
        },
      },
      execute: async ({ runtime, payload }) => {
        const result = await installVoiceTranscriber({
          runtime,
          input:
            payload && typeof payload === "object" && !Array.isArray(payload)
              ? payload
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
      execute: async ({ runtime, payload }) => {
        const current = readVoicePluginConfig(runtime);
        const next = {
          ...current,
          ...(payload && typeof payload === "object" && !Array.isArray(payload)
            ? payload
            : {}),
        };
        await writeVoicePluginConfig({
          runtime,
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
      command: {
        description: "启用 voice plugin，并可选安装转写依赖",
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
            .option("--no-inject-prompt", "关闭 prompt 注入")
            .option("--no-augment-message", "关闭消息增强");
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
            injectPrompt: getBooleanOpt(opts, "injectPrompt", true),
            augmentMessage: getBooleanOpt(opts, "augmentMessage", true),
            ...(getStringOpt(opts, "hfToken")
              ? { hfToken: getStringOpt(opts, "hfToken") }
              : {}),
          };
        },
      },
      execute: async ({ runtime, payload }) => {
        const nextConfig = {
          ...readVoicePluginConfig(runtime),
          enabled: true,
          injectPrompt:
            typeof (payload as { injectPrompt?: unknown }).injectPrompt === "boolean"
              ? ((payload as { injectPrompt?: boolean }).injectPrompt as boolean)
              : true,
          augmentMessage:
            typeof (payload as { augmentMessage?: unknown }).augmentMessage === "boolean"
              ? ((payload as { augmentMessage?: boolean }).augmentMessage as boolean)
              : true,
        };
        await writeVoicePluginConfig({
          runtime,
          value: nextConfig,
        });
        if ((payload as { install?: unknown }).install !== false) {
          const installResult = await installVoiceTranscriber({
            runtime,
            input:
              payload && typeof payload === "object" && !Array.isArray(payload)
                ? payload
                : undefined,
          });
          if (!installResult.success) {
            return {
              success: false,
              error: installResult.message || "voice dependency install failed",
              message: installResult.message || "voice dependency install failed",
            };
          }
        }
        return {
          success: true,
          data: {
            plugin: toJsonObject(nextConfig) || {},
            transcriber: toJsonObject(readVoiceTranscriberConfig(runtime)) || {},
          },
        };
      },
    },
    off: {
      command: {
        description: "关闭 voice plugin",
        mapInput() {
          return {};
        },
      },
      execute: async ({ runtime }) => {
        const nextConfig = {
          ...readVoicePluginConfig(runtime),
          enabled: false,
        };
        await writeVoicePluginConfig({
          runtime,
          value: nextConfig,
        });
        return {
          success: true,
          data: {
            plugin: toJsonObject(nextConfig) || {},
          },
        };
      },
    },
    use: {
      command: {
        description: "切换 voice 当前转写模型",
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
      execute: async ({ runtime, payload }) => {
        const modelId = String((payload as { modelId?: unknown }).modelId || "").trim();
        const resolvedModelId = resolveVoicePluginModelId(modelId);
        if (!resolvedModelId) {
          return {
            success: false,
            error: `Unsupported voice model: ${modelId}`,
            message: `Unsupported voice model: ${modelId}`,
          };
        }
        const transcriberConfig = await writeVoiceTranscriberConfig({
          runtime,
          value: {
            ...readVoiceTranscriberConfig(runtime),
            modelId: resolvedModelId,
          },
        });
        return {
          success: true,
          data: {
            transcriber: toJsonObject(transcriberConfig as Record<string, unknown>) || {},
          },
        };
      },
    },
    transcribe: {
      command: {
        description: "转写本地音频文件",
        configure(command) {
          command
            .argument("<audioPath>")
            .option("--language <code>", "语言提示（可选，例如 zh / en）");
        },
        mapInput({ args, opts }) {
          const audioPath = String(args[0] || "").trim();
          if (!audioPath) {
            throw new Error("audioPath is required");
          }
          return {
            audioPath,
            ...(getStringOpt(opts, "language")
              ? { language: getStringOpt(opts, "language") }
              : {}),
          };
        },
      },
      execute: async ({ runtime, payload }) => {
        const pluginStatus = await voicePlugin.availability!(runtime);
        if (!pluginStatus.enabled || !pluginStatus.available) {
          return {
            success: false,
            error: pluginStatus.reasons.join("; "),
            message: pluginStatus.reasons.join("; "),
          };
        }
        const result = await transcribeWithVoiceDependency({
          runtime,
          audioPath: String((payload as { audioPath?: unknown }).audioPath || ""),
          language:
            typeof (payload as { language?: unknown }).language === "string"
              ? String((payload as { language?: unknown }).language || "")
              : undefined,
        });
        return {
          success: result.success,
          ...(result !== undefined ? { data: result } : {}),
          ...(result.success ? {} : { error: result.error || "transcribe failed" }),
          ...(result.success ? {} : { message: result.error || "transcribe failed" }),
        };
      },
    },
    models: {
      command: {
        description: "列出内置 voice 支持的模型目录",
        mapInput() {
          return {};
        },
      },
      execute: async () => {
        return {
          success: true,
          data: {
            models: listVoiceModels(),
          },
        };
      },
    },
    doctor: {
      command: {
        description: "检查 voice plugin 与转写依赖可用性",
        mapInput() {
          return {};
        },
      },
      execute: async ({ runtime }) => {
        const availability = await voicePlugin.availability!(runtime);
        const dependencyStatus = await checkVoiceTranscriber(runtime);
        return {
          success: availability.available,
          data: {
            availability: {
              enabled: availability.enabled,
              available: availability.available,
              reasons: availability.reasons,
            },
            transcriberStatus: {
              available: dependencyStatus.available,
              reasons: dependencyStatus.reasons,
              ...(dependencyStatus.details !== undefined
                ? { details: dependencyStatus.details }
                : {}),
            },
          },
          ...(availability.available
            ? { message: "voice plugin is available" }
            : { message: availability.reasons.join("; ") }),
          ...(availability.available
            ? {}
            : { error: availability.reasons.join("; ") }),
        };
      },
    },
  },
  system(runtime) {
    const config = readVoicePluginConfig(runtime);
    if (config.enabled !== true || config.injectPrompt !== true) {
      return "";
    }
    return [
      "# Voice Plugin",
      "Audio attachments may be transcribed before agent execution.",
    ].join("\n");
  },
};

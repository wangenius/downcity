/**
 * ASR Plugin。
 *
 * 关键点（中文）
 * - ASR Plugin 现在自己内聚转写依赖，不再暴露独立依赖端口心智。
 * - 具体模型、依赖安装、命令模板等实现细节全部收敛到 plugin 内部 dependency helper。
 * - 当前作为 chat 入站消息增强中间件接入语音转写。
 */

import type { Plugin } from "@/types/Plugin.js";
import type { ChatInboundAugmentInput } from "@/types/ChatPlugin.js";
import type { VoicePluginConfig } from "@/types/VoicePlugin.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import { persistProjectPluginConfig } from "@/main/plugin/ProjectConfigStore.js";
import { CHAT_PLUGIN_POINTS } from "@services/chat/runtime/PluginPoints.js";
import {
  listVoiceModels,
  resolveVoicePluginModelId,
} from "@/plugins/asr/ModelCatalog.js";
import {
  checkVoiceTranscriber,
  installVoiceTranscriber,
  readVoiceTranscriberConfig,
  transcribeWithVoiceDependency,
  writeVoiceTranscriberConfig,
} from "@/plugins/asr/Dependency.js";

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
 * 读取 ASR Plugin 配置。
 *
 * 关键点（中文）
 * - 行为配置与转写依赖配置统一收敛到 `plugins.asr`。
 */
function readVoicePluginConfig(runtime: {
  config: {
    plugins?: Record<string, unknown>;
  };
}): VoicePluginConfig {
  const current = runtime.config.plugins?.asr;
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
 * 写入完整 ASR plugin 配置。
 */
async function writeVoicePluginConfig(params: {
  agentState: {
    rootPath: string;
    config: {
      plugins?: Record<string, unknown>;
    };
  };
  value: VoicePluginConfig;
}): Promise<void> {
  if (!params.agentState.config.plugins) {
    params.agentState.config.plugins = {};
  }
  params.agentState.config.plugins.asr = (toJsonObject(params.value) || {}) as JsonObject;
  await persistProjectPluginConfig({
    projectRoot: params.agentState.rootPath,
    sections: {
      plugins: params.agentState.config.plugins as Record<string, JsonObject>,
    },
  });
}

/**
 * asrPlugin：声明式插件定义。
 */
export const asrPlugin: Plugin = {
  name: "asr",
  title: "Automatic Speech Recognition",
  description:
    "Detects voice and audio attachments in inbound chat messages, runs transcription through the configured ASR dependency, and appends readable text so the agent can work with spoken input like normal message content.",
  config: {
    plugin: "asr",
    scope: "project",
    defaultValue: {
      enabled: false,
      injectPrompt: true,
      augmentMessage: true,
      provider: "local",
      modelId: "SenseVoiceSmall",
    },
  },
  setup: {
    mode: "install-configure",
    title: "安装语音识别",
    description: "选择模型后即可完成依赖安装与当前配置写入。",
    fields: [
      {
        key: "modelId",
        label: "模型",
        type: "select",
        required: true,
        sourceAction: "models",
      },
      {
        key: "installDeps",
        label: "安装 Python 依赖",
        type: "checkbox",
      },
    ],
    primaryAction: "install",
    statusAction: "status",
  },
  async availability(context) {
    const config = readVoicePluginConfig(context);
    if (config.enabled !== true) {
      return {
        enabled: false,
        available: false,
        reasons: ["asr plugin disabled"],
      };
    }
    const dependencyStatus = await checkVoiceTranscriber(context);
    return {
      enabled: true,
      available: dependencyStatus.available,
      reasons: dependencyStatus.reasons,
    };
  },
  hooks: {
    pipeline: {
      [CHAT_PLUGIN_POINTS.augmentInbound]: [
        async ({ context, value }) => {
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
                context,
                audioPath: String(attachment.path || "").trim(),
              });
              const text = typeof result.text === "string" ? result.text.trim() : "";
              if (!text) continue;

              const absPath = String(attachment.path || "").trim();
              const rel = absPath.startsWith(`${context.rootPath}/`)
                ? absPath.slice(context.rootPath.length + 1)
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
      allowWhenDisabled: true,
      command: {
        description: "查看 asr plugin 当前状态",
        mapInput() {
          return {};
        },
      },
      execute: async ({ context }) => {
        const config = readVoicePluginConfig(context);
        const availability = await asrPlugin.availability!(context);
        const transcriberConfig = readVoiceTranscriberConfig(context);
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
      allowWhenDisabled: true,
      command: {
        description: "安装 asr 转写依赖",
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
      execute: async ({ context, payload }) => {
        const result = await installVoiceTranscriber({
          context,
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
      allowWhenDisabled: true,
      execute: async ({ context, payload }) => {
        const current = readVoicePluginConfig(context);
        const next = {
          ...current,
          ...(payload && typeof payload === "object" && !Array.isArray(payload)
            ? payload
            : {}),
        };
        await writeVoicePluginConfig({
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
        description: "启用 asr plugin，并可选安装转写依赖",
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
      execute: async ({ context, payload }) => {
        const nextConfig = {
          ...readVoicePluginConfig(context),
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
          agentState: context,
          value: nextConfig,
        });
        if ((payload as { install?: unknown }).install !== false) {
          const installResult = await installVoiceTranscriber({
            context,
            input:
              payload && typeof payload === "object" && !Array.isArray(payload)
                ? payload
                : undefined,
          });
          if (!installResult.success) {
            return {
              success: false,
              error: installResult.message || "asr dependency install failed",
              message: installResult.message || "asr dependency install failed",
            };
          }
        }
        return {
          success: true,
          data: {
            plugin: toJsonObject(nextConfig) || {},
            transcriber: toJsonObject(readVoiceTranscriberConfig(context)) || {},
          },
        };
      },
    },
    off: {
      command: {
        description: "关闭 asr plugin",
        mapInput() {
          return {};
        },
      },
      execute: async ({ context }) => {
        const nextConfig = {
          ...readVoicePluginConfig(context),
          enabled: false,
        };
        await writeVoicePluginConfig({
          agentState: context,
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
        description: "切换 asr 当前转写模型",
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
        const resolvedModelId = resolveVoicePluginModelId(modelId);
        if (!resolvedModelId) {
          return {
            success: false,
            error: `Unsupported asr model: ${modelId}`,
            message: `Unsupported asr model: ${modelId}`,
          };
        }
        const transcriberConfig = await writeVoiceTranscriberConfig({
          context,
          value: {
            ...readVoiceTranscriberConfig(context),
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
      execute: async ({ context, payload }) => {
        const pluginStatus = await asrPlugin.availability!(context);
        if (!pluginStatus.enabled || !pluginStatus.available) {
          return {
            success: false,
            error: pluginStatus.reasons.join("; "),
            message: pluginStatus.reasons.join("; "),
          };
        }
        const result = await transcribeWithVoiceDependency({
          context,
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
      allowWhenDisabled: true,
      command: {
        description: "列出内置 asr 支持的模型目录",
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
        description: "检查 asr plugin 与转写依赖可用性",
        mapInput() {
          return {};
        },
      },
      execute: async ({ context }) => {
        const availability = await asrPlugin.availability!(context);
        const dependencyStatus = await checkVoiceTranscriber(context);
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
            ? { message: "asr plugin is available" }
            : { message: availability.reasons.join("; ") }),
          ...(availability.available
            ? {}
            : { error: availability.reasons.join("; ") }),
        };
      },
    },
  },
  system(context) {
    const config = readVoicePluginConfig(context);
    if (config.enabled !== true || config.injectPrompt !== true) {
      return "";
    }
    return [
      "# ASR Plugin",
      "Audio attachments may be transcribed before agent execution.",
    ].join("\n");
  },
};

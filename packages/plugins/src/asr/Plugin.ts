/**
 * ASR Plugin。
 *
 * 关键点（中文）
 * - ASR Plugin 现在自己内聚转写依赖，不再暴露独立依赖端口心智。
 * - 具体模型、依赖安装、命令模板等实现细节全部收敛到 plugin 内部 dependency helper。
 * - 当前作为 chat 入站消息增强中间件接入语音转写。
 */

import { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import type { Plugin } from "@downcity/agent/internal/plugin/types/Plugin.js";
import type { VoicePluginConfig } from "@/voice/types/VoicePlugin.js";
import { CHAT_PLUGIN_POINTS } from "@/chat/runtime/PluginPoints.js";
import { isPluginEnabled } from "@downcity/agent/internal/plugin/core/Activation.js";
import { writeProjectPluginEnabled } from "@downcity/agent/internal/plugin/core/ProjectConfigStore.js";
import {
  listVoiceModels,
  resolveVoicePluginModelId,
} from "@/asr/ModelCatalog.js";
import {
  getBooleanOpt,
  getStringOpt,
  readVoicePluginConfig,
  toJsonObject,
  writeVoicePluginConfig,
} from "@/asr/Config.js";
import { augmentAsrInboundMessage } from "@/asr/InboundAugment.js";
import {
  checkVoiceTranscriber,
  installVoiceTranscriber,
  readVoiceTranscriberConfig,
  transcribeWithVoiceDependency,
  writeVoiceTranscriberConfig,
} from "@/asr/Dependency.js";

function createAsrPluginDefinition(plugin: Plugin): Plugin {
  return {
    name: "asr",
  title: "Automatic Speech Recognition",
  description:
    "Detects voice and audio attachments in inbound chat messages, runs transcription through the configured ASR dependency, and appends readable text so the agent can work with spoken input like normal message content.",
  config: {
    plugin: "asr",
    scope: "project",
    defaultValue: {
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
  usage: {
    title: "配置语音识别",
    description: "设置当前 agent 如何把语音内容转成文本并注入对话链路。",
    fields: [
      {
        key: "injectPrompt",
        label: "注入 Prompt 提示",
        type: "boolean",
        trueLabel: "开启",
        falseLabel: "关闭",
        description: "开启后会把 ASR 使用约束注入到 agent 的系统提示词。",
      },
      {
        key: "augmentMessage",
        label: "自动增强消息",
        type: "boolean",
        trueLabel: "开启",
        falseLabel: "关闭",
        description: "开启后，入站语音消息会先自动转写再交给 agent。",
      },
      {
        key: "modelId",
        label: "默认模型",
        type: "select",
        sourceAction: "models",
      },
      {
        key: "language",
        label: "默认语言提示",
        type: "string",
        placeholder: "auto / zh / en",
      },
      {
        key: "timeoutMs",
        label: "超时（毫秒）",
        type: "number",
        placeholder: "60000",
      },
    ],
    saveAction: "configure",
    statusAction: "status",
  },
  async availability(context) {
    if (!isPluginEnabled({ plugin, context })) {
      return {
        enabled: false,
        available: false,
        reasons: ["asr plugin disabled in project config"],
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
          return await augmentAsrInboundMessage({ context, value });
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
        const availability = await plugin.availability!(context);
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
        const payloadObject =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Partial<VoicePluginConfig> & Record<string, unknown>)
            : {};
        const { enabled: _ignoredEnabled, ...patch } = payloadObject;
        const current = readVoicePluginConfig(context);
        const next = {
          ...current,
          ...(patch as Partial<VoicePluginConfig>),
        } satisfies VoicePluginConfig;
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
        await writeProjectPluginEnabled({
          pluginName: "asr",
          enabled: true,
          context,
        });
        const nextConfig = {
          ...readVoicePluginConfig(context),
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
        await writeProjectPluginEnabled({
          pluginName: "asr",
          enabled: false,
          context,
        });
        return {
          success: true,
          data: {
            plugin: toJsonObject(readVoicePluginConfig(context) as Record<string, unknown>) || {},
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
        const pluginStatus = await plugin.availability!(context);
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
        const availability = await plugin.availability!(context);
        const dependencyStatus = await checkVoiceTranscriber(context);
        return {
          success: true,
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
          message: availability.available
            ? "asr plugin is available"
            : availability.reasons.join("; ") || "asr plugin is not available",
        };
      },
    },
  },
  system(context) {
    const config = readVoicePluginConfig(context);
    if (!isPluginEnabled({ plugin, context }) || config.injectPrompt !== true) {
      return "";
    }
    return [
      "# ASR Plugin",
      "Audio attachments may be transcribed before agent execution.",
    ].join("\n");
  },
  };
}

/**
 * AsrPlugin：语音识别插件。
 */
export class AsrPlugin extends BasePlugin {
  readonly name = "asr";

  constructor() {
    super();
    Object.assign(this, createAsrPluginDefinition(this));
  }
}

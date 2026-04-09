/**
 * LMP（Local Model Provider）Plugin。
 *
 * 关键点（中文）
 * - 本插件负责本地 GGUF 模型目录、模型下载和 `llama-server` 运行参数管理。
 * - `local executor` 只消费这里落下来的 `plugins.lmp` 配置，不再自己维护模型路径。
 * - 当前只实现 `llama.cpp` 链路，因此 provider 固定为 `llama`。
 */

import type { Plugin } from "@/shared/types/Plugin.js";
import type { JsonObject, JsonValue } from "@/shared/types/Json.js";
import type { LmpInstallInput, LmpPluginConfig } from "@/shared/types/LmpPlugin.js";
import { isPluginEnabled } from "@/main/plugin/Activation.js";
import { setCityPluginEnabled } from "@/main/plugin/Lifecycle.js";
import {
  checkLmpEnvironment,
  installLmpModel,
  listLmpModelOptions,
} from "@/plugins/lmp/Dependency.js";
import {
  readLmpPluginConfig,
  resolveLmpRuntimeConfig,
  writeLmpPluginConfig,
} from "@/plugins/lmp/runtime/Config.js";

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
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * lmpPlugin：本地模型 provider 管理插件。
 */
export const lmpPlugin: Plugin = {
  name: "lmp",
  title: "Local Model Provider",
  description:
    "Manages local GGUF model files, Hugging Face downloads, and llama-server runtime settings for the local executor.",
  config: {
    plugin: "lmp",
    scope: "project",
    defaultValue: {
      provider: "llama",
      modelsDir: "~/.models",
      command: "llama-server",
      autoStart: true,
    },
  },
  setup: {
    mode: "install-configure",
    title: "安装本地模型",
    description: "选择一个本地 GGUF 模型并写入当前激活配置；必要时也可通过 install action 下载模型。",
    fields: [
      {
        key: "activeModel",
        label: "模型",
        type: "select",
        required: true,
        sourceAction: "models",
      },
    ],
    primaryAction: "install",
    statusAction: "status",
  },
  usage: {
    title: "配置本地模型运行参数",
    description: "设置当前 agent 使用本地模型时的默认模型与 llama-server 运行参数。",
    fields: [
      {
        key: "model",
        label: "当前模型",
        type: "select",
        required: true,
        sourceAction: "models",
      },
      {
        key: "command",
        label: "llama-server 命令",
        type: "string",
        placeholder: "llama-server",
      },
      {
        key: "host",
        label: "监听 Host",
        type: "string",
        placeholder: "127.0.0.1",
      },
      {
        key: "port",
        label: "监听端口",
        type: "number",
        placeholder: "留空则自动分配",
      },
      {
        key: "contextSize",
        label: "上下文窗口",
        type: "number",
        placeholder: "8192",
      },
      {
        key: "gpuLayers",
        label: "GPU Layers",
        type: "number",
        placeholder: "可选",
      },
      {
        key: "autoStart",
        label: "自动启动 llama-server",
        type: "boolean",
        trueLabel: "自动",
        falseLabel: "手动",
      },
    ],
    saveAction: "configure",
    statusAction: "status",
  },
  async availability(context) {
    if (!isPluginEnabled({ plugin: lmpPlugin })) {
      return {
        enabled: false,
        available: false,
        reasons: ["lmp plugin disabled in city config"],
      };
    }
    const doctor = await checkLmpEnvironment(context);
    return {
      enabled: true,
      available: doctor.available,
      reasons: doctor.reasons,
    };
  },
  actions: {
    status: {
      allowWhenDisabled: true,
      command: {
        description: "查看 lmp plugin 当前状态",
        mapInput() {
          return {};
        },
      },
      execute: async ({ context }) => {
        const plugin = readLmpPluginConfig(context.config);
        const availability = await lmpPlugin.availability!(context);
        const doctor = await checkLmpEnvironment(context);
        let runtime: Record<string, unknown> | null = null;
        try {
          const resolved = resolveLmpRuntimeConfig({
            projectRoot: context.rootPath,
            config: context.config,
          });
          runtime = {
            provider: resolved.provider,
            modelsDir: resolved.modelsDir,
            model: resolved.model,
            modelPath: resolved.modelPath,
            modelName: resolved.modelName,
            command: resolved.command,
            host: resolved.host,
            port: resolved.port || null,
            contextSize: resolved.contextSize,
            gpuLayers: resolved.gpuLayers ?? null,
            autoStart: resolved.autoStart,
          };
        } catch (error) {
          runtime = {
            error: error instanceof Error ? error.message : String(error),
          };
        }
        return {
          success: true,
          data: {
            plugin: toJsonObject(plugin as Record<string, unknown>) || {},
            availability: toJsonObject(availability as unknown as Record<string, unknown>) || {},
            doctor: toJsonObject(doctor as unknown as Record<string, unknown>) || {},
            runtime: toJsonObject(runtime) || {},
          },
        };
      },
    },
    doctor: {
      allowWhenDisabled: true,
      command: {
        description: "检查 lmp plugin 依赖状态",
        mapInput() {
          return {};
        },
      },
      execute: async ({ context }) => {
        const doctor = await checkLmpEnvironment(context);
        return {
          success: true,
          data: toJsonObject(doctor as unknown as Record<string, unknown>) || {},
        };
      },
    },
    models: {
      allowWhenDisabled: true,
      command: {
        description: "列出当前可用的本地 GGUF 模型",
        configure(command) {
          command.option("--models-dir <path>", "模型目录（默认取 plugins.lmp.modelsDir）");
        },
        mapInput({ opts }) {
          return {
            ...(getStringOpt(opts, "modelsDir")
              ? { modelsDir: getStringOpt(opts, "modelsDir") }
              : {}),
          };
        },
      },
      execute: async ({ context, payload }) => {
        const options = await listLmpModelOptions({
          ...context,
          config:
            payload &&
            typeof payload === "object" &&
            !Array.isArray(payload) &&
            typeof payload.modelsDir === "string"
              ? {
                  ...context.config,
                  plugins: {
                    ...(context.config.plugins || {}),
                    lmp: {
                      ...(context.config.plugins?.lmp || {}),
                      modelsDir: payload.modelsDir,
                    },
                  },
                }
              : context.config,
        });
        return {
          success: true,
          data: {
            options,
          },
        };
      },
    },
    configure: {
      allowWhenDisabled: true,
      command: {
        description: "写入 lmp plugin 配置",
        configure(command) {
          command
            .option("--model <file>", "当前激活模型文件名或绝对路径")
            .option("--models-dir <path>", "模型目录")
            .option("--command <bin>", "llama-server 命令")
            .option("--host <host>", "监听 host")
            .option("--port <port>", "监听端口")
            .option("--context-size <n>", "上下文窗口大小")
            .option("--gpu-layers <n>", "GPU offload 层数")
            .option("--auto-start [enabled]", "是否自动启动 llama-server");
        },
        mapInput({ opts }) {
          return {
            ...(getStringOpt(opts, "model") ? { model: getStringOpt(opts, "model") } : {}),
            ...(getStringOpt(opts, "modelsDir")
              ? { modelsDir: getStringOpt(opts, "modelsDir") }
              : {}),
            ...(getStringOpt(opts, "command")
              ? { command: getStringOpt(opts, "command") }
              : {}),
            ...(getStringOpt(opts, "host") ? { host: getStringOpt(opts, "host") } : {}),
            ...(getNumberOpt(opts, "port") ? { port: getNumberOpt(opts, "port") } : {}),
            ...(getNumberOpt(opts, "contextSize")
              ? { contextSize: getNumberOpt(opts, "contextSize") }
              : {}),
            ...(getNumberOpt(opts, "gpuLayers") !== undefined
              ? { gpuLayers: getNumberOpt(opts, "gpuLayers") }
              : {}),
            autoStart: getBooleanOpt(opts, "autoStart", true),
          };
        },
      },
      execute: async ({ context, payload }) => {
        const current = readLmpPluginConfig(context.config);
        const nextConfig = await writeLmpPluginConfig({
          config: context.config,
          pluginConfig: context.pluginConfig,
          value: {
            ...current,
            ...((payload && typeof payload === "object" && !Array.isArray(payload))
              ? (payload as LmpPluginConfig)
              : {}),
            provider: "llama",
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
    use: {
      allowWhenDisabled: true,
      command: {
        description: "切换当前激活的本地模型",
        configure(command) {
          command
            .argument("<model>")
            .option("--models-dir <path>", "模型目录（可选）");
        },
        mapInput({ args, opts }) {
          return {
            activeModel: String(args[0] || "").trim(),
            ...(getStringOpt(opts, "modelsDir")
              ? { modelsDir: getStringOpt(opts, "modelsDir") }
              : {}),
            skipDownload: true,
          };
        },
      },
      execute: async ({ context, payload }) => {
        const result = await installLmpModel({
          context,
          input:
            payload && typeof payload === "object" && !Array.isArray(payload)
              ? (payload as LmpInstallInput)
              : {},
        });
        return {
          success: true,
          data: result,
        };
      },
    },
    install: {
      allowWhenDisabled: true,
      command: {
        description: "下载或激活本地 GGUF 模型",
        configure(command) {
          command
            .argument("[activeModel]")
            .option("--repo-id <repoId>", "Hugging Face 仓库 ID")
            .option("--filename <filename>", "需要下载的 GGUF 文件名")
            .option("--models-dir <path>", "模型目录（默认 ~/.models）")
            .option("--skip-download", "跳过下载，仅写入当前配置")
            .option("--hf-token <token>", "Hugging Face token（可选）");
        },
        mapInput({ args, opts }) {
          return {
            ...(String(args[0] || "").trim()
              ? { activeModel: String(args[0] || "").trim() }
              : {}),
            ...(getStringOpt(opts, "repoId")
              ? { repoId: getStringOpt(opts, "repoId") }
              : {}),
            ...(getStringOpt(opts, "filename")
              ? { filename: getStringOpt(opts, "filename") }
              : {}),
            ...(getStringOpt(opts, "modelsDir")
              ? { modelsDir: getStringOpt(opts, "modelsDir") }
              : {}),
            ...(getStringOpt(opts, "hfToken")
              ? { hfToken: getStringOpt(opts, "hfToken") }
              : {}),
            skipDownload: getBooleanOpt(opts, "skipDownload", false),
          };
        },
      },
      execute: async ({ context, payload }) => {
        const result = await installLmpModel({
          context,
          input:
            payload && typeof payload === "object" && !Array.isArray(payload)
              ? (payload as LmpInstallInput)
              : {},
        });
        return {
          success: true,
          data: result,
        };
      },
    },
    on: {
      allowWhenDisabled: true,
      command: {
        description: "全局启用 lmp plugin",
        mapInput() {
          return {};
        },
      },
      execute: async () => {
        setCityPluginEnabled("lmp", true);
        return {
          success: true,
          data: {
            enabled: true,
          },
        };
      },
    },
  },
};

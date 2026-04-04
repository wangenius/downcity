/**
 * Web Plugin。
 *
 * 关键点（中文）
 * - `web` plugin 不再自实现联网与浏览器能力，只负责 provider 选择、状态检查与提示词注入。
 * - 真正的联网逻辑直接交给外部实现：`web-access` 或 `agent-browser`。
 */

import { readFileSync } from "node:fs";
import type { Plugin } from "@/shared/types/Plugin.js";
import type { JsonObject, JsonValue } from "@/shared/types/Json.js";
import type { WebPluginConfig, WebPluginInstallInput } from "@/shared/types/WebPlugin.js";
import { WEB_PLUGIN_DEFAULT_REPOSITORY_URL } from "@/shared/types/WebPlugin.js";
import {
  doctorWebPluginDependency,
  inspectWebPluginDependency,
  installWebPluginDependency,
  readWebPluginConfig,
  writeWebPluginConfig,
} from "@/plugins/web/Dependency.js";

const WEB_PLUGIN_PROMPT_FILE_URL = new URL("./PROMPT.txt", import.meta.url);
const WEB_ACCESS_PROMPT_FILE_URL = new URL("./PROMPT.web-access.txt", import.meta.url);
const AGENT_BROWSER_PROMPT_FILE_URL = new URL("./PROMPT.agent-browser.txt", import.meta.url);

function loadPrompt(fileUrl: URL): string {
  try {
    return readFileSync(fileUrl, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to load prompt ${fileUrl.pathname}: ${reason}`);
  }
}

const WEB_PLUGIN_PROMPT = loadPrompt(WEB_PLUGIN_PROMPT_FILE_URL);
const WEB_ACCESS_PROMPT = loadPrompt(WEB_ACCESS_PROMPT_FILE_URL);
const AGENT_BROWSER_PROMPT = loadPrompt(AGENT_BROWSER_PROMPT_FILE_URL);

function toJsonObject(input: Record<string, unknown> | null | undefined): JsonObject {
  const out: JsonObject = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
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

function getWebProviderOpt(
  opts: Record<string, JsonValue>,
  key: string,
): "web-access" | "agent-browser" | undefined {
  const value = getStringOpt(opts, key);
  if (value === "web-access" || value === "agent-browser") return value;
  return undefined;
}

function getInstallScopeOpt(
  opts: Record<string, JsonValue>,
  key: string,
): "user" | "project" | undefined {
  const value = getStringOpt(opts, key);
  if (value === "user" || value === "project") return value;
  return undefined;
}

/**
 * webPlugin：provider 选择器与提示词适配层。
 */
export const webPlugin: Plugin = {
  name: "web",
  title: "Web Access",
  description:
    "Connects the agent to either web-access or agent-browser, checks provider readiness, and injects the matching guidance into the runtime prompt.",
  config: {
    plugin: "web",
    scope: "project",
    defaultValue: {
      enabled: true,
      provider: "web-access",
      injectPrompt: true,
      repositoryUrl: WEB_PLUGIN_DEFAULT_REPOSITORY_URL,
      sourceVersion: "2.4.1",
      browserCommand: "agent-browser",
      installScope: "user",
    },
  },
  setup: {
    mode: "install-configure",
    title: "安装联网 Provider",
    description: "把 provider 安装到统一 skill 目录，并同步当前配置。",
    fields: [
      {
        key: "provider",
        label: "联网方法",
        type: "select",
        required: true,
        sourceAction: "providers",
      },
      {
        key: "installScope",
        label: "安装位置",
        type: "select",
        required: true,
        options: [
          { label: "用户目录", value: "user", hint: "~/.agents/skills" },
          { label: "项目目录", value: "project", hint: "PROJECT/.agents/skills" },
        ],
      },
      {
        key: "injectPrompt",
        label: "注入 provider 提示词",
        type: "checkbox",
      },
    ],
    primaryAction: "install",
    statusAction: "status",
  },
  async availability(context) {
    const config = readWebPluginConfig(context);
    if (!config.enabled) {
      return {
        enabled: false,
        available: false,
        reasons: ["web plugin disabled"],
      };
    }
    const dependency = await inspectWebPluginDependency(context);
    return {
      enabled: true,
      available: dependency.available,
      reasons: dependency.reasons,
    };
  },
  actions: {
    status: {
      allowWhenDisabled: true,
      command: {
        description: "查看 web plugin 当前状态",
        mapInput() {
          return {};
        },
      },
      execute: async ({ context }) => {
        const config = readWebPluginConfig(context);
        const availability = await webPlugin.availability!(context);
        const source = await inspectWebPluginDependency(context);
        return {
          success: true,
          data: {
            plugin: toJsonObject(config as unknown as Record<string, unknown>),
            availability: {
              enabled: availability.enabled,
              available: availability.available,
              reasons: availability.reasons,
            },
            provider: source.details || null,
          },
        };
      },
    },
    providers: {
      allowWhenDisabled: true,
      command: {
        description: "列出 web plugin 支持的 provider",
        mapInput() {
          return {};
        },
      },
      execute: async () => {
        return {
          success: true,
          data: {
            options: [
              {
                value: "web-access",
                title: "web-access",
                description: "适合网页搜索、信息查证与策略型联网任务",
              },
              {
                value: "agent-browser",
                title: "agent-browser",
                description: "适合动态页面、登录态页面与真实浏览器操作",
              },
            ],
            providers: [
              {
                value: "web-access",
                title: "web-access",
                description: "适合网页搜索、信息查证与策略型联网任务",
              },
              {
                value: "agent-browser",
                title: "agent-browser",
                description: "适合动态页面、登录态页面与真实浏览器操作",
              },
            ],
          },
        };
      },
    },
    configure: {
      allowWhenDisabled: true,
      execute: async ({ context, payload }) => {
        const nextConfig = await writeWebPluginConfig({
          context,
          value:
            payload && typeof payload === "object" && !Array.isArray(payload)
              ? (payload as Partial<WebPluginConfig>)
              : {},
        });
        return {
          success: true,
          data: {
            plugin: toJsonObject(nextConfig as unknown as Record<string, unknown>),
          },
        };
      },
    },
    install: {
      allowWhenDisabled: true,
      command: {
        description: "安装当前 provider 对应的 skill，并写入配置",
        configure(command) {
          command
            .option("--provider <provider>", "web-access 或 agent-browser")
            .option("--repo <url>", "记录来源仓库地址")
            .option("--version <version>", "记录来源版本")
            .option("--browser-command <command>", "agent-browser 命令名")
            .option("--scope <scope>", "安装位置：user 或 project")
            .option("--enable", "启用 plugin", true)
            .option("--no-inject-prompt", "关闭 provider 提示词注入");
        },
        mapInput({ opts }): JsonValue {
          return {
            ...(getWebProviderOpt(opts, "provider")
              ? { provider: getWebProviderOpt(opts, "provider") }
              : {}),
            ...(getStringOpt(opts, "repo")
              ? { repositoryUrl: getStringOpt(opts, "repo") }
              : {}),
            ...(getStringOpt(opts, "version")
              ? { sourceVersion: getStringOpt(opts, "version") }
              : {}),
            ...(getStringOpt(opts, "browserCommand")
              ? { browserCommand: getStringOpt(opts, "browserCommand") }
              : {}),
            ...(getInstallScopeOpt(opts, "scope")
              ? { installScope: getInstallScopeOpt(opts, "scope") }
              : {}),
            enable: getBooleanOpt(opts, "enable", true),
            injectPrompt: getBooleanOpt(opts, "injectPrompt", true),
          } as JsonObject;
        },
      },
      execute: async ({ context, payload }) => {
        const result = await installWebPluginDependency({
          context,
          input:
            payload && typeof payload === "object" && !Array.isArray(payload)
              ? (payload as WebPluginInstallInput)
              : undefined,
        });
        return {
          success: result.success,
          ...(result.details ? { data: result.details } : {}),
          ...(result.message ? { message: result.message } : {}),
        };
      },
    },
    on: {
      allowWhenDisabled: true,
      command: {
        description: "启用 web plugin，并可选设置 provider",
        configure(command) {
          command
            .option("--provider <provider>", "web-access 或 agent-browser")
            .option("--repo <url>", "记录来源仓库地址")
            .option("--version <version>", "记录来源版本")
            .option("--browser-command <command>", "agent-browser 命令名")
            .option("--no-inject-prompt", "关闭 provider 提示词注入");
        },
        mapInput({ opts }): JsonValue {
          return {
            ...(getWebProviderOpt(opts, "provider")
              ? { provider: getWebProviderOpt(opts, "provider") }
              : {}),
            ...(getStringOpt(opts, "repo")
              ? { repositoryUrl: getStringOpt(opts, "repo") }
              : {}),
            ...(getStringOpt(opts, "version")
              ? { sourceVersion: getStringOpt(opts, "version") }
              : {}),
            ...(getStringOpt(opts, "browserCommand")
              ? { browserCommand: getStringOpt(opts, "browserCommand") }
              : {}),
            injectPrompt: getBooleanOpt(opts, "injectPrompt", true),
          } as JsonObject;
        },
      },
      execute: async ({ context, payload }) => {
        const providerRaw = String((payload as { provider?: unknown }).provider || "").trim();
        const provider =
          providerRaw === "web-access" || providerRaw === "agent-browser"
            ? providerRaw
            : undefined;
        const nextConfig = await writeWebPluginConfig({
          context,
          value: {
            ...readWebPluginConfig(context),
            enabled: true,
            ...(provider ? { provider } : {}),
            injectPrompt:
              typeof (payload as { injectPrompt?: unknown }).injectPrompt === "boolean"
                ? Boolean((payload as { injectPrompt?: unknown }).injectPrompt)
                : true,
            ...(typeof (payload as { repositoryUrl?: unknown }).repositoryUrl === "string"
              ? { repositoryUrl: String((payload as { repositoryUrl?: unknown }).repositoryUrl) }
              : {}),
            ...(typeof (payload as { sourceVersion?: unknown }).sourceVersion === "string"
              ? { sourceVersion: String((payload as { sourceVersion?: unknown }).sourceVersion) }
              : {}),
            ...(typeof (payload as { browserCommand?: unknown }).browserCommand === "string"
              ? { browserCommand: String((payload as { browserCommand?: unknown }).browserCommand) }
              : {}),
          },
        });
        return {
          success: true,
          data: {
            plugin: toJsonObject(nextConfig as unknown as Record<string, unknown>),
          },
        };
      },
    },
    off: {
      command: {
        description: "关闭 web plugin",
        mapInput() {
          return {};
        },
      },
      execute: async ({ context }) => {
        const nextConfig = await writeWebPluginConfig({
          context,
          value: {
            ...readWebPluginConfig(context),
            enabled: false,
          },
        });
        return {
          success: true,
          data: {
            plugin: toJsonObject(nextConfig as unknown as Record<string, unknown>),
          },
        };
      },
    },
    use: {
      allowWhenDisabled: true,
      command: {
        description: "切换 web plugin 当前 provider",
        configure(command) {
          command
            .argument("<provider>")
            .option("--browser-command <command>", "agent-browser 命令名")
            .option("--no-inject-prompt", "关闭 provider 提示词注入");
        },
        mapInput({ args, opts }): JsonValue {
          const provider = String(args[0] || "").trim();
          if (!provider) throw new Error("provider is required");
          return {
            provider,
            ...(getStringOpt(opts, "browserCommand")
              ? { browserCommand: getStringOpt(opts, "browserCommand") }
              : {}),
            injectPrompt: getBooleanOpt(opts, "injectPrompt", true),
          } as JsonObject;
        },
      },
      execute: async ({ context, payload }) => {
        const provider = String((payload as { provider?: unknown }).provider || "").trim();
        if (provider !== "web-access" && provider !== "agent-browser") {
          return {
            success: false,
            error: `Unsupported web provider: ${provider}`,
            message: `Unsupported web provider: ${provider}`,
          };
        }
        const nextConfig = await writeWebPluginConfig({
          context,
          value: {
            ...readWebPluginConfig(context),
            provider,
            injectPrompt:
              typeof (payload as { injectPrompt?: unknown }).injectPrompt === "boolean"
                ? Boolean((payload as { injectPrompt?: unknown }).injectPrompt)
                : true,
            ...(typeof (payload as { browserCommand?: unknown }).browserCommand === "string"
              ? { browserCommand: String((payload as { browserCommand?: unknown }).browserCommand) }
              : {}),
          },
        });
        return {
          success: true,
          data: {
            plugin: toJsonObject(nextConfig as unknown as Record<string, unknown>),
          },
        };
      },
    },
    doctor: {
      allowWhenDisabled: true,
      command: {
        description: "检查当前 provider 是否已就绪",
        mapInput() {
          return {};
        },
      },
      execute: async ({ context }) => {
        const availability = await webPlugin.availability!(context);
        const dependency = await doctorWebPluginDependency(context);
        return {
          success: true,
          data: {
            availability: {
              enabled: availability.enabled,
              available: availability.available,
              reasons: availability.reasons,
            },
            provider: dependency.details || null,
          },
          message: dependency.available
            ? "web provider is available"
            : dependency.reasons.join("; ") || "web provider is not available",
        };
      },
    },
  },
  system(context) {
    const config = readWebPluginConfig(context);
    if (!config.enabled || !config.injectPrompt) {
      return "";
    }
    const providerPrompt =
      config.provider === "agent-browser" ? AGENT_BROWSER_PROMPT : WEB_ACCESS_PROMPT;
    return [
      `Current web provider: ${config.provider}`,
      config.provider === "agent-browser"
        ? `Use external CLI command: ${config.browserCommand}`
        : "Use the installed external web-access skill/project.",
      "",
      WEB_PLUGIN_PROMPT,
      "",
      providerPrompt,
    ].join("\n");
  },
};

/**
 * WebPlugin：联网方法论注入插件。
 *
 * 关键点（中文）
 * - web plugin 不选择 provider，也不持久化 provider 运行态。
 * - install action 只负责准备联网相关 skill / CLI 依赖。
 * - 它只通过 `system()` 注入联网研究与浏览器使用方法论。
 * - 具体执行能力由当前 agent 已注册的 tools、skills 或外部 plugin 决定。
 */

import { BasePlugin } from "@downcity/agent";
import { createAction } from "@downcity/agent";
import { z } from "zod";
import type { AgentContext } from "@downcity/agent";
import type {
  JsonObject,
  JsonValue,
} from "@downcity/agent";
import { WEB_PLUGIN_PROMPT } from "@/web/WebPromptAssets.js";
import { installWebPluginTargets } from "@/web/runtime/Install.js";
import type { WebPluginInstallPayload } from "@/web/types/WebPlugin.js";

/**
 * 读取字符串选项。
 */
function get_string_opt(
  opts: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = opts[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * 读取布尔选项。
 */
function get_boolean_opt(
  opts: Record<string, JsonValue>,
  key: string,
): boolean | undefined {
  const value = opts[key];
  return typeof value === "boolean" ? value : undefined;
}

/**
 * 读取安装目标。
 */
function get_install_target_opt(
  opts: Record<string, JsonValue>,
): "web-access" | "agent-browser" | "all" | undefined {
  const value = get_string_opt(opts, "target");
  if (value === "web-access" || value === "agent-browser" || value === "all") {
    return value;
  }
  return undefined;
}

/**
 * 读取安装作用域。
 */
function get_install_scope_opt(
  opts: Record<string, JsonValue>,
): "user" | "project" | undefined {
  const value = get_string_opt(opts, "scope");
  if (value === "user" || value === "project") return value;
  return undefined;
}

/**
 * WebPlugin：为 agent 注入联网任务的方法论。
 */
export class WebPlugin extends BasePlugin {
  /**
   * 当前 plugin 稳定名称。
   */
  readonly name = "web";

  /**
   * 插件标题。
   */
  readonly title = "Web Methodology";

  /**
   * 插件说明。
   */
  readonly description =
    "Injects web research and browser-use methodology for agents.";

  /**
   * setup 面板：只准备联网相关依赖，不做 provider 配置。
   */
  readonly setup = {
    mode: "install" as const,
    title: "Install web capabilities",
    description:
      "安装 web-access、agent-browser 等联网相关 skill / CLI 依赖；不改变 agent 的运行时默认选择。",
    fields: [
      {
        key: "target",
        label: "联网能力",
        type: "select" as const,
        required: true,
        options: [
          {
            label: "web-access",
            value: "web-access",
            hint: "通用搜索、抓取与资料核实 skill",
          },
          {
            label: "agent-browser",
            value: "agent-browser",
            hint: "浏览器自动化 skill，并准备 agent-browser CLI",
          },
          {
            label: "全部",
            value: "all",
            hint: "同时准备 web-access 和 agent-browser",
          },
        ],
      },
      {
        key: "scope",
        label: "安装位置",
        type: "select" as const,
        required: true,
        options: [
          { label: "用户目录", value: "user", hint: "用户级 skill / 全局 CLI" },
          { label: "项目目录", value: "project", hint: "项目级 skill / devDependency" },
        ],
      },
    ],
    primaryAction: "install",
  };

  /**
   * WebPlugin 对外 action。
   */
  readonly actions = {
    install: createAction({
      description: "Install web-related skill / CLI dependencies (web-access, agent-browser).",
      input_schema: {
        zod: z.object({
          target: z.enum(["web-access", "agent-browser", "all"]).optional(),
          scope: z.enum(["user", "project"]).optional(),
          yes: z.boolean().optional(),
          agent: z.string().optional(),
        }),
        json_schema: {
          type: "object",
          properties: {
            target: {
              type: "string",
              enum: ["web-access", "agent-browser", "all"],
              description: "Web capability to install.",
            },
            scope: {
              type: "string",
              enum: ["user", "project"],
              description: "Installation scope.",
            },
            yes: { type: "boolean", description: "Skip confirmation." },
            agent: { type: "string", description: "Target agent for skill installer." },
          },
        },
      },
      examples: [
        {
          title: "Install all web capabilities for user",
          payload: { target: "all", scope: "user" },
        },
      ],
      command: {
        description: "Install web-related skill / CLI dependencies.",
        configure(command) {
          command
            .option("--target <target>", "web-access、agent-browser 或 all")
            .option("--scope <scope>", "安装位置：user 或 project")
            .option("-y, --yes", "跳过确认（默认 true）", true)
            .option("--agent <agent>", "skill installer 目标 agent");
        },
        mapInput({ opts }): JsonObject {
          return {
            ...(get_install_target_opt(opts)
              ? { target: get_install_target_opt(opts) }
              : {}),
            ...(get_install_scope_opt(opts)
              ? { scope: get_install_scope_opt(opts) }
              : {}),
            ...(typeof get_boolean_opt(opts, "yes") === "boolean"
              ? { yes: get_boolean_opt(opts, "yes") }
              : {}),
            ...(get_string_opt(opts, "agent") ? { agent: get_string_opt(opts, "agent") } : {}),
          } satisfies JsonObject;
        },
      },
      execute: async ({ context, input }) => {
        const data = await installWebPluginTargets({
          context,
          payload:
            input && typeof input === "object" && !Array.isArray(input)
              ? (input as WebPluginInstallPayload)
              : undefined,
        });
        return {
          success: true,
          data,
          message: "web dependencies installed",
        };
      },
    }),
  };

  /**
   * 注入联网方法论提示词。
   */
  system(_context: AgentContext): string {
    return WEB_PLUGIN_PROMPT;
  }
}

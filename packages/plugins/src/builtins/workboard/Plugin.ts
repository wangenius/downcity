/**
 * Workboard Plugin。
 *
 * 关键点（中文）
 * - workboard 是一个 runtime 观测面板插件，负责提供结构化工作快照。
 * - 当前通过 plugin HTTP 注入暴露 `/api/workboard/snapshot`，供 console 代理与 UI 消费。
 */

import type { AgentRuntime } from "@downcity/agent/internal/types/runtime/agent/AgentRuntime.js";
import { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import type { Plugin } from "@downcity/agent/internal/plugin/types/Plugin.js";
import { isPluginEnabled } from "@downcity/agent/internal/plugin/core/Activation.js";
import { getWorkboardSnapshotStore } from "@/builtins/workboard/runtime/Store.js";
import type { WorkboardSnapshotResponse } from "@/builtins/workboard/types/Workboard.js";

function createWorkboardPluginDefinition(plugin: Plugin): Plugin {
  return {
    name: "workboard",
    title: "Workboard Snapshot",
    description:
      "Collects structured runtime activity snapshots so console surfaces can show what the current agent is doing now and what it recently worked on.",
    availability(context) {
      if (!isPluginEnabled({ plugin, context })) {
        return {
          enabled: false,
          available: false,
          reasons: ["workboard plugin disabled in project config"],
        };
      }
      return {
        enabled: true,
        available: true,
        reasons: [],
      };
    },
    http: {
      server: {
        authPolicies: [
          {
            path: "/api/workboard/*",
            method: "GET",
            requireAuth: true,
            anyPermissions: ["agent.read"],
          },
        ],
        register({ app, getContext }) {
          app.get("/api/workboard/snapshot", async (c) => {
            try {
              const availability = await plugin.availability?.(getContext());
              if (availability && availability.available !== true) {
                return c.json(
                  {
                    success: false,
                    error: availability.reasons.join("; ") || "workboard unavailable",
                  },
                  503,
                );
              }

              const snapshot = await getWorkboardSnapshotStore({
                contextResolver: getContext,
              }).readSnapshot();
              const payload: WorkboardSnapshotResponse = {
                success: true,
                snapshot,
              };
              return c.json(payload);
            } catch (error) {
              return c.json(
                {
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                },
                500,
              );
            }
          });
        },
      },
    },
  };
}

/**
 * WorkboardPlugin：运行态观测面板插件。
 */
export class WorkboardPlugin extends BasePlugin {
  readonly name = "workboard";

  constructor(agent: AgentRuntime | null = null) {
    super(agent);
    Object.assign(this, createWorkboardPluginDefinition(this));
  }
}

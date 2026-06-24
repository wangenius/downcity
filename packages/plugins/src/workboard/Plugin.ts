/**
 * Workboard Plugin。
 *
 * 关键点（中文）
 * - workboard 是 runtime 观测面板插件，负责提供结构化工作快照。
 * - plugin action 与 HTTP route 共享同一份快照读取逻辑。
 * - 是否启用由是否注册该 plugin 决定，不再读取项目配置做二次开关。
 */

import { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import { createAction } from "@downcity/agent/internal/plugin/core/PluginActionFactory.js";
import { z } from "zod";
import type {
  PluginActions,
  PluginHttpDefinition,
} from "@downcity/agent/internal/plugin/types/Plugin.js";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type { JsonValue } from "@downcity/agent/internal/types/common/Json.js";
import { getWorkboardSnapshotStore } from "@/workboard/runtime/Store.js";
import type { WorkboardSnapshotResponse } from "@/workboard/types/Workboard.js";

/**
 * 读取 workboard 快照。
 */
async function readWorkboardSnapshot(
  context: AgentContext,
): Promise<WorkboardSnapshotResponse> {
  const snapshot = await getWorkboardSnapshotStore({
    contextResolver: () => context,
  }).readSnapshot();
  return {
    success: true,
    snapshot,
  };
}

/**
 * WorkboardPlugin：运行态观测面板插件。
 */
export class WorkboardPlugin extends BasePlugin {
  /**
   * 当前 plugin 稳定名称。
   */
  readonly name = "workboard";

  /**
   * 插件标题。
   */
  readonly title = "Workboard Snapshot";

  /**
   * 插件说明。
   */
  readonly description =
    "Collects structured runtime activity snapshots so console surfaces can show what the current agent is doing now and what it recently worked on.";

  /**
   * Workboard 对外 action。
   */
  readonly actions: PluginActions = {
    snapshot: createAction({
      description: "读取 workboard 当前的结构化运行态快照。",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {} },
      },
      examples: [{ title: "读取快照", payload: {} }],
      execute: async ({ context }) => {
        const response = await readWorkboardSnapshot(context);
        return {
          success: true,
          data: {
            snapshot: response.snapshot,
          } as unknown as JsonValue,
        };
      },
    }),
  };

  /**
   * Workboard HTTP route。
   */
  readonly http: PluginHttpDefinition = {
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
            return c.json(await readWorkboardSnapshot(getContext()));
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
  };
}

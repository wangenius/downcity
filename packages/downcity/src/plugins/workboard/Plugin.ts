/**
 * Workboard Plugin。
 *
 * 关键点（中文）
 * - workboard 是一个 runtime 观测面板插件，负责提供结构化工作快照。
 * - 当前通过 plugin HTTP 注入暴露 `/api/workboard/snapshot`，供 console 代理与 UI 消费。
 */

import type { Plugin } from "@/shared/types/Plugin.js";
import { isPluginEnabled } from "@/main/plugin/Activation.js";
import { getWorkboardSnapshotStore } from "@/plugins/workboard/runtime/Store.js";
import type { WorkboardSnapshotResponse } from "@/plugins/workboard/types/Workboard.js";

/**
 * Workboard 插件定义。
 */
export const workboardPlugin: Plugin = {
  name: "workboard",
  title: "Workboard Snapshot",
  description:
    "Collects structured runtime activity snapshots so console surfaces can show what the current agent is doing now and what it recently worked on.",
  availability() {
    if (!isPluginEnabled({ plugin: workboardPlugin })) {
      return {
        enabled: false,
        available: false,
        reasons: ["workboard plugin disabled in city config"],
      };
    }
    return {
      enabled: true,
      available: true,
      reasons: [],
    };
  },
  http: {
    runtime: {
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
            const availability = await workboardPlugin.availability?.(getContext());
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

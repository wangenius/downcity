/**
 * 扩展路由偏好工具。
 *
 * 关键点（中文）：
 * - Popup、Options、Side Panel 都会更新同一份连接路由偏好。
 * - 这里统一合并逻辑，避免不同入口遗漏 `targetMode` 或 `agentSessionId`。
 */

import type {
  ExtensionRouteTargetMode,
  ExtensionSettings,
} from "../types/extension";
import { resolveRoutePreference } from "./serverConnection";

/**
 * 合并指定连接的路由偏好。
 */
export function mergeRoutePreferenceSettings(params: {
  /**
   * 当前完整设置。
   */
  settings: ExtensionSettings;
  /**
   * 当前连接 id。
   */
  connectionId: string;
  /**
   * 目标模式。
   */
  targetMode?: ExtensionRouteTargetMode;
  /**
   * 默认 Agent id。
   */
  agentId?: string;
  /**
   * 默认 IM Session id。
   */
  sessionId?: string;
  /**
   * 默认 Agent SDK Session id。
   */
  agentSessionId?: string;
  /**
   * 默认 Ask。
   */
  taskPrompt?: string;
}): ExtensionSettings {
  const connectionId = String(params.connectionId || "").trim();
  const currentPreference = resolveRoutePreference({
    settings: params.settings,
    connectionId,
  });

  return {
    ...params.settings,
    ...(params.taskPrompt !== undefined ? { taskPrompt: params.taskPrompt } : {}),
    selectedConnectionId: connectionId || params.settings.selectedConnectionId,
    routePreferences: {
      ...params.settings.routePreferences,
      [connectionId]: {
        targetMode:
          params.targetMode !== undefined
            ? params.targetMode
            : currentPreference.targetMode,
        agentId:
          params.agentId !== undefined
            ? String(params.agentId || "").trim()
            : currentPreference.agentId,
        sessionId:
          params.sessionId !== undefined
            ? String(params.sessionId || "").trim()
            : currentPreference.sessionId,
        agentSessionId:
          params.agentSessionId !== undefined
            ? String(params.agentSessionId || "").trim()
            : currentPreference.agentSessionId,
      },
    },
  };
}

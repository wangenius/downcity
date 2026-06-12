/**
 * Console Dashboard Shell approval 状态 Hook。
 *
 * 关键点（中文）
 * - 只管理当前 session 的 shell approval mode 与可选模式列表。
 * - 该状态属于交互控制面，不参与 session message/history 刷新编排。
 */

import { useCallback, useEffect, useState } from "react";
import { dashboardApiRoutes } from "../../lib/dashboard-api";
import { getErrorMessage } from "./shared";
import type {
  UiShellApprovalMode,
  UiShellApprovalModeOption,
} from "../../types/Dashboard";
import type { DashboardToastType } from "../../types/DashboardHook";

export function useDashboardShellApproval(params: {
  /** 当前是否已选中可访问的 agent。 */
  selected_agent_id: string;
  /** 当前选中的 session id。 */
  selected_session_id: string;
  /** Console API JSON 请求函数。 */
  request_json: <T>(path: string, options?: RequestInit) => Promise<T>;
  /** toast 展示函数。 */
  show_toast: (message: string, type?: DashboardToastType) => void;
}): {
  /** 当前 session 的 shell approval 模式。 */
  shell_approval_mode: UiShellApprovalMode;
  /** Shell approval 可选模式列表。 */
  shell_approval_mode_options: UiShellApprovalModeOption[];
  /** 当前是否正在读取或更新模式。 */
  shell_approval_mode_loading: boolean;
  /** 设置当前 session 的 shell approval 模式。 */
  set_session_shell_approval_mode: (mode: UiShellApprovalMode) => Promise<void>;
} {
  const {
    selected_agent_id,
    selected_session_id,
    request_json,
    show_toast,
  } = params;
  const [shell_approval_mode, set_shell_approval_mode] = useState<UiShellApprovalMode>("ask");
  const [shell_approval_mode_options, set_shell_approval_mode_options] = useState<UiShellApprovalModeOption[]>([]);
  const [shell_approval_mode_loading, set_shell_approval_mode_loading] = useState(false);

  const refresh_shell_approval_mode = useCallback(
    async (session_id: string) => {
      const resolved_session_id = String(session_id || "").trim();
      if (!resolved_session_id) {
        set_shell_approval_mode("ask");
        return;
      }
      const response = await request_json<{
        success?: boolean;
        session_id?: string;
        mode?: UiShellApprovalMode;
      }>(dashboardApiRoutes.shellApprovalMode(resolved_session_id));
      set_shell_approval_mode(response.mode === "always-allow" ? "always-allow" : "ask");
    },
    [request_json],
  );

  const refresh_shell_approval_mode_options = useCallback(
    async () => {
      const response = await request_json<{
        success?: boolean;
        modes?: UiShellApprovalModeOption[];
      }>(dashboardApiRoutes.shellApprovalModes());
      set_shell_approval_mode_options(Array.isArray(response.modes) ? response.modes : []);
    },
    [request_json],
  );

  const set_session_shell_approval_mode = useCallback(
    async (mode: UiShellApprovalMode) => {
      const resolved_session_id = String(selected_session_id || "").trim();
      if (!resolved_session_id) return;
      const next_mode: UiShellApprovalMode = mode === "always-allow" ? "always-allow" : "ask";
      set_shell_approval_mode_loading(true);
      try {
        const response = await request_json<{
          success?: boolean;
          session_id?: string;
          mode?: UiShellApprovalMode;
        }>(dashboardApiRoutes.shellApprovalMode(resolved_session_id), {
          method: "POST",
          body: JSON.stringify({
            session_id: resolved_session_id,
            mode: next_mode,
          }),
        });
        set_shell_approval_mode(response.mode === "always-allow" ? "always-allow" : "ask");
        show_toast(
          next_mode === "always-allow"
            ? "已允许当前 session 自动通过 shell approval"
            : "已恢复当前 session 的 shell approval 确认",
          "success",
        );
      } catch (error) {
        show_toast(`更新 shell approval 失败: ${getErrorMessage(error)}`, "error");
      } finally {
        set_shell_approval_mode_loading(false);
      }
    },
    [request_json, selected_session_id, show_toast],
  );

  useEffect(() => {
    const resolved_session_id = String(selected_session_id || "").trim();
    if (!resolved_session_id || !selected_agent_id) {
      set_shell_approval_mode("ask");
      set_shell_approval_mode_loading(false);
      return;
    }
    let disposed = false;
    set_shell_approval_mode_loading(true);
    refresh_shell_approval_mode(resolved_session_id)
      .catch(() => {
        if (!disposed) set_shell_approval_mode("ask");
      })
      .finally(() => {
        if (!disposed) set_shell_approval_mode_loading(false);
      });
    return () => {
      disposed = true;
    };
  }, [selected_agent_id, selected_session_id, refresh_shell_approval_mode]);

  useEffect(() => {
    if (!selected_agent_id) {
      set_shell_approval_mode_options([]);
      return;
    }
    refresh_shell_approval_mode_options().catch(() => {
      set_shell_approval_mode_options([]);
    });
  }, [selected_agent_id, refresh_shell_approval_mode_options]);

  return {
    shell_approval_mode,
    shell_approval_mode_options,
    shell_approval_mode_loading,
    set_session_shell_approval_mode,
  };
}

/**
 * Console workboard hook。
 *
 * 关键点（中文）
 * - workboard 是独立 feature，不并入巨型 dashboard hook。
 * - 这里直接使用 console 请求层，按当前 agent 做轻量轮询。
 */

import * as React from "react";
import {
  ConsoleApiError,
  dashboardApiRoutes,
  requestConsoleApiJson,
} from "@/lib/dashboard-api";
import type { UiWorkboardSnapshot, UiWorkboardSnapshotResponse } from "@/types/Workboard";

export interface UseWorkboardResult {
  /**
   * 当前快照。
   */
  snapshot: UiWorkboardSnapshot | null;
  /**
   * 当前是否正在加载。
   */
  loading: boolean;
  /**
   * 错误信息。
   */
  errorMessage: string;
  /**
   * 手动刷新。
   */
  refresh: () => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ConsoleApiError) return error.message;
  if (error instanceof Error) return error.message || String(error);
  return String(error);
}

export function useWorkboard(params: {
  agentId: string;
  enabled: boolean;
}): UseWorkboardResult {
  const [snapshot, setSnapshot] = React.useState<UiWorkboardSnapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");

  const refresh = React.useCallback(async () => {
    const agentId = String(params.agentId || "").trim();
    if (!params.enabled || !agentId) {
      setSnapshot(null);
      setErrorMessage("");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await requestConsoleApiJson<UiWorkboardSnapshotResponse>({
        path: dashboardApiRoutes.workboardSnapshot(),
        selectedAgentId: agentId,
        preferredAgentId: agentId,
      });
      setSnapshot(payload.snapshot || null);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [params.agentId, params.enabled]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    const agentId = String(params.agentId || "").trim();
    if (!params.enabled || !agentId) return undefined;

    const timer = window.setInterval(() => {
      void refresh();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [params.agentId, params.enabled, refresh]);

  return {
    snapshot,
    loading,
    errorMessage,
    refresh,
  };
}

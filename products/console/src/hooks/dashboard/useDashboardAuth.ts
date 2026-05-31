/**
 * Console Dashboard 鉴权状态管理。
 *
 * 关键点（中文）
 * - Bearer Token、本机 bootstrap 探测和 logout 收敛在这里。
 * - 主 dashboard hook 只消费鉴权状态与 submit/logout 行为，不再承载鉴权状态机细节。
 */

import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import {
  clearConsoleAuthState,
  dashboardApiRoutes,
  type ConsoleAuthStatusResponse,
  readConsoleAuthState,
  requestConsoleApiJson,
  writeConsoleAuthState,
} from "../../lib/dashboard-api";
import { getErrorMessage } from "./shared";

export interface UseDashboardAuthOptions {
  /**
   * 刷新 dashboard 的可变引用，token 提交成功后用于重新拉取首屏数据。
   */
  refresh_dashboard_ref: MutableRefObject<((preferredAgentId?: string) => Promise<void>) | null>;
  /**
   * 写入顶部状态文案。
   */
  set_topbar_status: (value: string) => void;
  /**
   * 写入顶部错误态。
   */
  set_topbar_error: (value: boolean) => void;
}

export interface UseDashboardAuthResult {
  /**
   * 当前是否仍在执行首屏鉴权探测。
   */
  authInitializing: boolean;
  /**
   * 当前是否需要先在本机 CLI 创建首个 token。
   */
  authBootstrapRequired: boolean;
  /**
   * 当前是否已持有有效 Bearer Token。
   */
  isAuthenticated: boolean;
  /**
   * 当前 Bearer Token 对应的主体名。
   */
  authUsername: string;
  /**
   * 当前是否需要提供 Bearer Token。
   */
  authRequired: boolean;
  /**
   * 当前是否正在提交 Token。
   */
  authSubmitting: boolean;
  /**
   * 当前 Token 验证错误文案。
   */
  authErrorMessage: string;
  /**
   * 进入需要 Bearer Token 的状态。
   */
  enterAuthRequiredState: () => void;
  /**
   * 提交用户输入的 Bearer Token。
   */
  submitAuthToken: (input: { token: string }) => Promise<void>;
  /**
   * 清理本地 token 并回到登录态。
   */
  logout: () => void;
  /**
   * 直接写入 authRequired，供 refresh 流程在成功/失败时同步状态。
   */
  setAuthRequiredState: (value: boolean) => void;
}

export function useDashboardAuth(options: UseDashboardAuthOptions): UseDashboardAuthResult {
  const { refresh_dashboard_ref, set_topbar_error, set_topbar_status } = options;
  const initial_auth_state = readConsoleAuthState();
  const [authInitializing, setAuthInitializing] = useState(!Boolean(initial_auth_state?.token));
  const [authBootstrapRequired, setAuthBootstrapRequired] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(initial_auth_state?.token));
  const [authUsername, setAuthUsername] = useState(String(initial_auth_state?.username || "").trim());
  const [authRequired, setAuthRequired] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authErrorMessage, setAuthErrorMessage] = useState("");

  const enterAuthRequiredState = useCallback(() => {
    clearConsoleAuthState();
    setAuthInitializing(false);
    setAuthBootstrapRequired(false);
    setIsAuthenticated(false);
    setAuthUsername("");
    setAuthRequired(true);
    setAuthErrorMessage("");
    set_topbar_status("需要 Bearer Token");
    set_topbar_error(false);
  }, [set_topbar_error, set_topbar_status]);

  const submitAuthToken = useCallback(
    async (input: { token: string }) => {
      setAuthSubmitting(true);
      setAuthErrorMessage("");
      try {
        const raw_token = String(input.token || "").trim();
        if (!raw_token) throw new Error("请先输入 Bearer Token");

        const response = await requestConsoleApiJson<{
          user?: { username?: string };
        }>({
          path: dashboardApiRoutes.authMe(),
          selectedAgentId: "",
          options: {
            headers: {
              Authorization: /^Bearer\s+/i.test(raw_token) ? raw_token : `Bearer ${raw_token}`,
            },
          },
        });
        const token = raw_token.replace(/^Bearer\s+/i, "").trim();
        const username = String(response?.user?.username || "").trim();
        writeConsoleAuthState({
          token,
          ...(username ? { username } : {}),
        });
        setAuthInitializing(false);
        setAuthBootstrapRequired(false);
        setIsAuthenticated(true);
        setAuthUsername(username);
        setAuthRequired(false);
        await refresh_dashboard_ref.current?.();
      } catch (error) {
        clearConsoleAuthState();
        setIsAuthenticated(false);
        setAuthUsername("");
        setAuthRequired(true);
        setAuthErrorMessage(getErrorMessage(error));
        throw error;
      } finally {
        setAuthSubmitting(false);
      }
    },
    [refresh_dashboard_ref],
  );

  const logout = useCallback(() => {
    enterAuthRequiredState();
  }, [enterAuthRequiredState]);

  useEffect(() => {
    let disposed = false;

    const bootstrapDashboard = async () => {
      const auth_state = readConsoleAuthState();
      const has_token = Boolean(auth_state?.token);

      setIsAuthenticated(has_token);
      setAuthUsername(String(auth_state?.username || "").trim());

      if (has_token) {
        if (disposed) return;
        setAuthBootstrapRequired(false);
        setAuthRequired(false);
        setAuthInitializing(false);
        return;
      }

      try {
        const auth_status = await requestConsoleApiJson<ConsoleAuthStatusResponse>({
          path: dashboardApiRoutes.authStatus(),
          selectedAgentId: "",
        });

        if (!auth_status.initialized) {
          if (disposed) return;
          setAuthBootstrapRequired(true);
          setAuthRequired(true);
          setAuthInitializing(false);
          set_topbar_status("需要先创建 Token");
          set_topbar_error(false);
          return;
        }

        if (auth_status.requireToken && !has_token) {
          if (disposed) return;
          setAuthBootstrapRequired(false);
          setAuthRequired(true);
          setAuthInitializing(false);
          set_topbar_status("需要 Bearer Token");
          set_topbar_error(false);
          return;
        }
      } catch {
        // 关键点（中文）：状态探测失败时也不允许直接进入 dashboard，改为停在 token 入口页。
      }

      if (disposed) return;
      setAuthBootstrapRequired(false);
      setAuthRequired(true);
      set_topbar_status("需要 Bearer Token");
      set_topbar_error(false);
      setAuthInitializing(false);
    };

    void bootstrapDashboard();

    return () => {
      disposed = true;
    };
  }, [set_topbar_error, set_topbar_status]);

  return {
    authInitializing,
    authBootstrapRequired,
    isAuthenticated,
    authUsername,
    authRequired,
    authSubmitting,
    authErrorMessage,
    enterAuthRequiredState,
    submitAuthToken,
    logout,
    setAuthRequiredState: setAuthRequired,
  };
}

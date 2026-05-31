/**
 * Console Dashboard 自动刷新轮询。
 *
 * 关键点（中文）
 * - 轮询只关心鉴权状态和 refresh 引用，避免主 hook 继续承载定时器细节。
 */

import { useEffect, type MutableRefObject } from "react";

export function useDashboardAutoRefresh(params: {
  /**
   * 当前是否正在鉴权初始化。
   */
  auth_initializing: boolean;
  /**
   * 当前是否要求输入 token。
   */
  auth_required: boolean;
  /**
   * 当前是否已认证。
   */
  is_authenticated: boolean;
  /**
   * dashboard 刷新函数引用。
   */
  refresh_dashboard_ref: MutableRefObject<((preferredAgentId?: string) => Promise<void>) | null>;
}) {
  useEffect(() => {
    if (params.auth_initializing) return;
    if (params.auth_required && !params.is_authenticated) return;
    void params.refresh_dashboard_ref.current?.();
    const timer = window.setInterval(() => {
      if (params.auth_required && !params.is_authenticated) return;
      void params.refresh_dashboard_ref.current?.();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [params.auth_initializing, params.auth_required, params.is_authenticated, params.refresh_dashboard_ref]);
}

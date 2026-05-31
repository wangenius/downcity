/**
 * Console Dashboard toast 状态管理。
 *
 * 关键点（中文）
 * - toast 定时关闭逻辑独立维护，避免主 dashboard hook 继续膨胀。
 * - 组件卸载时统一清理 timer，避免悬挂回调。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardToastState, DashboardToastType } from "../../types/DashboardHook";

export function useDashboardToast() {
  const [toast, setToast] = useState<DashboardToastState | null>(null);
  const toast_timer_ref = useRef<number | null>(null);

  const showToast = useCallback((message: string, type: DashboardToastType = "info") => {
    setToast({ message, type });
    if (toast_timer_ref.current) {
      window.clearTimeout(toast_timer_ref.current);
    }
    toast_timer_ref.current = window.setTimeout(() => {
      setToast(null);
      toast_timer_ref.current = null;
    }, 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (toast_timer_ref.current) {
        window.clearTimeout(toast_timer_ref.current);
      }
    };
  }, []);

  return { toast, showToast };
}

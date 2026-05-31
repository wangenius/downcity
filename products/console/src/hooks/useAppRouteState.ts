/**
 * Console App 路由相关本地状态。
 *
 * 关键点（中文）
 * - 初始 pathname/view/task/channel 状态从根组件拆出，降低 App.tsx 入口噪音。
 */

import * as React from "react";
import { parseDashboardPath } from "@/lib/dashboard-route";
import type { DashboardView } from "@/types/Navigation";

const DEBUG_PANELS_COLLAPSED_STORAGE_KEY = "city.console-ui.context.debug-panels-collapsed";

export function useAppRouteState() {
  const [routePathname, setRoutePathname] = React.useState(() =>
    typeof window === "undefined" ? "/global/overview" : window.location.pathname,
  );
  const [activeView, setActiveView] = React.useState<DashboardView>(() =>
    typeof window === "undefined" ? "globalOverview" : parseDashboardPath(window.location.pathname).view,
  );
  const [routeHydrated, setRouteHydrated] = React.useState(false);
  const [selectedTaskTitle, setSelectedTaskTitle] = React.useState(() =>
    typeof window === "undefined"
      ? ""
      : String(parseDashboardPath(window.location.pathname).taskTitle || "").trim(),
  );
  const [focusedChatChannel, setFocusedChatChannel] = React.useState("");
  const [debugPanelsCollapsed, setDebugPanelsCollapsed] = React.useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(DEBUG_PANELS_COLLAPSED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  return {
    routePathname, setRoutePathname,
    activeView, setActiveView,
    routeHydrated, setRouteHydrated,
    selectedTaskTitle, setSelectedTaskTitle,
    focusedChatChannel, setFocusedChatChannel,
    debugPanelsCollapsed, setDebugPanelsCollapsed,
  };
}

export { DEBUG_PANELS_COLLAPSED_STORAGE_KEY };

/**
 * Dashboard 导航元数据。
 *
 * 关键点（中文）
 * - 将导航结构作为单一事实源，统一驱动 Sidebar、Header 与路由映射。
 * - 明确区分 Global / Agent / Context 的页面边界，避免内容错位。
 */

import type {
  DashboardPageMeta,
  DashboardPrimaryView,
  DashboardScope,
  DashboardView,
} from "@/types/Navigation";

const PAGES: Record<DashboardPrimaryView, DashboardPageMeta> = {
  globalOverview: {
    view: "globalOverview",
    scope: "global",
    title: "Overview",
    path: "/global/overview",
  },
  globalEnv: {
    view: "globalEnv",
    scope: "global",
    title: "Env",
    path: "/global/env",
  },
  globalModel: {
    view: "globalModel",
    scope: "global",
    title: "Model",
    path: "/global/model",
  },
  globalChannelAccounts: {
    view: "globalChannelAccounts",
    scope: "global",
    title: "Channel Accounts",
    path: "/global/channel-accounts",
  },
  globalCommand: {
    view: "globalCommand",
    scope: "global",
    title: "Command",
    path: "/global/command",
  },
  globalAgents: {
    view: "globalAgents",
    scope: "global",
    title: "Agents",
    path: "/global/agents",
  },
  globalExtensions: {
    view: "globalExtensions",
    scope: "global",
    title: "Extensions",
    path: "/global/extensions",
  },
  agentOverview: {
    view: "agentOverview",
    scope: "agent",
    title: "Overview",
    path: "/agent/overview",
  },
  agentSkills: {
    view: "agentSkills",
    scope: "agent",
    title: "Skills",
    path: "/agent/skills",
  },
  agentServices: {
    view: "agentServices",
    scope: "agent",
    title: "Services",
    path: "/agent/services",
  },
  agentCommand: {
    view: "agentCommand",
    scope: "agent",
    title: "Command",
    path: "/agent/command",
  },
  agentTasks: {
    view: "agentTasks",
    scope: "agent",
    title: "Tasks",
    path: "/agent/tasks",
  },
  agentLogs: {
    view: "agentLogs",
    scope: "agent",
    title: "Logs",
    path: "/agent/logs",
  },
  contextOverview: {
    view: "contextOverview",
    scope: "context",
    title: "Overview",
    path: "/context/overview",
  },
};

const SCOPE_TITLES: Record<DashboardScope, string> = {
  global: "Global",
  agent: "Agent",
  context: "Context",
};

const PRIMARY_PAGE_ORDER: DashboardPrimaryView[] = [
  "globalOverview",
  "globalCommand",
  "globalEnv",
  "globalModel",
  "globalChannelAccounts",
  "globalAgents",
  "globalExtensions",
  "agentOverview",
  "agentSkills",
  "agentServices",
  "agentCommand",
  "agentTasks",
  "agentLogs",
  "contextOverview",
];

/**
 * 获取主导航页面元信息。
 */
export function getPrimaryPageMeta(view: DashboardPrimaryView): DashboardPageMeta {
  return PAGES[view];
}

/**
 * 按 Scope 获取主导航页面列表（按定义顺序）。
 */
export function listPrimaryPagesByScope(scope: DashboardScope): DashboardPageMeta[] {
  return PRIMARY_PAGE_ORDER
    .map((view) => PAGES[view])
    .filter((item) => item.scope === scope);
}

/**
 * 获取页面标题（用于 Header）。
 */
export function getDashboardViewLabel(view: DashboardView): string {
  if (view === "contextWorkspace") {
    return "Context / Workspace";
  }
  const page = PAGES[view];
  return `${SCOPE_TITLES[page.scope]} / ${page.title}`;
}

/**
 * 获取主导航页面路径映射。
 */
export function getPrimaryViewPathMap(): Record<DashboardPrimaryView, string> {
  return PRIMARY_PAGE_ORDER.reduce((result, view) => {
    result[view] = PAGES[view].path;
    return result;
  }, {} as Record<DashboardPrimaryView, string>);
}

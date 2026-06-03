/**
 * City 首页菜单模块。
 *
 * 关键说明（中文）
 * - 首次使用时，主动作是 connect City，而不是选择身份
 * - 日常使用时，首页围绕当前激活的 City 工作区展开
 */

import { isCancel, select } from "@clack/prompts";
import { readActiveServer, readUserSession } from "../core/session.js";
import { type HomeAction, type WelcomeAction } from "../types/Interactive.js";

/**
 * 首次启动时选择动作。
 */
export async function selectWelcomeAction(): Promise<WelcomeAction> {
  const selected = await select({
    message: "Welcome to City",
    options: [
      { label: "Connect an existing City", value: "connect_city", hint: "Add a City server URL and sign in as user" },
      { label: "Upgrade CLI", value: "update", hint: "Refresh the global city command" },
      { label: "Exit", value: "quit" },
    ],
  });

  if (!selected || isCancel(selected)) {
    return "quit";
  }

  return selected as WelcomeAction;
}

/**
 * 已经有 City server 时的首页动作。
 */
export async function selectHomeAction(): Promise<HomeAction> {
  const active_server = readActiveServer();
  if (!active_server) {
    return "connect_city";
  }

  const selected = await select({
    message: `City [${active_server.name}]`,
    options: [
      {
        label: "Open current City",
        value: "open_current",
        hint: formatServerSummary(active_server.base_url),
      },
      {
        label: "Switch City",
        value: "switch_city",
        hint: "Choose another connected City",
      },
      {
        label: "Connect another City",
        value: "connect_city",
        hint: "Add a new City server URL",
      },
      {
        label: "Upgrade CLI",
        value: "update",
        hint: "Refresh the global city command",
      },
      { label: "Exit", value: "quit" },
    ],
  });

  if (!selected || isCancel(selected)) {
    return "quit";
  }

  return selected as HomeAction;
}

function formatServerSummary(base_url: string): string {
  const has_user_session = !!readUserSession(base_url);
  return has_user_session
    ? `${base_url} · user signed in`
    : `${base_url} · user sign in required`;
}

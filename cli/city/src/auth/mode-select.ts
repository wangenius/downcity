/**
 * 身份选择模块。
 *
 * 始终显示菜单，围绕当前 active server 进入身份或 server 管理。
 */

import { readActiveServer, readConfig, readUserSession } from "../core/session.js";
import { select, isCancel } from "@clack/prompts";

export type Identity = "admin" | "user" | "servers" | "update" | "quit";

/**
 * 选择身份。始终显示菜单，已有 session 的身份标注 ★。
 */
export async function selectIdentity(): Promise<Identity> {
  const config = readConfig();
  const activeServer = readActiveServer();

  const hasAdmin = !!String(activeServer?.admin_secret_key ?? "").trim();
  const hasUser = activeServer ? !!readUserSession(activeServer.base_url) : false;
  const title = activeServer
    ? `Identity [${activeServer.name}]`
    : "Identity [No servers configured]";

  const selected = await select({
    message: title,
    options: [
      { label: hasAdmin ? "★ Admin" : "   Admin", value: "admin", hint: hasAdmin ? activeServer?.base_url ?? "" : "Admin management" },
      { label: hasUser ? "★ User" : "   User", value: "user", hint: hasUser ? "session active" : "Login or register" },
      { label: "Manage Servers", value: "servers", hint: `${config.servers.length} configured` },
      { label: "Update CLI", value: "update", hint: "Refresh global city/bay commands" },
      { label: "Quit", value: "quit" },
    ],
  });

  if (!selected || isCancel(selected)) return "quit";
  return selected as Identity;
}

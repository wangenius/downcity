/**
 * Server 管理模块。
 *
 * 关键说明（中文）
 * - 不再提供“切换当前 server”的临时入口
 * - 所有 server 操作都统一收口到 Manage Servers
 * - 没有 server 时，CLI 会先强制进入添加流程
 */

import { City } from "@downcity/city";
import { isCancel, password, select, text } from "@clack/prompts";
import {
  addServer,
  readActiveServer,
  readConfig,
  readServer,
  removeServer,
  setActiveServer,
  type ServerProfile,
  updateServer,
} from "../core/session.js";
import { show, showError, showSuccess } from "../core/ui.js";

/**
 * 确保至少存在一个 server。
 */
export async function ensureServerConfigured(): Promise<boolean> {
  if (readConfig().servers.length > 0) {
    return true;
  }

  show("No servers configured. Add a server before continuing.");
  const created = await promptAddServer();
  if (!created) {
    showError("No server configured. Exiting.");
    return false;
  }
  return true;
}

/**
 * 顶层 server 管理菜单。
 */
export async function manageServersMenu(): Promise<void> {
  while (true) {
    const config = readConfig();
    const active = readActiveServer();

    const selected = await select({
      message: active
        ? `Manage Servers [current: ${active.name}]`
        : "Manage Servers [no active server]",
      options: [
        { label: "List Servers", value: "list", hint: `${config.servers.length} configured` },
        { label: "Add Server", value: "add", hint: "Create a new Infra server profile" },
        { label: "Select Active Server", value: "select", hint: active ? active.base_url : "Choose current server" },
        { label: "Edit Server", value: "edit", hint: "Update name, server URL, or admin key" },
        { label: "Remove Server", value: "remove", hint: "Delete a server profile" },
        { label: "Back", value: "back", hint: "Return to main menu" },
      ],
    });

    if (!selected || isCancel(selected) || selected === "back") {
      return;
    }

    if (selected === "list") {
      printServers(config.servers, active?.base_url);
      continue;
    }

    if (selected === "add") {
      await promptAddServer();
      continue;
    }

    if (selected === "select") {
      await promptSelectActiveServer();
      continue;
    }

    if (selected === "edit") {
      await promptEditServer();
      continue;
    }

    if (selected === "remove") {
      await promptRemoveServer();
    }
  }
}

/**
 * 添加 server。
 */
export async function promptAddServer(): Promise<ServerProfile | undefined> {
  const baseUrl = await text({
    message: "Server URL",
    placeholder: "https://downcity.wangenius.workers.dev",
  });
  if (!baseUrl || isCancel(baseUrl) || !String(baseUrl).trim()) {
    return undefined;
  }

  const adminSecretKey = await password({ message: "admin_secret_key" });
  if (!adminSecretKey || isCancel(adminSecretKey) || !String(adminSecretKey).trim()) {
    return undefined;
  }

  const server = addServer({
    base_url: String(baseUrl).trim(),
    admin_secret_key: String(adminSecretKey).trim(),
  });

  const verified = await verifyServerAdminAccess(server);
  if (verified) {
    showSuccess(`Server added and activated: ${server.name}`);
  } else {
    showError(`Server saved, but admin verification failed: ${server.name}`);
  }

  return server;
}

async function promptSelectActiveServer(): Promise<void> {
  const config = readConfig();
  if (config.servers.length === 0) {
    showError("No servers configured.");
    return;
  }

  const selected = await select({
    message: "Select active server",
    options: config.servers.map((server) => ({
      label: server.base_url === config.active_server_url ? `★ ${server.name}` : `   ${server.name}`,
      value: server.base_url,
      hint: server.base_url,
    })),
  });

  if (!selected || isCancel(selected)) {
    return;
  }

  setActiveServer(String(selected));
  showSuccess(`Active server: ${String(selected)}`);
}

async function promptEditServer(): Promise<void> {
  const config = readConfig();
  if (config.servers.length === 0) {
    showError("No servers configured.");
    return;
  }

  const targetBaseUrl = await select({
    message: "Edit server",
    options: config.servers.map((server) => ({
      label: server.base_url === config.active_server_url ? `★ ${server.name}` : `   ${server.name}`,
      value: server.base_url,
      hint: server.base_url,
    })),
  });
  if (!targetBaseUrl || isCancel(targetBaseUrl)) {
    return;
  }

  const current = readServer(String(targetBaseUrl));
  if (!current) {
    showError("Selected server no longer exists.");
    return;
  }

  const field = await select({
    message: `Edit ${current.name}`,
    options: [
      { label: "Name", value: "name", hint: current.name },
      { label: "Server URL", value: "base_url", hint: current.base_url },
      { label: "Admin secret key", value: "admin_secret_key", hint: maskSecret(current.admin_secret_key) },
      { label: "Cancel", value: "cancel", hint: "Return without changes" },
    ],
  });
  if (!field || isCancel(field) || field === "cancel") {
    return;
  }

  const next = { ...current };

  if (field === "name") {
    const name = await text({ message: "Display name", initialValue: current.name });
    if (!name || isCancel(name)) return;
    next.name = String(name).trim() || current.name;
  } else if (field === "base_url") {
    const baseUrl = await text({ message: "Server URL", initialValue: current.base_url });
    if (!baseUrl || isCancel(baseUrl)) return;
    next.base_url = String(baseUrl).trim() || current.base_url;
  } else if (field === "admin_secret_key") {
    const adminSecretKey = await password({ message: "admin_secret_key" });
    if (!adminSecretKey || isCancel(adminSecretKey)) return;
    next.admin_secret_key = String(adminSecretKey).trim();
  }

  const updated = updateServer(current.base_url, next);
  const verified = await verifyServerAdminAccess(updated);
  if (verified) {
    showSuccess(`Server updated: ${updated.name}`);
  } else {
    showError(`Server updated, but admin verification failed: ${updated.name}`);
  }
}

async function promptRemoveServer(): Promise<void> {
  const config = readConfig();
  if (config.servers.length === 0) {
    showError("No servers configured.");
    return;
  }

  const selected = await select({
    message: "Remove server",
    options: [
      ...config.servers.map((server) => ({
        label: `${server.base_url === config.active_server_url ? "★ " : ""}${server.name}`,
        value: server.base_url,
        hint: server.base_url,
      })),
      { label: "Cancel", value: "cancel", hint: "Return without changes" },
    ],
  });
  if (!selected || isCancel(selected) || selected === "cancel") {
    return;
  }

  removeServer(String(selected));
  const nextActive = readActiveServer();
  showSuccess(
    nextActive
      ? `Server removed. Current server: ${nextActive.name}`
      : "Server removed. No servers configured.",
  );
}

async function verifyServerAdminAccess(server: ServerProfile): Promise<boolean> {
  try {
    const admin = new City({
      role: "admin",
      city_url: server.base_url,
      admin_secret_key: server.admin_secret_key,
    });
    await admin.listServices();
    return true;
  } catch {
    return false;
  }
}

function printServers(servers: ServerProfile[], activeBaseUrl: string | undefined): void {
  if (servers.length === 0) {
    show("No servers configured.");
    return;
  }

  console.log(`\n${servers.length} servers:\n`);
  for (const server of servers) {
    const marker = server.base_url === activeBaseUrl ? "★" : " ";
    console.log(` ${marker} ${server.name.padEnd(24)} ${server.base_url}  admin=${maskSecret(server.admin_secret_key)}`);
  }
  console.log("");
}

function maskSecret(value: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "(missing)";
  if (normalized.length <= 8) return `${normalized.slice(0, 2)}***`;
  return `${normalized.slice(0, 4)}***${normalized.slice(-2)}`;
}

#!/usr/bin/env node

/**
 * Downcity Agent 入口与状态机调度。
 *
 * 状态流转：
 *   selectIdentity → Admin → adminLoop → selectIdentity (switch identity)
 *   selectIdentity → User  → userLoop  → selectIdentity (switch identity)
 *   selectIdentity → Manage Servers → selectIdentity
 *
 * 不再持有 config 快照，每次需要时从磁盘 readConfig()。
 */

import { readFileSync } from "node:fs";
import { intro } from "./core/ui.js";
import { readActiveServer, readConfig, writeConfig } from "./core/session.js";
import { parseArgs } from "./core/env.js";
import { selectIdentity } from "./auth/mode-select.js";
import { adminAuth } from "./auth/admin.js";
import { userAuth } from "./auth/user.js";
import { ensureServerConfigured, manageServersMenu } from "./auth/server-switch.js";
import { userLoop } from "./user/loop.js";
import { adminLoop } from "./admin/loop.js";
import { show, showError, showSuccess } from "./core/ui.js";
import { updateCli } from "./core/update.js";

export async function runTerminalApp(argv: string[] = []): Promise<void> {
  const cli = parseArgs(argv);
  if (cli.command === "update") {
    await runSelfUpdate();
    return;
  }

  intro(`Downcity City v${readCliVersion()} (Esc to go back, Ctrl+C to exit)`);
  if (!(await ensureServerConfigured())) {
    return;
  }

  let identity = await selectIdentity();

  while (identity !== "quit") {
    if (identity === "update") {
      await runSelfUpdate();
      return;
    }

    if (identity === "servers") {
      await manageServersMenu();
      if (!(await ensureServerConfigured())) {
        return;
      }
      identity = await selectIdentity();
      continue;
    }

    // 每次从磁盘读取最新 config，不持快照
    const cfg = readConfig();
    const activeServer = readActiveServer();
    if (!activeServer) {
      if (!(await ensureServerConfigured())) {
        return;
      }
      identity = await selectIdentity();
      continue;
    }
    writeConfig({ ...cfg, last_identity: identity });

    if (identity === "admin") {
      const session = await adminAuth(activeServer);
      if (!session) { identity = await selectIdentity(); continue; }
      const result = await adminLoop(session);
      if (result === "quit") break;
      if (result === "switch_identity") { identity = await selectIdentity(); continue; }
      identity = await selectIdentity();
      continue;
    }

    // identity === "user"
    const ctx = await userAuth(activeServer.base_url);
    if (!ctx) { identity = await selectIdentity(); continue; }
    const result = await userLoop(ctx);
    if (result === "quit") break;
    if (result === "switch_identity") { identity = await selectIdentity(); continue; }
    identity = await selectIdentity();
  }
}

/**
 * 读取当前 CLI 包版本。
 *
 * 关键说明（中文）
 * - 运行源码时从仓库 package.json 读取
 * - 发布后的全局安装同样从包根目录 package.json 读取
 * - 读取失败时回退到 unknown，避免 CLI 启动被版本展示阻断
 */
function readCliVersion(): string {
  try {
    const packageJsonPath = new URL("../../package.json", import.meta.url);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version?: string;
    };
    return String(packageJson.version ?? "unknown");
  } catch {
    return "unknown";
  }
}

/**
 * 执行 CLI 自更新，并提示用户重新启动。
 */
async function runSelfUpdate(): Promise<void> {
  try {
    show("Updating downcity CLI...");
    const result = await updateCli();
    showSuccess(`CLI updated via ${result.mode} mode -> v${result.version}`);
    show("Please run `city` again to use the updated CLI.");
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

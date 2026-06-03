#!/usr/bin/env node

/**
 * Downcity City 交互入口与工作区调度。
 *
 * 状态流转：
 *   welcome/home → connect/switch City → server workspace → server management/admin tools
 *
 * 关键说明（中文）
 * - 顶层不再要求先选择 admin / user 身份
 * - connect City 后默认进入 user sign in / user 工作区
 * - admin 能力只作为低频的 server management 入口出现
 */

import { readFileSync } from "node:fs";
import { intro } from "./core/ui.js";
import { readActiveServer } from "./core/session.js";
import { parseArgs } from "./core/env.js";
import { promptAddServer, promptSelectActiveServer } from "./auth/server-switch.js";
import { show, showError, showSuccess } from "./core/ui.js";
import { updateCli } from "./core/update.js";
import { selectHomeAction, selectWelcomeAction } from "./home/HomeMenu.js";
import { openServerWorkspace } from "./workspace/ServerWorkspace.js";

export async function runCityApp(argv: string[] = []): Promise<void> {
  const cli = parseArgs(argv);
  if (cli.command === "update") {
    await runSelfUpdate();
    return;
  }

  intro(`Downcity City v${readCliVersion()} (Esc to go back, Ctrl+C to exit)`);
  while (true) {
    const activeServer = readActiveServer();
    if (!activeServer) {
      const welcomeAction = await selectWelcomeAction();
      if (welcomeAction === "quit") {
        return;
      }
      if (welcomeAction === "update") {
        await runSelfUpdate();
        return;
      }

      const connectedServer = await promptAddServer();
      if (!connectedServer) {
        continue;
      }

      const result = await openServerWorkspace(connectedServer.base_url);
      if (result === "quit") {
        return;
      }
      continue;
    }

    const homeAction = await selectHomeAction();
    if (homeAction === "quit") {
      return;
    }
    if (homeAction === "update") {
      await runSelfUpdate();
      return;
    }

    if (homeAction === "connect_city") {
      const connectedServer = await promptAddServer();
      if (!connectedServer) {
        continue;
      }
      const result = await openServerWorkspace(connectedServer.base_url);
      if (result === "quit") {
        return;
      }
      continue;
    }

    if (homeAction === "switch_city") {
      const selectedServer = await promptSelectActiveServer();
      if (!selectedServer) {
        continue;
      }
      const result = await openServerWorkspace(selectedServer.base_url);
      if (result === "quit") {
        return;
      }
      continue;
    }

    const result = await openServerWorkspace(activeServer.base_url);
    if (result === "quit") {
      return;
    }
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
    const packageJsonPath = new URL("../package.json", import.meta.url);
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

/**
 * city reset 命令实现。
 *
 * 关键点（中文）
 * - 删除整个 ~/.downcity/ 目录：数据库、模型、venvs、skills 等全部清除。
 * - 执行前会要求用户确认，防止误删。
 */

import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import prompts from "prompts";
import { emitCliBlock } from "./CliReporter.js";

const CITY_HOME = path.join(os.homedir(), ".downcity");

async function getDirSize(dirPath: string): Promise<string> {
  try {
    let total = 0;
    const walk = async (d: string) => {
      const entries = await fs.readdir(d, { withFileTypes: true });
      for (const e of entries) {
        const fp = path.join(d, e.name);
        if (e.isDirectory()) { await walk(fp); continue; }
        try { const s = await fs.stat(fp); total += s.size; } catch {}
      }
    };
    await walk(dirPath);
    if (total < 1024) return `${total}B`;
    if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)}KB`;
    if (total < 1024 * 1024 * 1024) return `${(total / (1024 * 1024)).toFixed(1)}MB`;
    return `${(total / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  } catch {
    return "未知";
  }
}

export async function resetCommand(): Promise<void> {
  const exists = await fs.pathExists(CITY_HOME);

  if (!exists) {
    emitCliBlock({
      tone: "info",
      title: "无可重置的配置",
      summary: "~/.downcity/ 不存在。",
    });
    return;
  }

  const size = await getDirSize(CITY_HOME);

  emitCliBlock({
    tone: "warning",
    title: "即将删除整个 ~/.downcity/",
    facts: [
      { label: "路径", value: CITY_HOME },
      { label: "大小", value: size },
      { label: "影响", value: "数据库、模型文件、venvs、skills、所有配置" },
    ],
  });

  const response = await prompts({
    type: "confirm",
    name: "confirmed",
    message: "确认删除？此操作不可撤销。",
    initial: false,
  });

  if (!response.confirmed) {
    emitCliBlock({ tone: "info", title: "已取消" });
    return;
  }

  await fs.remove(CITY_HOME);

  emitCliBlock({
    tone: "success",
    title: "~/.downcity/ 已删除",
    note: "运行 studio init 重新配置。",
  });
}

import type { Command } from "commander";

export function registerResetCommand(program: Command): void {
  program
    .command("reset")
    .description("重置 city 全部数据（删除整个 ~/.downcity/），需确认")
    .helpOption("--help", "display help for command")
    .action(async () => {
      await resetCommand();
    });
}

/**
 * city reset 命令实现。
 *
 * 关键点（中文）
 * - 删除 ~/.downcity/downcity.db 以及所有 city 配置文件。
 * - 执行前会要求用户确认，防止误删。
 */

import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import prompts from "prompts";
import { emitCliBlock } from "./CliReporter.js";

const CITY_HOME = path.join(os.homedir(), ".downcity");
const DB_PATH = path.join(CITY_HOME, "downcity.db");

export async function resetCommand(): Promise<void> {
  const dbExists = await fs.pathExists(DB_PATH);
  
  if (!dbExists) {
    emitCliBlock({
      tone: "info",
      title: "无可重置的配置",
      summary: "~/.downcity/downcity.db 不存在，city 尚未初始化。",
    });
    return;
  }

  emitCliBlock({
    tone: "warning",
    title: "即将删除 city 全部配置",
    facts: [
      { label: "数据库", value: DB_PATH },
      { label: "影响", value: "模型配置、provider、env、token 等全部清除" },
    ],
  });

  const response = await prompts({
    type: "confirm",
    name: "confirmed",
    message: "确认删除？此操作不可撤销。",
    initial: false,
  });

  if (!response.confirmed) {
    emitCliBlock({
      tone: "info",
      title: "已取消",
    });
    return;
  }

  await fs.remove(DB_PATH);
  
  emitCliBlock({
    tone: "success",
    title: "City 配置已重置",
    note: "运行 city init 重新配置。",
  });
}

import type { Command } from "commander";

/**
 * 注册 city reset 命令。
 */
export function registerResetCommand(program: Command): void {
  program
    .command("reset")
    .description("重置 city 全部配置（删除 ~/.downcity/downcity.db），需确认")
    .helpOption("--help", "display help for command")
    .action(async () => {
      await resetCommand();
    });
}

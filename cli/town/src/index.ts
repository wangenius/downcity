#!/usr/bin/env node

/**
 * Town CLI 进程入口。
 *
 * 关键点（中文）
 * - 入口文件只负责启动 CLI。
 * - commander 命令树统一由 `src/command/RootCommand.ts` 装配。
 * - `-v/--version` 走轻量快速路径，避免版本命令被完整 CLI 依赖链阻塞。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCliLocale, setCliLocale } from "./shared/CliLocale.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const argv = process.argv.slice(2);

setCliLocale(resolveCliLocale({ argv }));

if (argv.length === 1 && (argv[0] === "-v" || argv[0] === "--version")) {
  const package_json = JSON.parse(
    readFileSync(join(__dirname, "../package.json"), "utf-8"),
  ) as { version?: string };
  console.log(String(package_json.version || "unknown"));
  process.exit(0);
}

const { runTownCli } = await import("./command/RootCommand.js");

await runTownCli();

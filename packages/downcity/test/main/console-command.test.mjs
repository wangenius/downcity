/**
 * console/city 启动命令装配测试（node:test）。
 *
 * 关键点（中文）
 * - 锁定 `city start` 对外暴露的 Console 启动参数，避免 `-p` 语义再次漂回 `port`。
 * - 这类测试只验证命令树装配，不触发真实启动流程。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Command } from "commander";
import { registerConsoleCommands } from "../../bin/main/modules/cli/IndexConsoleCommand.js";

test("registerConsoleCommands exposes public and host options on city start", () => {
  const program = new Command();

  registerConsoleCommands(program, {
    version: "1.0.461",
    cliPath: "/tmp/Index.js",
  });

  const startCommand = program.commands.find((command) => command.name() === "start");
  assert.ok(startCommand, "start command should be registered");

  assert.equal(startCommand.options.some((option) => option.long === "--public"), true);
  assert.equal(startCommand.options.some((option) => option.long === "--host"), true);
});

test("registerConsoleCommands keeps hidden internal console port option", () => {
  const program = new Command();

  registerConsoleCommands(program, {
    version: "1.0.462",
    cliPath: "/tmp/Index.js",
  });

  const consoleCommand = program.commands.find((command) => command.name() === "console");
  assert.ok(consoleCommand, "console command should be registered");

  assert.equal(consoleCommand.options.some((option) => option.long === "--port"), true);
});

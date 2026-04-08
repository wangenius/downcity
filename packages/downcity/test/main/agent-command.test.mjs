/**
 * agent 命令行为测试（node:test）。
 *
 * 关键点（中文）
 * - 锁定 `city agent` 的命令树，确保 `chat` 同时覆盖交互式与一次性消息入口。
 * - 锁定 `agent start` 在未传路径时的目标选择规则，避免交互逻辑反复漂移。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Command, Option } from "commander";
import { registerAgentCommands } from "../../bin/main/modules/cli/IndexAgentCommand.js";
import { resolveCliAgentStartTargetDecision } from "../../bin/main/modules/cli/AgentSelection.js";

test("registerAgentCommands exposes agent list and chat commands", () => {
  const program = new Command();

  registerAgentCommands(program, {
    version: "1.0.437",
    hiddenPortOption: Option,
  });

  const agentCommand = program.commands.find((command) => command.name() === "agent");
  assert.ok(agentCommand, "agent command should be registered");

  const subcommandNames = agentCommand.commands.map((command) => command.name());
  assert.deepEqual(
    subcommandNames,
    ["create", "list", "start", "chat", "status", "doctor", "restart"],
  );

  const chatCommand = agentCommand.commands.find((command) => command.name() === "chat");
  assert.ok(chatCommand, "chat command should be registered");
  assert.equal(chatCommand.options.some((option) => option.long === "--to"), true);
  assert.equal(chatCommand.options.some((option) => option.long === "--message"), true);
  assert.equal(chatCommand.options.some((option) => option.long === "--json"), true);
});

test("resolveCliAgentStartTargetDecision prefers interactive selection when cwd is not initialized", () => {
  const decision = resolveCliAgentStartTargetDecision({
    currentWorkingDirectory: "/Users/wangenius/Documents/github/downcity",
    currentDirectoryInitialized: false,
    interactive: true,
    registeredAgents: [
      {
        name: "lucas_whitman",
        projectRoot: "/Users/wangenius/Documents/bots/lucas_whitman",
        status: "running",
      },
    ],
  });

  assert.deepEqual(decision, {
    mode: "prompt",
  });
});

test("resolveCliAgentStartTargetDecision uses current cwd when it is already an initialized agent", () => {
  const decision = resolveCliAgentStartTargetDecision({
    currentWorkingDirectory: "/Users/wangenius/Documents/bots/lucas_whitman",
    currentDirectoryInitialized: true,
    interactive: true,
    registeredAgents: [
      {
        name: "lucas_whitman",
        projectRoot: "/Users/wangenius/Documents/bots/lucas_whitman",
        status: "running",
      },
    ],
  });

  assert.deepEqual(decision, {
    mode: "current",
    projectRoot: "/Users/wangenius/Documents/bots/lucas_whitman",
  });
});

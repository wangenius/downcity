/**
 * CLI 命令树测试（node:test）。
 *
 * 关键点（中文）
 * - 锁定用户可见命令树，避免内部命令再次泄漏到顶层 help。
 * - 锁定 `env` 已经升级为标准资源子命令，而不是单个扁平命令。
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";

const CLI_ENTRY = resolve(process.cwd(), "bin/main/modules/cli/Index.js");

function readHelp(args) {
  return execFileSync(process.execPath, [CLI_ENTRY, ...args], {
    encoding: "utf8",
  });
}

test("root help hides internal and redundant commands", () => {
  const output = readHelp(["--help"]);

  assert.match(output, /\n  token\s+/);
  assert.match(output, /\n  env\s+/);
  assert.match(output, /\n  update\s+/);
  assert.doesNotMatch(output, /\n  agents \[options\]/);
  assert.doesNotMatch(output, /\n  run\s+/);
});

test("token help exposes token management subcommands", () => {
  const output = readHelp(["token", "--help"]);

  assert.match(output, /\n  list \[options\]/);
  assert.match(output, /\n  create \[options\] \[name\]/);
  assert.match(output, /\n  delete \[options\] \[tokenId\]/);
});

test("env help exposes list set delete subcommands", () => {
  const output = readHelp(["env", "--help"]);

  assert.match(output, /\n  list \[options\]/);
  assert.match(output, /\n  set \[options\] <key> <value>/);
  assert.match(output, /\n  delete \[options\] <key>/);
});

test("agent list help exposes running filter", () => {
  const output = readHelp(["agent", "list", "--help"]);

  assert.match(output, /--running \[enabled\]/);
});

test("city start help exposes console public and host shortcuts", () => {
  const output = readHelp(["start", "--help"]);

  assert.match(output, /-p, --public \[enabled\]/);
  assert.match(output, /-h, --host <host>/);
  assert.doesNotMatch(output, /-p, --port <port>/);
});

test("city console help hides internal port option", () => {
  const output = readHelp(["console", "--help"]);

  assert.match(output, /-p, --public \[enabled\]/);
  assert.doesNotMatch(output, /--port <port>/);
});

test("city update help exposes package manager override", () => {
  const output = readHelp(["update", "--help"]);

  assert.match(output, /--manager <manager>/);
});

test("agent chat help exposes interactive and one-shot options", () => {
  const output = readHelp(["agent", "chat", "--help"]);

  assert.match(output, /--to <name>/);
  assert.match(output, /--message <text>/);
  assert.match(output, /--json \[enabled\]/);
});

test("model help keeps interactive and scriptable entrypoints", () => {
  const output = readHelp(["model", "--help"]);

  assert.match(output, /\n  create \[options\]/);
  assert.match(output, /\n  list \[options\]/);
  assert.match(output, /\n  pause \[options\] <modelId>/);
});

test("service and plugin root help are static catalog views", () => {
  const serviceListOutput = readHelp(["service", "list", "--help"]);
  const pluginListOutput = readHelp(["plugin", "list", "--help"]);
  const pluginStatusOutput = readHelp(["plugin", "status", "--help"]);

  assert.doesNotMatch(serviceListOutput, /--path <path>/);
  assert.doesNotMatch(serviceListOutput, /--agent <name>/);
  assert.doesNotMatch(pluginListOutput, /--path <path>/);
  assert.doesNotMatch(pluginListOutput, /--agent <name>/);
  assert.match(pluginStatusOutput, /status \[options\] \[pluginName\]/);
});

test("concrete service roots expose lifecycle commands when supported", () => {
  const memoryOutput = readHelp(["memory", "--help"]);
  const taskOutput = readHelp(["task", "--help"]);

  assert.match(memoryOutput, /\n  start \[options\]/);
  assert.match(memoryOutput, /\n  stop \[options\]/);
  assert.match(memoryOutput, /\n  restart \[options\]/);
  assert.match(taskOutput, /\n  start \[options\]/);
  assert.match(taskOutput, /\n  stop \[options\]/);
  assert.match(taskOutput, /\n  restart \[options\]/);
});

test("static service and plugin catalog commands run without agent context", () => {
  const serviceOutput = readHelp(["service", "list", "--json"]);
  const pluginOutput = readHelp(["plugin", "list", "--json"]);

  const servicePayload = JSON.parse(serviceOutput);
  const pluginPayload = JSON.parse(pluginOutput);

  assert.equal(servicePayload.success, true);
  assert.equal(Array.isArray(servicePayload.services), true);
  assert.equal(pluginPayload.success, true);
  assert.equal(Array.isArray(pluginPayload.plugins), true);
});

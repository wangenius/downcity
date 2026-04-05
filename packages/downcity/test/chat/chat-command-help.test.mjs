/**
 * chat 命令帮助文本测试（node:test）。
 *
 * 覆盖点（中文）
 * - `city chat --help` 应给出当前会话发送、跨 chat 发送与常用入口提示。
 * - `city chat send --help` 应包含正文协议、附件协议与常用示例。
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const CLI_ENTRY = path.resolve(process.cwd(), "bin/main/modules/cli/Index.js");

async function runHelp(args) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_ENTRY, ...args], {
    cwd: process.cwd(),
    env: process.env,
  });
  return `${stdout}${stderr}`;
}

test("city chat --help includes direct-send and cross-chat guidance", async () => {
  const output = await runHelp(["chat", "--help"]);
  assert.match(output, /直接输出 assistant 文本会发送到当前 chat channel/);
  assert.match(output, /跨 chat 发送请使用 `city chat send --chat-key <chatKey>`/);
  assert.match(output, /先看 `city chat send --help` 与 `city chat react --help`/);
});

test("city chat send --help includes message protocol and examples", async () => {
  const output = await runHelp(["chat", "send", "--help"]);
  assert.match(output, /frontmatter metadata 字段语义与 `city chat send` 参数一致/);
  assert.match(output, /附件使用 `<file type=\"\.\.\.\">path<\/file>`/);
  assert.match(output, /city chat send --text 'done'/);
  assert.match(output, /city chat send --chat-key <chatKey> --text 'done'/);
  assert.match(output, /cat <<'EOF' \| city chat send --stdin --chat-key <chatKey>/);
});

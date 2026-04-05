/**
 * CLI reporter 输出测试（node:test）。
 *
 * 关键点（中文）
 * - 锁定 header、block、list 的基础版式，避免后续命令输出再次失去一致性。
 * - 关闭 ANSI 颜色后断言纯文本，保证快照稳定且容易阅读。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  emitCliBlock,
  emitCliHeader,
  emitCliList,
  formatCliBlock,
  formatCliHeader,
  formatCliList,
  resetCliSectionFlow,
} from "../../bin/main/modules/cli/CliReporter.js";

test("formatCliHeader renders a compact branded banner", () => {
  const output = formatCliHeader("1.0.431", { color: false });

  assert.equal(output, "downcity  v1.0.431");
});

test("formatCliBlock aligns facts under a single visual block", () => {
  const output = formatCliBlock(
    {
      tone: "success",
      title: "Console started",
      summary: "ready",
      facts: [
        { label: "URL", value: "http://127.0.0.1:5315" },
      ],
      note: "单个 Console 实例可切换查看多个已运行 agent。",
    },
    { color: false },
  );

  assert.equal(output, [
    "Console started                                      [READY]",
    "  url       http://127.0.0.1:5315",
    "  note      单个 Console 实例可切换查看多个已运行 agent。",
  ].join("\n"));
});

test("formatCliList renders grouped agent items with nested facts", () => {
  const output = formatCliList(
    {
      tone: "accent",
      title: "Managed agents",
      summary: "restarting · 1 item",
      items: [
        {
          tone: "success",
          title: "lucas_whitman",
          facts: [
            {
              label: "Project",
              value: "/Users/wangenius/Documents/bots/lucas_whitman",
            },
          ],
        },
      ],
    },
    { color: false },
  );

  assert.equal(output, [
    "Managed agents                         [RESTARTING · 1 ITEM]",
    "  lucas_whitman",
    "    project   /Users/wangenius/Documents/bots/lucas_whitman",
  ].join("\n"));
});

test("formatCliReporter emits ansi color when enabled", () => {
  const output = formatCliBlock(
    {
      tone: "success",
      title: "Console started",
      facts: [{ label: "URL", value: "http://127.0.0.1:5315" }],
    },
    { color: true },
  );

  assert.match(output, /\u001b\[/);
});

test("emitCli* inserts blank lines between sections", () => {
  const captured = [];
  const originalLog = console.log;
  console.log = (...args) => {
    captured.push(args.join(" "));
  };

  try {
    resetCliSectionFlow();
    emitCliHeader("1.0.431", { color: false });
    emitCliBlock(
      {
        tone: "success",
        title: "Console started",
        summary: "ready",
      },
      { color: false },
    );
    emitCliList(
      {
        tone: "accent",
        title: "Managed agents",
        summary: "restarting · 1 item",
        items: [{ title: "lucas_whitman" }],
      },
      { color: false },
    );
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(captured, [
    "downcity  v1.0.431",
    "────────────────────────────────────────────────────────────",
    "Console started                                      [READY]",
    "────────────────────────────────────────────────────────────",
    "Managed agents                         [RESTARTING · 1 ITEM]\n  lucas_whitman",
  ]);
});

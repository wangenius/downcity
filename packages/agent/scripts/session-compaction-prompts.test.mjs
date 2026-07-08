/**
 * @file 验证 session compact prompt 与文件操作 XML 记录。
 *
 * 关键点（中文）
 * - compact prompt 必须保持结构化摘要格式稳定。
 * - 迭代更新 prompt 需要携带 previous-summary 标签。
 * - 文件操作 XML 由本地解析追加，不依赖模型复述工具日志。
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_COMPACTION_SYSTEM_PROMPT,
  append_session_compaction_file_operations,
  build_initial_session_compaction_prompt,
  build_turn_prefix_session_compaction_prompt,
  build_update_session_compaction_prompt,
} from "../bin/executor/composer/compaction/jsonl/JsonlSessionCompactionPrompts.js";
import {
  collect_session_compaction_file_operations,
  format_session_compaction_file_operations,
} from "../bin/executor/composer/compaction/jsonl/JsonlSessionCompactionFileOperations.js";

test("session compaction prompts preserve structured formats", () => {
  assert.match(
    SESSION_COMPACTION_SYSTEM_PROMPT,
    /Do NOT continue the conversation/,
  );

  const initial_prompt = build_initial_session_compaction_prompt({
    conversation_text: "user: 请修改 packages/agent/src/foo.ts",
  });
  assert.match(initial_prompt, /## Goal/);
  assert.match(initial_prompt, /## Constraints & Preferences/);
  assert.match(initial_prompt, /## Critical Context/);
  assert.match(
    initial_prompt,
    /Keep each section concise\. Preserve exact file paths/,
  );

  const update_prompt = build_update_session_compaction_prompt({
    previous_summary: "## Goal\n旧目标",
    new_conversation_text: "assistant: 已完成一部分",
  });
  assert.match(update_prompt, /<previous-summary>\n## Goal\n旧目标\n<\/previous-summary>/);
  assert.match(update_prompt, /PRESERVE all existing information/);
  assert.match(update_prompt, /## Next Steps/);

  const prefix_prompt = build_turn_prefix_session_compaction_prompt({
    prefix_text: "user: 这个 turn 太长",
  });
  assert.match(prefix_prompt, /## Original Request/);
  assert.match(prefix_prompt, /## Context for Suffix/);
});

test("session compaction file operations are appended as xml", () => {
  const messages = [
    {
      id: "a:1",
      role: "assistant",
      parts: [
        {
          type: "tool-exec_command",
          input: {
            cmd: "sed -n '1,40p' packages/agent/src/foo.ts && rg -n compact packages/agent/src",
          },
          output: [
            "*** Update File: packages/agent/src/bar.ts",
            " M packages/agent/src/baz.ts",
          ].join("\n"),
        },
      ],
    },
  ];

  const operations = collect_session_compaction_file_operations(messages);
  assert.deepEqual(operations.read_files, [
    "packages/agent/src",
    "packages/agent/src/foo.ts",
  ]);
  assert.deepEqual(operations.modified_files, [
    "packages/agent/src/bar.ts",
    "packages/agent/src/baz.ts",
  ]);

  const xml = format_session_compaction_file_operations(messages);
  assert.match(xml, /<read-files>\npackages\/agent\/src/);
  assert.match(xml, /<modified-files>\npackages\/agent\/src\/bar\.ts/);

  const summary = append_session_compaction_file_operations({
    summary: "## Goal\n完成 compact",
    file_operations_xml: xml,
  });
  assert.match(summary, /## Goal\n完成 compact\n\n<read-files>/);
  assert.match(summary, /<\/modified-files>$/);
});

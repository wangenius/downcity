/**
 * @file 验证 Session compact prompt 的结构化摘要格式。
 *
 * 关键点（中文）
 * - compact prompt 必须保持结构化摘要格式稳定。
 * - 迭代更新 prompt 需要携带 previous-summary 标签。
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  SESSION_COMPACTION_SYSTEM_PROMPT,
  build_initial_session_compaction_prompt,
  build_turn_prefix_session_compaction_prompt,
  build_update_session_compaction_prompt,
} from "../bin/executor/composer/compaction/jsonl/JsonlSessionCompactionPrompts.js";

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

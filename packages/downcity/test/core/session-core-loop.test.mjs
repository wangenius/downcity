/**
 * SessionCore loop 决策测试（node:test）。
 *
 * 关键点（中文）
 * - 文本续跑、tool call 续跑、不完整响应恢复三者的优先级需要稳定。
 * - 这类条件判断拆出后，必须靠测试锁住，避免后续重构把 loop 语义改坏。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateSessionLoopDecision,
  shouldContinueForTailMergedUserMessages,
} from "../../bin/sessions@/city/runtime/console/SessionCoreLoop.js";

test("evaluateSessionLoopDecision prefers incomplete recovery over other branches", () => {
  const decision = evaluateSessionLoopDecision({
    hasIncompleteResponse: true,
    incompleteRecoveryCount: 0,
    maxIncompleteRecoveries: 2,
    textOnlyContinuationReason: "assistant_text_only",
    textOnlyContinuationCount: 0,
    maxTextOnlyContinuations: 2,
    hasTools: true,
    toolCallCount: 0,
  });

  assert.equal(decision.kind, "recover_incomplete");
  assert.equal(decision.continueForIncompleteRecovery, true);
});

test("evaluateSessionLoopDecision continues for tool calls before text-only continuation", () => {
  const decision = evaluateSessionLoopDecision({
    hasIncompleteResponse: false,
    incompleteRecoveryCount: 0,
    maxIncompleteRecoveries: 2,
    textOnlyContinuationReason: "assistant_text_only",
    textOnlyContinuationCount: 0,
    maxTextOnlyContinuations: 2,
    hasTools: true,
    toolCallCount: 1,
  });

  assert.equal(decision.kind, "continue_for_tool_calls");
  assert.equal(decision.continueForToolCalls, true);
});

test("evaluateSessionLoopDecision falls back to stop when no continuation condition matches", () => {
  const decision = evaluateSessionLoopDecision({
    hasIncompleteResponse: false,
    incompleteRecoveryCount: 0,
    maxIncompleteRecoveries: 2,
    textOnlyContinuationReason: null,
    textOnlyContinuationCount: 0,
    maxTextOnlyContinuations: 2,
    hasTools: true,
    toolCallCount: 0,
  });

  assert.equal(decision.kind, "stop");
  assert.equal(decision.continueForToolCalls, false);
  assert.equal(decision.continueForTextOnly, false);
  assert.equal(decision.continueForIncompleteRecovery, false);
});

test("shouldContinueForTailMergedUserMessages continues when tail merge picked up late inbound messages", () => {
  assert.equal(
    shouldContinueForTailMergedUserMessages({
      mergedUserMessageCount: 1,
    }),
    true,
  );
});

test("shouldContinueForTailMergedUserMessages stops when no late inbound message was merged", () => {
  assert.equal(
    shouldContinueForTailMergedUserMessages({
      mergedUserMessageCount: 0,
    }),
    false,
  );
});

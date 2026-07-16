/**
 * @file 验证 SessionQueue 只维护 Prompt/Command 的确定 FIFO 顺序。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { SessionQueue } from "../bin/session/SessionQueue.js";

function model_command(command_id) {
  return {
    type: "session_model",
    command_id,
    config: {},
  };
}

test("SessionQueue 返回首个 Prompt 及其之前的命令", () => {
  const queue = new SessionQueue();
  queue.enqueue_command(model_command("command-1"));
  const handle = queue.enqueue_prompt({ query: "first" });
  queue.enqueue_command({ type: "compact", command_id: "compact-1" });

  const next = queue.take_next_prompt();
  assert.deepEqual(next.commands.map((item) => item.command_id), ["command-1"]);
  assert.equal(next.prompt.input.query, "first");
  assert.equal(handle instanceof Promise, true);
  assert.equal(queue.has_command(), true);
  assert.equal(queue.has_prompt(), false);
});

test("SessionQueue drain 保留 Prompt 和 Command 的原始顺序", () => {
  const queue = new SessionQueue();
  queue.enqueue_prompt({ query: "steer-1" });
  queue.enqueue_command(model_command("command-1"));
  queue.enqueue_prompt({ query: "steer-2" });

  assert.deepEqual(
    queue.drain().map((item) => item.type),
    ["prompt", "session_model", "prompt"],
  );
  assert.equal(queue.has_prompt(), false);
});

test("SessionQueue cancel_prompts 取消 Prompt 但保留命令", () => {
  const queue = new SessionQueue();
  queue.enqueue_prompt({ query: "queued" });
  queue.enqueue_command({ type: "compact", command_id: "compact-1" });

  assert.equal(queue.cancel_prompts().length, 1);
  assert.deepEqual(queue.drain(), [
    { type: "compact", command_id: "compact-1" },
  ]);
});

test("SessionQueue 可以把未处理输入恢复到队列头部", () => {
  const queue = new SessionQueue();
  queue.enqueue_command({ type: "compact", command_id: "tail" });
  queue.restore_front([model_command("head")]);

  assert.deepEqual(
    queue.drain().map((item) => item.command_id),
    ["head", "tail"],
  );
});

/**
 * Task 默认正文模板测试（node:test）。
 *
 * 关键点（中文）
 * - 未显式提供 body 的 agent task 应生成结构化正文模板，降低后续 task 维护成本。
 * - 模板需要覆盖目标、步骤、输出要求、触发/状态建议与注意事项。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createTaskDefinition,
  listTaskDefinitions,
} from "../../bin/services/task/Action.js";

test("createTaskDefinition uses structured default body template for agent tasks", async () => {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-task-default-body-template-"),
  );

  try {
    const created = await createTaskDefinition({
      projectRoot: rootPath,
      request: {
        title: "default-body-template",
        description: "验证默认正文模板",
        sessionId: "ctx_default_body_template",
        when: "@manual",
      },
    });
    assert.equal(created.success, true);

    const listed = await listTaskDefinitions({
      projectRoot: rootPath,
    });
    assert.equal(listed.success, true);
    assert.equal(listed.tasks.length, 1);

    const body = String(listed.tasks[0].body || "");
    assert.match(body, /# 任务目标/);
    assert.match(body, /# 执行步骤/);
    assert.match(body, /# 输出要求/);
    assert.match(body, /# 触发与状态建议/);
    assert.match(body, /# 注意事项/);
    assert.match(body, /最终回复会由系统自动发送到任务绑定的 chat/);
    assert.match(body, /默认使用 `@manual` \+ `paused`/);
    assert.match(body, /不要在正文里重复调用 `city chat send`/);
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});

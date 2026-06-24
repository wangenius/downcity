/**
 * @file 验证 plugin tool bridge 会把生成文件摘要为可打开路径。
 *
 * 关键点（中文）
 * - assistant message 仍然使用 `resources://` URL，避免历史暴露本机路径。
 * - tool result 额外返回本机绝对路径，便于模型与用户明确知道文件位置。
 */

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import {
  invokePluginCallTool,
  setPluginToolRuntime,
} from "../bin/executor/tools/plugin/PluginToolBridge.js";
import { withSessionRunScope } from "../bin/executor/SessionRunScope.js";

function create_run_context(project_root) {
  return {
    sessionId: "session_test",
    projectRoot: project_root,
    injectedUserMessages: [],
    deferredPersistedUserMessages: [],
    pendingAssistantFileParts: [],
  };
}

test("invokePluginCallTool returns absolute paths for materialized file parts", async () => {
  const project_root = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-plugin-tool-files-"),
  );
  const bytes = Buffer.from("png-bytes-for-plugin-tool", "utf8");

  setPluginToolRuntime({
    list: () => [],
    availability: async () => ({ enabled: true, available: true, reasons: [] }),
    runAction: async () => ({
      success: true,
      message: "image generated",
      data: {
        id: "msg_image_test",
        role: "assistant",
        parts: [
          {
            type: "file",
            mediaType: "image/png",
            filename: "image.png",
            url: `data:image/png;base64,${bytes.toString("base64")}`,
          },
        ],
      },
    }),
    pipeline: async (_, value) => value,
    guard: async () => {},
    effect: async () => {},
    resolve: async () => {
      throw new Error("not implemented");
    },
  });

  const run_context = create_run_context(project_root);
  const result = await withSessionRunScope({ runContext: run_context }, () =>
    invokePluginCallTool({
      plugin: "image",
      action: "image_result",
      payload: { job_id: "img_1" },
    }),
  );

  assert.equal(result.success, true);
  assert.equal(result.assistant_file_count, 1);
  assert.equal(result.files?.length, 1);
  assert.match(result.files[0].url, /^resources:\/\/\.downcity\/resources\//);
  assert.equal(path.isAbsolute(result.files[0].path), true);
  assert.equal(
    path.dirname(result.files[0].path),
    path.join(project_root, ".downcity", "resources"),
  );
  assert.deepEqual(await fs.readFile(result.files[0].path), bytes);
  assert.equal("data" in result, false);

  const pending_parts = run_context.pendingAssistantFileParts;
  assert.equal(pending_parts.length, 1);
  assert.equal(pending_parts[0].url, result.files[0].url);
});

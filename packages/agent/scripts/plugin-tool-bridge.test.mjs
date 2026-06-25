/**
 * @file 验证 plugin tool bridge 会把生成文件摘要为可打开路径。
 *
 * 关键点（中文）
 * - assistant message 使用 Agent 根目录相对路径，避免历史暴露本机路径。
 * - tool result 同时返回相对路径与本机绝对路径，便于模型与用户明确知道文件位置。
 */

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import {
  invokePluginCallTool,
  invokePluginReadTool,
  setPluginToolRuntime,
} from "../bin/executor/tools/plugin/PluginToolBridge.js";
import { withSessionRunScope } from "../bin/executor/SessionRunScope.js";
import { createAction, createPlugin } from "../bin/plugin/core/PluginActionFactory.js";
import { createAgentPluginRegistry } from "../bin/agent/local/AgentPluginFactory.js";
import { z } from "zod";

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
    read: () => ({ plugins: [] }),
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
  assert.match(result.files[0].relative_path, /^\.downcity\/resources\//);
  assert.equal(path.isAbsolute(result.files[0].path), true);
  assert.equal(
    path.dirname(result.files[0].path),
    path.join(project_root, ".downcity", "resources"),
  );
  assert.deepEqual(await fs.readFile(result.files[0].path), bytes);
  assert.equal("data" in result, false);

  const pending_parts = run_context.pendingAssistantFileParts;
  assert.equal(pending_parts.length, 1);
  assert.equal(pending_parts[0].url, result.files[0].relative_path);
});

test("invokePluginReadTool returns plugin action metadata", async () => {
  setPluginToolRuntime({
    list: () => [],
    read: () => ({
      name: "image",
      title: "Image",
      description: "Create images",
      actions: [
        {
          name: "image_create",
          description: "Create image job",
          has_input_schema: true,
          input_schema: {
            type: "object",
            properties: {
              prompt: { type: "string" },
            },
          },
          examples: [
            {
              title: "Text-only image",
              payload: { prompt: "draw" },
            },
          ],
          allow_when_disabled: false,
          has_command: false,
          has_api: false,
        },
      ],
    }),
    availability: async () => ({ enabled: true, available: true, reasons: [] }),
    runAction: async () => ({ success: false, error: "not used" }),
    pipeline: async (_, value) => value,
    guard: async () => {},
    effect: async () => {},
    resolve: async () => {
      throw new Error("not implemented");
    },
  });

  const result = await invokePluginReadTool({
    plugin: "image",
    action: "image_create",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.name, "image");
  assert.equal(result.data.actions[0].name, "image_create");
  assert.equal(result.data.actions[0].has_input_schema, true);
  assert.equal(result.data.actions[0].examples[0].payload.prompt, "draw");
});

test("PluginRegistry validates action payload with metadata schema", async () => {
  const plugin = createPlugin({
    name: "demo",
    title: "Demo",
    description: "Demo plugin",
    actions: {
      echo: createAction({
        description: "Echo text",
        input_schema: {
          zod: z.object({
            text: z.string(),
          }),
          json_schema: {
            type: "object",
            required: ["text"],
            properties: {
              text: { type: "string" },
            },
          },
        },
        execute: async ({ input }) => ({
          success: true,
          data: { text: input.text },
          message: "echoed",
        }),
      }),
    },
  });
  const registry = createAgentPluginRegistry({
    plugins: [plugin],
    get_context: () => ({ rootPath: process.cwd() }),
  });

  const metadata = registry.read({ plugin: "demo", action: "echo" });
  assert.equal(metadata.actions[0].description, "Echo text");
  assert.equal(metadata.actions[0].has_input_schema, true);

  const invalid = await registry.runAction({
    plugin: "demo",
    action: "echo",
    payload: {},
  });
  assert.equal(invalid.success, false);
  assert.match(invalid.error, /Invalid payload/);

  const valid = await registry.runAction({
    plugin: "demo",
    action: "echo",
    payload: { text: "hello" },
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data.text, "hello");
});

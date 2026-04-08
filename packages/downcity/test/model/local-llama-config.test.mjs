/**
 * LMP runtime 配置解析测试（node:test）。
 *
 * 关键点（中文）
 * - `execution.type=local` 默认读取 `plugins.lmp`。
 * - `plugins.lmp.model` 允许只写文件名，由运行时自动拼接为绝对路径。
 */

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  resolveLmpRuntimeConfig,
} from "../../bin/plugins/lmp/runtime/Config.js";

test("resolveLmpRuntimeConfig uses ~/.models as default modelsDir", () => {
  const result = resolveLmpRuntimeConfig({
    projectRoot: "/tmp/downcity-local-agent",
    config: {
      name: "local-agent",
      version: "1.0.0",
      execution: {
        type: "local",
      },
      plugins: {
        lmp: {
          provider: "llama",
          model: "gemma-4-E4B-it-UD-Q4_K_XL.gguf",
        },
      },
    },
  });

  assert.equal(result.modelsDir, path.join(os.homedir(), ".models"));
  assert.equal(
    result.modelPath,
    path.join(os.homedir(), ".models", "gemma-4-E4B-it-UD-Q4_K_XL.gguf"),
  );
  assert.equal(result.command, "llama-server");
  assert.equal(result.host, "127.0.0.1");
  assert.equal(result.autoStart, true);
});

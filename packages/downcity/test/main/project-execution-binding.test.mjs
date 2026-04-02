/**
 * 项目 execution binding 测试（node:test）。
 *
 * 关键点（中文）
 * - 现在项目只需要声明 `execution`。
 * - `initializeAgentProject` 也应支持只创建 ACP execution 配置。
 */

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import fs from "fs-extra";
import { loadDowncityConfig } from "../../bin/main/env/Config.js";
import { initializeAgentProject } from "../../bin/main/project/AgentInitializer.js";

test("loadDowncityConfig accepts execution.acp without model execution", async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-acp-config-"));
  try {
    await fs.writeJson(path.join(projectRoot, "downcity.json"), {
      name: "acp-only-agent",
      version: "1.0.0",
      execution: {
        type: "acp",
        agent: {
          type: "kimi",
        },
      },
    });

    const config = loadDowncityConfig(projectRoot, {
      projectEnv: {},
      agentEnv: {},
      globalEnv: {},
    });

    assert.equal(config.name, "acp-only-agent");
    assert.equal(config.execution?.type, "acp");
    assert.equal(config.execution?.agent?.type, "kimi");
  } finally {
    await fs.remove(projectRoot);
  }
});

test("initializeAgentProject writes execution.agent when using ACP mode", async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-acp-init-"));
  try {
    const result = await initializeAgentProject({
      projectRoot,
      agentName: "ACP Agent",
      execution: {
        type: "acp",
        agent: {
          type: "claude",
        },
      },
    });

    const ship = await fs.readJson(path.join(projectRoot, "downcity.json"));
    assert.equal(result.executionMode, "acp");
    assert.equal(result.agentType, "claude");
    assert.equal(result.modelId, undefined);
    assert.equal(ship.execution?.type, "acp");
    assert.equal(ship.execution?.agent?.type, "claude");
  } finally {
    await fs.remove(projectRoot);
  }
});

/**
 * 项目 execution binding 测试（node:test）。
 *
 * 关键点（中文）
 * - 现在项目只需要声明 `execution`。
 * - `initializeAgentProject` 应支持 `api / acp / local` 三种 execution 配置。
 * - `local` 的具体模型配置现在通过 `plugins.lmp` 写入。
 */

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import fs from "fs-extra";
import { loadDowncityConfig } from "../../bin/main/city/env/Config.js";
import { initializeAgentProject } from "../../bin/main/agent/project/AgentInitializer.js";

test("loadDowncityConfig accepts execution.acp without api execution", async () => {
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

test("loadDowncityConfig accepts execution.api with modelId", async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-api-config-"));
  try {
    await fs.writeJson(path.join(projectRoot, "downcity.json"), {
      name: "api-agent",
      version: "1.0.0",
      execution: {
        type: "api",
        modelId: "default",
      },
    });

    const config = loadDowncityConfig(projectRoot, {
      projectEnv: {},
      agentEnv: {},
      globalEnv: {},
    });

    assert.equal(config.name, "api-agent");
    assert.equal(config.execution?.type, "api");
    assert.equal(config.execution?.modelId, "default");
  } finally {
    await fs.remove(projectRoot);
  }
});

test("loadDowncityConfig accepts execution.local with plugins.lmp.model", async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-local-config-"));
  try {
    await fs.writeJson(path.join(projectRoot, "downcity.json"), {
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
    });

    const config = loadDowncityConfig(projectRoot, {
      projectEnv: {},
      agentEnv: {},
      globalEnv: {},
    });

    assert.equal(config.name, "local-agent");
    assert.equal(config.execution?.type, "local");
    assert.equal(config.plugins?.lmp?.model, "gemma-4-E4B-it-UD-Q4_K_XL.gguf");
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

test("initializeAgentProject writes execution.local when using local llama mode", async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-local-init-"));
  try {
    const result = await initializeAgentProject({
      projectRoot,
      agentName: "Local Agent",
      execution: {
        type: "local",
      },
      plugins: {
        lmp: {
          provider: "llama",
          model: "gemma-4-E4B-it-UD-Q4_K_XL.gguf",
        },
      },
    });

    const ship = await fs.readJson(path.join(projectRoot, "downcity.json"));
    assert.equal(result.executionMode, "local");
    assert.equal(result.agentType, undefined);
    assert.equal(result.modelId, undefined);
    assert.equal(ship.execution?.type, "local");
    assert.equal(ship.plugins?.lmp?.model, "gemma-4-E4B-it-UD-Q4_K_XL.gguf");
  } finally {
    await fs.remove(projectRoot);
  }
});

/**
 * `city agent create`：在目标目录生成最小可用的 Downcity 工程骨架与配置文件。
 *
 * 目标
 * - 生成 `PROFILE.md` / `SOUL.md` / `downcity.json` / `.downcity/` 目录结构与 schema 文件
 * - 通过交互式问题收集必要配置（模型、channels 等）
 *
 * 设计要点
 * - Chat channels 支持多选：仅写入用户选择的 channels（未选择的不出现在 `downcity.json`）
 * - 避免写入无意义的默认值：能省则省，保持配置简洁
 */

import path from "path";
import os from "os";
import prompts from "prompts";
import fs from "fs-extra";
import fg from "fast-glob";
import { getProfileMdPath, getDowncityJsonPath, getSoulMdPath } from "@/main/city/env/Paths.js";
import {
  initializeAgentProject,
  listConsoleModelChoices,
  normalizeDefaultAgentName,
} from "@/main/agent/project/AgentInitializer.js";
import type { AgentProjectChannel } from "@/shared/types/AgentProject.js";
import type { ExecutionBindingConfig } from "@/shared/types/ExecutionBinding.js";
import type { SessionAgentType } from "@/shared/types/SessionAgent.js";
import { emitCliBlock, emitCliList } from "./CliReporter.js";

type InitPromptResponse = {
  name?: string;
  executionTarget?: string;
  primaryModelId?: string;
  localModel?: string;
  channels?: string[];
};

async function listLocalLlamaModelChoices(): Promise<Array<{ title: string; value: string }>> {
  const modelsRoot = path.join(os.homedir(), ".models");
  const matches = await fg(["*.gguf", "**/*.gguf"], {
    cwd: modelsRoot,
    onlyFiles: true,
  }).catch(() => []);
  return matches.slice(0, 100).map((item) => ({
    title: item,
    value: item,
  }));
}

/**
 * init 命令入口。
 *
 * 流程（中文）
 * 1) 校验项目目录与覆盖策略
 * 2) 交互收集配置
 * 3) 生成配置与目录
 * 4) 生成最小可运行结构（skills 目录仅创建，不做自动同步/安装）
 */
export async function initCommand(
  cwd: string = ".",
  options: { force?: boolean } = {},
): Promise<void> {
  const projectRoot = path.resolve(cwd);
  const projectBaseName = path.basename(projectRoot);
  const defaultAgentName =
    normalizeDefaultAgentName(projectBaseName) || projectBaseName;
  let allowOverwrite = Boolean(options.force);

  emitCliBlock({
    tone: "accent",
    title: "Initializing agent project",
    facts: [
      {
        label: "Project",
        value: projectRoot,
      },
    ],
  });

  // Check if core initialization files already exist
  const existingProfileMd = fs.existsSync(getProfileMdPath(projectRoot));
  const existingSoulMd = fs.existsSync(getSoulMdPath(projectRoot));
  const existingShipJson = fs.existsSync(getDowncityJsonPath(projectRoot));
  const consoleModelChoices = await listConsoleModelChoices();
  const consoleModelIds = consoleModelChoices.map((item) => item.value);
  const localModelChoices = await listLocalLlamaModelChoices();

  // 关键点（中文）：已存在的 PROFILE.md 永远不覆盖，只在 downcity.json 已存在时询问覆盖。
  if (existingShipJson) {
    if (!allowOverwrite) {
      const confirmResponse = (await prompts({
        type: "confirm",
        name: "overwrite",
        message:
          "downcity.json already exists. Overwrite existing downcity.json and continue?",
        initial: false,
      })) as { overwrite?: boolean };

      if (!confirmResponse.overwrite) {
        emitCliBlock({
          tone: "info",
          title: "Initialization cancelled",
        });
        return;
      }
      allowOverwrite = true;
    }
  }

  // Collect configuration information
  // 交互采集（中文）：agent name + channels。
  const response = (await prompts([
    {
      type: "text",
      name: "name",
      message: "Agent name",
      initial: defaultAgentName,
    },
    {
      type: "select",
      name: "executionTarget",
      message: "Select execution mode",
      choices: [
        { title: "API Model Pool", value: "api" },
        { title: "Local llama (~/.models)", value: "local" },
        { title: "Kimi ACP", value: "kimi" },
        { title: "Claude ACP", value: "claude" },
        { title: "Codex ACP", value: "codex" },
      ],
      initial: consoleModelIds.length > 0 ? 0 : 1,
    },
    {
      type: (prev: string) => prev === "api" ? "select" : null,
      name: "primaryModelId",
      message: "Select primary model (from console model pool)",
      choices: consoleModelChoices,
      initial: 0,
    },
    {
      type: (prev: string) =>
        prev === "local"
          ? localModelChoices.length > 0
            ? "select"
            : "text"
          : null,
      name: "localModel",
      message:
        localModelChoices.length > 0
          ? "Select local GGUF model (from ~/.models)"
          : "Enter local GGUF model file name or absolute path",
      choices: localModelChoices,
      initial: 0,
    },
    {
      // 关键交互: Chat channels 允许多选，未选择的就不写入 downcity.json
      type: "multiselect",
      name: "channels",
      message: "Select chat channels (multi-select)",
      choices: [
        { title: "Telegram", value: "telegram" },
        { title: "Feishu", value: "feishu" },
        { title: "QQ", value: "qq" },
      ],
    },
  ])) as InitPromptResponse;

  // 关键点（中文）：agent_name 同时用于 `downcity.json.name` 与 init 模板变量渲染，避免两处来源不一致。
  const agentName =
    String(response.name || "").trim() || defaultAgentName;
  const executionTarget = String(response.executionTarget || "").trim();
  if (executionTarget === "api" && consoleModelIds.length === 0) {
    console.error("❌ Console model pool is empty.");
    console.error("   Please configure at least one model before using api mode:");
    console.error("   1) city model create");
    console.error("   2) or choose a local / ACP executor during init");
    process.exit(1);
  }
  const primaryModelId =
    executionTarget === "api"
      ? String(response.primaryModelId || "").trim() || "default"
      : "";
  const localModel =
    executionTarget === "local"
      ? String(response.localModel || "").trim()
      : "";
  const sessionAgentType =
    executionTarget && executionTarget !== "api" && executionTarget !== "local"
      ? executionTarget as SessionAgentType
      : undefined;
  const execution: ExecutionBindingConfig =
    primaryModelId
      ? {
          type: "api",
          modelId: primaryModelId,
        }
      : localModel
        ? {
            type: "local",
          }
        : {
          type: "acp",
          agent: {
            type: sessionAgentType || "kimi",
          },
          };
  const selectedChannels = Array.isArray(response.channels)
    ? (response.channels as AgentProjectChannel[])
    : [];
  const initResult = await initializeAgentProject({
    projectRoot,
    agentName,
    execution,
    ...(localModel
      ? {
          plugins: {
            lmp: {
              provider: "llama",
              model: localModel,
            },
          },
        }
      : {}),
    channels: selectedChannels,
    forceOverwriteShipJson: allowOverwrite,
  });

  const createdItems: string[] = [];
  const skippedItems: string[] = [];
  if (!existingProfileMd && initResult.createdFiles.includes("PROFILE.md")) {
    createdItems.push("PROFILE.md");
  } else if (existingProfileMd) {
    skippedItems.push("PROFILE.md");
  }
  if (!existingSoulMd && initResult.createdFiles.includes("SOUL.md")) {
    createdItems.push("SOUL.md");
  } else if (existingSoulMd) {
    skippedItems.push("SOUL.md");
  }
  createdItems.push("downcity.json", ".downcity/", "downcity.schema.json");
  skippedItems.push(".env", ".env.example");

  emitCliBlock({
    tone: "success",
    title: "Initialization complete",
    summary: agentName,
  });
  emitCliList({
    tone: "accent",
    title: "Created",
    items: createdItems.map((item) => ({ title: item })),
  });
  emitCliList({
    tone: "info",
    title: "Skipped",
    items: skippedItems.map((item) => ({ title: item })),
  });
  if (primaryModelId) {
    emitCliBlock({
      tone: "info",
      title: "Execution",
      summary: "api",
      facts: [
        {
          label: "Model ID",
          value: primaryModelId,
        },
        {
          label: "Source",
          value: "~/.downcity/downcity.db",
        },
      ],
    });
  }
  if (localModel) {
    emitCliBlock({
      tone: "info",
      title: "Execution",
      summary: "local",
      facts: [
        {
          label: "Runtime",
          value: "llama.cpp",
        },
        {
          label: "Model",
          value: localModel,
        },
        {
          label: "Source",
          value: "~/.models",
        },
      ],
    });
  }
  if (sessionAgentType) {
    emitCliBlock({
      tone: "info",
      title: "Execution",
      summary: "acp",
      facts: [
        {
          label: "Agent",
          value: sessionAgentType,
        },
        {
          label: "Runtime",
          value: "ACP coding agent session",
        },
      ],
    });
  }

  const channelItems: Array<{ title: string; facts: Array<{ label: string; value: string }> }> = [];
  if (selectedChannels.includes("feishu")) {
    channelItems.push({
      title: "feishu",
      facts: [
        {
          label: "Bind",
          value: "services.chat.channels.feishu.channelAccountId",
        },
        {
          label: "Manage",
          value: "Console > Global / Channel Accounts",
        },
      ],
    });
  }
  if (selectedChannels.includes("telegram")) {
    channelItems.push({
      title: "telegram",
      facts: [
        {
          label: "Bind",
          value: "services.chat.channels.telegram.channelAccountId",
        },
        {
          label: "Manage",
          value: "Console > Global / Channel Accounts",
        },
      ],
    });
  }
  if (selectedChannels.includes("qq")) {
    channelItems.push({
      title: "qq",
      facts: [
        {
          label: "Bind",
          value: "services.chat.channels.qq.channelAccountId",
        },
        {
          label: "Manage",
          value: "Console > Global / Channel Accounts",
        },
      ],
    });
  }
  if (channelItems.length > 0) {
    emitCliList({
      tone: "accent",
      title: "Channels",
      items: channelItems,
    });
  }

  const nextSteps: string[] = [
    "Edit PROFILE.md to customize agent behavior",
    "Edit SOUL.md to customize your core operating principles",
    "Edit downcity.json.execution to adjust execution target",
  ];
  if (primaryModelId) {
    nextSteps.push("Edit downcity.json.execution.modelId (bind to console API model id)");
    nextSteps.push('Use "city model ..." to manage global model pool');
  }
  if (localModel) {
    nextSteps.push("Put GGUF models under ~/.models or update plugins.lmp.model");
    nextSteps.push("Ensure llama-server from llama.cpp is installed and available in PATH");
    nextSteps.push('Use "city lmp status", "city lmp models", and "city lmp use <model>" to manage local models');
  }
  if (sessionAgentType) {
    nextSteps.push(`Ensure the local ACP command for "${sessionAgentType}" is installed and runnable`);
  }

  if (selectedChannels.includes("telegram")) {
    nextSteps.push(
      "Bind services.chat.channels.telegram.channelAccountId to an existing channel account",
    );
  }
  if (selectedChannels.includes("feishu")) {
    nextSteps.push(
      "Bind services.chat.channels.feishu.channelAccountId to an existing channel account",
    );
  }
  if (selectedChannels.includes("qq")) {
    nextSteps.push(
      "Bind services.chat.channels.qq.channelAccountId to an existing channel account",
    );
  }
  nextSteps.push('Run "city agent start" to start the agent');

  emitCliList({
    tone: "accent",
    title: "Next steps",
    items: nextSteps.map((line, idx) => ({
      title: `${idx + 1}. ${line}`,
    })),
  });
  emitCliBlock({
    tone: "info",
    title: "Tip",
    note: "agent 现在可以绑定 API 模型池、切到本地 llama，或切到 ACP coding agent。",
  });
}

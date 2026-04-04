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
import prompts from "prompts";
import fs from "fs-extra";
import { getProfileMdPath, getDowncityJsonPath, getSoulMdPath } from "@/city/runtime/env/Paths.js";
import {
  initializeAgentProject,
  listConsoleModelChoices,
  normalizeDefaultAgentName,
} from "@/city/runtime/project/AgentInitializer.js";
import type { AgentProjectChannel } from "@/shared/types/AgentProject.js";
import type { ExecutionBindingConfig } from "@/shared/types/ExecutionBinding.js";
import type { SessionAgentType } from "@/shared/types/SessionAgent.js";

type InitPromptResponse = {
  name?: string;
  executionTarget?: string;
  primaryModelId?: string;
  channels?: string[];
};

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

  console.log(`🚀 Initializing Downcity project: ${projectRoot}`);

  // Check if core initialization files already exist
  const existingProfileMd = fs.existsSync(getProfileMdPath(projectRoot));
  const existingSoulMd = fs.existsSync(getSoulMdPath(projectRoot));
  const existingShipJson = fs.existsSync(getDowncityJsonPath(projectRoot));
  const consoleModelChoices = await listConsoleModelChoices();
  const consoleModelIds = consoleModelChoices.map((item) => item.value);

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
        console.log("❌ Initialization cancelled");
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
        { title: "Global Model Pool", value: "model" },
        { title: "Kimi ACP", value: "kimi" },
        { title: "Claude ACP", value: "claude" },
        { title: "Codex ACP", value: "codex" },
      ],
      initial: consoleModelIds.length > 0 ? 0 : 1,
    },
    {
      type: (prev: string) => prev === "model" ? "select" : null,
      name: "primaryModelId",
      message: "Select primary model (from console model pool)",
      choices: consoleModelChoices,
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
  if (executionTarget === "model" && consoleModelIds.length === 0) {
    console.error("❌ Console model pool is empty.");
    console.error("   Please configure at least one model before using model mode:");
    console.error("   1) city console model create");
    console.error("   2) or choose an ACP session agent during init");
    process.exit(1);
  }
  const primaryModelId =
    executionTarget === "model"
      ? String(response.primaryModelId || "").trim() || "default"
      : "";
  const sessionAgentType =
    executionTarget && executionTarget !== "model"
      ? executionTarget as SessionAgentType
      : undefined;
  const execution: ExecutionBindingConfig =
    primaryModelId
      ? {
          type: "model",
          modelId: primaryModelId,
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
    channels: selectedChannels,
    forceOverwriteShipJson: allowOverwrite,
  });

  if (!existingProfileMd && initResult.createdFiles.includes("PROFILE.md")) {
    console.log("✅ Created PROFILE.md");
  } else if (existingProfileMd) {
    console.log("⏭️  Skipped existing PROFILE.md");
  }
  if (!existingSoulMd && initResult.createdFiles.includes("SOUL.md")) {
    console.log("✅ Created SOUL.md");
  } else if (existingSoulMd) {
    console.log("⏭️  Skipped existing SOUL.md");
  }

  console.log("✅ Created downcity.json");
  console.log("⏭️  Skipped .env (no new entries)");
  console.log("⏭️  Skipped .env.example (no new entries)");
  console.log("✅ Created .downcity/ directory structure");
  console.log("✅ Created downcity.schema.json");

  console.log("\n🎉 Initialization complete!\n");
  if (primaryModelId) {
    console.log(`📦 Agent execution.modelId: ${primaryModelId}`);
    console.log("🌐 Model pool source: ~/.downcity/downcity.db (console global)\n");
  }
  if (sessionAgentType) {
    console.log(`🤖 ACP agent: ${sessionAgentType}`);
    console.log("🔌 Runtime path: ACP coding agent session\n");
  }

  if (selectedChannels.includes("feishu")) {
    console.log("📱 Feishu chat channel enabled");
    console.log(
      "   Please bind services.chat.channels.feishu.channelAccountId to a channel account in Console UI",
    );
    console.log("   Manage credentials in Global / Channel Accounts\n");
  }
  if (selectedChannels.includes("telegram")) {
    console.log("📱 Telegram chat channel enabled");
    console.log(
      "   Please bind services.chat.channels.telegram.channelAccountId to a channel account in Console UI",
    );
    console.log("   Manage credentials in Global / Channel Accounts\n");
  }
  if (selectedChannels.includes("qq")) {
    console.log("📱 QQ chat channel enabled");
    console.log(
      "   Please bind services.chat.channels.qq.channelAccountId to a channel account in Console UI",
    );
    console.log("   Manage credentials in Global / Channel Accounts\n");
  }

  const nextSteps: string[] = [
    "Edit PROFILE.md to customize agent behavior",
    "Edit SOUL.md to customize your core operating principles",
    "Edit downcity.json.execution to adjust execution target",
  ];
  if (primaryModelId) {
    nextSteps.push("Edit downcity.json.execution.modelId (bind to console model id)");
    nextSteps.push('Use "city console model ..." to manage global model pool');
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

  console.log("Next steps:");
  for (const [idx, line] of nextSteps.entries()) {
    console.log(`  ${idx + 1}. ${line}`);
  }
  console.log("");
  console.log(
    "💡 Tip: agent 现在可以绑定 console 模型池，也可以把 session 切到 ACP coding agent。\n",
  );
}

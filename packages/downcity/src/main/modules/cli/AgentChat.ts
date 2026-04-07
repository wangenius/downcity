/**
 * `city agent chat` 命令实现。
 *
 * 关键点（中文）
 * - 通过终端持续循环向指定 agent 的 Console 主会话发送消息。
 * - 省略 `--to` 时，可在交互式终端里从运行中的 agent 中选择。
 * - 该命令只做最小 REPL：输入一行，发送一轮，打印一轮回复。
 */

import { createInterface } from "node:readline/promises";
import prompts from "prompts";
import { emitCliBlock } from "./CliReporter.js";
import { executeAgentQuest } from "./AgentQuest.js";
import { listRegisteredAgentsForCli } from "./AgentSelection.js";
import type { AgentChatCliOptions } from "@/types/cli/AgentChat.js";

async function resolveChatTargetAgentName(inputName?: string): Promise<string | null> {
  const explicit = String(inputName || "").trim();
  if (explicit) return explicit;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    emitCliBlock({
      tone: "error",
      title: "Agent name is required",
      note: "Use `city agent chat --to <agentName>` or run this command in an interactive terminal.",
    });
    return null;
  }

  const runningAgents = (await listRegisteredAgentsForCli()).filter(
    (item) => item.status === "running",
  );
  if (runningAgents.length === 0) {
    emitCliBlock({
      tone: "error",
      title: "No running agents",
      note: "Run `city agent start` first.",
    });
    return null;
  }

  const response = (await prompts({
    type: "select",
    name: "agentName",
    message: "选择要聊天的 Agent",
    choices: runningAgents.map((agent) => ({
      title: agent.name,
      description: agent.projectRoot,
      value: agent.name,
    })),
    initial: 0,
  })) as { agentName?: string };
  const agentName = String(response.agentName || "").trim();
  if (!agentName) {
    emitCliBlock({
      tone: "info",
      title: "Agent chat cancelled",
    });
    return null;
  }
  return agentName;
}

function printAssistantReply(replyText: string): void {
  const text = String(replyText || "").trim();
  if (!text) {
    emitCliBlock({
      tone: "info",
      title: "No visible reply",
      note: "The turn completed, but no user-visible text was returned.",
    });
    return;
  }
  console.log(`\n${text}\n`);
}

/**
 * 启动终端持续对话。
 */
export async function chatCommand(options: AgentChatCliOptions): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    emitCliBlock({
      tone: "error",
      title: "Interactive terminal required",
      note: "Use this command in a local terminal with TTY support.",
    });
    return;
  }

  const agentName = await resolveChatTargetAgentName(options.to);
  if (!agentName) return;

  emitCliBlock({
    tone: "info",
    title: `Agent chat · ${agentName}`,
    note: "Shared session: consoleui-chat-main · Type /exit to quit.",
  });

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  try {
    while (true) {
      const line = await rl.question(`${agentName}> `);
      const text = String(line || "").trim();
      if (!text) {
        continue;
      }
      if (text === "/exit" || text === "/quit") {
        break;
      }

      const outcome = await executeAgentQuest({
        agentName,
        instructions: text,
        transport: {
          host: options.host,
          port: options.port,
          token: options.token,
        },
      });

      if (!outcome.success || !outcome.payload) {
        emitCliBlock({
          tone: "error",
          title: "Agent chat failed",
          facts: [
            {
              label: "agent",
              value: agentName,
            },
            {
              label: "error",
              value: outcome.error || "Unknown error",
            },
          ],
        });
        continue;
      }

      if (outcome.payload.result?.queued === true) {
        emitCliBlock({
          tone: "info",
          title: "Turn queued",
          facts: [
            {
              label: "agent",
              value: agentName,
            },
            ...(outcome.payload.result.queueItemId
              ? [
                  {
                    label: "queue item",
                    value: outcome.payload.result.queueItemId,
                  },
                ]
              : []),
          ],
        });
        continue;
      }

      printAssistantReply(String(outcome.payload.result?.userVisible || ""));
    }
  } finally {
    rl.close();
  }
}

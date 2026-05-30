/**
 * User Chat 命令 — Agent 连续对话。
 *
 * 使用 pi-agent 进行多轮对话（流式输出 + tools）。
 * pi-agent 通过 server 的 /chat/completions 端点调用 AI，
 * client 不做任何 provider 或 model 硬编码。
 * 空输入或 Esc 返回上级菜单。
 */

import type { UserClient } from "@downcity/gate";
import { type UserContext } from "../auth/user.js";
import { askText, show, showError } from "../core/ui.js";
import { createPiAgentSession, type PiAgentSession } from "../agent/pi-agent.js";

let activeAgentSession: PiAgentSession | undefined;

export async function doAgentChat(c: UserClient, ctx: UserContext): Promise<void> {
  // 从 server 获取模型目录，构建 ModelHandle
  let modelName: string;

  try {
    const catalog = await c.ai.listModels();
    const all = catalog.all();
    if (all.length === 0) {
      showError("No ready models available on server. Please configure provider env first.");
      return;
    }

    const selected = ctx.config.model
      ? (catalog.get(ctx.config.model) ?? catalog.default())
      : catalog.default();

    if (!selected) {
      showError("No ready default model found on server.");
      return;
    }

    modelName = selected.name;

    const handle = c.ai.model(selected);

    show(`Starting agent chat (model: ${modelName})`);
    show("Type your message (empty or Esc to exit chat)");

    activeAgentSession = await createPiAgentSession({
      model: handle,
      tools: "agent",
      onText: (text) => process.stdout.write(text),
      onToolStart: (toolName) => process.stdout.write(`\n[tool:${toolName}] `),
      onToolEnd: (toolName, isError) => {
        if (isError) process.stdout.write(`[tool:${toolName} failed]\n`);
      },
    });
  } catch (e) {
    showError(`Failed to start agent: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  while (true) {
    process.stdout.write("\n");
    const prompt = await askText("You");
    if (!prompt || prompt.trim() === "") {
      show("Exited chat");
      break;
    }

    process.stdout.write("assistant: ");
    try {
      const response = await activeAgentSession.ask(prompt);
      if (response) process.stdout.write("\n");
    } catch (e) {
      process.stdout.write("\n");
      showError(`Agent error: ${e instanceof Error ? e.message : String(e)}`);
      show("Agent session ended. Please re-enter chat to start a new conversation.");
      break;
    }
  }

  activeAgentSession = undefined;
}

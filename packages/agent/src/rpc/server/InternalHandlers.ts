/**
 * RPC internal handlers。
 *
 * 关键点（中文）
 * - 只处理 `internal.*` 方法。
 * - 这些方法服务 Town 本机管理通道，不属于 RemoteAgent 的用户 SDK 面。
 */

import fs from "fs-extra";
import { dirname } from "node:path";
import type { SystemModelMessage } from "ai";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { RpcRequest } from "@/types/rpc/RpcProtocol.js";
import type {
  RpcRequestHandlerOptions,
  RpcWriteSuccess,
} from "@/rpc/server/ServerTypes.js";
import {
  getDowncityChatHistoryPath,
  getDowncitySessionMessagesPath,
} from "@/config/Paths.js";
import { resolveSessionSystemMessages } from "@/executor/composer/system/default/SystemDomain.js";
import {
  controlPluginState,
  listPluginStates,
} from "@/plugin/core/PluginStateController.js";
import { parsePluginCommandRequestBody } from "@/plugin/core/PluginCommandRequest.js";
import { runPluginCommand } from "@/plugin/core/PluginActionRunner.js";

/**
 * 处理 internal RPC 请求。
 */
export async function handleInternalRpcRequest(params: {
  /** 当前 RPC 请求。 */
  request: RpcRequest;
  /** handler 依赖。 */
  options: RpcRequestHandlerOptions;
  /** 成功帧写入函数。 */
  write_success: RpcWriteSuccess;
}): Promise<boolean> {
  const { request, options, write_success } = params;

  switch (request.method) {
    case "internal.status.get": {
      write_success(request.id, { status: "ok" });
      return true;
    }
    case "internal.sessions.clear_messages": {
      const runtime = requireAgentRuntime(options);
      const session_id = String(request.params.sessionId || "").trim();
      if (!session_id) throw new Error("Missing sessionId");
      const messages_path = getDowncitySessionMessagesPath(
        runtime.rootPath,
        runtime.paths.agentId,
        session_id,
      );
      await fs.remove(dirname(messages_path));
      runtime.getSession(session_id).clearExecutor();
      write_success(request.id, {
        sessionId: session_id,
        cleared: true,
      });
      return true;
    }
    case "internal.sessions.clear_chat_history": {
      const runtime = requireAgentRuntime(options);
      const session_id = String(request.params.sessionId || "").trim();
      if (!session_id) throw new Error("Missing sessionId");
      await fs.remove(getDowncityChatHistoryPath(runtime.rootPath, session_id));
      write_success(request.id, {
        sessionId: session_id,
        cleared: true,
      });
      return true;
    }
    case "internal.sessions.resolve_system_prompt": {
      const runtime = requireAgentRuntime(options);
      const context = requireAgentContext(options);
      const session_id =
        String(request.params.sessionId || "").trim() || "consoleui-chat-main";
      const system_messages = await resolveSessionSystemMessages({
        projectRoot: runtime.rootPath,
        sessionId: session_id,
        profile: "chat",
        staticSystemPrompts: runtime.systems,
        context,
      });
      write_success(request.id, {
        sessionId: session_id,
        ...toSystemPromptPayload(system_messages),
      });
      return true;
    }
    case "internal.plugins.catalog": {
      const context = requireAgentContext(options);
      write_success(request.id, {
        plugins: context.plugins.list(),
      });
      return true;
    }
    case "internal.plugins.list": {
      const context = requireAgentContext(options);
      write_success(request.id, {
        plugins: listPluginStates({ context }),
      });
      return true;
    }
    case "internal.plugins.control": {
      const context = requireAgentContext(options);
      const result = await controlPluginState({
        pluginName: request.params.pluginName,
        action: request.params.action,
        context,
      });
      write_success(request.id, result);
      return true;
    }
    case "internal.plugins.command": {
      const context = requireAgentContext(options);
      const body = parsePluginCommandRequestBody(request.params);
      const result = await runPluginCommand({
        pluginName: body.pluginName,
        command: body.command,
        payload: body.payload,
        schedule: body.schedule,
        context,
      });
      write_success(request.id, result);
      return true;
    }
    case "internal.plugins.availability": {
      const context = requireAgentContext(options);
      const availability = await context.plugins.availability(
        request.params.pluginName,
      );
      write_success(request.id, {
        pluginName: request.params.pluginName,
        availability,
      });
      return true;
    }
    case "internal.plugins.action": {
      const context = requireAgentContext(options);
      const result = await context.plugins.runAction({
        plugin: request.params.pluginName,
        action: request.params.actionName,
        payload: request.params.payload,
      });
      write_success(request.id, {
        ...result,
        pluginName: request.params.pluginName,
        actionName: request.params.actionName,
      });
      return true;
    }
    case "internal.shell.approvals": {
      const shell = requireShell(options);
      write_success(request.id, {
        approvals: shell.approvals(),
      });
      return true;
    }
    case "internal.shell.approvalModes": {
      const shell = requireShell(options);
      write_success(request.id, {
        modes: shell.approval_modes(),
      });
      return true;
    }
    case "internal.shell.approvalMode": {
      const shell = requireShell(options);
      const result = shell.approval_mode({
        session_id: String(request.params.sessionId || "").trim(),
      });
      write_success(request.id, result);
      return true;
    }
    case "internal.shell.setApprovalMode": {
      const shell = requireShell(options);
      const result = shell.set_approval_mode({
        session_id: String(request.params.sessionId || "").trim(),
        mode: request.params.mode,
      });
      write_success(request.id, result);
      return true;
    }
    case "internal.shell.approve": {
      const shell = requireShell(options);
      const result = await shell.approve({
        approval_id: String(request.params.approvalId || "").trim(),
      });
      write_success(request.id, result);
      return true;
    }
    case "internal.shell.deny": {
      const shell = requireShell(options);
      const result = await shell.deny({
        approval_id: String(request.params.approvalId || "").trim(),
      });
      write_success(request.id, result);
      return true;
    }
    default:
      return false;
  }
}

function requireShell(options: RpcRequestHandlerOptions) {
  const shell = options.getShell?.();
  if (!shell) {
    throw new Error("Agent RPC server was started without Shell");
  }
  return shell;
}

function requireAgentContext(options: RpcRequestHandlerOptions): AgentContext {
  const context = options.getAgentContext?.();
  if (!context) {
    throw new Error("Agent RPC server was started without AgentContext");
  }
  return context;
}

function requireAgentRuntime(options: RpcRequestHandlerOptions): AgentRuntime {
  const runtime = options.getAgentRuntime?.();
  if (!runtime) {
    throw new Error("Agent RPC server was started without AgentRuntime");
  }
  return runtime;
}

function normalizeSystemText(input: string | null | undefined): string {
  return String(input || "").trim();
}

function toSystemMessageText(message: SystemModelMessage): string {
  const content = message.content as unknown;
  if (typeof content === "string") return normalizeSystemText(content);
  if (!Array.isArray(content)) return "";
  const parts = content as Array<{ text?: unknown }>;
  const texts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const text = normalizeSystemText(String(part.text || ""));
    if (!text) continue;
    texts.push(text);
  }
  return texts.join("\n").trim();
}

/**
 * 把 system messages 转成 Console/Town 可直接渲染的结构。
 */
function toSystemPromptPayload(messages: SystemModelMessage[]): {
  sections: Array<{
    key: string;
    title: string;
    items: Array<{ index: number; content: string }>;
  }>;
  totalMessages: number;
  totalChars: number;
} {
  const items = messages
    .map((message, index) => ({
      index: index + 1,
      content: toSystemMessageText(message),
    }))
    .filter((item) => item.content);
  const totalChars = items.reduce(
    (acc, item) => acc + String(item.content || "").length,
    0,
  );
  return {
    sections: [
      {
        key: "resolved",
        title: "Resolved System Messages",
        items,
      },
    ],
    totalMessages: items.length,
    totalChars,
  };
}

/**
 * PluginDispatch：chat 领域的 plugin 调用辅助。
 *
 * 关键点（中文）
 * - chat service 只依赖这里，不直接依赖某个具体 plugin 模块路径。
 * - 这里封装 chat 领域的 plugin 点调用语义，保持 service 边界稳定。
 */

import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { JsonObject } from "@/types/Json.js";
import type {
  AuthObservePrincipalPayload,
  ChatAuthorizationEvaluateInput,
  ChatAuthorizationRole,
} from "@/types/AuthPlugin.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";
import { CHAT_PLUGIN_POINTS } from "@services/chat/runtime/PluginPoints.js";

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/**
 * 观测入站主体。
 */
export async function observeIncomingChatPrincipal(params: {
  context: ExecutionContext;
  channel: ChatDispatchChannel;
  chatId: string;
  chatType?: string;
  chatTitle?: string;
  userId?: string;
  username?: string;
}): Promise<void> {
  await params.context.plugins.effect(CHAT_PLUGIN_POINTS.observePrincipal, {
    channel: params.channel,
    chatId: params.chatId,
    ...(params.chatType ? { chatType: params.chatType } : {}),
    ...(params.chatTitle ? { chatTitle: params.chatTitle } : {}),
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.username ? { username: params.username } : {}),
  } as AuthObservePrincipalPayload as unknown as JsonObject);
}

/**
 * 校验入站消息是否允许执行。
 *
 * 关键点（中文）
 * - 这是 guard 语义：允许则静默返回，拒绝则直接抛错。
 * - 这样 chat service 可以像处理中间件一样串联 guard 点。
 */
export async function guardIncomingChat(params: {
  context: ExecutionContext;
  channel: ChatDispatchChannel;
  input: ChatAuthorizationEvaluateInput;
}): Promise<void> {
  await params.context.plugins.guard(
    CHAT_PLUGIN_POINTS.authorizeIncoming,
    {
      channel: params.channel,
      chatId: params.input.chatId,
      ...(params.input.chatType ? { chatType: params.input.chatType } : {}),
      ...(params.input.userId ? { userId: params.input.userId } : {}),
      ...(params.input.username ? { username: params.input.username } : {}),
      ...(params.input.chatTitle ? { chatTitle: params.input.chatTitle } : {}),
    } as JsonObject,
  );
}

/**
 * 解析用户角色。
 */
export async function resolveIncomingChatUserRole(params: {
  context: ExecutionContext;
  channel: ChatDispatchChannel;
  userId?: string;
}): Promise<ChatAuthorizationRole | undefined> {
  const result = await params.context.plugins.resolve<JsonObject, unknown>(
    CHAT_PLUGIN_POINTS.resolveUserRole,
    {
      channel: params.channel,
      ...(params.userId ? { userId: params.userId } : {}),
    },
  );
  const role = toRecord(result);
  if (!role.roleId) return undefined;
  return role as unknown as ChatAuthorizationRole;
}

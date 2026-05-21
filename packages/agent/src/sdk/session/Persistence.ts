/**
 * SDK Session 持久化辅助。
 *
 * 关键点（中文）
 * - 集中处理 session meta 更新时间、模型展示标签与 assistant 消息落盘。
 * - `Session` 只负责调用这些能力，不直接拼装 meta 结构。
 */

import { resolveAssistantMessageForPersistence } from "@/service/builtins/chat/runtime/UserVisibleText.js";
import { extractTextFromUiMessage } from "@/service/builtins/chat/runtime/UIMessageTransformer.js";
import type { SessionHistoryMetaV1 } from "@/session/types/SessionHistoryMeta.js";
import type { SessionMessageV1 } from "@/session/types/SessionMessages.js";
import type { AgentSessionConfigSnapshot } from "@/sdk/AgentSdkTypes.js";
import {
  readSessionMetadata,
  writeSessionMetadata,
} from "@/sdk/session/Metadata.js";

/**
 * SDK Session 元数据写入参数。
 */
export interface TouchSessionMetadataParams {
  /**
   * 当前项目根目录。
   */
  projectRoot: string;
  /**
   * 当前 agent 稳定标识。
   */
  agentId: string;
  /**
   * 当前 sessionId。
   */
  sessionId: string;
  /**
   * 当前 session 内存配置快照。
   */
  sessionConfig: AgentSessionConfigSnapshot;
}

/**
 * Assistant 结果落盘参数。
 */
export interface PersistSdkAssistantResultParams
  extends TouchSessionMetadataParams {
  /**
   * 追加 assistant 消息的底层执行编排器。
   */
  executor: {
    appendAssistantMessage(params: {
      /**
       * 已构造好的完整消息。
       */
      message?: SessionMessageV1 | null;
      /**
       * 兜底文本内容。
       */
      fallbackText?: string;
    }): Promise<void>;
  };
  /**
   * 本轮执行得到的 assistant 消息。
   */
  assistantMessage: SessionMessageV1;
}

/**
 * 刷新 SDK session 元数据。
 */
export async function touchSessionMetadata(
  params: TouchSessionMetadataParams,
): Promise<void> {
  const current = await readSessionMetadata({
    projectRoot: params.projectRoot,
    agentId: params.agentId,
    sessionId: params.sessionId,
  });
  const next: SessionHistoryMetaV1 = {
    ...current,
    agentId: params.agentId,
    createdAt:
      typeof current.createdAt === "number" ? current.createdAt : Date.now(),
    updatedAt: Date.now(),
    ...(params.sessionConfig.modelLabel
      ? {
          sdkConfig: {
            ...(current.sdkConfig || {}),
            modelLabel: params.sessionConfig.modelLabel,
          },
        }
      : {}),
  };
  await writeSessionMetadata({
    projectRoot: params.projectRoot,
    agentId: params.agentId,
    sessionId: params.sessionId,
    meta: next,
  });
}

/**
 * 持久化 assistant 结果并同步刷新 session meta。
 */
export async function persistSdkAssistantResult(
  params: PersistSdkAssistantResultParams,
): Promise<void> {
  const persisted = resolveAssistantMessageForPersistence(params.assistantMessage);
  await params.executor.appendAssistantMessage({
    ...(persisted ? { message: persisted } : {}),
    fallbackText: extractTextFromUiMessage(params.assistantMessage),
  });
  await touchSessionMetadata(params);
}

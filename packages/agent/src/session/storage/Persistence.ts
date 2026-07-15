/**
 * SDK Session 持久化辅助。
 *
 * 关键点（中文）
 * - 集中处理 session meta 更新时间、模型展示标签与 assistant 消息落盘。
 * - `Session` 只负责调用这些能力，不直接拼装 meta 结构。
 */

import { extractTextFromUiMessage } from "@/executor/messages/UIMessageTransformer.js";
import type { SessionHistoryMetaV1 } from "@/executor/types/SessionHistoryMeta.js";
import type {
  SessionRecordV1,
  SessionMessageRecordV1,
} from "@/executor/types/SessionRecords.js";
import { persistAssistantResult } from "@/executor/messages/AssistantResultPersistence.js";
import type { AgentSessionConfigSnapshot } from "@/types/agent/SessionTypes.js";
import {
  readSessionMetadata,
  writeSessionMetadata,
} from "@/session/storage/Metadata.js";

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
  /** 当前 canonical Message 总数。 */
  message_count?: number;
  /** 当前 Message 日志文件字节数。 */
  history_bytes?: number;
  /** 最近一条用户可见 Message 的文本摘要。 */
  preview_text?: string;
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
    append_assistant_message(params: {
      /**
       * 已构造好的完整消息。
       */
      message?: SessionRecordV1 | null;
      /**
       * 兜底文本内容。
       */
      fallbackText?: string;
    }): Promise<void>;
  };
  /**
   * 本轮执行得到的 assistant 消息。
   *
   * 关键点（中文）
   * - stop/abort 且没有 assistant 内容时允许为空。
   * - 为空时仅刷新 metadata，不写入伪造 assistant 正文。
   */
  assistantMessage?: SessionMessageRecordV1 | null;
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
          modelLabel: params.sessionConfig.modelLabel,
        }
      : {}),
    ...(typeof params.message_count === "number"
      ? { messageCount: params.message_count }
      : {}),
    ...(typeof params.history_bytes === "number"
      ? { historyBytes: params.history_bytes }
      : {}),
    ...(params.preview_text ? { previewText: params.preview_text } : {}),
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
  await persistAssistantResult({
    writer: params.executor,
    assistantMessage: params.assistantMessage,
    fallbackText: params.assistantMessage
      ? extractTextFromUiMessage(params.assistantMessage)
      : undefined,
  });
  await touchSessionMetadata(params);
}

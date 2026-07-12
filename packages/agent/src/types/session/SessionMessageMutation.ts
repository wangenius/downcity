/**
 * Session Message Mutation 与增量读取类型。
 *
 * Mutation 同时是 messages.jsonl 的持久化单元和 subscribe 的实时事件 payload。
 */

import type { SessionAssistantMessagePart, SessionMessage } from "@/types/session/SessionMessage.js";

/** Mutation 公共字段。 */
export interface SessionMessageMutationBase {
  /** Mutation 稳定唯一标识。 */
  mutation_id: string;
  /** Mutation 在 Session 内的单调提交序号。 */
  commit_sequence: number;
  /** Mutation 目标 Message。 */
  message_id: string;
  /** 目标 Message 的逻辑位置。 */
  sequence: number;
  /** 应用 Mutation 后的 Message revision。 */
  revision: number;
  /** Mutation 所属 Session。 */
  session_id: string;
  /** Mutation 所属 turn。 */
  turn_id?: string;
  /** Mutation 创建时间戳（ms）。 */
  created_at: number;
}

/** 创建完整 Message 的 Mutation。 */
export interface SessionMessageCreatedMutation extends SessionMessageMutationBase {
  /** Mutation 类型固定为 message-created。 */
  type: "message-created";
  /** 新创建的完整 Message。 */
  message: SessionMessage;
}

/** Assistant 文本增量 Mutation。 */
export interface SessionAssistantPartDeltaMutation extends SessionMessageMutationBase {
  /** Mutation 类型固定为 assistant-part-delta。 */
  type: "assistant-part-delta";
  /** Delta 所属 part。 */
  part_id: string;
  /** Delta 对应可见文本或推理文本。 */
  part_type: "text" | "reasoning";
  /** 本次新增文本，不是累计全文。 */
  delta: string;
}

/** Assistant part 完整更新 Mutation。 */
export interface SessionAssistantPartUpdatedMutation extends SessionMessageMutationBase {
  /** Mutation 类型固定为 assistant-part-updated。 */
  type: "assistant-part-updated";
  /** 被创建或更新的完整 part。 */
  part: SessionAssistantMessagePart;
}

/** 非 delta Message 完整更新 Mutation。 */
export interface SessionMessageUpdatedMutation extends SessionMessageMutationBase {
  /** Mutation 类型固定为 message-updated。 */
  type: "message-updated";
  /** 更新后的完整 Message。 */
  message: SessionMessage;
}

/** Assistant 收口 Mutation。 */
export interface SessionMessageCompletedMutation extends SessionMessageMutationBase {
  /** Mutation 类型固定为 message-completed。 */
  type: "message-completed";
  /** Assistant 最终状态。 */
  status: "completed" | "stopped" | "failed";
}

/** 全部合法 Session Message Mutation。 */
export type SessionMessageMutation =
  | SessionMessageCreatedMutation
  | SessionAssistantPartDeltaMutation
  | SessionAssistantPartUpdatedMutation
  | SessionMessageUpdatedMutation
  | SessionMessageCompletedMutation;

/** 从 commit cursor 增量读取 Mutation 的输入。 */
export interface ListSessionMessageChangesInput {
  /** 只返回 commit_sequence 严格大于该值的 Mutation。 */
  after_commit_sequence: number;
  /** 单页数量上限。 */
  limit?: number;
}

/** Mutation 增量分页结果。 */
export interface SessionMessageMutationPage {
  /** 当前页按 commit_sequence 升序排列的 Mutation。 */
  items: SessionMessageMutation[];
  /** 当前页之后是否仍有 Mutation。 */
  has_more: boolean;
  /** 下一次增量读取应使用的 commit_sequence。 */
  next_commit_sequence: number;
  /** 当前 Session 已提交的最大 commit_sequence。 */
  latest_commit_sequence: number;
}

/** Session Mutation 订阅回调。 */
export type SessionMessageMutationSubscriber = (mutation: SessionMessageMutation) => void;

/** 取消 Session Mutation 订阅的函数。 */
export type SessionMessageMutationUnsubscribe = () => void;

/** 判断未知事件是否为 Session Message Mutation。 */
export function is_session_message_mutation(input: unknown): input is SessionMessageMutation {
  if (!input || typeof input !== "object") return false;
  const candidate = input as { type?: unknown; mutation_id?: unknown; commit_sequence?: unknown };
  return (
    typeof candidate.mutation_id === "string" &&
    typeof candidate.commit_sequence === "number" &&
    (candidate.type === "message-created" ||
      candidate.type === "assistant-part-delta" ||
      candidate.type === "assistant-part-updated" ||
      candidate.type === "message-updated" ||
      candidate.type === "message-completed")
  );
}

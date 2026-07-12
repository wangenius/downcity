/**
 * Session Message Mutation 与增量读取类型。
 *
 * Mutation 只按变化层级分成 message、part、delta 三种 variant；`type` 在各 variant
 * 内直接表达对应的 Message 或 Part 类型。
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
  /** 应用 Mutation 后的 Message revision。 */
  revision: number;
  /** Mutation 所属 Session。 */
  session_id: string;
  /** Mutation 所属 turn。 */
  turn_id?: string;
  /** Mutation 创建时间戳（ms）。 */
  created_at: number;
}

/** 顶层 Message 创建或状态更新 Mutation。 */
export type SessionMessageSnapshotMutation = {
  [TType in SessionMessage["type"]]: SessionMessageMutationBase & {
    /** Mutation 层级固定为 message。 */
    variant: "message";
    /** 当前完整 Message 类型。 */
    type: TType;
    /** Message 在线性 Session 中的固定位置。 */
    sequence: number;
    /** 创建或更新后的完整 Message 快照。 */
    message: Extract<SessionMessage, { type: TType }>;
  };
}[SessionMessage["type"]];

/** Assistant Part 创建或状态更新 Mutation。 */
export type SessionPartSnapshotMutation = {
  [TType in SessionAssistantMessagePart["type"]]: SessionMessageMutationBase & {
    /** Mutation 层级固定为 part。 */
    variant: "part";
    /** 当前完整 Part 类型。 */
    type: TType;
    /** 被创建或更新的 Part 标识。 */
    part_id: string;
    /** 创建或更新后的完整 Part 快照。 */
    part: SessionAssistantMessagePart & { type: TType };
  };
}[SessionAssistantMessagePart["type"]];

/** Assistant 文本或推理原始增量 Mutation。 */
export interface SessionDeltaMutation extends SessionMessageMutationBase {
  /** Mutation 层级固定为 delta。 */
  variant: "delta";
  /** Delta 类型只允许 text 或 reasoning。 */
  type: "text" | "reasoning";
  /** Delta 所属 Part 标识。 */
  part_id: string;
  /** 本次模型新增的原始文本，不是累计全文。 */
  delta: string;
}

/** 全部合法 Session Message Mutation。 */
export type SessionMessageMutation =
  | SessionMessageSnapshotMutation
  | SessionPartSnapshotMutation
  | SessionDeltaMutation;

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
  const candidate = input as {
    variant?: unknown;
    type?: unknown;
    mutation_id?: unknown;
    commit_sequence?: unknown;
  };
  if (
    typeof candidate.mutation_id !== "string" ||
    typeof candidate.commit_sequence !== "number" ||
    typeof candidate.type !== "string"
  ) {
    return false;
  }
  return (
    candidate.variant === "message" ||
    candidate.variant === "part" ||
    candidate.variant === "delta"
  );
}

/**
 * Session Message Mutation reducer。
 *
 * 历史重放与实时消费者共享 message、part、delta 三种归并语义。
 */

import type { SessionAssistantMessage, SessionMessage } from "@/types/session/SessionMessage.js";
import type { SessionMessageMutation } from "@/types/session/SessionMessageMutation.js";

/** 将单条 Mutation 应用到已有 Message。 */
export function reduce_session_message(
  current_message: SessionMessage | undefined,
  mutation: SessionMessageMutation,
): SessionMessage {
  if (mutation.variant === "message") {
    validate_message_snapshot(current_message, mutation);
    return structuredClone(mutation.message);
  }
  if (!current_message) {
    throw new Error(`Session Message does not exist: ${mutation.message_id}`);
  }
  validate_next_revision(current_message, mutation);
  const assistant = require_streaming_assistant(current_message);

  if (mutation.variant === "part") {
    if (mutation.part.part_id !== mutation.part_id) {
      throw new Error(`Part Mutation identity mismatch: ${mutation.part_id}`);
    }
    if (mutation.part.type !== mutation.type) {
      throw new Error(`Part Mutation type mismatch: ${mutation.part_id}`);
    }
    const exists = assistant.parts.some(
      (part) => part.part_id === mutation.part_id,
    );
    const parts = exists
      ? assistant.parts.map((part) =>
          part.part_id === mutation.part_id
            ? structuredClone(mutation.part)
            : part,
        )
      : [...assistant.parts, structuredClone(mutation.part)];
    return with_revision(assistant, mutation, { parts });
  }

  const existing_part = assistant.parts.find(
    (part) => part.part_id === mutation.part_id,
  );
  if (
    !existing_part ||
    (existing_part.type !== "text" && existing_part.type !== "reasoning")
  ) {
    throw new Error(`Delta target Part does not exist: ${mutation.part_id}`);
  }
  if (existing_part.type !== mutation.type) {
    throw new Error(`Delta type changed for Part: ${mutation.part_id}`);
  }
  const parts = assistant.parts.map((part) =>
    part.part_id === mutation.part_id &&
    (part.type === "text" || part.type === "reasoning")
      ? { ...part, text: part.text + mutation.delta }
      : part,
  );
  return with_revision(assistant, mutation, { parts });
}

/** 按 commit_sequence 重放 Mutation，恢复线性 Message snapshot。 */
export function reduce_session_messages(
  mutations: SessionMessageMutation[],
): SessionMessage[] {
  const messages = new Map<string, SessionMessage>();
  const ordered = [...mutations].sort(
    (left, right) => left.commit_sequence - right.commit_sequence,
  );
  let previous_commit_sequence = 0;
  for (const mutation of ordered) {
    if (mutation.commit_sequence <= previous_commit_sequence) {
      throw new Error(`Duplicate commit_sequence: ${String(mutation.commit_sequence)}`);
    }
    messages.set(
      mutation.message_id,
      reduce_session_message(messages.get(mutation.message_id), mutation),
    );
    previous_commit_sequence = mutation.commit_sequence;
  }
  return [...messages.values()].sort(
    (left, right) => left.sequence - right.sequence,
  );
}

function validate_message_snapshot(
  current_message: SessionMessage | undefined,
  mutation: Extract<SessionMessageMutation, { variant: "message" }>,
): void {
  if (mutation.message.message_id !== mutation.message_id) {
    throw new Error(`Message Mutation identity mismatch: ${mutation.message_id}`);
  }
  if (mutation.message.type !== mutation.type) {
    throw new Error(`Message Mutation type mismatch: ${mutation.message_id}`);
  }
  if (mutation.message.sequence !== mutation.sequence) {
    throw new Error(`Message Mutation sequence mismatch: ${mutation.message_id}`);
  }
  if (mutation.message.revision !== mutation.revision) {
    throw new Error(`Message Mutation revision mismatch: ${mutation.message_id}`);
  }
  if (!current_message) {
    if (mutation.revision !== 1) {
      throw new Error(`New Message revision must be 1: ${mutation.message_id}`);
    }
    return;
  }
  validate_next_revision(current_message, mutation);
  if (current_message.type !== mutation.type) {
    throw new Error(`Message type changed: ${mutation.message_id}`);
  }
  if (current_message.sequence !== mutation.sequence) {
    throw new Error(`Message sequence changed: ${mutation.message_id}`);
  }
}

function validate_next_revision(
  current_message: SessionMessage,
  mutation: SessionMessageMutation,
): void {
  if (mutation.revision !== current_message.revision + 1) {
    throw new Error(
      `Invalid Message revision for ${mutation.message_id}: expected ${String(current_message.revision + 1)}, received ${String(mutation.revision)}`,
    );
  }
}

function require_streaming_assistant(
  message: SessionMessage,
): SessionAssistantMessage {
  if (message.type !== "assistant") {
    throw new Error(`Session Message is not assistant: ${message.message_id}`);
  }
  if (message.status !== "streaming") {
    throw new Error(`Assistant Message is already closed: ${message.message_id}`);
  }
  return message;
}

function with_revision<TMessage extends SessionMessage>(
  message: TMessage,
  mutation: SessionMessageMutation,
  changes: object,
): TMessage {
  return {
    ...message,
    ...changes,
    revision: mutation.revision,
    updated_at: mutation.created_at,
  } as TMessage;
}

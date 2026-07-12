/**
 * Session Message Mutation reducer。
 *
 * 历史重放与实时消费者必须共享这里定义的归并语义。
 */

import type { SessionAssistantMessage, SessionMessage } from "@/types/session/SessionMessage.js";
import type { SessionMessageMutation } from "@/types/session/SessionMessageMutation.js";

/** 将单条 Mutation 应用到已有 Message。 */
export function reduce_session_message(
  current_message: SessionMessage | undefined,
  mutation: SessionMessageMutation,
): SessionMessage {
  if (mutation.type === "message-created") {
    if (current_message) {
      throw new Error(`Session Message already exists: ${mutation.message_id}`);
    }
    return structuredClone(mutation.message);
  }
  if (!current_message) {
    throw new Error(`Session Message does not exist: ${mutation.message_id}`);
  }
  if (mutation.revision !== current_message.revision + 1) {
    throw new Error(
      `Invalid Message revision for ${mutation.message_id}: expected ${String(current_message.revision + 1)}, received ${String(mutation.revision)}`,
    );
  }

  if (mutation.type === "assistant-part-delta") {
    const assistant = require_assistant(current_message);
    if (assistant.status !== "streaming") {
      throw new Error(`Cannot append delta to closed Assistant Message: ${assistant.message_id}`);
    }
    const existing_part = assistant.parts.find(
      (part) => part.part_id === mutation.part_id,
    );
    const parts = existing_part
      ? assistant.parts.map((part) => {
          if (part.part_id !== mutation.part_id) return part;
          if (part.type !== mutation.part_type) {
            throw new Error(`Assistant part type changed: ${part.part_id}`);
          }
          return { ...part, text: part.text + mutation.delta };
        })
      : [
          ...assistant.parts,
          {
            part_id: mutation.part_id,
            type: mutation.part_type,
            text: mutation.delta,
            state: "streaming" as const,
          },
        ];
    return with_revision(assistant, mutation, { parts });
  }

  if (mutation.type === "assistant-part-updated") {
    const assistant = require_assistant(current_message);
    if (assistant.status !== "streaming") {
      throw new Error(`Cannot update part on closed Assistant Message: ${assistant.message_id}`);
    }
    const exists = assistant.parts.some(
      (part) => part.part_id === mutation.part.part_id,
    );
    const parts = exists
      ? assistant.parts.map((part) =>
          part.part_id === mutation.part.part_id
            ? structuredClone(mutation.part)
            : part,
        )
      : [...assistant.parts, structuredClone(mutation.part)];
    return with_revision(assistant, mutation, { parts });
  }

  if (mutation.type === "message-updated") {
    if (mutation.message.message_id !== current_message.message_id) {
      throw new Error("Message update changed message_id");
    }
    return structuredClone(mutation.message);
  }

  const assistant = require_assistant(current_message);
  return with_revision(assistant, mutation, {
    status: mutation.status,
    parts: assistant.parts.map((part) =>
      part.type === "text" || part.type === "reasoning"
        ? { ...part, state: "done" as const }
        : part,
    ),
  });
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

function require_assistant(message: SessionMessage): SessionAssistantMessage {
  if (message.type !== "assistant") {
    throw new Error(`Session Message is not assistant: ${message.message_id}`);
  }
  return message;
}

function with_revision<TMessage extends SessionMessage>(
  message: TMessage,
  mutation: Exclude<SessionMessageMutation, { type: "message-created" }>,
  changes: object,
): TMessage {
  return {
    ...message,
    ...changes,
    revision: mutation.revision,
    updated_at: mutation.created_at,
  } as TMessage;
}

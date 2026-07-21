/**
 * 单个 Assistant Message 的流式写入器。
 *
 * Writer 把 AI SDK chunk、Executor Tool 输入屏障和最终关闭操作收口到同一条
 * 单写者队列，保证并发回调不会产生 revision 冲突。
 */

import type { UIMessageChunk } from "ai";
import type { SessionMessages } from "@/session/SessionMessages.js";
import {
  to_session_json_object,
  to_session_json_value,
  to_session_provider_metadata,
} from "@/session/messages/SessionJsonValue.js";
import type {
  SessionAssistantFilePart,
  SessionAssistantMessage,
  SessionAssistantMessagePart,
  SessionAssistantTextPart,
  SessionAssistantToolPart,
} from "@/types/session/SessionMessage.js";
import type { SessionToolInputReady } from "@/types/session/SessionTool.js";
import { generateId } from "@/utils/Id.js";

/** 单个 Assistant segment 的流式 writer。 */
export class SessionAssistantMessageWriter {
  readonly message_id: string;
  private readonly recorder: SessionMessages;
  private readonly pending_text_parts = new Map<
    string,
    Pick<SessionAssistantTextPart, "type" | "provider_metadata">
  >();
  private readonly active_text_part_ids = new Map<string, string>();
  private write_chain: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(recorder: SessionMessages, message_id: string) {
    this.recorder = recorder;
    this.message_id = message_id;
  }

  /** 应用一个原始 AI SDK UI chunk。 */
  async apply_chunk(chunk: UIMessageChunk): Promise<void> {
    await this.enqueue_write(async () => {
      await this.apply_chunk_serialized(chunk);
    });
  }

  /** 在当前 Assistant writer 的单写者队列中应用原始 chunk。 */
  private async apply_chunk_serialized(chunk: UIMessageChunk): Promise<void> {
    if (this.closed) throw new Error("Assistant Message writer is closed");
    const current = this.current_message();
    switch (chunk.type) {
      case "text-start":
      case "reasoning-start": {
        const type = chunk.type === "text-start" ? "text" : "reasoning";
        const part_id = this.resolve_text_part_id(type, chunk.id);
        if (!current.parts.some((part) => part.part_id === part_id)) {
          this.pending_text_parts.set(part_id, {
            type,
            provider_metadata: to_session_provider_metadata(chunk.providerMetadata),
          });
        }
        return;
      }
      case "text-delta":
      case "reasoning-delta": {
        const type = chunk.type === "text-delta" ? "text" : "reasoning";
        const part_id = this.resolve_text_part_id(type, chunk.id);
        await this.ensure_text_part(
          part_id,
          type,
          to_session_provider_metadata(chunk.providerMetadata),
        );
        await this.recorder.append_assistant_delta(
          this.message_id,
          part_id,
          type,
          chunk.delta,
        );
        return;
      }
      case "text-end":
      case "reasoning-end": {
        const type = chunk.type === "text-end" ? "text" : "reasoning";
        const source_part_id = this.source_text_part_id(type, chunk.id);
        const part_id = this.active_text_part_ids.get(source_part_id);
        if (!part_id) return;
        const part = current.parts.find((item) => item.part_id === part_id);
        if (part?.type === "text" || part?.type === "reasoning") {
          const provider_metadata = to_session_provider_metadata(chunk.providerMetadata);
          await this.upsert_part({
            ...part,
            state: "done",
            ...(provider_metadata !== undefined ? { provider_metadata } : {}),
          });
        } else {
          this.pending_text_parts.delete(part_id);
        }
        this.active_text_part_ids.delete(source_part_id);
        return;
      }
      case "tool-input-start": {
        const tool = this.find_tool(chunk.toolCallId);
        const call_provider_metadata = to_session_provider_metadata(
          chunk.providerMetadata,
        );
        const tool_metadata = to_session_json_object(chunk.toolMetadata);
        if (tool) {
          if (
            call_provider_metadata === undefined &&
            chunk.providerExecuted === undefined &&
            chunk.title === undefined &&
            tool_metadata === undefined &&
            chunk.dynamic === undefined
          ) return;
          await this.upsert_tool(chunk.toolCallId, {
            tool_name: tool.tool_name,
            state: tool.state,
            ...(call_provider_metadata !== undefined
              ? { call_provider_metadata }
              : {}),
            ...(chunk.providerExecuted !== undefined
              ? { provider_executed: chunk.providerExecuted }
              : {}),
            ...(chunk.title !== undefined ? { title: chunk.title } : {}),
            ...(tool_metadata !== undefined ? { tool_metadata } : {}),
            ...(chunk.dynamic !== undefined ? { dynamic: chunk.dynamic } : {}),
          });
          return;
        }
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: chunk.toolName,
          state: "input-streaming",
          input_text: "",
          ...(call_provider_metadata !== undefined
            ? { call_provider_metadata }
            : {}),
          ...(chunk.providerExecuted !== undefined
            ? { provider_executed: chunk.providerExecuted }
            : {}),
          ...(chunk.title !== undefined ? { title: chunk.title } : {}),
          ...(tool_metadata !== undefined ? { tool_metadata } : {}),
          ...(chunk.dynamic !== undefined ? { dynamic: chunk.dynamic } : {}),
        });
        return;
      }
      case "tool-input-delta": {
        const tool = this.find_tool(chunk.toolCallId);
        if (tool && tool.state !== "input-streaming") return;
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: tool?.tool_name || "unknown",
          state: "input-streaming",
          input_text: `${tool?.input_text || ""}${chunk.inputTextDelta}`,
        });
        return;
      }
      case "tool-input-available": {
        const tool = this.find_tool(chunk.toolCallId);
        const call_provider_metadata = to_session_provider_metadata(
          chunk.providerMetadata,
        );
        const tool_metadata = to_session_json_object(chunk.toolMetadata);
        if (tool && tool.state !== "input-streaming") {
          if (
            call_provider_metadata === undefined &&
            chunk.providerExecuted === undefined &&
            chunk.title === undefined &&
            tool_metadata === undefined &&
            chunk.dynamic === undefined
          ) return;
          await this.upsert_tool(chunk.toolCallId, {
            tool_name: tool.tool_name,
            state: tool.state,
            ...(call_provider_metadata !== undefined
              ? { call_provider_metadata }
              : {}),
            ...(chunk.providerExecuted !== undefined
              ? { provider_executed: chunk.providerExecuted }
              : {}),
            ...(chunk.title !== undefined ? { title: chunk.title } : {}),
            ...(tool_metadata !== undefined ? { tool_metadata } : {}),
            ...(chunk.dynamic !== undefined ? { dynamic: chunk.dynamic } : {}),
          });
          return;
        }
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: chunk.toolName,
          state: "ready",
          input: to_session_json_value(chunk.input),
          ...(call_provider_metadata !== undefined
            ? { call_provider_metadata }
            : {}),
          ...(chunk.providerExecuted !== undefined
            ? { provider_executed: chunk.providerExecuted }
            : {}),
          ...(chunk.title !== undefined ? { title: chunk.title } : {}),
          ...(tool_metadata !== undefined ? { tool_metadata } : {}),
          ...(chunk.dynamic !== undefined ? { dynamic: chunk.dynamic } : {}),
        });
        return;
      }
      case "tool-input-error": {
        const call_provider_metadata = to_session_provider_metadata(
          chunk.providerMetadata,
        );
        const tool_metadata = to_session_json_object(chunk.toolMetadata);
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: chunk.toolName,
          state: "failed",
          input: to_session_json_value(chunk.input),
          error: chunk.errorText,
          ...(chunk.input === undefined && "rawInput" in chunk && chunk.rawInput !== undefined
            ? { raw_input: to_session_json_value(chunk.rawInput) }
            : {}),
          ...(call_provider_metadata !== undefined
            ? { call_provider_metadata }
            : {}),
          ...(chunk.providerExecuted !== undefined
            ? { provider_executed: chunk.providerExecuted }
            : {}),
          ...(chunk.title !== undefined ? { title: chunk.title } : {}),
          ...(tool_metadata !== undefined ? { tool_metadata } : {}),
          ...(chunk.dynamic !== undefined ? { dynamic: chunk.dynamic } : {}),
        });
        return;
      }
      case "tool-approval-request": {
        const tool = this.find_tool(chunk.toolCallId);
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: tool?.tool_name || "unknown",
          state: "approval-required",
          approval: { approval_id: chunk.approvalId },
        });
        return;
      }
      case "tool-output-available": {
        const tool = this.find_tool(chunk.toolCallId);
        if (
          tool?.state === "failed" &&
          (tool.error === "Approval denied" || tool.error === "Approval expired")
        ) return;
        const result_provider_metadata = to_session_provider_metadata(
          chunk.providerMetadata,
        );
        const tool_metadata = to_session_json_object(chunk.toolMetadata);
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: tool?.tool_name || "unknown",
          state: "completed",
          output: to_session_json_value(chunk.output),
          ...(result_provider_metadata !== undefined
            ? { result_provider_metadata }
            : {}),
          ...(chunk.providerExecuted !== undefined
            ? { provider_executed: chunk.providerExecuted }
            : {}),
          ...(tool_metadata !== undefined ? { tool_metadata } : {}),
          ...(chunk.dynamic !== undefined ? { dynamic: chunk.dynamic } : {}),
          ...(chunk.preliminary !== undefined
            ? { preliminary: chunk.preliminary }
            : {}),
        });
        return;
      }
      case "tool-output-error": {
        const tool = this.find_tool(chunk.toolCallId);
        const result_provider_metadata = to_session_provider_metadata(
          chunk.providerMetadata,
        );
        const tool_metadata = to_session_json_object(chunk.toolMetadata);
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: tool?.tool_name || "unknown",
          state: "failed",
          error: chunk.errorText,
          ...(result_provider_metadata !== undefined
            ? { result_provider_metadata }
            : {}),
          ...(chunk.providerExecuted !== undefined
            ? { provider_executed: chunk.providerExecuted }
            : {}),
          ...(tool_metadata !== undefined ? { tool_metadata } : {}),
          ...(chunk.dynamic !== undefined ? { dynamic: chunk.dynamic } : {}),
        });
        return;
      }
      case "tool-output-denied": {
        const tool = this.find_tool(chunk.toolCallId);
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: tool?.tool_name || "unknown",
          state: "failed",
          error: "Tool output denied",
          approval: {
            ...(tool?.approval || {}),
            approval_id:
              tool?.approval?.approval_id || `approval:${chunk.toolCallId}`,
            approved: false,
          },
        });
        return;
      }
      case "file":
        await this.append_file_part({
          media_type: chunk.mediaType,
          url: chunk.url,
          provider_metadata: to_session_provider_metadata(chunk.providerMetadata),
        });
        return;
      case "source-url": {
        const part_id = `source:${chunk.sourceId}`;
        const current_part = current.parts.find((part) => part.part_id === part_id);
        const provider_metadata = to_session_provider_metadata(chunk.providerMetadata);
        await this.upsert_part({
          part_id,
          sequence: current_part?.sequence || this.next_part_sequence(),
          type: "source",
          source_type: "url",
          source_id: chunk.sourceId,
          url: chunk.url,
          ...(chunk.title !== undefined ? { title: chunk.title } : {}),
          ...(provider_metadata !== undefined
            ? { provider_metadata }
            : {}),
        });
        return;
      }
      case "source-document": {
        const part_id = `source:${chunk.sourceId}`;
        const current_part = current.parts.find((part) => part.part_id === part_id);
        const provider_metadata = to_session_provider_metadata(chunk.providerMetadata);
        await this.upsert_part({
          part_id,
          sequence: current_part?.sequence || this.next_part_sequence(),
          type: "source",
          source_type: "document",
          source_id: chunk.sourceId,
          media_type: chunk.mediaType,
          title: chunk.title,
          ...(chunk.filename !== undefined ? { filename: chunk.filename } : {}),
          ...(provider_metadata !== undefined
            ? { provider_metadata }
            : {}),
        });
        return;
      }
      case "start-step":
        await this.upsert_part({
          part_id: `step:${generateId()}`,
          sequence: this.next_part_sequence(),
          type: "step-start",
        });
        return;
      default: {
        if (chunk.type.startsWith("data-")) {
          const data_chunk = chunk as unknown as Record<string, unknown>;
          if (data_chunk.transient === true) return;
          const data_id = typeof data_chunk.id === "string"
            ? data_chunk.id
            : undefined;
          const part_id = `data:${data_id ?? generateId()}`;
          const current_part = current.parts.find((part) => part.part_id === part_id);
          await this.upsert_part({
            part_id,
            sequence: current_part?.sequence || this.next_part_sequence(),
            type: "data",
            data_type: chunk.type,
            data: to_session_json_value(data_chunk.data),
            ...(data_id !== undefined ? { data_id } : {}),
          });
        }
        return;
      }
    }
  }

  /** 写入一个完整 Assistant part。 */
  async upsert_part(part: SessionAssistantMessagePart): Promise<void> {
    await this.recorder.update_assistant_part(this.message_id, part);
  }

  /**
   * 用 AI SDK 最终 UIMessage 原子校准流式写入结果。
   *
   * 关键点（中文）
   * - 最终快照决定完整 part 的相对顺序，避免漏写 Tool 在末尾补齐时落到正文之后。
   * - 已有流式 part 保留 part_id，最终快照只补齐内容与 metadata。
   * - 最终快照没有携带的流式 part 按原始相对位置锚定到最近的后继 part。
   */
  async reconcile_final_parts(
    parts: SessionAssistantMessagePart[],
  ): Promise<void> {
    await this.enqueue_write(async () => {
      if (parts.length === 0) return;
      const current_parts = this.current_message().parts;
      const matched_part_ids = new Set<string>();
      const reconciled_parts = parts.map((part) => {
        const current_part = this.find_matching_final_part(
          part,
          current_parts,
          matched_part_ids,
        );
        if (current_part) matched_part_ids.add(current_part.part_id);
        return {
          ...(current_part || {}),
          ...part,
          part_id: current_part?.part_id || this.final_part_id(part),
          sequence: 0,
        } as SessionAssistantMessagePart;
      });

      // 最终快照可能不包含流式阶段的临时可见 part，按原顺序锚定到最近后继。
      for (const [current_index, current_part] of current_parts.entries()) {
        if (matched_part_ids.has(current_part.part_id)) continue;
        const next_matched_part = current_parts
          .slice(current_index + 1)
          .find((part) => matched_part_ids.has(part.part_id));
        const next_index = next_matched_part
          ? reconciled_parts.findIndex(
            (part) => part.part_id === next_matched_part.part_id,
          )
          : -1;
        if (next_index >= 0) reconciled_parts.splice(next_index, 0, current_part);
        else reconciled_parts.push(current_part);
      }

      await this.recorder.reconcile_assistant_parts(
        this.message_id,
        reconciled_parts.map((part, index) => ({ ...part, sequence: index + 1 })),
      );
    });
  }

  /** Executor 在调用 Tool 实现前写入完整输入。 */
  async prepare_tool_input(input: SessionToolInputReady): Promise<void> {
    await this.enqueue_write(async () => {
      const current = this.find_tool(input.tool_call_id);
      if (current && current.state !== "input-streaming" && current.state !== "ready") {
        throw new Error(
          `Tool input cannot be prepared from ${current.state}: ${input.tool_call_id}`,
        );
      }
      await this.upsert_tool(input.tool_call_id, {
        tool_name: input.tool_name,
        state: "ready",
        input: to_session_json_value(input.input),
      });
    });
  }

  /** 把最终结果中的文件补入当前 Assistant，并对流式已写入文件去重。 */
  async append_file_part(
    input: Pick<
      SessionAssistantFilePart,
      "filename" | "media_type" | "provider_metadata" | "url"
    >,
  ): Promise<void> {
    const filename = String(input.filename || "").trim();
    const current = this.current_message();
    const existing = current.parts.find(
      (part) =>
        part.type === "file" &&
        part.url === input.url &&
        part.media_type === input.media_type,
    );
    if (existing?.type === "file") {
      if (
        (filename && String(existing.filename || "").trim() !== filename) ||
        input.provider_metadata !== undefined
      ) {
        await this.upsert_part({
          ...existing,
          ...(filename ? { filename } : {}),
          ...(input.provider_metadata !== undefined
            ? { provider_metadata: input.provider_metadata }
            : {}),
        });
      }
      return;
    }
    await this.upsert_part({
      part_id: `file:${generateId()}`,
      sequence: this.next_part_sequence(),
      type: "file",
      media_type: input.media_type,
      url: input.url,
      ...(filename ? { filename } : {}),
      ...(input.provider_metadata !== undefined
        ? { provider_metadata: input.provider_metadata }
        : {}),
    });
  }

  /** 等待当前 Assistant writer 已入队的全部写操作完成。 */
  async flush(): Promise<void> {
    await this.write_chain;
  }

  /** 正常完成当前 assistant segment。 */
  async complete(): Promise<void> {
    await this.enqueue_write(async () => {
      await this.close_serialized("completed");
    });
  }

  /** 停止当前 assistant segment，并保留已有 parts。 */
  async stop(): Promise<void> {
    await this.enqueue_write(async () => {
      await this.close_serialized("stopped");
    });
  }

  /** 以失败状态关闭当前 assistant segment。 */
  async fail(_error: unknown): Promise<void> {
    await this.enqueue_write(async () => {
      await this.close_serialized("failed");
    });
  }

  /** 读取当前 Assistant Message 快照。 */
  private current_message(): SessionAssistantMessage {
    const message = this.recorder.get_message(this.message_id);
    if (!message || message.type !== "assistant") {
      throw new Error(`Assistant Message not found: ${this.message_id}`);
    }
    return message;
  }

  /** 读取当前 Assistant 中的指定 Tool Part。 */
  private find_tool(tool_call_id: string): SessionAssistantToolPart | undefined {
    return this.current_message().parts.find(
      (part): part is SessionAssistantToolPart =>
        part.type === "tool" && part.tool_call_id === tool_call_id,
    );
  }

  /** 在当前流式快照中寻找最终 Part 对应的稳定 identity。 */
  private find_matching_final_part(
    final_part: SessionAssistantMessagePart,
    current_parts: SessionAssistantMessagePart[],
    matched_part_ids: Set<string>,
  ): SessionAssistantMessagePart | undefined {
    const available_parts = current_parts.filter(
      (part) => !matched_part_ids.has(part.part_id),
    );
    if (final_part.type === "tool") {
      return available_parts.find(
        (part) => part.type === "tool" && part.tool_call_id === final_part.tool_call_id,
      );
    }
    if (final_part.type === "file") {
      return available_parts.find(
        (part) =>
          part.type === "file" &&
          part.url === final_part.url &&
          part.media_type === final_part.media_type,
      );
    }
    if (final_part.type === "source") {
      return available_parts.find(
        (part) => part.type === "source" && part.source_id === final_part.source_id,
      );
    }
    if (final_part.type === "data" && final_part.data_id !== undefined) {
      return available_parts.find(
        (part) =>
          part.type === "data" &&
          part.data_type === final_part.data_type &&
          part.data_id === final_part.data_id,
      );
    }
    if (final_part.type === "text" || final_part.type === "reasoning") {
      return available_parts.find(
        (part) => part.type === final_part.type && part.text === final_part.text,
      ) || available_parts.find((part) => part.type === final_part.type);
    }
    return available_parts.find((part) => part.type === final_part.type);
  }

  /** 为最终快照中新出现的 Part 创建 canonical identity。 */
  private final_part_id(part: SessionAssistantMessagePart): string {
    if (part.type === "tool") return `tool:${part.tool_call_id}`;
    if (part.type === "source") return `source:${part.source_id}`;
    return `${part.type}:${generateId()}`;
  }

  /** 计算下一个不可变 Part 顺序号。 */
  private next_part_sequence(): number {
    return this.current_message().parts.reduce(
      (value, part) => Math.max(value, part.sequence + 1),
      1,
    );
  }

  /**
   * 把 AI SDK 当前 stream 内的临时 chunk ID 映射为 Message 内唯一 Part ID。
   *
   * AI SDK 会在不同 `streamText()` 调用中重复使用 `txt-0`、`reasoning-0`
   * 等 ID，因此这些 ID 只能用于关联当前尚未结束的文本片段。
   */
  private resolve_text_part_id(
    type: "text" | "reasoning",
    chunk_id: string,
  ): string {
    const source_part_id = this.source_text_part_id(type, chunk_id);
    const active_part_id = this.active_text_part_ids.get(source_part_id);
    if (active_part_id) return active_part_id;
    const part_id = `${type}:${generateId()}`;
    this.active_text_part_ids.set(source_part_id, part_id);
    return part_id;
  }

  /** 构造当前流片段使用的临时关联键。 */
  private source_text_part_id(
    type: "text" | "reasoning",
    chunk_id: string,
  ): string {
    return `${type}:${chunk_id}`;
  }

  /** 在首个有效 Delta 到达时才固定文本 Part 的真实顺序。 */
  private async ensure_text_part(
    part_id: string,
    type: "text" | "reasoning",
    provider_metadata?: SessionAssistantTextPart["provider_metadata"],
  ): Promise<void> {
    const existing = this.current_message().parts.find(
      (part) => part.part_id === part_id,
    );
    if (existing) {
      if (existing.type !== type) {
        throw new Error(`Assistant Part type changed: ${part_id}`);
      }
      if (
        (existing.type === "text" || existing.type === "reasoning") &&
        provider_metadata !== undefined
      ) {
        await this.upsert_part({ ...existing, provider_metadata });
      }
      return;
    }
    const pending = this.pending_text_parts.get(part_id);
    if (pending && pending.type !== type) {
      throw new Error(`Assistant pending Part type changed: ${part_id}`);
    }
    await this.upsert_part({
      part_id,
      sequence: this.next_part_sequence(),
      type,
      text: "",
      state: "streaming",
      ...(provider_metadata !== undefined
        ? { provider_metadata }
        : pending?.provider_metadata !== undefined
          ? { provider_metadata: pending.provider_metadata }
          : {}),
    });
    this.pending_text_parts.delete(part_id);
  }

  /** 创建或更新 Tool Part 完整快照。 */
  private async upsert_tool(
    tool_call_id: string,
    changes: Pick<SessionAssistantToolPart, "tool_name" | "state"> &
      Partial<Omit<SessionAssistantToolPart, "part_id" | "type" | "tool_call_id" | "tool_name" | "state">>,
  ): Promise<void> {
    const current = this.find_tool(tool_call_id);
    await this.upsert_part({
      ...(current || {}),
      part_id: `tool:${tool_call_id}`,
      sequence: current?.sequence || this.next_part_sequence(),
      type: "tool",
      tool_call_id,
      ...changes,
    });
  }

  /** 串行执行对当前 Assistant Message 的全部写操作。 */
  private async enqueue_write(operation: () => Promise<void>): Promise<void> {
    const current = this.write_chain.then(operation, operation);
    this.write_chain = current.catch(() => undefined);
    await current;
  }

  /** 在队列内关闭当前 Assistant Message。 */
  private async close_serialized(
    status: "completed" | "stopped" | "failed",
  ): Promise<void> {
    if (this.closed) return;
    this.pending_text_parts.clear();
    this.active_text_part_ids.clear();
    await this.recorder.complete_assistant_message(this.message_id, status);
    this.closed = true;
  }
}

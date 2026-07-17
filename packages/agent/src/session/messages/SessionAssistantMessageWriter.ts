/**
 * 单个 Assistant Message 的流式写入器。
 *
 * Writer 把 AI SDK chunk、Executor Tool 输入屏障和最终关闭操作收口到同一条
 * 单写者队列，保证并发回调不会产生 revision 冲突。
 */

import type { UIMessageChunk } from "ai";
import type { SessionMessages } from "@/session/SessionMessages.js";
import {
  to_session_json_value,
  to_session_provider_metadata,
} from "@/session/messages/SessionJsonValue.js";
import type {
  SessionAssistantFilePart,
  SessionAssistantMessage,
  SessionAssistantMessagePart,
  SessionAssistantToolPart,
} from "@/types/session/SessionMessage.js";
import type { SessionToolInputReady } from "@/types/session/SessionTool.js";
import { generateId } from "@/utils/Id.js";

/** 单个 Assistant segment 的流式 writer。 */
export class SessionAssistantMessageWriter {
  readonly message_id: string;
  private readonly recorder: SessionMessages;
  private readonly pending_text_parts = new Map<string, "text" | "reasoning">();
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
          this.pending_text_parts.set(part_id, type);
        }
        return;
      }
      case "text-delta":
      case "reasoning-delta": {
        const type = chunk.type === "text-delta" ? "text" : "reasoning";
        const part_id = this.resolve_text_part_id(type, chunk.id);
        await this.ensure_text_part(part_id, type);
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
          await this.upsert_part({ ...part, state: "done" });
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
        if (tool) {
          if (
            call_provider_metadata === undefined &&
            chunk.providerExecuted === undefined
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
        if (tool && tool.state !== "input-streaming") {
          if (
            call_provider_metadata === undefined &&
            chunk.providerExecuted === undefined
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
        });
        return;
      }
      case "tool-input-error": {
        const call_provider_metadata = to_session_provider_metadata(
          chunk.providerMetadata,
        );
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: chunk.toolName,
          state: "failed",
          input: to_session_json_value(chunk.input),
          error: chunk.errorText,
          ...(call_provider_metadata !== undefined
            ? { call_provider_metadata }
            : {}),
          ...(chunk.providerExecuted !== undefined
            ? { provider_executed: chunk.providerExecuted }
            : {}),
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
        });
        return;
      }
      case "tool-output-error": {
        const tool = this.find_tool(chunk.toolCallId);
        const result_provider_metadata = to_session_provider_metadata(
          chunk.providerMetadata,
        );
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
        });
        return;
      }
      case "tool-output-denied": {
        const tool = this.find_tool(chunk.toolCallId);
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: tool?.tool_name || "unknown",
          state: "failed",
          error: "Tool output denied",
        });
        return;
      }
      case "file":
        await this.append_file_part({
          media_type: chunk.mediaType,
          url: chunk.url,
        });
        return;
      default:
        return;
    }
  }

  /** 写入一个完整 Assistant part。 */
  async upsert_part(part: SessionAssistantMessagePart): Promise<void> {
    await this.recorder.update_assistant_part(this.message_id, part);
  }

  /**
   * 用 AI SDK 最终 UIMessage 中的 Tool 快照校准流式写入结果。
   *
   * 关键点（中文）：最终快照只覆盖实际存在的字段；缺失 metadata 时继续保留
   * 流式阶段已经写入的 Provider 快照。
   */
  async reconcile_final_tool_part(
    part: SessionAssistantToolPart,
  ): Promise<void> {
    await this.enqueue_write(async () => {
      const current = this.find_tool(part.tool_call_id);
      await this.upsert_part({
        ...(current || {}),
        ...part,
        part_id: current?.part_id || `tool:${part.tool_call_id}`,
        sequence: current?.sequence || this.next_part_sequence(),
      });
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
    input: Pick<SessionAssistantFilePart, "filename" | "media_type" | "url">,
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
      if (filename && String(existing.filename || "").trim() !== filename) {
        await this.upsert_part({ ...existing, filename });
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
  ): Promise<void> {
    const existing = this.current_message().parts.find(
      (part) => part.part_id === part_id,
    );
    if (existing) {
      if (existing.type !== type) {
        throw new Error(`Assistant Part type changed: ${part_id}`);
      }
      return;
    }
    const pending_type = this.pending_text_parts.get(part_id);
    if (pending_type && pending_type !== type) {
      throw new Error(`Assistant pending Part type changed: ${part_id}`);
    }
    await this.upsert_part({
      part_id,
      sequence: this.next_part_sequence(),
      type,
      text: "",
      state: "streaming",
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

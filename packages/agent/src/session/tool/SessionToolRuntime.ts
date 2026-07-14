/**
 * Session Tool 生命周期协调器。
 *
 * 关键点（中文）
 * - Executor、Approval Broker 与 AI SDK stream 都通过本对象更新 Tool Part。
 * - Recorder 只保存已经确定的快照，不等待或协调未来事件。
 */

import type { SessionApproval } from "@/types/session/SessionApproval.js";
import type { SessionToolInputReady } from "@/types/session/SessionToolRuntime.js";
import type {
  SessionAssistantMessageWriter,
  SessionRecorder,
} from "@/session/recorder/SessionRecorder.js";

/** 单个 Session 的 Tool 生命周期协调器。 */
export class SessionToolRuntime {
  private readonly recorder: SessionRecorder;

  /**
   * @param recorder 当前 Session 的持久化 Recorder。
   */
  constructor(recorder: SessionRecorder) {
    this.recorder = recorder;
  }

  /** 在调用 Tool 实现前写入完整输入，建立 ready 顺序屏障。 */
  async prepare_input(
    writer: SessionAssistantMessageWriter,
    input: SessionToolInputReady,
  ): Promise<void> {
    await writer.prepare_tool_input(input);
  }

  /** 把 Session Broker 创建的完整审批快照投影到 Tool Part。 */
  async request_approval(approval: SessionApproval): Promise<void> {
    const tool = this.require_ready_tool(approval.tool_call_id);
    await this.recorder.update_assistant_part(tool.message_id, {
      ...tool.part,
      state: "approval-required",
      approval,
    });
  }

  /** 在 Shell 恢复执行前先提交审批结果对应的 Tool 状态。 */
  async resolve_approval(input: {
    /** 当前审批请求标识。 */
    approval_id: string;
    /** 当前审批最终结果。 */
    decision: "approved" | "denied" | "expired";
    /** 当前审批关联的 Tool Call。 */
    tool_call_id: string;
  }): Promise<void> {
    const tool = this.require_tool(input.tool_call_id);
    if (tool.part.approval?.approval_id !== input.approval_id) {
      throw new Error(`Tool approval identity mismatch: ${input.approval_id}`);
    }
    await this.recorder.update_assistant_part(tool.message_id, {
      ...tool.part,
      state: input.decision === "approved" ? "running" : "failed",
      ...(input.decision === "approved"
        ? {}
        : { error: input.decision === "expired" ? "Approval expired" : "Approval denied" }),
    });
  }

  /** 读取当前流式 Assistant 中的 Tool Part。 */
  private require_tool(tool_call_id: string) {
    const tool = this.recorder.find_streaming_tool(tool_call_id);
    if (tool) return tool;
    throw new Error(`Streaming Tool Part not found: ${tool_call_id}`);
  }

  /** 审批请求只能从已经持久化完整输入的 ready 状态进入。 */
  private require_ready_tool(tool_call_id: string) {
    const tool = this.require_tool(tool_call_id);
    if (tool.part.state !== "ready") {
      throw new Error(
        `Tool approval requires ready input: ${tool_call_id} (${tool.part.state})`,
      );
    }
    return tool;
  }
}

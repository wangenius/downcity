/**
 * Session queue command 运行时类型。
 *
 * 关键点（中文）
 * - 配置 API 负责把 configured state 修改成功后创建 command。
 * - command 与 steer 共用 Session 输入队列，并在下一次 Session step 检查点执行。
 * - 这里只描述进程内提交协议，不属于持久化格式或公开 SDK 协议。
 */

import type { AgentSessionSystemBlock } from "@/types/agent/SessionTypes.js";
import type { AgentPluginExecutionRuntime } from "@/types/plugin/PluginRuntime.js";

/**
 * Session queue command 的归属作用域。
 */
export type SessionQueueCommandScope = "agent" | "session";

/**
 * Session queue command 执行时的 step 上下文。
 */
export interface SessionQueueCommandContext {
  /** 当前公开 Session turn 标识。 */
  turn_id: string;
}

/**
 * 等待在 Session step 检查点执行的 command。
 */
export interface SessionQueueCommand {
  /** 当前队列项固定为 command。 */
  type: "command";

  /** 当前 command 的稳定唯一标识。 */
  command_id: string;

  /** 当前配置修改属于 Agent 还是 Session。 */
  scope: SessionQueueCommandScope;

  /**
   * 把 configured state 提交为当前 Session 的 effective state。
   *
   * 关键点（中文）
   * - effective state 提交失败时可以抛错，但不能让后续 command 静默丢失。
   * - action message 是提交后的观测记录，写入失败不能回滚已经生效的配置。
   */
  execute(context: SessionQueueCommandContext): Promise<void>;
}

/**
 * Agent configured state 广播给已有 Session 的 command。
 */
export type AgentSessionCommand =
  | {
      /** 当前修改固定为 instruction。 */
      type: "instruction";
      /** 当前 command 唯一标识。 */
      command_id: string;
      /** 下一 Session step 使用的 instruction blocks。 */
      instruction_blocks: AgentSessionSystemBlock[];
    }
  | {
      /** 当前修改固定为 env。 */
      type: "env";
      /** 当前 command 唯一标识。 */
      command_id: string;
      /** 下一 Session step 使用的完整 Agent env。 */
      env: Record<string, string>;
    }
  | {
      /** 当前修改固定为 plugin registry。 */
      type: "plugins";
      /** 当前 command 唯一标识。 */
      command_id: string;
      /** 当前 plugin 配置修改的用户可读标题。 */
      title: string;
      /** 下一 Session step 使用的 Plugin 执行视图。 */
      plugins: AgentPluginExecutionRuntime;
    };

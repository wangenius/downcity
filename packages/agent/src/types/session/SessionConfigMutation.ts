/**
 * Session 配置 Mutation 运行时类型。
 *
 * 关键点（中文）
 * - 配置 API 负责把 configured state 修改成功后创建 mutation。
 * - mutation 与 steer 共用 Session 输入队列，并在下一次 Session step 检查点提交。
 * - 这里只描述进程内提交协议，不属于持久化格式或公开 SDK 协议。
 */

import type { AgentSessionSystemBlock } from "@/types/agent/SessionTypes.js";
import type { AgentPluginExecutionRuntime } from "@/types/plugin/PluginRuntime.js";

/**
 * 配置 Mutation 的归属作用域。
 */
export type SessionConfigMutationScope = "agent" | "session";

/**
 * 配置 Mutation 生效时的 Session step 上下文。
 */
export interface SessionConfigMutationApplyContext {
  /** 当前公开 Session turn 标识。 */
  turn_id: string;
}

/**
 * 等待在下一次 Session step 检查点提交的配置 Mutation。
 */
export interface SessionRuntimeConfigMutation {
  /** 当前配置修改的稳定唯一标识。 */
  mutation_id: string;

  /** 当前配置修改属于 Agent 还是 Session。 */
  scope: SessionConfigMutationScope;

  /**
   * 把 configured state 提交为当前 Session 的 effective state。
   *
   * 关键点（中文）
   * - effective state 提交失败时可以抛错，但不能让后续 mutation 静默丢失。
   * - action message 是提交后的观测记录，写入失败不能回滚已经生效的配置。
   */
  apply(context: SessionConfigMutationApplyContext): Promise<void>;
}

/**
 * Agent configured state 广播给已有 Session 的配置修改。
 */
export type AgentSessionConfigMutation =
  | {
      /** 当前修改固定为 instruction。 */
      type: "instruction";
      /** 当前配置修改唯一标识。 */
      mutation_id: string;
      /** 下一 Session step 使用的 instruction blocks。 */
      instruction_blocks: AgentSessionSystemBlock[];
    }
  | {
      /** 当前修改固定为 env。 */
      type: "env";
      /** 当前配置修改唯一标识。 */
      mutation_id: string;
      /** 下一 Session step 使用的完整 Agent env。 */
      env: Record<string, string>;
    }
  | {
      /** 当前修改固定为 plugin registry。 */
      type: "plugins";
      /** 当前配置修改唯一标识。 */
      mutation_id: string;
      /** 当前 plugin 配置修改的用户可读标题。 */
      title: string;
      /** 下一 Session step 使用的 Plugin 执行视图。 */
      plugins: AgentPluginExecutionRuntime;
    };

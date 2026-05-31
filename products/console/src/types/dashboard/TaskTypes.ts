/**
 * Console Dashboard 任务与任务运行类型定义。
 *
 * 关键点（中文）
 * - 从 Dashboard.ts 拆出，按业务主题聚合类型，避免单个类型文件继续膨胀。
 * - 字段级文档保留在具体 interface/type 上，方便调用侧悬浮查看。
 */

import type { UiSessionTimelineMessage } from "./SessionAndModelTypes";

/**
 * 任务状态项。
 */
export interface UiTaskItem {
  /**
   * 任务名称（主字段）。
   */
  title?: string;
  /**
   * 任务状态。
   */
  status?: string;
  /**
   * 当前是否正在执行。
   */
  running?: boolean;
  /**
   * 触发条件（@manual | cron | time:ISO8601）。
   */
  when?: string;
  /**
   * 任务描述。
   */
  description?: string;
  /**
   * 任务正文（task.md frontmatter 之后的 body）。
   */
  body?: string;
  /**
   * 任务所属 sessionId。
   */
  sessionId?: string;
  /**
   * 任务类型（agent/script）。
   */
  kind?: "agent" | "script" | string;
  /**
   * 是否启用 review 多轮复核。
   */
  review?: boolean;
  /**
   * 任务正文文件路径。
   */
  taskMdPath?: string;
  /**
   * 最近一次执行时间戳目录名。
   */
  lastRunTimestamp?: string;
}

/**
 * `/api/dashboard/tasks` 响应。
 */
export interface UiTasksResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * task 列表。
   */
  tasks?: UiTaskItem[];
}

/**
 * 任务状态值。
 */
export type UiTaskStatusValue = "enabled" | "paused" | "disabled";

/**
 * task 通用变更响应（状态切换/删除）。
 */
export interface UiTaskMutationResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 任务名称。
   */
  title?: string;
  /**
   * 任务状态（状态更新接口时返回）。
   */
  status?: UiTaskStatusValue | string;
  /**
   * 任务目录路径（删除任务时可选返回）。
   */
  taskDirPath?: string;
  /**
   * 服务层补充信息（如 scheduler reload 信息）。
   */
  scheduler?: Record<string, unknown>;
  /**
   * 错误信息。
   */
  error?: string;
  /**
   * 可选提示文案。
   */
  message?: string;
}

/**
 * 任务执行摘要项。
 */
export interface UiTaskRunSummary {
  /**
   * 运行时间戳目录名（YYYYMMDD-HHmmss-SSS）。
   */
  timestamp: string;
  /**
   * 任务最终状态。
   */
  status?: string;
  /**
   * 执行器状态。
   */
  executionStatus?: string;
  /**
   * 结果状态。
   */
  resultStatus?: string;
  /**
   * 是否仍在执行中。
   */
  inProgress?: boolean;
  /**
   * 当前执行阶段（来自 run-progress.json）。
   */
  progressPhase?: string;
  /**
   * 当前阶段说明（来自 run-progress.json）。
   */
  progressMessage?: string;
  /**
   * 最近进度更新时间（毫秒）。
   */
  progressUpdatedAt?: number;
  /**
   * 当前执行轮次（agent 任务可选）。
   */
  progressRound?: number;
  /**
   * 最大执行轮次（agent 任务可选）。
   */
  progressMaxRounds?: number;
  /**
   * 开始时间戳（毫秒）。
   */
  startedAt?: number;
  /**
   * 结束时间戳（毫秒）。
   */
  endedAt?: number;
  /**
   * 对话轮数。
   */
  dialogueRounds?: number;
  /**
   * 用户模拟满意度。
   */
  userSimulatorSatisfied?: boolean;
  /**
   * 错误信息。
   */
  error?: string;
  /**
   * run 目录相对路径。
   */
  runDirRel?: string;
}

/**
 * 任务执行详情项。
 */
export interface UiTaskRunDetail {
  /**
   * task 名称。
   */
  title?: string;
  /**
   * 运行时间戳目录名。
   */
  timestamp?: string;
  /**
   * run 目录相对路径。
   */
  runDirRel?: string;
  /**
   * run 元数据（run.json）。
   */
  meta?: Record<string, unknown>;
  /**
   * 运行进度快照（run-progress.json）。
   */
  progress?: {
    /**
     * 当前进度状态（running/success/failure）。
     */
    status?: string;
    /**
     * 当前阶段标识。
     */
    phase?: string;
    /**
     * 当前阶段说明文案。
     */
    message?: string;
    /**
     * 开始时间（毫秒）。
     */
    startedAt?: number;
    /**
     * 最近更新时间（毫秒）。
     */
    updatedAt?: number;
    /**
     * 结束时间（毫秒）。
     */
    endedAt?: number;
    /**
     * 当前轮次（agent 场景可选）。
     */
    round?: number;
    /**
     * 最大轮次（agent 场景可选）。
     */
    maxRounds?: number;
    /**
     * 最终 run 状态（可选）。
     */
    runStatus?: string;
    /**
     * 最终执行状态（可选）。
     */
    executionStatus?: string;
    /**
     * 最终结果状态（可选）。
     */
    resultStatus?: string;
    /**
     * 最近进度事件列表（时间顺序）。
     */
    events?: Array<{
      /**
       * 事件时间（毫秒）。
       */
      at?: number;
      /**
       * 事件阶段标识。
       */
      phase?: string;
      /**
       * 事件说明文案。
       */
      message?: string;
      /**
       * 事件对应轮次（可选）。
       */
      round?: number;
      /**
       * 事件对应最大轮次（可选）。
       */
      maxRounds?: number;
    }>;
  };
  /**
   * 对话元数据（dialogue.json）。
   */
  dialogue?: Record<string, unknown>;
  /**
   * 产物文本集合。
   */
  artifacts?: {
    /**
     * 输入文本。
     */
    input?: string;
    /**
     * 输出文本。
     */
    output?: string;
    /**
     * 结果文本。
     */
    result?: string;
    /**
     * 对话文本。
     */
    dialogue?: string;
    /**
     * 错误文本。
     */
    error?: string;
  };
  /**
   * 执行消息时间线。
   */
  messages?: UiSessionTimelineMessage[];
}

/**
 * `/api/dashboard/tasks/:title/runs` 响应。
 */
export interface UiTaskRunsResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * task 名称。
   */
  title?: string;
  /**
   * 执行摘要列表。
   */
  runs?: UiTaskRunSummary[];
  /**
   * 错误信息。
   */
  error?: string;
}

/**
 * `/api/dashboard/tasks/:title/runs/:timestamp` 响应。
 */
export interface UiTaskRunDetailResponse extends UiTaskRunDetail {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * 错误信息。
   */
  error?: string;
}

/**
 * 删除 task run 记录响应。
 */
export interface UiTaskRunDeleteResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * task 标题。
   */
  title?: string;
  /**
   * 被删除的 run 时间戳目录名。
   */
  timestamp?: string;
  /**
   * 是否完成删除。
   */
  deleted?: boolean;
  /**
   * 错误信息。
   */
  error?: string;
}

/**
 * 批量清理 task run 记录响应。
 */
export interface UiTaskRunsClearResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * task 标题。
   */
  title?: string;
  /**
   * 已删除 run 数量。
   */
  deletedCount?: number;
  /**
   * 因“仍在运行”而跳过的 run 数量。
   */
  skippedRunningCount?: number;
  /**
   * 已删除 run 的时间戳目录列表。
   */
  deletedTimestamps?: string[];
  /**
   * 被跳过（运行中）的 run 时间戳目录列表。
   */
  skippedRunningTimestamps?: string[];
  /**
   * 错误信息。
   */
  error?: string;
}

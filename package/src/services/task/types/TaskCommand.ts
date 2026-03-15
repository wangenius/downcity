/**
 * Task 命令协议类型。
 *
 * 关键点（中文）
 * - task 模块相关 DTO 就近放在 task/types
 * - 统一给 CLI / Server / service 复用
 */

import type {
  ShipTaskKind,
  ShipTaskRunExecutionStatusV1,
  ShipTaskRunResultStatusV1,
  ShipTaskRunStatusV1,
  ShipTaskStatus,
} from "./Task.js";

export type TaskCreateRequest = {
  taskName: string;
  cron: string;
  description: string;
  contextId: string;
  kind?: ShipTaskKind;
  time?: string;
  status?: ShipTaskStatus;
  timezone?: string;
  requiredArtifacts?: string[];
  minOutputChars?: number;
  maxDialogueRounds?: number;
  body?: string;
  overwrite?: boolean;
};

export type TaskCreateResponse = {
  /** 调用是否成功 */
  success: boolean;
  /** 任务名称（新建成功或复用已有任务时返回） */
  taskName?: string;
  /** 任务定义文件相对路径 */
  taskMdPath?: string;
  /** 是否复用了已有任务（true 表示未新建） */
  reusedExisting?: boolean;
  /** 说明信息（例如“复用已有任务”） */
  message?: string;
  /** 错误信息 */
  error?: string;
};

export type TaskUpdateRequest = {
  taskName: string;
  taskNameNext?: string;
  cron?: string;
  description?: string;
  contextId?: string;
  kind?: ShipTaskKind;
  time?: string;
  clearTime?: boolean;
  status?: ShipTaskStatus;
  timezone?: string;
  clearTimezone?: boolean;
  requiredArtifacts?: string[];
  clearRequiredArtifacts?: boolean;
  minOutputChars?: number;
  clearMinOutputChars?: boolean;
  maxDialogueRounds?: number;
  clearMaxDialogueRounds?: boolean;
  body?: string;
  clearBody?: boolean;
};

export type TaskUpdateResponse = {
  success: boolean;
  taskName?: string;
  taskMdPath?: string;
  error?: string;
};

export type TaskListItemView = {
  taskName: string;
  description: string;
  cron: string;
  status: string;
  contextId: string;
  kind?: ShipTaskKind;
  time?: string;
  timezone?: string;
  requiredArtifacts?: string[];
  minOutputChars?: number;
  maxDialogueRounds?: number;
  taskMdPath: string;
  lastRunTimestamp?: string;
};

export type TaskListResponse = {
  success: true;
  tasks: TaskListItemView[];
};

export type TaskRunRequest = {
  taskName: string;
  reason?: string;
};

export type TaskRunResponse = {
  success: boolean;
  /** 是否已受理后台执行（true 表示任务已开始异步执行） */
  accepted?: boolean;
  /** 给调用方的简短提示（例如“任务已经开始执行”） */
  message?: string;
  status?: ShipTaskRunStatusV1;
  executionStatus?: ShipTaskRunExecutionStatusV1;
  resultStatus?: ShipTaskRunResultStatusV1;
  resultErrors?: string[];
  dialogueRounds?: number;
  userSimulatorSatisfied?: boolean;
  userSimulatorReply?: string;
  userSimulatorReason?: string;
  userSimulatorScore?: number;
  taskName?: string;
  timestamp?: string;
  runDir?: string;
  runDirRel?: string;
  error?: string;
};

export type TaskSetStatusRequest = {
  taskName: string;
  status: ShipTaskStatus;
};

export type TaskSetStatusResponse = {
  success: boolean;
  taskName?: string;
  status?: ShipTaskStatus;
  error?: string;
};

export type TaskDeleteRequest = {
  taskName: string;
};

export type TaskDeleteResponse = {
  success: boolean;
  taskName?: string;
  taskDirPath?: string;
  error?: string;
};

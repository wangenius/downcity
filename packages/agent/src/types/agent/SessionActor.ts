/**
 * Agent session actor 接口类型。
 *
 * 关键点（中文）
 * - 这里只描述 session 的可调用能力。
 * - session 的数据结构、history/system payload 放在 `SessionTypes.ts`。
 */

import type {
  AgentCreateSessionInput,
  AgentArchiveSessionInput,
  AgentArchiveSessionsInput,
  AgentArchiveSessionResult,
  AgentArchiveSessionsResult,
  AgentCleanArchiveResult,
  AgentListSessionsInput,
  AgentSessionConfigSnapshot,
  AgentSessionForkInput,
  AgentSessionRecordsInput,
  AgentSessionRecordsPage,
  AgentSessionInfo,
  AgentSessionSetInput,
  AgentSessionSummaryPage,
  AgentSessionSystemSnapshot,
} from "@/types/agent/SessionTypes.js";
import type {
  AgentSessionSubscriber,
  AgentSessionUnsubscribe,
} from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionStopResult } from "@/types/sdk/AgentSessionStop.js";
import type { AgentSessionTurnHandle } from "@/types/sdk/AgentSessionTurn.js";

/**
 * SDK Session 集合入口。
 */
export interface AgentSessions<TSession extends AgentSessionActor = AgentSession> {
  /** 新建一个 session。 */
  create(input?: AgentCreateSessionInput): Promise<TSession>;

  /** 获取一个已存在的 session。 */
  get(session_id: string): Promise<TSession>;

  /** 列出当前 agent 的 session 摘要页。 */
  list(input?: AgentListSessionsInput): Promise<AgentSessionSummaryPage>;

  /** 归档单个 session。 */
  archive(input: AgentArchiveSessionInput): Promise<AgentArchiveSessionResult>;

  /** 列出已归档的 session 摘要页。 */
  archived(input?: AgentArchiveSessionsInput): Promise<AgentArchiveSessionsResult>;

  /** 永久清空已归档 session。 */
  clean_archive(): Promise<AgentCleanArchiveResult>;
}

/**
 * Session actor 公共能力。
 */
export interface AgentSessionActor {
  /** 当前 session 稳定标识。 */
  readonly id: string;

  /** 读取当前 session 详情。 */
  get_info(): Promise<AgentSessionInfo>;

  /** 追加一条新的 prompt。 */
  prompt(input: AgentSessionPromptInput): Promise<AgentSessionTurnHandle>;

  /** 停止当前 turn，并取消尚未被吸收的排队 prompt。 */
  stop(): Promise<AgentSessionStopResult>;

  /** 订阅当前 session 的未来事件。 */
  subscribe(subscriber: AgentSessionSubscriber): AgentSessionUnsubscribe;

  /** 读取当前 session records 分页。 */
  records(input?: AgentSessionRecordsInput): Promise<AgentSessionRecordsPage>;

  /** 读取当前 session 生效的 system 快照。 */
  system(): Promise<AgentSessionSystemSnapshot>;
}

/**
 * 本地 Agent 返回的公开 session 接口。
 */
export interface AgentSession extends AgentSessionActor {
  /** 当前 session 所属 agentId。 */
  readonly agentId: string;

  /** 当前 session 配置快照。 */
  readonly config: AgentSessionConfigSnapshot;

  /** 写入当前 session 默认配置。 */
  set(input: AgentSessionSetInput): Promise<void>;

  /** 从当前 session 创建一个分叉会话。 */
  fork(input?: AgentSessionForkInput | string): Promise<AgentSession>;
}

/**
 * 远程 Agent 返回的公开 session 接口。
 */
export interface RemoteAgentSession extends AgentSessionActor {
  /** 按稳定模型 ID 更新远程 Session 模型。 */
  set(input: AgentSessionSetInput): Promise<void>;

  /** 从当前远程 session 创建一个分叉会话。 */
  fork(input?: AgentSessionForkInput | string): Promise<RemoteAgentSession>;
}

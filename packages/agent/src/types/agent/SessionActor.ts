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
  AgentSessionHistoryInput,
  AgentSessionHistoryPage,
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
import type { AgentSessionTurnHandle } from "@/types/sdk/AgentSessionTurn.js";

/**
 * SDK Session 集合绑定。
 */
export interface AgentSessionCollection {
  /** 新建一个 session。 */
  create_session(input?: AgentCreateSessionInput): Promise<AgentSession>;

  /** 获取一个已存在的 session。 */
  get_session(sessionId: string): Promise<AgentSession>;

  /** 列出当前 agent 的 session 摘要页。 */
  list_sessions(input?: AgentListSessionsInput): Promise<AgentSessionSummaryPage>;

  /** 归档单个 session。 */
  archive_session(input: AgentArchiveSessionInput): Promise<AgentArchiveSessionResult>;

  /** 列出已归档的 session 摘要页。 */
  archive_sessions(input?: AgentArchiveSessionsInput): Promise<AgentArchiveSessionsResult>;

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
  getInfo(): Promise<AgentSessionInfo>;

  /** 追加一条新的 prompt。 */
  prompt(input: AgentSessionPromptInput): Promise<AgentSessionTurnHandle>;

  /** 订阅当前 session 的未来事件。 */
  subscribe(subscriber: AgentSessionSubscriber): AgentSessionUnsubscribe;

  /** 读取当前 session 历史分页。 */
  history(input?: AgentSessionHistoryInput): Promise<AgentSessionHistoryPage>;

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
  /** 从当前远程 session 创建一个分叉会话。 */
  fork(input?: AgentSessionForkInput | string): Promise<RemoteAgentSession>;
}

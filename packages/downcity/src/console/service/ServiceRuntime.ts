import type { LanguageModel } from "ai";
import type {
  SessionMetadataV1,
  SessionMessageV1,
  SessionUserMessageV1,
} from "@agent/types/SessionMessage.js";
import type {
  AgentAssistantStepCallback,
  AgentResult,
  AgentRunInput,
} from "@agent/types/Agent.js";
import type { JsonValue } from "@/types/Json.js";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { PluginPort } from "@/types/Plugin.js";

/**
 * Service 运行时端口类型。
 *
 * 关键点（中文）
 * - services 仅依赖这些端口，不直接依赖 main 具体实现。
 */

export type ServiceInvokeParams = {
  service: string;
  action: string;
  payload?: JsonValue;
};

export type ServiceInvokeResult = {
  success: boolean;
  data?: JsonValue;
  error?: string;
};

/**
 * 服务调用端口（services -> services）。
 */
export type ServiceInvokePort = {
  invoke(params: ServiceInvokeParams): Promise<ServiceInvokeResult>;
};

/**
 * 会话 Persistor 端口。
 */
export type ServicePersistor = {
  list(): Promise<SessionMessageV1[]>;
  slice(start: number, end: number): Promise<SessionMessageV1[]>;
  append(message: SessionMessageV1): Promise<void>;
  size(): Promise<number>;
  meta(): Promise<Record<string, unknown>>;
  userText(params: {
    text: string;
    metadata: Omit<SessionMetadataV1, "v" | "ts"> &
      Partial<Pick<SessionMetadataV1, "ts">>;
    id?: string;
  }): SessionMessageV1;
  assistantText(params: {
    text: string;
    metadata: Omit<SessionMetadataV1, "v" | "ts"> &
      Partial<Pick<SessionMetadataV1, "ts">>;
    id?: string;
    kind?: "normal" | "summary";
    source?: "egress" | "compact";
  }): SessionMessageV1;
};

/**
 * Session Agent 端口。
 */
export type ServiceSessionAgent = {
  run(params: AgentRunInput): Promise<AgentResult>;
};

/**
 * service Session 能力。
 */
export type ServiceSession = {
  getAgent(sessionId: string): ServiceSessionAgent;
  getPersistor(sessionId: string): ServicePersistor;
  run(params: {
    sessionId: string;
    query: string;
    onStepCallback?: () => Promise<SessionUserMessageV1[]>;
    onAssistantStepCallback?: AgentAssistantStepCallback;
  }): Promise<AgentResult>;
  clearAgent(sessionId?: string): void;
  afterSessionUpdatedAsync(sessionId: string): Promise<void>;
  appendUserMessage(params: {
    sessionId: string;
    message?: SessionMessageV1 | null;
    text?: string;
    requestId?: string;
    extra?: SessionMetadataV1["extra"];
  }): Promise<void>;
  appendAssistantMessage(params: {
    sessionId: string;
    message?: SessionMessageV1 | null;
    fallbackText?: string;
    requestId?: string;
    extra?: SessionMetadataV1["extra"];
  }): Promise<void>;
  model: LanguageModel;
};

/**
 * ServiceRuntime（统一注入对象）。
 */
export type ServiceRuntime = ExecutionContext & {
  /**
   * Session 能力入口。
   *
   * 关键点（中文）
   * - 对 service 暴露的会话主轴统一命名为 `session`。
   * - 内外统一使用 `sessionId` 语义。
   */
  session: ServiceSession;

  /**
   * 跨 service action 调用入口。
   */
  invoke: ServiceInvokePort;
  /**
   * Service 调用别名端口。
   *
   * 关键点（中文）
   * - 新插件体系统一使用 `runtime.services.invoke(...)` 语义。
   * - 这里与 `invoke` 指向同一实现，仅做命名兼容层。
   */
  services: ServiceInvokePort;
  /**
   * Plugin 调用入口。
   *
   * 关键点（中文）
   * - 用于列出 plugin、检查可用性与运行显式 plugin action。
   * - plugin 不维护独立 runtime 状态机，这里只暴露声明式能力面。
   */
  plugins: PluginPort;
};

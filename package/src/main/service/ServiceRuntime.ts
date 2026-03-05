import type { LanguageModel } from "ai";
import type {
  ContextMetadataV1,
  ContextMessageV1,
} from "@core/types/ContextMessage.js";
import type { AgentResult, AgentRunInput } from "@core/types/Agent.js";
import type { AgentSystemConfig } from "@core/types/AgentSystem.js";
import type { JsonValue } from "@/types/Json.js";
import type { Logger } from "@utils/logger/Logger.js";
import type { ShipConfig } from "@main/types/ShipConfig.js";

/**
 * Service 运行时端口类型。
 *
 * 关键点（中文）
 * - 这些类型用于描述 services 需要的最小能力面
 * - services 只依赖这些端口，不直接依赖 core 具体实现
 * - 具体实现由 server 在启动时注入
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
 *
 * 关键点（中文）
 * - 统一跨 service action 调用入口。
 * - service 只感知“调用哪个 service/action”，不感知 main 内部调度细节。
 */
export type ServiceInvokePort = {
  invoke(params: ServiceInvokeParams): Promise<ServiceInvokeResult>;
};

/**
 * 会话存储端口。
 */
export type ServiceContextStore = {
  loadAll(): Promise<ContextMessageV1[]>;
  loadRange(
    startIndex: number,
    endIndex: number,
  ): Promise<ContextMessageV1[]>;
  append(message: ContextMessageV1): Promise<void>;
  getTotalMessageCount(): Promise<number>;
  loadMeta(): Promise<{ pinnedSkillIds?: string[] }>;
  setPinnedSkillIds(skillIds: string[]): Promise<void>;
  createAssistantTextMessage(params: {
    text: string;
    metadata: Omit<ContextMetadataV1, "v" | "ts"> &
      Partial<Pick<ContextMetadataV1, "ts">>;
    id?: string;
    kind?: "normal" | "summary";
    source?: "egress" | "compact";
  }): ContextMessageV1;
};

/**
 * 会话 Agent 端口。
 */
export type ServiceContextAgent = {
  setSystem(config: AgentSystemConfig): void;
  resetSystem(): void;
  run(params: AgentRunInput): Promise<AgentResult>;
};

/**
 * service 会话能力（会话管理 + 模型能力）。
 *
 * 关键点（中文）
 * - 只保留一个 `ServiceContext`，避免同层重复类型（如 manager/context）。
 * - 把模型能力收敛到 `context` 下，避免 Runtime 顶层字段增长。
 * - 会话相关与模型相关能力统一从 `context` 进入。
 */
export type ServiceContext = {
  getAgent(contextId: string): ServiceContextAgent;
  getContextStore(contextId: string): ServiceContextStore;
  clearAgent(contextId?: string): void;
  afterContextUpdatedAsync(contextId: string): Promise<void>;
  appendUserMessage(params: {
    contextId: string;
    text: string;
    requestId?: string;
    extra?: ContextMetadataV1["extra"];
  }): Promise<void>;
  model: LanguageModel;
};


/**
 * ServiceRuntime（统一注入对象）。
 *
 * 关键点（中文）
 * - 所有 service 在执行时都拿到同一结构的运行时对象。
 * - 该类型只描述“service 需要的能力”，不暴露 main 内部实现细节。
 * - 关键能力收敛为两类：`context`（会话+模型能力）、`invoke`（跨 service 调用）。
 * - 不在这里放 `contextId/request` 一类请求态字段；请求态由 `RequestContext` 显式传递。
 */
export type ServiceRuntime = {
  /**
   * 启动命令的工作目录（原始 cwd）。
   */
  cwd: string;

  /**
   * 项目根目录（绝对路径）。
   */
  rootPath: string;

  /**
   * 统一日志器。
   */
  logger: Logger;

  /**
   * 已解析的 ship 配置对象。
   */
  config: ShipConfig;

  /**
   * 当前生效的系统提示文本集合。
   */
  systems: string[];

  /**
   * 会话能力入口（context store + context agent + context lifecycle）；
   * 同时承载模型能力（`context.model`）。
   *
   * 关键点（中文）
   * - service 所有会话读写与模型访问都通过该字段完成。
   * - `context` 只表达“会话域能力”，与 Runtime 层概念解耦。
   */
  context: ServiceContext;

  /**
   * 跨 service action 调用入口。
   *
   * 关键点（中文）
   * - 例如 task 可以通过 `invoke` 调用 chat action。
   */
  invoke: ServiceInvokePort;
};

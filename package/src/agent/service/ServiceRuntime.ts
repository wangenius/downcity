import type { LanguageModel } from "ai";
import type {
  ContextMetadataV1,
  ContextMessageV1,
  ShipContextUserMessageV1,
} from "@agent/types/ContextMessage.js";
import type {
  AgentAssistantStepCallback,
  AgentResult,
  AgentRunInput,
} from "@agent/types/Agent.js";
import type { JsonValue } from "@/types/Json.js";
import type { Logger } from "@utils/logger/Logger.js";
import type { ShipConfig } from "@agent/types/ShipConfig.js";
import type { AssetPort } from "@/types/Asset.js";
import type { CapabilityPort, PluginPort } from "@/types/Plugin.js";

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
  list(): Promise<ContextMessageV1[]>;
  slice(start: number, end: number): Promise<ContextMessageV1[]>;
  append(message: ContextMessageV1): Promise<void>;
  size(): Promise<number>;
  meta(): Promise<Record<string, unknown>>;
  assistantText(params: {
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
  run(params: AgentRunInput): Promise<AgentResult>;
};

/**
 * service 会话能力。
 */
export type ServiceContext = {
  getAgent(contextId: string): ServiceContextAgent;
  getPersistor(contextId: string): ServicePersistor;
  run(params: {
    contextId: string;
    query: string;
    onStepCallback?: () => Promise<ShipContextUserMessageV1[]>;
    onAssistantStepCallback?: AgentAssistantStepCallback;
  }): Promise<AgentResult>;
  clearAgent(contextId?: string): void;
  afterContextUpdatedAsync(contextId: string): Promise<void>;
  appendUserMessage(params: {
    contextId: string;
    text: string;
    requestId?: string;
    extra?: ContextMetadataV1["extra"];
  }): Promise<void>;
  appendAssistantMessage(params: {
    contextId: string;
    message?: ContextMessageV1 | null;
    fallbackText?: string;
    requestId?: string;
    extra?: ContextMetadataV1["extra"];
  }): Promise<void>;
  model: LanguageModel;
};

/**
 * ServiceRuntime（统一注入对象）。
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
   * 当前 agent 的 `.env` 快照（仅本项目可见）。
   *
   * 关键点（中文）
   * - 用于 service 读取 agent 私有环境变量（如 chat 渠道密钥）。
   * - 不与全局 process.env 混用，避免跨 agent 污染。
   */
  env: Record<string, string>;

  /**
   * 当前生效的系统提示文本集合。
   */
  systems: string[];

  /**
   * 会话能力入口。
   */
  context: ServiceContext;

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
   * 跨 plugin capability 调用入口。
   *
   * 关键点（中文）
   * - 新插件体系下，主动能力调用统一走 capability 名称。
   * - 调用方不应再直接依赖具体 plugin 名称。
   */
  capabilities: CapabilityPort;
  /**
   * Asset 调用入口。
   *
   * 关键点（中文）
   * - 用于检查、安装、解析插件依赖的底层资源对象。
   * - 插件和业务代码都应通过该端口消费 asset，而不是直接拼底层实现路径。
   */
  assets: AssetPort;
  /**
   * Plugin 调用入口。
   *
   * 关键点（中文）
   * - 用于列出 plugin、检查可用性与运行显式 plugin action。
   * - plugin 不维护独立 runtime 状态机，这里只暴露声明式能力面。
   */
  plugins: PluginPort;
};

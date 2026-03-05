/**
 * Agent system 配置类型。
 *
 * 关键点（中文）
 * - 由 ContextAgent 维护，并允许调用方（如 task runner）按上下文覆盖。
 * - 用于控制 runtime system 模式、默认 core prompt 替换、service system 禁用列表。
 */

export type AgentSystemMode = "chat" | "task";

export type AgentSystemConfig = {
  mode?: AgentSystemMode;
  replaceDefaultCorePrompt?: string;
  disableServiceSystems?: string[];
};

export type ResolvedAgentSystemConfig = {
  mode: AgentSystemMode;
  replaceDefaultCorePrompt?: string;
  disableServiceSystems: string[];
};

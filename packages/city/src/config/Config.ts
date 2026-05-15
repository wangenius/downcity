/**
 * City Config 包级转发入口。
 *
 * 关键点（中文）
 * - 配置加载与环境解析统一复用 `@downcity/agent`。
 * - 保留本地 `DowncityConfig` 类型出口，避免 city 内部类型引用断裂。
 */

export type { DowncityConfig } from "@/shared/types/DowncityConfig.js";
export {
  loadDowncityConfig,
  loadGlobalEnvFromStore,
  loadAgentEnvSnapshot,
} from "@downcity/agent";

/**
 * Service 类注册表（单一事实源）。
 *
 * 关键点（中文）
 * - 统一维护所有可注册 service class，避免 Manager/AgentRuntime 各自硬编码。
 * - 这里只声明“有哪些 service class”，不承载运行态逻辑。
 */

import type { AgentRuntime } from "@downcity/agent/types/agent/AgentRuntime.js";
import type { BaseService } from "@downcity/agent/services/BaseService.js";
import { ChatService } from "@downcity/agent/services/chat/ChatService.js";
import { TaskService } from "@downcity/agent/services/task/TaskService.js";
import { MemoryService } from "@downcity/agent/services/memory/MemoryService.js";
import { ShellService } from "@downcity/agent/services/shell/ShellService.js";
import { ContactService } from "@downcity/agent/services/contact/ContactService.js";

/**
 * 单个 service class 构造器。
 */
export type ServiceClass<T extends BaseService = BaseService> = new (
  agent: AgentRuntime | null,
) => T;

/**
 * 全部已注册 service classes。
 */
export const SERVICE_CLASSES: ServiceClass[] = [
  ChatService,
  ContactService,
  TaskService,
  MemoryService,
  ShellService,
];

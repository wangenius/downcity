/**
 * Service 类注册表（单一事实源）。
 *
 * 关键点（中文）
 * - 统一维护所有可注册 service class，避免 Manager/AgentRuntime 各自硬编码。
 * - 这里只声明“有哪些 service class”，不承载运行态逻辑。
 */

import type { AgentRuntime } from "@/types/agent/AgentRuntime.js";
import type { BaseService } from "@services/BaseService.js";
import { ChatService } from "@services/chat/ChatService.js";
import { TaskService } from "@services/task/TaskService.js";
import { MemoryService } from "@services/memory/MemoryService.js";
import { ShellService } from "@services/shell/ShellService.js";
import { ContactService } from "@services/contact/ContactService.js";

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

/**
 * Service 清单（单一事实源）。
 *
 * 关键点（中文）
 * - 统一维护所有可注册服务，避免 Manager/RuntimeState 各自硬编码。
 * - 仅做静态聚合，不承载运行态逻辑。
 */

import type { Service } from "./ServiceManager.js";
import { chatService } from "@services/chat/Index.js";
import { taskService } from "@services/task/Index.js";
import { memoryService } from "@services/memory/Index.js";
import { shellService } from "@services/shell/Index.js";

export const SERVICES: Service[] = [
  chatService,
  taskService,
  memoryService,
  shellService,
];

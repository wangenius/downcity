/**
 * Service 清单（单一事实源）。
 *
 * 关键点（中文）
 * - 统一维护所有可注册服务，避免 Registry/ProcessBindings 各自硬编码。
 * - 仅做静态聚合，不承载运行态逻辑。
 */

import type { Service } from "./ServiceRegistry.js";
import { chatService } from "@services/chat/ServiceEntry.js";
import { skillsService } from "@services/skills/ServiceEntry.js";
import { taskService } from "@services/task/ServiceEntry.js";

const SMA_SERVICES: Service[] = [chatService, skillsService, taskService];

/**
 * 获取已注册服务列表。
 */
export function getRegisteredSmaServices(): Service[] {
  return [...SMA_SERVICES];
}


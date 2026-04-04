/**
 * ServiceSystemProviders：service system prompt 的静态提供器清单。
 *
 * 关键点（中文）
 * - 这里仅负责收集各 service 的 system 文本提供器。
 * - 不依赖完整 service instance，避免把 system 域与 service 运行态耦合在一起。
 * - 这样也能避开 `task -> runner -> prompt system -> service class registry` 的循环依赖。
 */

import type { ExecutionContext } from "@/shared/types/ExecutionContext.js";
import { buildChatServiceSystem } from "@services/chat/runtime/ChatServiceSystem.js";
import { buildMemoryServiceSystemText } from "@services/memory/runtime/SystemProvider.js";
import { TASK_SERVICE_PROMPT } from "@services/task/runtime/TaskServiceSystem.js";

/**
 * 单个 service 的 system provider。
 */
export type ServiceSystemProvider = {
  /**
   * 对应的 service 名称。
   */
  name: string;
  /**
   * 生成该 service system 文本的函数。
   */
  system: (context: ExecutionContext) => Promise<string> | string;
};

/**
 * 全部静态 service system providers。
 */
export const SERVICE_SYSTEM_PROVIDERS: ServiceSystemProvider[] = [
  {
    name: "chat",
    system: buildChatServiceSystem,
  },
  {
    name: "task",
    system: () => TASK_SERVICE_PROMPT,
  },
  {
    name: "memory",
    system: buildMemoryServiceSystemText,
  },
];

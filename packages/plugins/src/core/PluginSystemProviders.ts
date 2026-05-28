/**
 * PluginSystemProviders：plugin system prompt 的静态提供器清单。
 *
 * 关键点（中文）
 * - 这里仅负责收集各 plugin 的 system 文本提供器。
 * - 不依赖完整 plugin instance，避免把 system 域与 plugin 运行态耦合在一起。
 * - 这样也能避开 `task -> runner -> prompt system -> plugin class registry` 的循环依赖。
 */

import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import { buildChatPluginSystem } from "@/builtins/chat/runtime/ChatPluginSystem.js";
import { buildContactPluginSystemText } from "@/builtins/contact/runtime/SystemProvider.js";
import { buildMemoryPluginSystemText } from "@/builtins/memory/runtime/SystemProvider.js";
import { TASK_PLUGIN_PROMPT } from "@/builtins/task/runtime/TaskPluginSystem.js";

/**
 * 单个 plugin 的 system provider。
 */
export type PluginSystemProvider = {
  /**
   * 对应的 plugin 名称。
   */
  name: string;
  /**
   * 生成该 plugin system 文本的函数。
   */
  system: (context: AgentContext) => Promise<string> | string;
};

/**
 * 全部静态 plugin system providers。
 */
export const PLUGIN_SYSTEM_PROVIDERS: PluginSystemProvider[] = [
  {
    name: "chat",
    system: buildChatPluginSystem,
  },
  {
    name: "contact",
    system: buildContactPluginSystemText,
  },
  {
    name: "task",
    system: () => TASK_PLUGIN_PROMPT,
  },
  {
    name: "memory",
    system: buildMemoryPluginSystemText,
  },
];

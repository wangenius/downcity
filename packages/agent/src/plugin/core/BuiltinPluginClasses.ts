/**
 * 内建主动型 plugin 类清单。
 */

import type { AgentRuntime } from "@/core/AgentCoreTypes.js";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import { ChatService } from "@/plugin/builtins/chat/ChatService.js";
import { ContactService } from "@/plugin/builtins/contact/ContactService.js";
import { ScheduleService } from "@/plugin/builtins/schedule/ScheduleService.js";
import { TaskService } from "@/plugin/builtins/task/TaskService.js";
import { MemoryService } from "@/plugin/builtins/memory/MemoryService.js";
import { ShellService } from "@/plugin/builtins/shell/ShellService.js";

/**
 * 单个主动型 plugin class 构造器。
 */
export type BuiltinPluginClass<T extends BasePlugin = BasePlugin> = new (
  agent: AgentRuntime | null,
) => T;

/**
 * 全部内建主动型 plugin classes。
 */
export const BUILTIN_PLUGIN_CLASSES: BuiltinPluginClass[] = [
  ChatService,
  ContactService,
  ScheduleService,
  TaskService,
  MemoryService,
  ShellService,
];

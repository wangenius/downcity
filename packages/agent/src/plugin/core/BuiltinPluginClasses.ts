/**
 * 内建主动型 plugin 类清单。
 */

import type { AgentRuntime } from "@/core/AgentCoreTypes.js";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import { ChatPlugin } from "@/plugin/builtins/chat/ChatPlugin.js";
import { ContactPlugin } from "@/plugin/builtins/contact/ContactPlugin.js";
import { SchedulePlugin } from "@/plugin/builtins/schedule/SchedulePlugin.js";
import { TaskPlugin } from "@/plugin/builtins/task/TaskPlugin.js";
import { MemoryPlugin } from "@/plugin/builtins/memory/MemoryPlugin.js";
import { ShellPlugin } from "@/plugin/builtins/shell/ShellPlugin.js";

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
  ChatPlugin,
  ContactPlugin,
  SchedulePlugin,
  TaskPlugin,
  MemoryPlugin,
  ShellPlugin,
];

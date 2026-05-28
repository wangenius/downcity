/**
 * 内建 plugin class 清单。
 *
 * 关键点（中文）
 * - 所有内建 plugin 统一收敛到一套 `BasePlugin` class 注册表。
 * - 不再保留“plugin runtime / static plugin”两套定义源。
 * - 运行方式差异只通过 plugin 自身能力体现，例如是否声明 `lifecycle`。
 */

import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import { AuthPlugin } from "@/plugin/builtins/auth/Plugin.js";
import { SkillPlugin } from "@/plugin/builtins/skill/Plugin.js";
import { WebPlugin } from "@/plugin/builtins/web/Plugin.js";
import { AsrPlugin } from "@/plugin/builtins/asr/Plugin.js";
import { TtsPlugin } from "@/plugin/builtins/tts/Plugin.js";
import { WorkboardPlugin } from "@/plugin/builtins/workboard/Plugin.js";
import { ChatPlugin } from "@/plugin/builtins/chat/ChatPlugin.js";
import { ContactPlugin } from "@/plugin/builtins/contact/ContactPlugin.js";
import { SchedulePlugin } from "@/plugin/builtins/schedule/SchedulePlugin.js";
import { TaskPlugin } from "@/plugin/builtins/task/TaskPlugin.js";
import { MemoryPlugin } from "@/plugin/builtins/memory/MemoryPlugin.js";
import { ShellPlugin } from "@/plugin/builtins/shell/ShellPlugin.js";

/**
 * 单个内建 plugin class 构造器。
 */
export type BuiltinPluginClass<T extends BasePlugin = BasePlugin> = new (
  agent: AgentRuntime | null,
) => T;

/**
 * 全部内建 plugin classes。
 */
export const BUILTIN_PLUGIN_CLASSES: BuiltinPluginClass[] = [
  AuthPlugin,
  SkillPlugin,
  WebPlugin,
  AsrPlugin,
  TtsPlugin,
  WorkboardPlugin,
  ChatPlugin,
  ContactPlugin,
  SchedulePlugin,
  TaskPlugin,
  MemoryPlugin,
  ShellPlugin,
];

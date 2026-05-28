/**
 * 内建 plugin class 清单。
 *
 * 关键点（中文）
 * - 所有内建 plugin 统一收敛到一套 `BasePlugin` class 注册表。
 * - 不再保留“plugin runtime / static plugin”两套定义源。
 * - 运行方式差异只通过 plugin 自身能力体现，例如是否声明 `lifecycle`。
 */

import type { AgentRuntime } from "@downcity/agent/internal/types/runtime/agent/AgentRuntime.js";
import type { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import { AuthPlugin } from "@/builtins/auth/Plugin.js";
import { SkillPlugin } from "@/builtins/skill/Plugin.js";
import { WebPlugin } from "@/builtins/web/Plugin.js";
import { AsrPlugin } from "@/builtins/asr/Plugin.js";
import { TtsPlugin } from "@/builtins/tts/Plugin.js";
import { WorkboardPlugin } from "@/builtins/workboard/Plugin.js";
import { ChatPlugin } from "@/builtins/chat/ChatPlugin.js";
import { ContactPlugin } from "@/builtins/contact/ContactPlugin.js";
import { SchedulePlugin } from "@/builtins/schedule/SchedulePlugin.js";
import { TaskPlugin } from "@/builtins/task/TaskPlugin.js";
import { MemoryPlugin } from "@/builtins/memory/MemoryPlugin.js";
import { ShellPlugin } from "@/builtins/shell/ShellPlugin.js";

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

/**
 * BuiltinPlugins：Downcity 内建 plugin 实例工厂。
 *
 * 关键点（中文）
 * - 本包只提供具体内建 plugin class 和默认集合创建能力。
 * - 注册、目录视图、HTTP 装配、CLI action 执行都由 `@downcity/agent` 的通用能力处理。
 * - 调用方需要完整内建集合时，显式调用 `createBuiltinPlugins()` 并传给 Agent 或通用 helper。
 */

import type { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import { ChatAuthorizationPlugin } from "@/auth/Plugin.js";
import { SkillPlugin } from "@/skill/Plugin.js";
import { WebPlugin } from "@/web/Plugin.js";
import { WorkboardPlugin } from "@/workboard/Plugin.js";
import { ChatPlugin } from "@/chat/ChatPlugin.js";
import { ContactPlugin } from "@/contact/ContactPlugin.js";
import { TaskPlugin } from "@/task/TaskPlugin.js";
import { MemoryPlugin } from "@/memory/MemoryPlugin.js";
import { ShellPlugin } from "@/shell/ShellPlugin.js";

/**
 * 内建 plugin class 构造器。
 */
export type BuiltinPluginClass<T extends BasePlugin = BasePlugin> = new () => T;

/**
 * 全部内建 plugin classes。
 */
export const BUILTIN_PLUGIN_CLASSES: BuiltinPluginClass[] = [
  ChatAuthorizationPlugin,
  SkillPlugin,
  WebPlugin,
  WorkboardPlugin,
  ChatPlugin,
  ContactPlugin,
  TaskPlugin,
  MemoryPlugin,
  ShellPlugin,
];

/**
 * 创建完整内建 plugin 实例集合。
 */
export function createBuiltinPlugins(): BasePlugin[] {
  return BUILTIN_PLUGIN_CLASSES.map((PluginClass) => new PluginClass());
}

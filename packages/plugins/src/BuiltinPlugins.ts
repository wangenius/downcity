/**
 * BuiltinPlugins：Downcity 内建 plugin 实例工厂。
 *
 * 关键点（中文）
 * - 本包只提供具体内建 plugin class 和默认集合创建能力。
 * - 注册、目录视图、HTTP 装配、CLI action 执行都由 `@downcity/agent` 的通用能力处理。
 * - 调用方需要完整内建集合时，显式调用 `createBuiltinPlugins()` 并传给 Agent 或通用 helper。
 */

import type { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import { SkillPlugin } from "@/skill/Plugin.js";
import { WebPlugin } from "@/web/Plugin.js";
import { WorkboardPlugin } from "@/workboard/Plugin.js";
import { ChatPlugin } from "@/chat/ChatPlugin.js";
import { ContactPlugin } from "@/contact/ContactPlugin.js";
import { TaskPlugin } from "@/task/TaskPlugin.js";
import { MemoryPlugin } from "@/memory/MemoryPlugin.js";
import { ShellPlugin } from "@/shell/ShellPlugin.js";
import { ImagePlugin } from "@/image/ImagePlugin.js";
import { AsrPlugin } from "@/asr/Plugin.js";
import { TtsPlugin } from "@/tts/Plugin.js";
import type { ImagePluginOptions } from "@/image/types/ImagePlugin.js";
import type { AsrPluginOptions } from "@/asr/types/AsrPlugin.js";
import type { TtsPluginOptions } from "@/tts/types/TtsPlugin.js";

/**
 * 内建 plugin class 构造器。
 */
export type BuiltinPluginClass<T extends BasePlugin = BasePlugin> = new () => T;

/**
 * 可直接无参创建的内建 plugin classes。
 *
 * 关键点（中文）：image / asr / tts 需要宿主注入 City AI 能力，不能放入无参 class 列表。
 */
export const BUILTIN_PLUGIN_CLASSES: BuiltinPluginClass[] = [
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
 * 内建 plugin 工厂参数。
 */
export interface BuiltinPluginOptions {
  /**
   * 图片生成 plugin 的 City AI 能力注入。
   */
  image?: ImagePluginOptions;

  /**
   * 语音转写 plugin 的 City AI 能力注入。
   */
  asr?: AsrPluginOptions;

  /**
   * 文本转语音 plugin 的 City AI 能力注入。
   */
  tts?: TtsPluginOptions;
}

/**
 * 创建完整内建 plugin 实例集合。
 */
export function createBuiltinPlugins(options: BuiltinPluginOptions = {}): BasePlugin[] {
  const plugins = BUILTIN_PLUGIN_CLASSES.map((PluginClass) => new PluginClass());
  if (options.image?.image_create && options.image?.image_result) {
    plugins.push(new ImagePlugin(options.image));
  }
  if (options.asr?.asr) {
    plugins.push(new AsrPlugin(options.asr));
  }
  if (options.tts?.tts) {
    plugins.push(new TtsPlugin(options.tts));
  }
  return plugins;
}

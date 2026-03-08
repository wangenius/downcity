/**
 * Extension 清单（单一事实源）。
 *
 * 关键点（中文）
 * - 统一维护所有可注册 extension，避免各层硬编码。
 * - 仅做静态聚合，不承载运行态逻辑。
 */

import type { Extension } from "./ExtensionManager.js";
import { voiceExtension } from "@/extensions/voice/Index.js";

export const EXTENSIONS: Extension[] = [voiceExtension];

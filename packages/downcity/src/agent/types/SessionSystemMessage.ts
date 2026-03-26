/**
 * SessionSystemMessage：Session 运行阶段使用的 system message。
 *
 * 关键点（中文）
 * - 当前实现与 AI SDK 的 `SystemModelMessage` 等价。
 * - 单独抽出类型别名，便于后续把“context 语义 system”与底层 provider 类型解耦。
 */

import type { SystemModelMessage } from "ai";

/**
 * Context system message 类型别名。
 */
export type SessionSystemMessage = SystemModelMessage;

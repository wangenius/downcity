/**
 * Control 消息时间线 helper。
 *
 * 关键点（中文）
 * - 负责把上下文消息映射成 control UI 可视时间线。
 * - 同时提供消息文件读取能力。
 */
import type { SessionMessageV1 } from "@downcity/agent/internal/executor/types/SessionMessages.js";
import type { ControlTimelineEvent } from "@/agent/control/types/ControlViewData.js";
/**
 * 转成 control 时间线。
 */
export declare function toUiMessageTimeline(message: SessionMessageV1): ControlTimelineEvent[];
/**
 * 读取 session 消息文件。
 */
export declare function loadSessionMessagesFromFile(filePath: string): Promise<SessionMessageV1[]>;
/**
 * 读取适合摘要展示的消息预览文本。
 */
export declare function resolveUiMessagePreview(message: SessionMessageV1): string;
//# sourceMappingURL=MessageTimeline.d.ts.map
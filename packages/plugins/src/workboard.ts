/**
 * `@downcity/plugins/workboard` 独立公开入口。
 *
 * 关键点（中文）：只汇总 WorkboardPlugin 及其公开快照协议类型。
 */

export { WorkboardPlugin } from "./workboard/Plugin.js";
export type {
  WorkboardActivityItem,
  WorkboardActivityKind,
  WorkboardActivityStatus,
  WorkboardAgentSummary,
  WorkboardSignalItem,
  WorkboardSignalTone,
  WorkboardSnapshot,
  WorkboardSnapshotResponse,
  WorkboardSummary,
} from "./workboard/types/Workboard.js";

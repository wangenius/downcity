/**
 * Session system 显式快照存储类型。
 *
 * 关键点（中文）
 * - 这里只描述 instruction.md 的定位与写入输入。
 * - 文件存在性本身用于表达 Session 是否启用显式 system 快照。
 */

/** Session instruction.md 的稳定定位信息。 */
export interface SessionInstructionStorageLocation {
  /** 当前项目根目录。 */
  project_root: string;
  /** 当前 Agent 稳定标识。 */
  agent_id: string;
  /** 当前 Session 稳定标识。 */
  session_id: string;
}

/** 原子写入 Session instruction.md 使用的完整输入。 */
export interface WriteSessionInstructionInput
  extends SessionInstructionStorageLocation {
  /** 当前 Session 首次生成后固定的完整 system Markdown。 */
  instruction: string;
}

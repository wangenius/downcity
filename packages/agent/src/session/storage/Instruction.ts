/**
 * Session instruction 显式快照存储。
 *
 * 关键点（中文）
 * - instruction.md 是可选文件，不存在时由 Session 使用 Agent 当前 instruction。
 * - 空文件也是有效快照，用于显式固化没有自定义 instruction 的状态。
 * - 写入使用同目录临时文件替换，避免进程中断留下半份内容。
 */

import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import { getSdkAgentSessionInstructionPath } from "@/session/storage/Paths.js";
import type {
  SessionInstructionStorageLocation,
  WriteSessionInstructionInput,
} from "@/types/session/SessionInstruction.js";

/** 读取 Session 显式固化的 instruction；文件不存在时返回 null。 */
export async function read_session_instruction(
  input: SessionInstructionStorageLocation,
): Promise<string | null> {
  const instruction_path = getSdkAgentSessionInstructionPath(
    input.project_root,
    input.agent_id,
    input.session_id,
  );
  try {
    return await fs.readFile(instruction_path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** 原子覆盖当前 Session 的 instruction.md。 */
export async function write_session_instruction(
  input: WriteSessionInstructionInput,
): Promise<void> {
  const instruction_path = getSdkAgentSessionInstructionPath(
    input.project_root,
    input.agent_id,
    input.session_id,
  );
  const temporary_path = [
    instruction_path,
    process.pid,
    Date.now(),
    randomUUID(),
    "tmp",
  ].join(".");
  await fs.ensureDir(path.dirname(instruction_path));
  try {
    await fs.writeFile(temporary_path, input.instruction, "utf8");
    await fs.move(temporary_path, instruction_path, { overwrite: true });
  } finally {
    await fs.remove(temporary_path);
  }
}

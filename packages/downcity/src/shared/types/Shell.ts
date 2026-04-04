/**
 * Shell 工具类型定义。
 *
 * 关键点（中文）
 * - 统一沉淀 `shell_start/shell_status/shell_read/shell_write/shell_wait/shell_close` 类型。
 * - `shell_id` 与 chat `sessionId` 严格分离，避免语义混淆。
 */

export type ShellStartInput = {
  cmd: string;
  workdir?: string;
  shell?: string;
  login?: boolean;
  inline_wait_ms?: number;
  max_output_tokens?: number;
  auto_notify_on_exit?: boolean;
};

export type ShellExecInput = {
  cmd: string;
  workdir?: string;
  shell?: string;
  login?: boolean;
  timeout_ms?: number;
  max_output_tokens?: number;
};

export type ShellStatusInput = {
  shell_id?: string;
  cmd?: string;
};

export type ShellReadInput = {
  shell_id: string;
  from_cursor?: number;
  max_output_tokens?: number;
};

export type ShellWriteInput = {
  shell_id: string;
  chars: string;
};

export type ShellWaitInput = {
  shell_id: string;
  after_version?: number;
  from_cursor?: number;
  timeout_ms?: number;
  max_output_tokens?: number;
};

export type ShellCloseInput = {
  shell_id: string;
  force?: boolean;
};

/**
 * Shell tool 输入 schema。
 *
 * 关键点（中文）
 * - 所有 schema 统一集中，避免 `Tool.ts` 里同时混杂协议定义与执行逻辑。
 * - 这里保持纯声明，不放任何运行时桥接细节。
 */

import { z } from "zod";

export const shellStartInputSchema = z.object({
  cmd: z.string().describe("Shell command to execute."),
  workdir: z
    .string()
    .optional()
    .describe("Optional working directory. Relative path is resolved from project root."),
  shell: z
    .string()
    .optional()
    .describe("Optional shell executable path. Example: /bin/zsh"),
  login: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to run shell as login shell (-lc). false uses -c."),
  inline_wait_ms: z
    .number()
    .optional()
    .default(1200)
    .describe("How long to inline-wait for initial output before returning."),
  max_output_tokens: z
    .number()
    .optional()
    .describe("Maximum output tokens returned in a single read chunk."),
  auto_notify_on_exit: z
    .boolean()
    .optional()
    .describe("Whether the shell service should auto-return to the owning chat agent when the command exits."),
});

export const shellExecInputSchema = z.object({
  cmd: z.string().describe("Shell command to execute once and wait until completion."),
  workdir: z
    .string()
    .optional()
    .describe("Optional working directory. Relative path is resolved from project root."),
  shell: z
    .string()
    .optional()
    .describe("Optional shell executable path. Example: /bin/zsh"),
  login: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to run shell as login shell (-lc). false uses -c."),
  timeout_ms: z
    .number()
    .optional()
    .default(60000)
    .describe("Total timeout for one-shot execution. Use shell_start for long-running commands."),
  max_output_tokens: z
    .number()
    .optional()
    .describe("Maximum output tokens returned in the final result."),
});

export const shellStatusInputSchema = z.object({
  shell_id: z.string().optional().describe("Existing shell identifier."),
  cmd: z
    .string()
    .optional()
    .describe("Optional command substring to resolve the latest shell in the current chat."),
});

export const shellReadInputSchema = z.object({
  shell_id: z.string().describe("Existing shell identifier."),
  from_cursor: z
    .number()
    .optional()
    .describe("Character cursor to continue reading from."),
  max_output_tokens: z
    .number()
    .optional()
    .describe("Maximum output tokens returned in this chunk."),
});

export const shellWriteInputSchema = z.object({
  shell_id: z.string().describe("Existing shell identifier."),
  chars: z.string().describe("Bytes to write to stdin."),
});

export const shellWaitInputSchema = z.object({
  shell_id: z.string().describe("Existing shell identifier."),
  after_version: z
    .number()
    .optional()
    .describe("Only return once the shell version is greater than this value."),
  from_cursor: z
    .number()
    .optional()
    .describe("Character cursor to continue reading from after the wait."),
  timeout_ms: z
    .number()
    .optional()
    .default(10000)
    .describe("Maximum time to wait for state/output changes."),
  max_output_tokens: z
    .number()
    .optional()
    .describe("Maximum output tokens returned in this chunk."),
});

export const shellCloseInputSchema = z.object({
  shell_id: z.string().describe("Existing shell identifier."),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to force-kill the shell with SIGKILL."),
});

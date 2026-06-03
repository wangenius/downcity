/**
 * Shell 工具辅助函数。
 *
 * 关键点（中文）
 * - shell 会话生命周期已经统一收敛到 shell plugin runtime。
 * - 这里仅保留当前仍被 tool 与测试复用的最小能力：命令安全校验。
 */

/**
 * 对 `town chat send` 命令做前置安全校验。
 *
 * 关键点（中文）
 * - 历史上模型会把长文本直接拼进多行 shell 命令，导致后续行被 zsh 当作独立命令解析。
 * - 这会出现“前面已发送，后面才报错”的副作用。
 * - 默认建议多行正文通过 `--stdin`、`--text-file` 或显式 `--text` 传入。
 */
export function validateChatSendCommand(cmd: string): string | null {
  const source = String(cmd ?? "");
  if (!/\bbay\s+chat\s+send\b/.test(source)) return null;
  if (!/[\r\n]/.test(source)) return null;
  if (/\bbay\s+chat\s+send\b[\s\S]*\s--stdin(?:\s|$)/.test(source)) {
    return null;
  }
  if (/\bbay\s+chat\s+send\b[\s\S]*\s--text(?:\s|$)/.test(source)) {
    return null;
  }
  if (/\bbay\s+chat\s+send\b[\s\S]*\s--text-file(?:\s|$)/.test(source)) {
    return null;
  }
  return [
    "Unsafe `town chat send` command: real newlines are not allowed.",
    "If your message is multi-line, use `town chat send --stdin` (with heredoc/pipe), `--text-file`, or explicit `--text`.",
  ].join(" ");
}

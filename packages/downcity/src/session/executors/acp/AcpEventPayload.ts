/**
 * AcpEventPayload：ACP 原生事件 payload 标准化工具。
 *
 * 关键点（中文）
 * - `sessionUpdate` 是 ACP union discriminator，落盘 data part 时不重复保存。
 * - 只过滤 undefined，保留 null / false / 空数组等协议侧有意义的值。
 */

/**
 * 把 ACP session/update 原始对象转换成可写入 data part 的 payload。
 */
export function normalizeAcpEventPayload(
  update: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(update)) {
    if (key === "sessionUpdate") continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

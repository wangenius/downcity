/**
 * Cloudflare D1 admin key 输出解析模块。
 *
 * 关键说明（中文）
 * - Wrangler `d1 execute --json` 返回执行结果数组，本模块只提取查询行中的 value。
 * - 解析失败或查询结果为空时返回 undefined，由部署器统一提供可操作错误。
 */

/** 从 Wrangler D1 JSON 输出中提取 admin key。 */
export function extract_cloudflare_admin_key(output: string): string | undefined {
  try {
    const parsed = JSON.parse(output) as unknown;
    const executions = Array.isArray(parsed) ? parsed : [parsed];
    for (const execution of executions) {
      if (!is_record(execution) || !Array.isArray(execution.results)) continue;
      for (const row of execution.results) {
        if (!is_record(row)) continue;
        const value = typeof row.value === "string" ? row.value.trim() : "";
        if (value) return value;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** 判断未知值是否为普通记录。 */
function is_record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

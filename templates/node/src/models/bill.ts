/**
 * Node 模板模型出账工具。
 *
 * 关键点（中文）
 * - 模型在注册时通过 bill() 生成账单行。
 * - BalanceService 负责真正扣款和记录账单。
 */

import type { Context } from "@downcity/city";

const CHAT_REQUEST_COST_MICROCREDITS = 10_000;

/**
 * 生成一次 AI 调用的账单行。
 */
export function bill_ai_request(ctx: Context, output: unknown, amount_microcredits = CHAT_REQUEST_COST_MICROCREDITS) {
  const mode = String(ctx.metering?.metadata?.mode ?? "request");
  return {
    amount_microcredits,
    note: `AI ${mode}`,
    ref: read_bill_ref(output),
    metadata: {
      service_id: "ai",
      action_id: mode,
      model_id: ctx.metering?.model_id ?? ctx.variant?.id,
      provider_id: ctx.metering?.provider_id,
    },
  };
}

/**
 * 从输出对象中提取账单引用。
 */
function read_bill_ref(output: unknown): string | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) return undefined;
  const record = output as Record<string, unknown>;
  const ref = record.job_id ?? record.id ?? record.ref;
  return typeof ref === "string" && ref.trim() ? ref.trim() : undefined;
}

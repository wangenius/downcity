/**
 * Downcity 官方 Billing 服务实现。
 *
 * 设计边界：
 * - usage 负责记录事实，billing 负责把事实换算成 charge
 * - balance 负责真正的钱包扣减与流水
 * - pricing rule 使用 microcredits，1 credit = 1 USD = 1_000_000 microcredits
 */

import {
  InstallableService,
  type Context,
  type ServiceInstallContext,
} from "@downcity/city";
import { rawAll, rawFirst, rawRun } from "../balance/raw.ts";
import { microcreditsToCredits } from "../balance/amount.ts";
import { billingCharges, billingPricingRules, CHARGE_TABLE, PRICING_RULE_TABLE } from "./schema.ts";
import { registerBillingRoutes } from "./routes.ts";
import type {
  BillingBalanceBridge,
  BillingCharge,
  BillingChargeInput,
  BillingChargeQuery,
  BillingPricingRule,
  BillingPricingRuleInput,
  BillingPricingRuleQuery,
  BillingServiceOptions,
} from "./types.ts";

const TOKENS_PER_MTOKEN = 1_000_000;
const PRICING_RULE_COLUMNS = [
  "rule_id",
  "service_id",
  "action_id",
  "model_id",
  "provider_id",
  "request_microcredits",
  "input_token_microcredits",
  "input_mtoken_microcredits",
  "output_token_microcredits",
  "output_mtoken_microcredits",
  "cached_token_microcredits",
  "cached_mtoken_microcredits",
  "image_microcredits",
  "status",
  "note",
  "created_at",
  "updated_at",
].join(", ");
const PRICING_RULE_MTOKEN_COLUMNS = [
  "input_mtoken_microcredits",
  "output_mtoken_microcredits",
  "cached_mtoken_microcredits",
];

/**
 * Billing 服务实例。
 */
export class BillingService extends InstallableService {
  readonly id = "billing";
  readonly name = "Billing";
  readonly version = "0.1.0";
  readonly schema = {
    pricing_rules: billingPricingRules,
    charges: billingCharges,
  };

  private readonly balance: BillingBalanceBridge;
  private readonly initialRules: BillingPricingRuleInput[];
  private readonly requireBeforeCall: boolean;

  constructor(options: BillingServiceOptions) {
    super();
    this.balance = options.balance;
    this.initialRules = options.pricing_rules ?? [];
    this.requireBeforeCall = options.require_before_call !== false;
    this.instruction = [
      "根据 service 调用的标准 metering 计算扣费，并通过 balance 执行 microcredits 扣款。",
      "pricing rule 使用 microcredits：1 credit = 1 USD = 1_000_000 microcredits。",
      "Billing 不负责 provider 调用，也不替代 usage 事实层。",
    ].join("\n");
  }

  async _onInit(): Promise<void> {
    await super._onInit();
    await this.ensurePricingRuleColumns();
    for (const rule of this.initialRules) {
      await this.upsertPricingRule(rule);
    }
  }

  install(ctx: ServiceInstallContext): void {
    registerBillingRoutes(this, ctx);

    if (this.requireBeforeCall) {
      ctx.hook.before(async (serviceCtx) => {
        if (!shouldBill(serviceCtx)) return;
        const rule = await this.resolvePricingRule(serviceCtx);
        if (!rule) return;
        const amount_microcredits = calculateChargeAmount(serviceCtx, rule, { estimate: true });
        if (amount_microcredits <= 0) return;
        await this.balance.requireMicrocredits(serviceCtx.user!.user_id, amount_microcredits);
      });
    }

    ctx.hook.after(async (serviceCtx) => {
      if (!shouldBill(serviceCtx)) return;
      if (serviceCtx.locals.ai_billing_handled) return;
      if (!isSuccessfulOutput(serviceCtx.output)) return;
      await this.settle(serviceCtx);
    });
  }

  /**
   * 新增或更新 pricing rule。
   */
  async upsertPricingRule(input: BillingPricingRuleInput): Promise<BillingPricingRule> {
    const now = new Date().toISOString();
    const rule = normalizePricingRule(input, now);
    const existing = await this.readPricingRule(rule.rule_id);
    if (existing) {
      await rawRun(this.resolveRaw(), [
        `UPDATE ${PRICING_RULE_TABLE}`,
        "SET service_id = ?, action_id = ?, model_id = ?, provider_id = ?, request_microcredits = ?, input_token_microcredits = ?, input_mtoken_microcredits = ?, output_token_microcredits = ?, output_mtoken_microcredits = ?, cached_token_microcredits = ?, cached_mtoken_microcredits = ?, image_microcredits = ?, status = ?, note = ?, updated_at = ?",
        "WHERE rule_id = ?",
      ].join(" "), [
        rule.service_id,
        rule.action_id,
        rule.model_id,
        rule.provider_id,
        rule.request_microcredits,
        rule.input_token_microcredits,
        rule.input_mtoken_microcredits,
        rule.output_token_microcredits,
        rule.output_mtoken_microcredits,
        rule.cached_token_microcredits,
        rule.cached_mtoken_microcredits,
        rule.image_microcredits,
        rule.status,
        rule.note,
        now,
        rule.rule_id,
      ]);
      return await this.readPricingRuleRequired(rule.rule_id);
    }

    await rawRun(this.resolveRaw(), [
      `INSERT INTO ${PRICING_RULE_TABLE} (${PRICING_RULE_COLUMNS})`,
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ].join(" "), [
      rule.rule_id,
      rule.service_id,
      rule.action_id,
      rule.model_id,
      rule.provider_id,
      rule.request_microcredits,
      rule.input_token_microcredits,
      rule.input_mtoken_microcredits,
      rule.output_token_microcredits,
      rule.output_mtoken_microcredits,
      rule.cached_token_microcredits,
      rule.cached_mtoken_microcredits,
      rule.image_microcredits,
      rule.status,
      rule.note,
      rule.created_at,
      rule.updated_at,
    ]);
    return await this.readPricingRuleRequired(rule.rule_id);
  }

  /**
   * 列出 pricing rules。
   */
  async listPricingRules(query: BillingPricingRuleQuery = {}): Promise<BillingPricingRule[]> {
    const rows = await rawAll<BillingPricingRule>(this.resolveRaw(), [
      `SELECT ${PRICING_RULE_COLUMNS} FROM ${PRICING_RULE_TABLE}`,
      "ORDER BY updated_at DESC, rowid DESC",
      "LIMIT ?",
    ].join(" "), [normalizeLimit(query.limit)]);
    return rows.map(parsePricingRuleRow);
  }

  /**
   * 列出 charge。
   */
  async listCharges(query: BillingChargeQuery = {}): Promise<BillingCharge[]> {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (query.user_id) {
      clauses.push("user_id = ?");
      params.push(String(query.user_id));
    }
    if (query.town_id) {
      clauses.push("town_id = ?");
      params.push(String(query.town_id));
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await rawAll<BillingCharge>(this.resolveRaw(), [
      `SELECT charge_id, user_id, town_id, service_id, action_id, model_id, provider_id, rule_id, amount_microcredits, status, note, metadata_json, created_at FROM ${CHARGE_TABLE}`,
      where,
      "ORDER BY created_at DESC, rowid DESC",
      "LIMIT ?",
    ].join(" "), [...params, normalizeLimit(query.limit)]);
    return rows.map(parseChargeRow);
  }

  /**
   * 对当前 service 调用执行结算。
   */
  async settle(ctx: Context): Promise<BillingCharge | undefined> {
    const rule = await this.resolvePricingRule(ctx);
    if (!rule) return undefined;
    const amount_microcredits = calculateChargeAmount(ctx, rule, { estimate: false });
    if (amount_microcredits <= 0) return undefined;

    const charge = await this.createCharge(ctx, rule, amount_microcredits);
    await this.balance.subMicrocredits(ctx.user!.user_id, amount_microcredits, {
      note: charge.note,
      ref: charge.charge_id,
      meta: {
        charge_id: charge.charge_id,
        service_id: charge.service_id,
        action_id: charge.action_id,
        model_id: charge.model_id,
        provider_id: charge.provider_id,
        rule_id: charge.rule_id,
        metering: ctx.metering ?? {},
      },
    });
    return charge;
  }

  /**
   * 显式扣费。
   *
   * 关键说明（中文）
   * - AI Provider 可以自行完成 usage 与价格换算，然后通过 AIService 调用这里。
   * - Billing 只负责扣余额和记录账单，不理解 provider 内部 usage 结构。
   */
  async charge(input: BillingChargeInput): Promise<BillingCharge | undefined> {
    if (!shouldBill(input.ctx)) return undefined;
    const amount_microcredits = normalizeNonNegativeInteger(input.amount_microcredits, "amount_microcredits");
    if (amount_microcredits <= 0) return undefined;
    const charge = await this.createCharge(input.ctx, undefined, amount_microcredits, {
      note: input.note,
      metadata: input.metadata,
    });
    await this.balance.subMicrocredits(input.ctx.user!.user_id, amount_microcredits, {
      note: charge.note,
      ref: charge.charge_id,
      meta: {
        charge_id: charge.charge_id,
        service_id: charge.service_id,
        action_id: charge.action_id,
        model_id: charge.model_id,
        provider_id: charge.provider_id,
        explicit_billing: true,
        ...(input.metadata ? { billing: input.metadata } : {}),
      },
    });
    return charge;
  }

  private async createCharge(
    ctx: Context,
    rule: BillingPricingRule | undefined,
    amount_microcredits: number,
    options: {
      note?: string;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<BillingCharge> {
    const now = new Date().toISOString();
    const charge: BillingCharge = {
      charge_id: `chg_${randomId()}`,
      user_id: ctx.user?.user_id ?? "",
      town_id: ctx.town?.town_id ?? "",
      service_id: ctx.service?.id ?? "",
      action_id: ctx.action?.id ?? "",
      model_id: ctx.variant?.id ?? ctx.metering?.model_id ?? "",
      provider_id: ctx.metering?.provider_id ?? "",
      rule_id: rule?.rule_id ?? "",
      amount: microcreditsToCredits(amount_microcredits),
      amount_microcredits,
      status: "settled",
      note: options.note || `${ctx.service?.id ?? "service"} ${ctx.action?.id ?? "action"}`,
      metadata_json: JSON.stringify({
        metering: ctx.metering ?? {},
        pricing_rule: rule?.rule_id ?? "",
        ...(options.metadata ? { billing: options.metadata } : {}),
      }),
      created_at: now,
    };

    await rawRun(this.resolveRaw(), [
      `INSERT INTO ${CHARGE_TABLE} (charge_id, user_id, town_id, service_id, action_id, model_id, provider_id, rule_id, amount_microcredits, status, note, metadata_json, created_at)`,
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ].join(" "), [
      charge.charge_id,
      charge.user_id,
      charge.town_id,
      charge.service_id,
      charge.action_id,
      charge.model_id,
      charge.provider_id,
      charge.rule_id,
      charge.amount_microcredits,
      charge.status,
      charge.note,
      charge.metadata_json,
      charge.created_at,
    ]);

    return charge;
  }

  private async resolvePricingRule(ctx: Context): Promise<BillingPricingRule | undefined> {
    const rules = (await this.listPricingRules({ limit: 200 }))
      .filter((rule) => rule.status === "active")
      .filter((rule) => matchesRule(rule.service_id, ctx.service?.id ?? ""))
      .filter((rule) => matchesRule(rule.action_id, ctx.action?.id ?? ""))
      .filter((rule) => matchesRule(rule.model_id, ctx.variant?.id ?? ctx.metering?.model_id ?? ""))
      .filter((rule) => matchesRule(rule.provider_id, ctx.metering?.provider_id ?? ""));

    return rules.sort((a, b) => scoreRule(b) - scoreRule(a))[0];
  }

  private async readPricingRule(rule_id: string): Promise<BillingPricingRule | undefined> {
    const row = await rawFirst<BillingPricingRule>(this.resolveRaw(), [
      `SELECT ${PRICING_RULE_COLUMNS} FROM ${PRICING_RULE_TABLE}`,
      "WHERE rule_id = ?",
    ].join(" "), [rule_id]);
    return row ? parsePricingRuleRow(row) : undefined;
  }

  private async readPricingRuleRequired(rule_id: string): Promise<BillingPricingRule> {
    const row = await this.readPricingRule(rule_id);
    if (!row) throw new Error(`pricing rule not found: ${rule_id}`);
    return row;
  }

  private async ensurePricingRuleColumns(): Promise<void> {
    for (const column of PRICING_RULE_MTOKEN_COLUMNS) {
      try {
        await rawRun(this.resolveRaw(), `ALTER TABLE ${PRICING_RULE_TABLE} ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`, []);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/duplicate column|already exists/i.test(message)) throw error;
      }
    }
  }

  private resolveRaw(): unknown {
    if (!this._raw) {
      throw new Error("billing service raw database is not ready");
    }
    return this._raw;
  }
}

/**
 * 创建 Billing 服务实例。
 */
export function billingService(options: BillingServiceOptions): BillingService {
  return new BillingService(options);
}

/**
 * 是否应该对当前调用计费。
 */
function shouldBill(ctx: Context): boolean {
  return Boolean(ctx.identity?.kind === "user" && ctx.user?.user_id && ctx.town?.town_id && ctx.service?.id !== "billing");
}

/**
 * 判断输出是否成功。
 */
function isSuccessfulOutput(output: unknown): boolean {
  return !(output instanceof Response) || output.status < 400;
}

/**
 * 计算扣费金额。
 */
function calculateChargeAmount(
  ctx: Context,
  rule: BillingPricingRule,
  options: { estimate: boolean },
): number {
  const metering = ctx.metering ?? {};
  const request_count = Number(metering.request_count ?? 1);
  const input_tokens = options.estimate ? 0 : Number(metering.input_tokens ?? 0);
  const output_tokens = options.estimate ? 0 : Number(metering.output_tokens ?? 0);
  const cached_tokens = options.estimate ? 0 : Number(metering.cached_tokens ?? 0);
  const image_count = options.estimate ? 0 : Number(metering.image_count ?? 0);

  const total = request_count * rule.request_microcredits
    + input_tokens * rule.input_token_microcredits
    + (input_tokens * rule.input_mtoken_microcredits) / TOKENS_PER_MTOKEN
    + output_tokens * rule.output_token_microcredits
    + (output_tokens * rule.output_mtoken_microcredits) / TOKENS_PER_MTOKEN
    + cached_tokens * rule.cached_token_microcredits
    + (cached_tokens * rule.cached_mtoken_microcredits) / TOKENS_PER_MTOKEN
    + image_count * rule.image_microcredits;

  return Number.isFinite(total) && total > 0 ? Math.ceil(total) : 0;
}

/**
 * 规则字段为空时表示 fallback。
 */
function matchesRule(rule_value: string, actual_value: string): boolean {
  return !rule_value || rule_value === actual_value;
}

/**
 * 规则越具体优先级越高。
 */
function scoreRule(rule: BillingPricingRule): number {
  return [
    rule.service_id,
    rule.action_id,
    rule.model_id,
    rule.provider_id,
  ].filter(Boolean).length;
}

/**
 * 标准化 pricing rule。
 */
function normalizePricingRule(input: BillingPricingRuleInput, now: string): BillingPricingRule {
  const service_id = normalizeText(input.service_id ?? "ai");
  const action_id = normalizeText(input.action_id ?? "");
  const model_id = normalizeText(input.model_id ?? "");
  const provider_id = normalizeText(input.provider_id ?? "");
  return {
    rule_id: normalizeText(input.rule_id) || `price_${randomId()}`,
    service_id,
    action_id,
    model_id,
    provider_id,
    request_microcredits: normalizeNonNegativeInteger(input.request_microcredits ?? 0, "request_microcredits"),
    input_token_microcredits: normalizeNonNegativeInteger(input.input_token_microcredits ?? 0, "input_token_microcredits"),
    input_mtoken_microcredits: normalizeNonNegativeInteger(input.input_mtoken_microcredits ?? 0, "input_mtoken_microcredits"),
    output_token_microcredits: normalizeNonNegativeInteger(input.output_token_microcredits ?? 0, "output_token_microcredits"),
    output_mtoken_microcredits: normalizeNonNegativeInteger(input.output_mtoken_microcredits ?? 0, "output_mtoken_microcredits"),
    cached_token_microcredits: normalizeNonNegativeInteger(input.cached_token_microcredits ?? 0, "cached_token_microcredits"),
    cached_mtoken_microcredits: normalizeNonNegativeInteger(input.cached_mtoken_microcredits ?? 0, "cached_mtoken_microcredits"),
    image_microcredits: normalizeNonNegativeInteger(input.image_microcredits ?? 0, "image_microcredits"),
    status: input.status === "disabled" ? "disabled" : "active",
    note: normalizeText(input.note),
    created_at: now,
    updated_at: now,
  };
}

/**
 * 解析 pricing rule 行。
 */
function parsePricingRuleRow(row: BillingPricingRule): BillingPricingRule {
  return {
    rule_id: String(row.rule_id),
    service_id: String(row.service_id ?? ""),
    action_id: String(row.action_id ?? ""),
    model_id: String(row.model_id ?? ""),
    provider_id: String(row.provider_id ?? ""),
    request_microcredits: Number(row.request_microcredits ?? 0),
    input_token_microcredits: Number(row.input_token_microcredits ?? 0),
    input_mtoken_microcredits: Number(row.input_mtoken_microcredits ?? 0),
    output_token_microcredits: Number(row.output_token_microcredits ?? 0),
    output_mtoken_microcredits: Number(row.output_mtoken_microcredits ?? 0),
    cached_token_microcredits: Number(row.cached_token_microcredits ?? 0),
    cached_mtoken_microcredits: Number(row.cached_mtoken_microcredits ?? 0),
    image_microcredits: Number(row.image_microcredits ?? 0),
    status: row.status === "disabled" ? "disabled" : "active",
    note: String(row.note ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/**
 * 解析 charge 行。
 */
function parseChargeRow(row: BillingCharge): BillingCharge {
  const amount_microcredits = Number(row.amount_microcredits ?? 0);
  return {
    charge_id: String(row.charge_id),
    user_id: String(row.user_id ?? ""),
    town_id: String(row.town_id ?? ""),
    service_id: String(row.service_id ?? ""),
    action_id: String(row.action_id ?? ""),
    model_id: String(row.model_id ?? ""),
    provider_id: String(row.provider_id ?? ""),
    rule_id: String(row.rule_id ?? ""),
    amount: microcreditsToCredits(amount_microcredits),
    amount_microcredits,
    status: row.status === "skipped" ? "skipped" : "settled",
    note: String(row.note ?? ""),
    metadata_json: String(row.metadata_json ?? "{}"),
    created_at: String(row.created_at ?? ""),
  };
}

/**
 * 标准化非负整数。
 */
function normalizeNonNegativeInteger(value: unknown, label: string): number {
  const normalized = Number(value ?? 0);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return normalized;
}

/**
 * 标准化 limit。
 */
function normalizeLimit(value: unknown): number {
  const normalized = Number(value ?? 20);
  if (!Number.isInteger(normalized) || normalized <= 0) return 20;
  return Math.min(normalized, 200);
}

/**
 * 标准化文本。
 */
function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * 生成随机 ID。
 */
function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

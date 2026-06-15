/**
 * Payment 统一服务类型定义。
 *
 * 关键说明（中文）
 * - `payment` 是唯一对外服务，Stripe / Creem / Dodo / Waffo 都是 provider。
 * - provider 只负责创建 checkout、解析 webhook 和声明自身配置。
 * - 支付记录、webhook 事件和 balance 入账都由 PaymentService 统一负责。
 */

import type { EnvRequirement } from "@downcity/city";

/**
 * 支付方式展示模式。
 */
export type PaymentMethodType = "checkout";

/**
 * 支付方式不可用原因。
 */
export type PaymentMethodReason = "not_configured" | "not_supported";

/**
 * 统一支付状态。
 */
export type PaymentStatus = "pending" | "paid" | "expired" | "failed" | "canceled";

/**
 * 统一 webhook 同步状态。
 */
export type PaymentEventSyncStatus = "pending" | "applied" | "ignored" | "failed";

/**
 * 充值单最小只读视图。
 */
export interface PaymentTopupRecord extends Record<string, unknown> {
  /** 充值单 ID。 */
  topup_id: string;
  /** 充值目标用户 ID。 */
  user_id: string;
  /** 充值金额，单位为 microcredits。 */
  amount: number;
  /** 充值金额，单位为 USD cents，用于支付 provider。 */
  amount_usd_cents?: number;
  /** 充值单状态。 */
  status: string;
  /** 充值说明。 */
  note: string;
}

/**
 * Payment 服务所需的 balance 最小桥接接口。
 */
export interface PaymentServiceBalanceBridge {
  /** 读取充值单。 */
  readTopup(topup_id: string): Promise<PaymentTopupRecord>;

  /** 完成充值单并真正入账。 */
  finishTopup(
    topup_id: string,
    extra?: {
      /** 说明文本。 */
      note?: string;
      /** 外部引用 ID。 */
      ref?: string;
      /** 结构化扩展字段。 */
      meta?: Record<string, unknown>;
    },
  ): Promise<PaymentTopupRecord>;
}

/**
 * 单个支付方式返回项。
 */
export interface PaymentMethodItem {
  /** 支付方式唯一标识，例如 `stripe`。 */
  id: string;
  /** 支付方式模式。 */
  type: PaymentMethodType;
  /** 当前 City 是否实际开放该支付方式。 */
  enabled: boolean;
  /** 展示给前端的支付方式名称。 */
  label: string;
  /** 发起支付时应调用的 service id，统一为 `payment`。 */
  service: string;
  /** 发起支付时应调用的 action id，统一为 `checkout/create`。 */
  action: string;
  /** 是否要求用户先登录再发起支付。 */
  requires_user: boolean;
  /** 当前默认结算币种。 */
  currency: string;
  /** 未启用原因。 */
  reason?: PaymentMethodReason;
}

/**
 * provider 解析 method 时可用的上下文。
 */
export interface PaymentProviderContext {
  /** 读取 City runtime env。 */
  env(key: string): string | undefined;
}

/**
 * provider 创建 checkout 的输入。
 */
export interface PaymentProviderCheckoutInput {
  /** 服务内部 payment ID。 */
  payment_id: string;
  /** 充值单快照。 */
  topup: PaymentTopupRecord;
  /** 当前请求。 */
  request: Request;
  /** City runtime env 上下文。 */
  ctx: PaymentProviderContext;
  /** 支付成功跳转地址。 */
  success_url: string;
  /** 支付取消跳转地址。 */
  cancel_url: string;
}

/**
 * provider 创建 checkout 的结果。
 */
export interface PaymentProviderCheckoutResult {
  /** provider checkout/session ID。 */
  provider_session_id: string;
  /** provider payment ID。 */
  provider_payment_id?: string;
  /** provider order ID。 */
  provider_order_id?: string;
  /** 第三方 checkout 托管页 URL。 */
  checkout_url: string;
  /** 写入 payment metadata_json 的 provider 扩展字段。 */
  metadata?: Record<string, unknown>;
}

/**
 * provider 解析 webhook 的输入。
 */
export interface PaymentProviderWebhookInput {
  /** 原始请求 body。 */
  raw: string;
  /** 当前请求。 */
  request: Request;
  /** City runtime env 上下文。 */
  ctx: PaymentProviderContext;
}

/**
 * provider 解析后的 webhook 事件。
 */
export interface PaymentProviderWebhookEvent {
  /** provider webhook 事件 ID。 */
  event_id: string;
  /** provider webhook 事件类型。 */
  type: string;
  /** 原始事件对象。 */
  payload: Record<string, unknown>;
  /** 事件对应的支付状态；无法处理时使用 `ignored`。 */
  status: PaymentStatus | "ignored";
  /** 服务内部 payment ID。 */
  payment_id?: string;
  /** balance topup ID。 */
  topup_id?: string;
  /** provider checkout/session ID。 */
  provider_session_id?: string;
  /** provider payment ID。 */
  provider_payment_id?: string;
  /** provider order ID。 */
  provider_order_id?: string;
  /** 入账流水外部引用。 */
  ref?: string;
  /** 入账 metadata。 */
  meta?: Record<string, unknown>;
}

/**
 * Payment provider 定义。
 */
export interface PaymentProvider {
  /** provider ID，例如 `stripe`。 */
  id: string;
  /** provider 展示名。 */
  label: string;
  /** provider 需要暴露给 env 管理的配置项。 */
  env: EnvRequirement[];
  /** 生成支付方式展示信息。 */
  method(ctx: PaymentProviderContext): PaymentMethodItem;
  /** 创建 checkout。 */
  createCheckout(input: PaymentProviderCheckoutInput): Promise<PaymentProviderCheckoutResult>;
  /** 解析并校验 webhook。 */
  parseWebhook(input: PaymentProviderWebhookInput): Promise<PaymentProviderWebhookEvent>;
}

/**
 * Payment 服务配置。
 */
export interface PaymentServiceOptions {
  /** 已挂载到 City 的 balance 服务实例。 */
  balance: PaymentServiceBalanceBridge;
  /** 当前 City 启用的支付 provider。 */
  providers: PaymentProvider[];
}

/**
 * 统一创建 Checkout 请求。
 */
export interface PaymentCreateCheckoutInput extends Record<string, unknown> {
  /** 对应的 balance topup ID。 */
  topup_id?: string;
  /** 支付方式 ID，例如 `stripe`、`dodo`。 */
  method_id?: string;
  /** `method_id` 的别名，方便服务端脚本直接调用。 */
  provider?: string;
}

/**
 * 统一 Checkout 创建结果。
 */
export interface PaymentCheckoutCreateResult extends Record<string, unknown> {
  /** 服务内部支付记录 ID。 */
  payment_id: string;
  /** provider ID。 */
  provider: string;
  /** 对应的 topup ID。 */
  topup_id: string;
  /** provider checkout/session ID。 */
  provider_session_id: string;
  /** provider payment ID。 */
  provider_payment_id: string;
  /** provider order ID。 */
  provider_order_id: string;
  /** 可直接跳转的 Checkout URL。 */
  checkout_url: string;
  /** 当前支付状态。 */
  status: PaymentStatus;
}

/**
 * 统一支付记录。
 */
export interface PaymentRecord extends Record<string, unknown> {
  /** 服务内部支付记录 ID。 */
  payment_id: string;
  /** provider ID。 */
  provider: string;
  /** 对应的 balance topup ID。 */
  topup_id: string;
  /** 充值目标用户 ID。 */
  user_id: string;
  /** provider checkout/session ID。 */
  provider_session_id: string;
  /** provider payment ID。 */
  provider_payment_id: string;
  /** provider order ID。 */
  provider_order_id: string;
  /** 本次充值金额。 */
  amount: number;
  /** 结算币种。 */
  currency: string;
  /** 当前支付状态。 */
  status: PaymentStatus;
  /** 第三方 Checkout 托管页面 URL。 */
  checkout_url: string;
  /** 扩展字段 JSON 文本。 */
  metadata_json: string;
  /** 创建时间。 */
  created_at: string;
  /** 更新时间。 */
  updated_at: string;
}

/**
 * 统一 webhook 事件记录。
 */
export interface PaymentEventRecord extends Record<string, unknown> {
  /** provider webhook 事件 ID。 */
  event_id: string;
  /** provider ID。 */
  provider: string;
  /** webhook 事件类型。 */
  type: string;
  /** 原始事件 JSON 文本。 */
  payload_json: string;
  /** 当前同步状态。 */
  sync_status: PaymentEventSyncStatus;
  /** 同步失败摘要。 */
  sync_error: string;
  /** 记录创建时间。 */
  created_at: string;
}

/**
 * Stripe provider 配置。
 */
export interface StripePaymentProviderOptions {
  /** 显式注入的 Stripe Secret Key。 */
  secret_key?: string;
  /** Stripe webhook 签名密钥。 */
  webhook_secret?: string;
  /** 默认结算币种。 */
  currency?: string;
  /** Checkout 商品名。 */
  item_name?: string;
  /** Stripe API 基础地址。 */
  api_base_url?: string;
  /** 可选展示名称。 */
  label?: string;
}

/**
 * Creem provider 配置。
 */
export interface CreemPaymentProviderOptions {
  /** 显式注入的 Creem API Key。 */
  api_key?: string;
  /** 显式注入的 Creem product_id。 */
  product_id?: string;
  /** Creem webhook 签名密钥。 */
  webhook_secret?: string;
  /** 默认结算币种。 */
  currency?: string;
  /** Creem API 基础地址。 */
  api_base_url?: string;
  /** 可选展示名称。 */
  label?: string;
}

/**
 * Dodo Payments provider 配置。
 */
export interface DodoPaymentProviderOptions {
  /** 显式注入的 Dodo Payments API Key。 */
  api_key?: string;
  /** 显式注入的 Dodo product_id。 */
  product_id?: string;
  /** Dodo webhook signing key。 */
  webhook_key?: string;
  /** Dodo SDK 运行环境。 */
  environment?: "test_mode" | "live_mode";
  /** 默认结算币种。 */
  currency?: string;
  /** Dodo API 基础地址。 */
  api_base_url?: string;
  /** 可选展示名称。 */
  label?: string;
}

/**
 * Waffo Pancake provider 配置。
 */
export interface WaffoPaymentProviderOptions {
  /** 显式注入的 Waffo Merchant ID。 */
  merchant_id?: string;
  /** 显式注入的 Waffo private key。 */
  private_key?: string;
  /** 显式注入的 Waffo product_id。 */
  product_id?: string;
  /** webhook 验签 public key。 */
  webhook_public_key?: string;
  /** Waffo 运行环境。 */
  environment?: "test" | "prod";
  /** 默认结算币种。 */
  currency?: string;
  /** Waffo API 基础地址。 */
  api_base_url?: string;
  /** 可选展示名称。 */
  label?: string;
}

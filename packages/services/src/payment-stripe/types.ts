/**
 * Stripe 一次性充值服务对外类型定义。
 *
 * 关键说明（中文）
 * - 这里的能力只覆盖一次性 Stripe 充值
 * - 不覆盖 subscription / entitlement
 * - 所有金额都按 Stripe 最小货币单位传递，例如 USD cents
 */

/**
 * 充值单最小只读视图。
 */
export interface StripePaymentTopupRecord extends Record<string, unknown> {
  /**
   * 充值单 ID。
   */
  topup_id: string;

  /**
   * 充值目标用户 ID。
   */
  user_id: string;

  /**
   * 充值金额。
   */
  amount: number;

  /**
   * 充值单状态。
   */
  status: string;

  /**
   * 充值说明。
   */
  note: string;
}

/**
 * Stripe 服务所需的 balance 最小桥接接口。
 */
export interface StripePaymentServiceBalanceBridge {
  /**
   * 读取充值单。
   */
  readTopup(topup_id: string): Promise<StripePaymentTopupRecord>;

  /**
   * 完成充值单并真正入账。
   */
  finishTopup(
    topup_id: string,
    extra?: {
      /**
       * 说明文本。
       */
      note?: string;

      /**
       * 外部引用 ID。
       */
      ref?: string;

      /**
       * 结构化扩展字段。
       */
      meta?: Record<string, unknown>;
    },
  ): Promise<StripePaymentTopupRecord>;
}

/**
 * Stripe 支付服务配置。
 */
export interface StripePaymentServiceOptions {
  /**
   * 已挂载到 City 的 balance 服务实例。
   *
   * Stripe 服务会通过它读取 topup 并在支付成功后调用
   * `finishTopup()` 真正完成到账。
   */
  balance: StripePaymentServiceBalanceBridge;

  /**
   * Stripe Secret Key。
   *
   * 未传入时会读取 City env 中的 `STRIPE_SECRET_KEY`。
   */
  secret_key?: string;

  /**
   * Stripe webhook 签名密钥。
   *
   * 未传入时会读取 City env 中的 `STRIPE_WEBHOOK_SECRET`。
   */
  webhook_secret?: string;

  /**
   * 默认结算币种。
   *
   * 传给 Stripe 时会被规范化为小写；默认值为 `usd`。
   */
  currency?: string;

  /**
   * Checkout 商品名。
   *
   * 默认值为 `Downcity Topup`。
   */
  item_name?: string;

  /**
   * Stripe API 基础地址。
   *
   * 默认值为 Stripe 官方 `https://api.stripe.com/v1`。
   * 测试时可以覆写到伪造服务。
   */
  api_base_url?: string;
}

/**
 * Stripe 支付记录状态。
 */
export type StripePaymentStatus = "pending" | "paid" | "expired" | "failed";

/**
 * Stripe webhook 同步状态。
 */
export type StripeEventSyncStatus = "pending" | "applied" | "ignored" | "failed";

/**
 * Stripe 支付记录。
 */
export interface StripePaymentRecord extends Record<string, unknown> {
  /**
   * 服务内部支付记录 ID。
   */
  payment_id: string;

  /**
   * 对应的 balance topup ID。
   */
  topup_id: string;

  /**
   * 充值目标用户 ID。
   */
  user_id: string;

  /**
   * Stripe Checkout Session ID。
   */
  stripe_checkout_session_id: string;

  /**
   * Stripe PaymentIntent ID。
   *
   * 在创建 Checkout 时可能为空字符串，待 webhook 补全。
   */
  stripe_payment_intent_id: string;

  /**
   * 本次充值金额。
   *
   * 约定使用 Stripe 最小货币单位整数。
   */
  amount: number;

  /**
   * 结算币种。
   */
  currency: string;

  /**
   * 当前支付状态。
   */
  status: StripePaymentStatus;

  /**
   * Stripe Checkout 托管页面 URL。
   */
  checkout_url: string;

  /**
   * 扩展字段 JSON 文本。
   */
  metadata_json: string;

  /**
   * 创建时间。
   */
  created_at: string;

  /**
   * 更新时间。
   */
  updated_at: string;
}

/**
 * Stripe webhook 事件记录。
 */
export interface StripeEventRecord extends Record<string, unknown> {
  /**
   * Stripe event ID。
   */
  event_id: string;

  /**
   * Stripe event type。
   */
  type: string;

  /**
   * 原始事件 JSON 文本。
   */
  payload_json: string;

  /**
   * 当前同步状态。
   */
  sync_status: StripeEventSyncStatus;

  /**
   * 同步失败摘要。
   *
   * 未失败时为空字符串。
   */
  sync_error: string;

  /**
   * 记录创建时间。
   */
  created_at: string;
}

/**
 * 创建 Stripe Checkout 的输入。
 */
export interface StripeCreateCheckoutInput extends Record<string, unknown> {
  /**
   * 已存在的 balance topup ID。
   */
  topup_id?: string;
}

/**
 * 创建 Stripe Checkout 的返回值。
 */
export interface StripeCheckoutCreateResult extends Record<string, unknown> {
  /**
   * 服务内部支付记录 ID。
   */
  payment_id: string;

  /**
   * 对应的 topup ID。
   */
  topup_id: string;

  /**
   * Stripe Checkout Session ID。
   */
  stripe_checkout_session_id: string;

  /**
   * 可直接跳转的 Checkout URL。
   */
  checkout_url: string;

  /**
   * 当前支付状态。
   */
  status: StripePaymentStatus;
}

/**
 * Stripe 创建 Checkout Session 的内部参数。
 */
export interface StripeCreateCheckoutSessionInput {
  /**
   * 服务内部支付记录 ID。
   */
  payment_id: string;

  /**
   * 对应的充值单快照。
   */
  topup: StripePaymentTopupRecord;

  /**
   * 创建时使用的币种。
   */
  currency: string;

  /**
   * 支付成功跳转地址。
   */
  success_url: string;

  /**
   * 支付取消跳转地址。
   */
  cancel_url: string;

  /**
   * Checkout 商品名。
   */
  item_name: string;
}

/**
 * Stripe Checkout Session 创建结果。
 */
export interface StripeCheckoutSessionResult {
  /**
   * Stripe Checkout Session ID。
   */
  session_id: string;

  /**
   * Stripe Checkout 托管页面 URL。
   */
  checkout_url: string;

  /**
   * Stripe PaymentIntent ID。
   *
   * 创建阶段可能为空。
   */
  payment_intent_id: string;
}

/**
 * Stripe webhook 事件公共外壳。
 */
export interface StripeWebhookEvent extends Record<string, unknown> {
  /**
   * Stripe event ID。
   */
  id?: string;

  /**
   * Stripe event type。
   */
  type?: string;

  /**
   * 事件数据。
   */
  data?: {
    /**
     * 当前事件承载的 Stripe 对象。
     */
    object?: Record<string, unknown>;
  };
}

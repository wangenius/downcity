/**
 * Waffo Pancake 一次性充值服务对外类型定义。
 *
 * 关键说明（中文）
 * - 当前能力只覆盖 Waffo Checkout 一次性充值
 * - 不覆盖 subscription / refund
 * - 支付成功后统一通过 balance.finishTopup() 完成到账
 */

/**
 * Waffo 运行环境。
 */
export type WaffoPaymentEnvironment = "test" | "prod";

/**
 * 充值单最小只读视图。
 */
export interface WaffoPaymentTopupRecord extends Record<string, unknown> {
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
 * Waffo 服务所需的 balance 最小桥接接口。
 */
export interface WaffoPaymentServiceBalanceBridge {
  /**
   * 读取充值单。
   */
  readTopup(topup_id: string): Promise<WaffoPaymentTopupRecord>;

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
  ): Promise<WaffoPaymentTopupRecord>;
}

/**
 * Waffo 支付服务配置。
 */
export interface WaffoPaymentServiceOptions {
  /**
   * 已挂载到 City 的 balance 服务实例。
   */
  balance: WaffoPaymentServiceBalanceBridge;

  /**
   * Waffo Merchant ID。
   *
   * 未传入时会读取 City env 中的 `WAFFO_MERCHANT_ID`。
   */
  merchant_id?: string;

  /**
   * Waffo API private key。
   *
   * 未传入时会读取 City env 中的 `WAFFO_PRIVATE_KEY`。
   */
  private_key?: string;

  /**
   * Waffo Product ID。
   *
   * 未传入时会读取 City env 中的 `WAFFO_PRODUCT_ID`。
   */
  product_id?: string;

  /**
   * webhook 验签 public key。
   *
   * 未传入时 SDK 会读取 env 或使用内置 Waffo public key。
   */
  webhook_public_key?: string;

  /**
   * Waffo 运行环境。
   *
   * 未传入时会读取 `WAFFO_ENVIRONMENT`，最终默认 `test`。
   */
  environment?: WaffoPaymentEnvironment;

  /**
   * 默认结算币种。
   */
  currency?: string;

  /**
   * Waffo API 基础地址。
   */
  api_base_url?: string;
}

/**
 * Waffo Checkout 创建请求。
 */
export interface WaffoCreateCheckoutInput extends Record<string, unknown> {
  /**
   * 对应的 balance topup ID。
   */
  topup_id: string;
}

/**
 * Waffo Checkout 创建结果。
 */
export interface WaffoCheckoutCreateResult {
  /**
   * 服务内部支付记录 ID。
   */
  payment_id: string;

  /**
   * 对应的 balance topup ID。
   */
  topup_id: string;

  /**
   * Waffo Checkout Session ID。
   */
  waffo_session_id: string;

  /**
   * Waffo Checkout 托管页面 URL。
   */
  checkout_url: string;

  /**
   * 当前支付状态。
   */
  status: WaffoPaymentStatus;
}

/**
 * Waffo 支付记录状态。
 */
export type WaffoPaymentStatus = "pending" | "paid" | "failed" | "canceled";

/**
 * Waffo webhook 同步状态。
 */
export type WaffoEventSyncStatus = "pending" | "applied" | "ignored" | "failed";

/**
 * Waffo 支付记录。
 */
export interface WaffoPaymentRecord extends Record<string, unknown> {
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
   * Waffo Checkout Session ID。
   */
  waffo_session_id: string;

  /**
   * Waffo Order ID。
   */
  waffo_order_id: string;

  /**
   * Waffo Payment ID。
   */
  waffo_payment_id: string;

  /**
   * 本次充值金额。
   */
  amount: number;

  /**
   * 结算币种。
   */
  currency: string;

  /**
   * 当前支付状态。
   */
  status: WaffoPaymentStatus;

  /**
   * Waffo Checkout 托管页面 URL。
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
 * Waffo webhook 事件记录。
 */
export interface WaffoEventRecord extends Record<string, unknown> {
  /**
   * Waffo webhook 事件 ID。
   */
  event_id: string;

  /**
   * Waffo webhook 事件类型。
   */
  type: string;

  /**
   * 原始 webhook payload JSON 文本。
   */
  payload_json: string;

  /**
   * 同步状态。
   */
  sync_status: WaffoEventSyncStatus;

  /**
   * 同步失败信息。
   */
  sync_error: string;

  /**
   * 创建时间。
   */
  created_at: string;
}

/**
 * Waffo webhook 事件主体数据。
 */
export interface WaffoWebhookEventData extends Record<string, unknown> {
  /**
   * 订单 ID。
   */
  orderId?: unknown;

  /**
   * 支付 ID。
   */
  paymentId?: unknown;

  /**
   * 订单业务侧 ID，对应 Downcity payment_id。
   */
  orderMerchantExternalId?: unknown;

  /**
   * 支付状态。
   */
  paymentStatus?: unknown;
}

/**
 * Waffo webhook 事件。
 */
export interface WaffoWebhookEvent extends Record<string, unknown> {
  /**
   * webhook delivery ID。
   */
  id?: unknown;

  /**
   * 业务事件 ID。
   */
  eventId?: unknown;

  /**
   * 事件类型。
   */
  eventType?: unknown;

  /**
   * 事件环境。
   */
  mode?: unknown;

  /**
   * 事件数据。
   */
  data?: WaffoWebhookEventData;
}

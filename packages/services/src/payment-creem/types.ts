/**
 * Creem 一次性充值服务对外类型定义。
 *
 * 关键说明（中文）
 * - 当前能力只覆盖 Creem Checkout 一次性充值
 * - 不覆盖 subscription / entitlement
 * - 由于 Creem Checkout 基于 product_id 创建会话，实际充值金额仍以 balance topup 为准
 */

/**
 * 充值单最小只读视图。
 */
export interface CreemPaymentTopupRecord extends Record<string, unknown> {
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
   * 余额单位。
   */
  unit: string;

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
 * Creem 服务所需的 balance 最小桥接接口。
 */
export interface CreemPaymentServiceBalanceBridge {
  /**
   * 读取充值单。
   */
  readTopup(topup_id: string): Promise<CreemPaymentTopupRecord>;

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
  ): Promise<CreemPaymentTopupRecord>;
}

/**
 * Creem 支付服务配置。
 */
export interface CreemPaymentServiceOptions {
  /**
   * 已挂载到 City 的 balance 服务实例。
   *
   * Creem 服务会通过它读取 topup，并在 webhook 支付成功后调用
   * `finishTopup()` 真正完成到账。
   */
  balance: CreemPaymentServiceBalanceBridge;

  /**
   * Creem API Key。
   *
   * 未传入时会读取 City env 中的 `CREEM_API_KEY`。
   */
  api_key?: string;

  /**
   * Creem Checkout 使用的 product_id。
   *
   * 未传入时会读取 City env 中的 `CREEM_PRODUCT_ID`。
   */
  product_id?: string;

  /**
   * Creem webhook 签名密钥。
   *
   * 未传入时会读取 City env 中的 `CREEM_WEBHOOK_SECRET`。
   */
  webhook_secret?: string;

  /**
   * 默认支付成功跳转地址。
   *
   * 当 `checkout/create` 未显式传入 `success_url` 时使用。
   * 如果这里也未配置，服务会继续尝试基于 `DOWNCITY_CITY_BASE_URL`
   * 自动生成默认结果页地址。
   */
  success_url?: string;

  /**
   * 默认结算币种。
   *
   * 仅用于支付方式目录展示和本地记录；最终收款币种由 Creem product 决定。
   */
  currency?: string;

  /**
   * Creem API 基础地址。
   *
   * 默认值为 Creem 官方 `https://api.creem.io/v1`。
   * 测试时可以覆写到伪造服务。
   */
  api_base_url?: string;
}

/**
 * Creem Checkout 创建请求。
 */
export interface CreemCreateCheckoutInput extends Record<string, unknown> {
  /**
   * 对应的 balance topup ID。
   */
  topup_id: string;

  /**
   * 可选支付成功跳转地址。
   */
  success_url?: string;

  /**
   * 可选支付取消跳转地址。
   *
   * 当前 Creem Checkout API 不消费该字段；这里保留是为了前端在多支付方式
   * checkout 入参里可以复用同一结构。
   */
  cancel_url?: string;
}

/**
 * Creem Checkout 创建结果。
 */
export interface CreemCheckoutCreateResult {
  /**
   * 服务内部支付记录 ID。
   */
  payment_id: string;

  /**
   * 对应的 balance topup ID。
   */
  topup_id: string;

  /**
   * Creem Checkout ID。
   */
  creem_checkout_id: string;

  /**
   * Creem Checkout 托管页面 URL。
   */
  checkout_url: string;

  /**
   * 当前支付状态。
   */
  status: CreemPaymentStatus;
}

/**
 * Creem 支付记录状态。
 */
export type CreemPaymentStatus = "pending" | "paid" | "expired" | "failed";

/**
 * Creem webhook 同步状态。
 */
export type CreemEventSyncStatus = "pending" | "applied" | "ignored" | "failed";

/**
 * Creem 支付记录。
 */
export interface CreemPaymentRecord extends Record<string, unknown> {
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
   * Creem Checkout ID。
   */
  creem_checkout_id: string;

  /**
   * Creem Order ID。
   *
   * 创建 Checkout 时通常为空字符串，待 webhook 补全。
   */
  creem_order_id: string;

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
  status: CreemPaymentStatus;

  /**
   * Creem Checkout 托管页面 URL。
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
 * Creem webhook 事件记录。
 */
export interface CreemEventRecord extends Record<string, unknown> {
  /**
   * Creem webhook 事件 ID。
   */
  event_id: string;

  /**
   * Creem webhook 事件类型。
   */
  type: string;

  /**
   * 原始 webhook payload JSON 文本。
   */
  payload_json: string;

  /**
   * 同步状态。
   */
  sync_status: CreemEventSyncStatus;

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
 * Creem Checkout API 创建参数。
 */
export interface CreemCreateCheckoutSessionInput {
  /**
   * 服务内部支付记录 ID。
   */
  payment_id: string;

  /**
   * 充值单信息。
   */
  topup: CreemPaymentTopupRecord;

  /**
   * Creem product_id。
   */
  product_id: string;

  /**
   * 支付成功跳转地址。
   */
  success_url: string;

}

/**
 * Creem Checkout API 创建结果。
 */
export interface CreemCheckoutSessionResult {
  /**
   * Creem Checkout ID。
   */
  checkout_id: string;

  /**
   * Creem Checkout 托管页面 URL。
   */
  checkout_url: string;
}

/**
 * Creem webhook 事件。
 */
export interface CreemWebhookEvent extends Record<string, unknown> {
  /**
   * Creem webhook 事件 ID。
   */
  id?: unknown;

  /**
   * Creem webhook 事件类型。
   */
  eventType?: unknown;

  /**
   * 兼容部分测试或代理转发 payload 的事件类型字段。
   */
  type?: unknown;

  /**
   * Creem webhook 事件对象。
   */
  object?: unknown;

  /**
   * 兼容 data.object 形式的事件对象。
   */
  data?: {
    /**
     * 事件主体对象。
     */
    object?: unknown;
  };
}

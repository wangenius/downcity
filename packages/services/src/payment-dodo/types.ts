/**
 * Dodo Payments 一次性充值服务对外类型定义。
 *
 * 关键说明（中文）
 * - 当前能力只覆盖 Dodo Checkout 一次性充值
 * - 不覆盖 subscription / entitlement
 * - 支付成功后统一通过 balance.finishTopup() 完成到账
 */

/**
 * Dodo SDK 运行环境。
 */
export type DodoPaymentEnvironment = "test_mode" | "live_mode";

/**
 * 充值单最小只读视图。
 */
export interface DodoPaymentTopupRecord extends Record<string, unknown> {
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
 * Dodo 服务所需的 balance 最小桥接接口。
 */
export interface DodoPaymentServiceBalanceBridge {
  /**
   * 读取充值单。
   */
  readTopup(topup_id: string): Promise<DodoPaymentTopupRecord>;

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
  ): Promise<DodoPaymentTopupRecord>;
}

/**
 * Dodo 支付服务配置。
 */
export interface DodoPaymentServiceOptions {
  /**
   * 已挂载到 City 的 balance 服务实例。
   *
   * Dodo 服务会通过它读取 topup，并在 webhook 支付成功后调用
   * `finishTopup()` 真正完成到账。
   */
  balance: DodoPaymentServiceBalanceBridge;

  /**
   * Dodo Payments API key。
   *
   * 未传入时会读取 City env 中的 `DODO_PAYMENTS_API_KEY`。
   */
  api_key?: string;

  /**
   * Dodo Checkout 使用的 product_id。
   *
   * 未传入时会读取 City env 中的 `DODO_PRODUCT_ID`。
   */
  product_id?: string;

  /**
   * Dodo webhook signing key。
   *
   * 未传入时会读取 City env 中的 `DODO_WEBHOOK_KEY`。
   */
  webhook_key?: string;

  /**
   * Dodo SDK 运行环境。
   *
   * 未传入时会读取 `DODO_ENVIRONMENT`，最终默认 `test_mode`。
   */
  environment?: DodoPaymentEnvironment;

  /**
   * 默认结算币种。
   */
  currency?: string;

  /**
   * Dodo API 基础地址。
   *
   * 测试时可以覆写到伪造服务。
   */
  api_base_url?: string;
}

/**
 * Dodo Checkout 创建请求。
 */
export interface DodoCreateCheckoutInput extends Record<string, unknown> {
  /**
   * 对应的 balance topup ID。
   */
  topup_id: string;
}

/**
 * Dodo Checkout 创建结果。
 */
export interface DodoCheckoutCreateResult {
  /**
   * 服务内部支付记录 ID。
   */
  payment_id: string;

  /**
   * 对应的 balance topup ID。
   */
  topup_id: string;

  /**
   * Dodo Checkout Session ID。
   */
  dodo_checkout_session_id: string;

  /**
   * Dodo Payment ID。
   */
  dodo_payment_id: string;

  /**
   * Dodo Checkout 托管页面 URL。
   */
  checkout_url: string;

  /**
   * 当前支付状态。
   */
  status: DodoPaymentStatus;
}

/**
 * Dodo 支付记录状态。
 */
export type DodoPaymentStatus = "pending" | "paid" | "expired" | "failed" | "canceled";

/**
 * Dodo webhook 同步状态。
 */
export type DodoEventSyncStatus = "pending" | "applied" | "ignored" | "failed";

/**
 * Dodo 支付记录。
 */
export interface DodoPaymentRecord extends Record<string, unknown> {
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
   * Dodo Checkout Session ID。
   */
  dodo_checkout_session_id: string;

  /**
   * Dodo Payment ID。
   *
   * 创建 Checkout 时可能为空字符串，待 webhook 补全。
   */
  dodo_payment_id: string;

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
  status: DodoPaymentStatus;

  /**
   * Dodo Checkout 托管页面 URL。
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
 * Dodo webhook 事件记录。
 */
export interface DodoEventRecord extends Record<string, unknown> {
  /**
   * Dodo webhook 事件 ID。
   */
  event_id: string;

  /**
   * Dodo webhook 事件类型。
   */
  type: string;

  /**
   * 原始 webhook payload JSON 文本。
   */
  payload_json: string;

  /**
   * 同步状态。
   */
  sync_status: DodoEventSyncStatus;

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
 * Dodo webhook 事件。
 */
export interface DodoWebhookEvent extends Record<string, unknown> {
  /**
   * Dodo webhook 事件 ID。
   */
  id?: unknown;

  /**
   * Dodo webhook 事件类型。
   */
  type?: unknown;

  /**
   * Dodo webhook 事件主体。
   */
  data?: unknown;
}

/**
 * Payment 服务对外类型定义。
 *
 * 关键说明（中文）
 * - `payment` 是统一支付入口，只负责暴露“当前有哪些支付方式”
 * - 具体执行动作仍然由具体服务承接，例如 `payment.stripe`
 * - 前端可以先读 methods，再决定展示哪种充值/支付入口
 */

/**
 * 支付方式展示模式。
 */
export type PaymentMethodType = "checkout";

/**
 * 单个支付方式返回项。
 */
export interface PaymentMethodItem {
  /**
   * 支付方式唯一标识。
   *
   * 例如：`stripe`
   */
  id: string;

  /**
   * 支付方式模式。
   *
   * 当前版本统一使用 `checkout`，表示需要创建支付会话再跳转。
   */
  type: PaymentMethodType;

  /**
   * 当前 City 是否实际开放该支付方式。
   */
  enabled: boolean;

  /**
   * 展示给前端的支付方式名称。
   */
  label: string;

  /**
   * 发起支付时应调用的 service id。
   *
   * 例如：`payment.stripe`
   */
  service: string;

  /**
   * 发起支付时应调用的 action id。
   *
   * 例如：`checkout/create`
   */
  action: string;

  /**
   * 是否要求用户先登录再发起支付。
   */
  requires_user: boolean;

  /**
   * 当前默认结算币种。
   */
  currency: string;

  /**
   * 未启用原因。
   */
  reason?: "not_configured" | "not_supported";
}

/**
 * 单个支付方式定义。
 *
 * 关键说明（中文）
 * - `payment` 服务内部会在请求时解析这些定义
 * - 这样每种 method 可以根据 runtime env 动态决定是否启用
 */
export interface PaymentMethodDefinition {
  /**
   * 生成当前支付方式的展示结果。
   */
  resolve(ctx: { env(key: string): string | undefined }): PaymentMethodItem;
}

/**
 * Payment 服务配置。
 */
export interface PaymentServiceOptions {
  /**
   * 当前 City 挂载的支付方式列表。
   */
  methods: PaymentMethodDefinition[];
}

/**
 * Stripe 支付方式配置。
 */
export interface StripePaymentMethodOptions {
  /**
   * 显式注入的 Stripe Secret Key。
   *
   * 未传入时会回退读取 runtime env 中的 `STRIPE_SECRET_KEY`。
   */
  secret_key?: string;

  /**
   * 默认结算币种。
   *
   * 未传入时会回退读取 runtime env 中的 `STRIPE_CURRENCY`，最终默认 `usd`。
   */
  currency?: string;

  /**
   * 可选展示名称。
   */
  label?: string;
}

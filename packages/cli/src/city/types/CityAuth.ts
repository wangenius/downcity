/**
 * City City user 鉴权协议类型。
 *
 * 关键点（中文）
 * - 这些类型对应 City accounts service 返回的轻量结构。
 * - 只用于 `city city login` 流程。
 */

/**
 * 登录方式。
 */
export type CityAuthMethod = "login" | "register" | `oauth:${string}` | `input:${string}`;

/**
 * City accounts provider 描述。
 */
export interface AccountsProviderItem {
  /**
   * 登录方式标识。
   */
  id?: string;

  /**
   * 登录方式类型。
   */
  type?: string;

  /**
   * 登录方式展示名称。
   */
  label?: string;

  /**
   * 当前登录方式需要提前输入的字段。
   */
  inputs?: {
    /**
     * 输入字段名称。
     */
    name?: string;

    /**
     * 输入字段类型。
     */
    type?: string;

    /**
     * 输入字段展示名称。
     */
    label?: string;

    /**
     * 是否必填。
     */
    required?: boolean;
  }[];

  /**
   * 当前方式是否启用。
   */
  enabled?: boolean;

  /**
   * email login 是否启用。
   */
  login_enabled?: boolean;

  /**
   * email register 是否启用。
   */
  register_enabled?: boolean;
}

/**
 * CLI 登录菜单选项。
 */
export interface AuthOption {
  /**
   * 选项标题。
   */
  title: string;

  /**
   * 选项值。
   */
  value: CityAuthMethod;

  /**
   * 选项说明。
   */
  description: string;
}

/**
 * email register 结果。
 */
export interface RegisterResult {
  /**
   * 注册是否成功。
   */
  success?: boolean;

  /**
   * 服务端提示。
   */
  message?: string;

  /**
   * 验证 token。
   */
  verification_token?: string;

  /**
   * 用户 ID。
   */
  user_id?: string;

  /**
   * 服务端错误信息。
   */
  error?: string;
}

/**
 * email verify 结果。
 */
export interface VerifyResult {
  /**
   * City user token。
   */
  user_token?: string;

  /**
   * 用户 ID。
   */
  user_id?: string;

  /**
   * 服务端错误信息。
   */
  error?: string;
}

/**
 * 统一登录入口结果。
 */
export interface AuthStartResult {
  /**
   * 登录状态。
   */
  status?: "input_required" | "redirect_required" | "pending" | "done";

  /**
   * 登录流程 ID。
   */
  login_id?: string;

  /**
   * provider ID。
   */
  provider?: string;

  /**
   * OAuth 授权 URL。
   */
  url?: string;

  /**
   * OAuth state。
   */
  state?: string;

  /**
   * City user token。
   */
  user_token?: string;

  /**
   * 用户 ID。
   */
  user_id?: string;

  /**
   * 用户 email。
   */
  email?: string;

  /**
   * 服务端错误信息。
   */
  error?: string;
}

/**
 * 登录流程继续结果。
 */
export interface AuthContinueResult {
  /**
   * 登录状态。
   */
  status?: "input_required" | "pending" | "done";

  /**
   * 登录流程 ID。
   */
  login_id?: string;

  /**
   * 服务端错误信息。
   */
  error?: string;
}

/**
 * 登录结果轮询结果。
 */
export interface LoginPollResult {
  /**
   * 登录状态。
   */
  status?: string;

  /**
   * City user token。
   */
  user_token?: string;

  /**
   * 用户 ID。
   */
  user_id?: string;

  /**
   * 用户 email。
   */
  email?: string;

  /**
   * 服务端错误信息。
   */
  error?: string;
}

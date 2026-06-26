/**
 * Accounts 服务 provider 类型定义。
 *
 * 关键说明（中文）
 * - AccountsService 是统一账号服务容器，具体登录能力由 provider 声明。
 * - provider 负责声明 env、判断是否可用，并提供必要的发送或 OAuth 配置能力。
 */

import type { EnvRequirement } from "@downcity/city";
import type { OAuthProviderConfig, OAuthProviderId } from "./oauth.js";

/**
 * Accounts 登录方式类型。
 */
export type AccountsProviderType = "password" | "oauth";

/**
 * Accounts 登录方式不可用原因。
 */
export type AccountsProviderReason = "not_configured" | "not_supported";

/**
 * Accounts provider 运行时上下文。
 */
export interface AccountsProviderContext {
  /**
   * 读取 City runtime env。
   */
  env(key: string): string | undefined;
}

/**
 * Accounts 登录方式返回项。
 */
export interface AccountsProviderItem {
  /**
   * 登录方式唯一标识，例如 `email`、`github`。
   */
  id: string;

  /**
   * 登录方式类别。
   */
  type: AccountsProviderType;

  /**
   * 当前 City 是否实际开放该登录方式。
   */
  enabled: boolean;

  /**
   * 展示给前端或 CLI 的登录方式名称。
   */
  label: string;

  /**
   * email login 是否启用。
   */
  login_enabled?: boolean;

  /**
   * email register 是否启用。
   */
  register_enabled?: boolean;

  /**
   * 未启用原因。
   */
  reason?: AccountsProviderReason;
}

/**
 * Accounts provider 基础定义。
 */
export interface AccountsProvider {
  /**
   * provider ID。
   */
  id: string;

  /**
   * provider 展示名。
   */
  label: string;

  /**
   * provider 类型。
   */
  type: AccountsProviderType;

  /**
   * provider 需要暴露给 env 管理的配置项。
   */
  env: EnvRequirement[];

  /**
   * 生成登录方式展示信息。
   */
  method(ctx: AccountsProviderContext): AccountsProviderItem;
}

/**
 * 验证邮件发送参数。
 */
export interface AccountsEmailSendParams {
  /**
   * 收件人邮箱。
   */
  to: string;

  /**
   * 邮件标题。
   */
  subject: string;

  /**
   * 纯文本邮件内容。
   */
  text: string;
}

/**
 * Email accounts provider。
 */
export interface AccountsEmailProvider extends AccountsProvider {
  /**
   * provider ID，固定为 `email`。
   */
  id: "email";

  /**
   * provider 类型，固定为 password。
   */
  type: "password";

  /**
   * 发送验证邮件。
   */
  send_email(params: AccountsEmailSendParams): Promise<void>;
}

/**
 * OAuth accounts provider。
 */
export interface AccountsOAuthProvider extends AccountsProvider {
  /**
   * provider ID。
   */
  id: OAuthProviderId;

  /**
   * provider 类型，固定为 oauth。
   */
  type: "oauth";

  /**
   * 读取当前 provider 的 OAuth 配置。
   */
  config(ctx: AccountsProviderContext): OAuthProviderConfig | undefined;
}

/**
 * Email accounts provider 配置。
 */
export interface EmailAccountsProviderOptions {
  /**
   * 展示名称。
   */
  label?: string;

  /**
   * provider 需要暴露给 env 管理的配置项。
   */
  env?: EnvRequirement[];

  /**
   * 自定义可用性判断。
   *
   * 用于 SMTP、SendGrid、Resend 等发送能力由 env 驱动的场景。
   */
  enabled?: (ctx: AccountsProviderContext) => boolean;

  /**
   * 发送验证邮件。
   */
  send_email: (params: AccountsEmailSendParams) => Promise<void>;
}

/**
 * OAuth accounts provider 配置。
 */
export interface OAuthAccountsProviderOptions {
  /**
   * 展示名称。
   */
  label?: string;

  /**
   * OAuth client id。
   */
  client_id?: string;

  /**
   * OAuth client secret。
   */
  client_secret?: string;
}

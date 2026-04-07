/**
 * Console 启动阶段的本机 token 初始化辅助。
 *
 * 关键点（中文）
 * - `city start` 首次启动时，如果还没有本机 CLI access token，这里负责初始化首个 token。
 * - 新模型不再要求用户名密码登录，也不再做交互式密码提示。
 * - 一旦本机 token 已存在，本模块直接跳过，不会重复打断启动流程。
 * - 启动流程不再写入任何本机默认 token 状态，只显示一次明文 token。
 */

import { AuthService } from "@/main/modules/http/auth/AuthService.js";
import { emitCliBlock } from "./CliReporter.js";

const DEFAULT_CONSOLE_BOOTSTRAP_TOKEN_NAME = "console-bootstrap";

/**
 * Console 启动期统一账户初始化参数。
 */
export interface EnsureConsoleAuthBootstrapOptions {
  /**
   * 可选注入外部 AuthService，便于测试。
   */
  authService?: AuthService;

  readPassword?: () => Promise<string>;
}

/**
 * 确保 console 级至少存在一个本机 access token。
 */
export async function ensureConsoleAuthBootstrap(
  options: EnsureConsoleAuthBootstrapOptions = {},
): Promise<void> {
  const authService = options.authService || new AuthService();
  const ownsAuthService = !options.authService;
  try {
    if (authService.hasLocalCliAccess()) {
      return;
    }

    const payload = authService.ensureLocalCliAccess({
      tokenName: DEFAULT_CONSOLE_BOOTSTRAP_TOKEN_NAME,
    });

    emitCliBlock({
      tone: "success",
      title: "Console token initialized",
      summary: payload.user.username,
      facts: [
        {
          label: "Subject",
          value: payload.user.username,
        },
        {
          label: "Name",
          value: payload.token.name,
        },
        {
          label: "Token",
          value: payload.token.token,
        },
        {
          label: "Next",
          value: "把上面的 Bearer Token 粘贴到 Console UI / Extension",
        },
      ],
      note: "明文 token 只会在本次初始化时显示一次。",
    });
  } finally {
    if (ownsAuthService) authService.close();
  }
}

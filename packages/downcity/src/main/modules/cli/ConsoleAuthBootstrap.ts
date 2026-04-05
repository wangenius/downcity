/**
 * Console 启动阶段的统一账户初始化辅助。
 *
 * 关键点（中文）
 * - `city start` 首次启动时，如果还没有统一账户用户，这里负责初始化首个管理员。
 * - CLI 只让用户设置密码；用户名固定为 `admin`，默认密码为 `downcity`。
 * - 一旦统一账户已存在，本模块直接跳过，不会重复打断启动流程。
 */

import prompts from "prompts";
import { AuthService } from "@/main/modules/http/auth/AuthService.js";
import { writeCliAuthState } from "@/main/modules/http/auth/CliAuthStateStore.js";
import { emitCliBlock } from "./CliReporter.js";

const DEFAULT_CONSOLE_ADMIN_USERNAME = "admin";
const DEFAULT_CONSOLE_ADMIN_DISPLAY_NAME = "Admin";
const DEFAULT_CONSOLE_ADMIN_PASSWORD = "downcity";

/**
 * Console 启动期统一账户初始化参数。
 */
export interface EnsureConsoleAuthBootstrapOptions {
  /**
   * 可选注入外部 AuthService，便于测试。
   */
  authService?: AuthService;

  /**
   * 可选注入密码读取器，便于测试替换交互逻辑。
   */
  readPassword?: () => Promise<string>;
}

/**
 * 确保 console 级统一账户至少存在一个管理员。
 */
export async function ensureConsoleAuthBootstrap(
  options: EnsureConsoleAuthBootstrapOptions = {},
): Promise<void> {
  const authService = options.authService || new AuthService();
  const ownsAuthService = !options.authService;
  try {
    if (authService.hasUsers()) {
      return;
    }

    const rawPassword = await (options.readPassword || promptConsoleAdminPassword)();
    const password = String(rawPassword || "").trim() || DEFAULT_CONSOLE_ADMIN_PASSWORD;
    const payload = authService.bootstrapAdmin({
      username: DEFAULT_CONSOLE_ADMIN_USERNAME,
      password,
      displayName: DEFAULT_CONSOLE_ADMIN_DISPLAY_NAME,
      tokenName: "console-bootstrap",
    });
    try {
      writeCliAuthState({
        token: payload.token.token,
        username: payload.user.username,
        source: "bootstrap",
      });
    } catch {
      // 关键点（中文）：CLI 登录态写入失败不应阻塞统一账户初始化。
    }

    emitCliBlock({
      tone: "success",
      title: "Console auth initialized",
      summary: "admin",
      facts: [
        {
          label: "Username",
          value: DEFAULT_CONSOLE_ADMIN_USERNAME,
        },
        {
          label: "Password",
          value:
            password === DEFAULT_CONSOLE_ADMIN_PASSWORD
              ? DEFAULT_CONSOLE_ADMIN_PASSWORD
              : "使用你刚刚输入的密码",
        },
        {
          label: "Login",
          value: "使用该密码登录 Console",
        },
      ],
    });
  } finally {
    if (ownsAuthService) authService.close();
  }
}

/**
 * 首次启动时读取 console 管理员密码。
 */
async function promptConsoleAdminPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    return DEFAULT_CONSOLE_ADMIN_PASSWORD;
  }

  const response = (await prompts({
    type: "password",
    name: "password",
    message: "设置 Console 管理员密码（留空默认 downcity）",
    initial: DEFAULT_CONSOLE_ADMIN_PASSWORD,
  })) as {
    password?: string;
  };

  const password = String(response.password || "").trim();
  return password || DEFAULT_CONSOLE_ADMIN_PASSWORD;
}

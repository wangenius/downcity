/**
 * 浏览器工具模块。
 *
 * 关键说明（中文）
 * - 统一封装跨平台打开默认浏览器
 * - Stripe Checkout、OAuth 登录都复用这里，避免重复实现
 */

import { execFileSync } from "node:child_process";

/**
 * 打开系统默认浏览器。
 */
export function openBrowser(url: string): boolean {
  try {
    if (process.platform === "darwin") {
      execFileSync("open", [url], { stdio: "ignore" });
      return true;
    }

    if (process.platform === "win32") {
      execFileSync("cmd", ["/c", "start", "", url], { stdio: "ignore" });
      return true;
    }

    execFileSync("xdg-open", [url], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

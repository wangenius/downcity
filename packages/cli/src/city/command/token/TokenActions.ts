/**
 * Token 生命周期动作模块。
 *
 * 关键点（中文）
 * - 封装 token 的创建、删除与查询。
 * - 每个动作都自行管理 AuthService 生命周期。
 */

import type { AuthIssuedToken, AuthTokenSummary } from "@downcity/agent";
import { AuthService } from "@/city/runtime/auth/AuthService.js";
import { emitCliBlock } from "@/shared/CliReporter.js";
import { printResult } from "@/city/utils/cli/CliOutput.js";

/**
 * 创建新的本地 CLI token。
 */
export function createToken(params: {
  name: string;
  expiresAt?: string;
  json?: boolean;
}): AuthIssuedToken {
  const authService = new AuthService();
  try {
    const issued = authService.createLocalCliToken({
      name: params.name,
      expiresAt: params.expiresAt,
    });

    if (params.json === true) {
      printResult({
        asJson: true,
        success: true,
        title: "token created",
        payload: { token: issued },
      });
      return issued;
    }

    emitCliBlock({
      tone: "success",
      title: "Token created",
      summary: issued.name,
      facts: [
        {
          label: "Id",
          value: issued.id,
        },
        {
          label: "Token",
          value: issued.token,
        },
      ],
      note: "明文 token 只会在本次创建时显示一次。",
    });
    return issued;
  } finally {
    authService.close();
  }
}

/**
 * 删除指定 token。
 */
export function deleteToken(tokenId: string, json = false): void {
  const authService = new AuthService();
  try {
    const tokens = authService.listLocalCliTokens();
    const deleted = tokens.find((item) => item.id === tokenId);
    authService.deleteLocalCliToken(tokenId);
    if (json === true) {
      printResult({
        asJson: true,
        success: true,
        title: "token deleted",
        payload: { tokenId },
      });
      return;
    }

    emitCliBlock({
      tone: "success",
      title: "Token deleted",
      summary: deleted?.name || tokenId,
      facts: [
        {
          label: "Id",
          value: tokenId,
        },
      ],
    });
  } finally {
    authService.close();
  }
}

/**
 * 加载所有本地 CLI token 摘要。
 */
export function loadLocalCliTokens(): AuthTokenSummary[] {
  const authService = new AuthService();
  try {
    return authService.listLocalCliTokens();
  } finally {
    authService.close();
  }
}

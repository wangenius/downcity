/**
 * `city auth` 命令树。
 *
 * 关键点（中文）
 * - token 管理只允许在本机 CLI 执行，不再暴露用户名密码登录流。
 * - 这里直接调用本地 `AuthService`，不依赖 HTTP 自举。
 */

import type { Command } from "commander";
import { AuthService } from "@/main/modules/http/auth/AuthService.js";
import { writeCliAuthState } from "@/main/modules/http/auth/CliAuthStateStore.js";
import { emitCliBlock, emitCliList } from "./CliReporter.js";

function printJson(payload: Record<string, unknown>): void {
  console.log(JSON.stringify(payload, null, 2));
}

/**
 * 注册 `city auth` 命令。
 */
export function registerAuthCommand(program: Command): void {
  const auth = program
    .command("auth")
    .description("管理本机 Bearer Token");

  const token = auth
    .command("token")
    .description("管理本机 CLI / Console / Extension Bearer Token");

  token
    .command("list")
    .description("列出本机 Bearer Token")
    .option("--json", "以 JSON 输出")
    .action((options: { json?: boolean }) => {
      const authService = new AuthService();
      try {
        const tokens = authService.listLocalCliTokens();
        if (options.json === true) {
          printJson({
            success: true,
            tokens,
          });
          return;
        }

        if (tokens.length === 0) {
          emitCliBlock({
            tone: "info",
            title: "Auth tokens",
            summary: "0 configured",
            note: "当前还没有本机 token，可执行 `city auth token create <name>`。",
          });
          return;
        }

        emitCliList({
          tone: "accent",
          title: "Auth tokens",
          summary: `${tokens.length} configured`,
          items: tokens.map((item) => ({
            tone: item.revokedAt ? "warning" : "info",
            title: item.name,
            facts: [
              {
                label: "Id",
                value: item.id,
              },
              ...(item.revokedAt
                ? [
                    {
                      label: "Revoked",
                      value: item.revokedAt,
                    },
                  ]
                : []),
              ...(item.expiresAt
                ? [
                    {
                      label: "Expires",
                      value: item.expiresAt,
                    },
                  ]
                : []),
            ],
          })),
        });
      } finally {
        authService.close();
      }
    });

  token
    .command("create")
    .description("签发新的本机 Bearer Token")
    .argument("<name>", "token 名称")
    .option("--expires-at <iso>", "可选过期时间（ISO 字符串）")
    .option("--activate", "将新 token 写入本机 CLI 当前登录态")
    .option("--json", "以 JSON 输出")
    .action((name: string, options: {
      expiresAt?: string;
      activate?: boolean;
      json?: boolean;
    }) => {
      const authService = new AuthService();
      try {
        const issued = authService.createLocalCliToken({
          name,
          expiresAt: options.expiresAt,
        });
        if (options.activate === true) {
          writeCliAuthState({
            token: issued.token,
            username: "local-cli",
            source: "manual",
          });
        }

        if (options.json === true) {
          printJson({
            success: true,
            token: issued,
            activated: options.activate === true,
          });
          return;
        }

        emitCliBlock({
          tone: "success",
          title: "Auth token created",
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
            ...(options.activate === true
              ? [
                  {
                    label: "State",
                    value: "已写入 CLI 当前登录态",
                  },
                ]
              : []),
          ],
          note: "明文 token 只会在本次创建时显示一次。",
        });
      } finally {
        authService.close();
      }
    });

  token
    .command("revoke")
    .description("吊销指定 token")
    .argument("<tokenId>", "token 记录 ID")
    .option("--json", "以 JSON 输出")
    .action((tokenId: string, options: { json?: boolean }) => {
      const authService = new AuthService();
      try {
        const revoked = authService.revokeLocalCliToken(tokenId);
        if (options.json === true) {
          printJson({
            success: true,
            token: revoked,
          });
          return;
        }

        emitCliBlock({
          tone: "success",
          title: "Auth token revoked",
          summary: revoked.name,
          facts: [
            {
              label: "Id",
              value: revoked.id,
            },
            ...(revoked.revokedAt
              ? [
                  {
                    label: "Revoked",
                    value: revoked.revokedAt,
                  },
                ]
              : []),
          ],
        });
      } finally {
        authService.close();
      }
    });
}

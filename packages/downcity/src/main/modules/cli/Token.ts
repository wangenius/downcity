/**
 * `city token` 命令树。
 *
 * 关键点（中文）
 * - token 管理只允许在本机 CLI 执行，不再暴露用户名密码登录流。
 * - 根命令支持交互式入口，减少用户记忆负担。
 * - 子命令依旧保留脚本友好的非交互模式，便于自动化调用。
 */

import type { Command } from "commander";
import { spawnSync } from "node:child_process";
import prompts from "prompts";
import type { AuthIssuedToken, AuthTokenSummary } from "@/shared/types/auth/AuthToken.js";
import { AuthService } from "@/main/modules/http/auth/AuthService.js";
import { emitCliBlock, emitCliList } from "./CliReporter.js";

function printJson(payload: Record<string, unknown>): void {
  console.log(JSON.stringify(payload, null, 2));
}

function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

function isTokenExpired(token: AuthTokenSummary): boolean {
  if (!token.expiresAt) return false;
  return new Date(token.expiresAt).getTime() <= Date.now();
}

function resolveTokenState(token: AuthTokenSummary): "active" | "expired" {
  if (isTokenExpired(token)) return "expired";
  return "active";
}

function formatTokenStateLabel(token: AuthTokenSummary): string {
  const state = resolveTokenState(token);
  if (state === "expired") return "expired";
  return "active";
}

function resolveTokenTone(token: AuthTokenSummary): "accent" | "warning" {
  const state = resolveTokenState(token);
  if (state === "active") return "accent";
  return "warning";
}

function buildTokenFacts(token: AuthTokenSummary): Array<{ label: string; value: string }> {
  return [
    {
      label: "Id",
      value: token.id,
    },
    {
      label: "State",
      value: formatTokenStateLabel(token),
    },
    {
      label: "Created",
      value: token.createdAt,
    },
    ...(token.updatedAt
      ? [
          {
            label: "Updated",
            value: token.updatedAt,
          },
        ]
      : []),
    ...(token.lastUsedAt
      ? [
          {
            label: "Last used",
            value: token.lastUsedAt,
          },
        ]
      : []),
    ...(token.expiresAt
      ? [
          {
            label: "Expires",
            value: token.expiresAt,
          },
        ]
      : []),
  ];
}

function printTokenList(tokens: AuthTokenSummary[], json = false): void {
  if (json === true) {
    printJson({
      success: true,
      tokens,
    });
    return;
  }

  if (tokens.length === 0) {
    emitCliBlock({
      tone: "info",
      title: "Tokens",
      summary: "0 configured",
      note: "当前还没有本机 token，可执行 `city token create <name>`。",
    });
    return;
  }

  emitCliList({
    tone: "accent",
    title: "Tokens",
    summary: `${tokens.length} configured`,
    items: tokens.map((item) => ({
      tone: resolveTokenTone(item),
      title: item.name,
      facts: buildTokenFacts(item),
    })),
  });
}

function emitTokenDetail(token: AuthTokenSummary): void {
  emitCliBlock({
    tone: resolveTokenTone(token),
    title: token.name,
    summary: formatTokenStateLabel(token),
    facts: buildTokenFacts(token),
    note: resolveTokenState(token) === "active"
      ? "历史明文 token 不会被保存；只有新签发时才会显示一次。"
      : undefined,
  });
}

function createToken(params: {
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
      printJson({
        success: true,
        token: issued,
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

function deleteToken(tokenId: string, json = false): void {
  const authService = new AuthService();
  try {
    const tokens = authService.listLocalCliTokens();
    const deleted = tokens.find((item) => item.id === tokenId);
    authService.deleteLocalCliToken(tokenId);
    if (json === true) {
      printJson({
        success: true,
        tokenId,
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

function copyTextToClipboard(text: string): { success: boolean; backend?: string } {
  const value = String(text || "");
  if (!value) return { success: false };

  const backends = [
    {
      command: "pbcopy",
      args: [] as string[],
    },
    {
      command: "wl-copy",
      args: [] as string[],
    },
    {
      command: "xclip",
      args: ["-selection", "clipboard"],
    },
    {
      command: "clip",
      args: [] as string[],
    },
  ];

  for (const backend of backends) {
    const result = spawnSync(backend.command, backend.args, {
      input: value,
      encoding: "utf8",
    });
    if (!result.error && result.status === 0) {
      return {
        success: true,
        backend: backend.command,
      };
    }
  }

  return { success: false };
}

function emitTokenSetupGuide(token: AuthIssuedToken): void {
  emitCliBlock({
    tone: "info",
    title: "Token ready",
    facts: [
      {
        label: "Name",
        value: token.name,
      },
      {
        label: "Token",
        value: token.token,
      },
      {
        label: "Next",
        value: "把刚创建的 Bearer Token 粘贴到需要访问的 Console / Extension / 脚本环境",
      },
    ],
  });
}

async function promptTokenCreateInput(params?: {
  defaultName?: string;
  defaultExpiresAt?: string;
}): Promise<{
  name: string;
  expiresAt?: string;
} | null> {
  if (!isInteractiveTerminal()) {
    emitCliBlock({
      tone: "error",
      title: "Token name is required",
      note: "Use `city token create <name>` or run this command in an interactive terminal.",
    });
    return null;
  }

  const response = (await prompts([
    {
      type: "text",
      name: "name",
      message: "Token 名称",
      initial: String(params?.defaultName || "").trim() || "console-ui",
      validate: (value: string) => {
        return String(value || "").trim() ? true : "请输入 token 名称";
      },
    },
    {
      type: "text",
      name: "expiresAt",
      message: "过期时间（可选，ISO 字符串）",
      initial: String(params?.defaultExpiresAt || "").trim(),
      validate: (value: string) => {
        const normalized = String(value || "").trim();
        if (!normalized) return true;
        return Number.isNaN(Date.parse(normalized))
          ? "请输入合法的 ISO 时间，例如 2026-04-30T00:00:00.000Z"
          : true;
      },
    },
  ])) as {
    name?: string;
    expiresAt?: string;
  };

  const name = String(response.name || "").trim();
  if (!name) {
    emitCliBlock({
      tone: "info",
      title: "Token create cancelled",
    });
    return null;
  }

  const expiresAt = String(response.expiresAt || "").trim();
  return {
    name,
    expiresAt: expiresAt || undefined,
  };
}

async function promptTokenIdForDelete(): Promise<string | null> {
  if (!isInteractiveTerminal()) {
    emitCliBlock({
      tone: "error",
      title: "Token ID is required",
      note: "Use `city token delete <tokenId>` or run this command in an interactive terminal.",
    });
    return null;
  }

  const authService = new AuthService();
  try {
    const tokens = authService.listLocalCliTokens();
    if (tokens.length === 0) {
      emitCliBlock({
        tone: "info",
        title: "No tokens",
        note: "可先执行 `city token create`。",
      });
      return null;
    }

    const response = (await prompts({
      type: "select",
      name: "tokenId",
      message: "选择要删除的 token",
      choices: tokens.map((item) => ({
        title: item.name,
        description: item.id,
        value: item.id,
      })),
      initial: 0,
    })) as { tokenId?: string };

    const tokenId = String(response.tokenId || "").trim();
    if (!tokenId) {
      emitCliBlock({
        tone: "info",
        title: "Token delete cancelled",
      });
      return null;
    }
    return tokenId;
  } finally {
    authService.close();
  }
}

function loadLocalCliTokens(): AuthTokenSummary[] {
  const authService = new AuthService();
  try {
    return authService.listLocalCliTokens();
  } finally {
    authService.close();
  }
}

async function runInteractivePostCreateActions(params: {
  issued: AuthIssuedToken;
}): Promise<void> {
  while (true) {
    const response = (await prompts({
      type: "select",
      name: "action",
      message: "创建完成，下一步要做什么？",
      choices: [
        {
          title: "复制 token",
          description: "把刚签发的明文 token 复制到系统剪贴板",
          value: "copy",
        },
        {
          title: "查看接入说明",
          description: "显示 token 的通用使用说明",
          value: "guide",
        },
        {
          title: "返回",
          description: "回到上一级菜单",
          value: "back",
        },
      ],
      initial: 0,
    })) as { action?: string };

    const action = String(response.action || "").trim();
    if (!action || action === "back") return;

    if (action === "copy") {
      const copied = copyTextToClipboard(params.issued.token);
      emitCliBlock({
        tone: copied.success ? "success" : "warning",
        title: copied.success ? "Token copied" : "Clipboard unavailable",
        facts: copied.success
          ? [
              {
                label: "Backend",
                value: String(copied.backend || "clipboard"),
              },
            ]
          : [],
        note: copied.success
          ? "当前剪贴板里已经是刚签发的 Bearer Token。"
          : "当前环境没有可用的剪贴板命令，请直接复制终端里显示的 token。",
      });
      continue;
    }

    if (action === "guide") {
      emitTokenSetupGuide(params.issued);
      continue;
    }
  }
}

async function runInteractiveCreateFlow(): Promise<void> {
  const input = await promptTokenCreateInput({
    defaultName: "token",
  });
  if (!input) return;

  const issued = createToken(input);
  await runInteractivePostCreateActions({
    issued,
  });
}

async function runInteractiveCreateCommandFlow(options: {
  expiresAt?: string;
}): Promise<void> {
  const input = await promptTokenCreateInput({
    defaultName: "token",
    defaultExpiresAt: options.expiresAt,
  });
  if (!input) return;

  const issued = createToken(input);
  await runInteractivePostCreateActions({
    issued,
  });
}

async function runInteractiveTokenBrowser(): Promise<void> {
  while (true) {
    const tokens = loadLocalCliTokens();
    if (tokens.length === 0) {
      emitCliBlock({
        tone: "info",
        title: "Tokens",
        summary: "0 configured",
        note: "当前还没有本机 token，可先执行创建流程。",
      });
      return;
    }

    const response = (await prompts({
      type: "select",
      name: "tokenId",
      message: "选择一个 token 查看详情",
      choices: [
        ...tokens.map((item) => ({
          title: item.name,
          description: `${formatTokenStateLabel(item)} · ${item.id}`,
          value: item.id,
        })),
        {
          title: "返回",
          description: "回到上一级菜单",
          value: "__back__",
        },
      ],
      initial: 0,
    })) as { tokenId?: string };

    const tokenId = String(response.tokenId || "").trim();
    if (!tokenId || tokenId === "__back__") return;

    while (true) {
      const current = loadLocalCliTokens().find((item) => item.id === tokenId);
      if (!current) {
        emitCliBlock({
          tone: "warning",
          title: "Token not found",
          note: "该 token 可能已经被其他命令删除。",
        });
        break;
      }

      emitTokenDetail(current);

      const actionResponse = (await prompts({
        type: "select",
        name: "action",
        message: "选择后续操作",
        choices: [
          {
            title: "删除 token",
            description: "立即删除当前 token",
            value: "delete",
          },
          {
            title: "返回 token 列表",
            description: "继续浏览其他 token",
            value: "back",
          },
        ],
        initial: 0,
      })) as { action?: string };

      const action = String(actionResponse.action || "").trim();
      if (!action || action === "back") break;
      if (action === "delete") {
        deleteToken(current.id, false);
      }
    }
  }
}

async function runInteractiveTokenCommand(): Promise<void> {
  if (!isInteractiveTerminal()) {
    emitCliBlock({
      tone: "info",
      title: "Token command",
      note: "Use `city token --help` for scriptable usage, or run `city token` in an interactive terminal.",
    });
    return;
  }

  while (true) {
    const tokens = loadLocalCliTokens();

    const response = (await prompts({
      type: "select",
      name: "action",
      message: "选择 token 操作",
      choices: [
        {
          title: "浏览 token",
          description: `查看 ${tokens.length} 个 token 的详情和状态`,
          value: "browse",
        },
        {
          title: "创建 token",
          description: "签发新的 Bearer Token，并继续后续接入配置",
          value: "create",
        },
        {
          title: "删除 token",
          description: "删除已有 token",
          value: "delete",
        },
        {
          title: "退出",
          description: "结束交互式 token 管理",
          value: "exit",
        },
      ],
      initial: tokens.length > 0 ? 0 : 1,
    })) as { action?: string };

    const action = String(response.action || "").trim();
    if (!action || action === "exit") {
      emitCliBlock({
        tone: "info",
        title: "Token command finished",
      });
      return;
    }

    if (action === "browse") {
      await runInteractiveTokenBrowser();
      continue;
    }

    if (action === "create") {
      await runInteractiveCreateFlow();
      continue;
    }

    if (action === "delete") {
      const tokenId = await promptTokenIdForDelete();
      if (!tokenId) {
        continue;
      }
      deleteToken(tokenId, false);
      continue;
    }
  }
}

/**
 * 注册 `city token` 命令。
 */
export function registerTokenCommand(program: Command): void {
  const token = program
    .command("token")
    .description("管理本机 Bearer Token")
    .action(async () => {
      await runInteractiveTokenCommand();
    });

  token
    .command("list")
    .description("列出本机 Bearer Token")
    .option("--json", "以 JSON 输出")
    .action((options: { json?: boolean }) => {
      const authService = new AuthService();
      try {
        const tokens = authService.listLocalCliTokens();
        printTokenList(tokens, options.json === true);
      } finally {
        authService.close();
      }
    });

  token
    .command("create")
    .description("签发新的本机 Bearer Token")
    .argument("[name]", "token 名称")
    .option("--expires-at <iso>", "可选过期时间（ISO 字符串）")
    .option("--json", "以 JSON 输出")
    .action(async (name: string | undefined, options: {
      expiresAt?: string;
      json?: boolean;
    }) => {
      const normalizedName = String(name || "").trim();
      if (!normalizedName) {
        if (options.json === true) {
          emitCliBlock({
            tone: "error",
            title: "Token name is required",
            note: "JSON 模式下必须显式传入 token 名称。",
          });
          process.exitCode = 1;
          return;
        }
        await runInteractiveCreateCommandFlow({
          expiresAt: options.expiresAt,
        });
        return;
      }

      createToken({
        name: normalizedName,
        expiresAt: options.expiresAt,
        json: options.json === true,
      });
    });

  token
    .command("delete")
    .description("删除指定 token")
    .argument("[tokenId]", "token 记录 ID")
    .option("--json", "以 JSON 输出")
    .action(async (tokenId: string | undefined, options: { json?: boolean }) => {
      const normalizedTokenId = String(tokenId || "").trim();
      if (!normalizedTokenId) {
        if (options.json === true) {
          emitCliBlock({
            tone: "error",
            title: "Token ID is required",
            note: "JSON 模式下必须显式传入 tokenId。",
          });
          process.exitCode = 1;
          return;
        }
        const selectedTokenId = await promptTokenIdForDelete();
        if (!selectedTokenId) return;
        deleteToken(selectedTokenId, false);
        return;
      }

      deleteToken(normalizedTokenId, options.json === true);
    });
}

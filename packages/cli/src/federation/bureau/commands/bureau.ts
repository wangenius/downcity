/**
 * Federation Bureau 注册表命令。
 *
 * `token` 在 CLI 本地生成部署凭证，并通过当前 active Federation 的 Admin
 * 控制面登记 hash。`list` 和 `revoke` 只管理 Federation 数据库记录。
 */

import { Bureau } from "@downcity/city";
import { create_bureau_deployment_credential } from "@/federation/bureau/BureauCredential.js";
import { readActiveServer, type ServerProfile } from "@/federation/core/session.js";
import { CliError } from "@/shared/CliError.js";
import { emitCliBlock, emitCliList } from "@/shared/CliReporter.js";
import { t } from "@/shared/CliLocale.js";

/** 为当前 active Federation 创建并登记 Bureau Token。 */
export async function create_federation_bureau_token(): Promise<void> {
  const server = require_active_admin_server();
  const credential = create_bureau_deployment_credential();
  const admin = create_federation_bureau(server);

  await admin.bureaus.register({
    token_id: credential.token_id,
    token_hash: credential.token_hash,
  });

  emitCliBlock({
    tone: "success",
    title: t({ zh: "Bureau Token 已登记", en: "Bureau token registered" }),
    facts: [
      { label: "DOWNCITY_FEDERATION_URL", value: server.base_url },
      { label: "Token ID", value: credential.token_id },
      { label: "DOWNCITY_BUREAU_TOKEN", value: credential.bureau_token },
    ],
    note: t({
      zh: "Token 明文只显示这一次，请立即写入 Bureau 的部署环境变量。",
      en: "The plaintext token is shown only once. Store it in the Bureau deployment environment now.",
    }),
  });
}

/** 列出当前 active Federation 的 Bureau 注册记录。 */
export async function list_federation_bureaus(): Promise<void> {
  const server = require_active_admin_server();
  const items = await create_federation_bureau(server).bureaus.list();
  emitCliList({
    title: t({ zh: "Bureau 注册表", en: "Bureau registry" }),
    summary: t({ zh: `${items.length} 条`, en: `${items.length} items` }),
    items: items.map((item) => ({
      title: item.token_id,
      tone: item.status === "active" ? "success" : "warning",
      facts: [
        { label: t({ zh: "状态", en: "Status" }), value: item.status },
      ],
    })),
  });
}

/** 撤销当前 active Federation 中的 Bureau 注册记录。 */
export async function revoke_federation_bureau(token_id_input: string): Promise<void> {
  const server = require_active_admin_server();
  const token_id = require_value(token_id_input, "token_id");
  await create_federation_bureau(server).bureaus.revoke(token_id);
  emitCliBlock({
    tone: "success",
    title: t({ zh: "Bureau 已撤销", en: "Bureau revoked" }),
    facts: [{ label: "Token ID", value: token_id }],
  });
}

function require_active_admin_server(): ServerProfile {
  const server = readActiveServer();
  if (!server) {
    throw new CliError({
      title: t({ zh: "当前没有 active Federation。", en: "No active Federation is configured." }),
      fix: "fed server add",
    });
  }
  if (!String(server.admin_secret_key ?? "").trim()) {
    throw new CliError({
      title: t({
        zh: "当前 Federation 没有配置 admin_secret_key。",
        en: "The active Federation has no admin_secret_key configured.",
      }),
      fix: "fed server manage",
    });
  }
  return server;
}

function create_federation_bureau(server: ServerProfile): Bureau {
  return new Bureau({
    federation_url: server.base_url,
    bureau_token: server.admin_secret_key!,
  });
}

function require_value(value: unknown, name: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new CliError({ title: `${name} is required` });
  }
  return normalized;
}

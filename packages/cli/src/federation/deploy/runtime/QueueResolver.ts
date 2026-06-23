/**
 * Cloudflare Queue 解析器。
 *
 * 关键点（中文）
 * - Queue 是 Workers 目标的运行时异步任务资源，由 `city deploy` 自动准备。
 * - 用户只需要在 `federation.json.resources.queue` 声明稳定资源名。
 * - Queue 没有需要写入项目配置的 id，Wrangler 配置只绑定 queue name。
 */

import { CliError } from "@/shared/CliError.js";
import type {
  FederationProjectConfigFile,
} from "@/federation/types/FederationProjectConfig.js";
import type { FederationQueueSummary } from "@/federation/types/FederationDeployRuntime.js";
import { runCommand } from "@/federation/deploy/runtime/CommandRunner.js";

/** Queue 解析参数。 */
export interface ResolveQueueParams {
  /** City 项目配置文件。 */
  config_file: FederationProjectConfigFile;
  /** Cloudflare account id。 */
  account_id?: string;
  /** 找不到同名 Queue 时是否允许创建。 */
  create_if_missing?: boolean;
}

/** Queue 解析结果。 */
export interface ResolveQueueResult {
  /** 本次 Queue 准备摘要。 */
  summary: FederationQueueSummary;
}

/**
 * 确认 Queue 存在，必要时创建。
 */
export async function resolveQueue(
  params: ResolveQueueParams,
): Promise<ResolveQueueResult> {
  const queue = params.config_file.config.resources.queue;
  if (!queue) {
    return {
      summary: { status: "skipped" },
    };
  }
  const queue_name = queue.name;
  const create_if_missing = params.create_if_missing !== false;

  const exists = await findExistingQueue({
    project_dir: params.config_file.project_dir,
    account_id: params.account_id,
    queue_name,
  });
  if (exists) {
    return {
      summary: {
        name: queue_name,
        status: "reused",
      },
    };
  }

  if (!create_if_missing) {
    throw new CliError({
      title: "Cloudflare Queue not found",
      note: `Cloudflare account does not have a Queue named ${queue_name}.`,
      fix: "Run `city deploy` once without `--dry-run` to let Downcity create it, or update resources.queue.name in federation.json.",
    });
  }

  await runCommand({
    label: "Create Cloudflare Queue",
    command: `pnpm exec wrangler queues create ${shellQuote(queue_name)}`,
    cwd: params.config_file.project_dir,
    env: { CLOUDFLARE_ACCOUNT_ID: params.account_id },
    capture: true,
  });

  return {
    summary: {
      name: queue_name,
      status: "created",
    },
  };
}

/**
 * 从 Cloudflare 已有 Queue 列表中查找同名 Queue。
 */
async function findExistingQueue(
  params: {
    project_dir: string;
    account_id?: string;
    queue_name: string;
  },
): Promise<boolean> {
  const output = await runCommand({
    label: "List Cloudflare Queues",
    command: "pnpm exec wrangler queues list --json",
    cwd: params.project_dir,
    env: { CLOUDFLARE_ACCOUNT_ID: params.account_id },
    capture: true,
  });

  try {
    const parsed = JSON.parse(output) as unknown;
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { queues?: unknown })?.queues)
        ? (parsed as { queues: unknown[] }).queues
        : [];
    return items.some((item) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return String(record.name ?? record.queue_name ?? "").trim() === params.queue_name;
    });
  } catch {
    return false;
  }
}

/**
 * shell 参数转义。
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

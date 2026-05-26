/**
 * SDK Session 元数据辅助。
 *
 * 关键点（中文）
 * - 统一负责 `.downcity/agents/<agentId>/sessions/<sessionId>/messages/meta.json` 的 SDK 字段读写。
 * - 仅处理轻量配置摘要与索引信息，不负责消息 JSONL 的读写。
 */

import fs from "fs-extra";
import type { LanguageModel } from "ai";
import type {
  SessionHistoryMetaV1,
  SessionHistorySdkConfigV1,
} from "@/executor/types/SessionHistoryMeta.js";
import { getSdkAgentSessionMetaPath } from "@/sdk/session/Paths.js";

type ReadSessionMetadataInput = {
  /**
   * 项目根目录。
   */
  projectRoot: string;

  /**
   * 当前 agentId。
   */
  agentId: string;

  /**
   * 当前 sessionId。
   */
  sessionId: string;
};

function normalizeModelLabel(input: unknown): string | undefined {
  const label = typeof input === "string" ? input.trim() : "";
  return label || undefined;
}

/**
 * 读取当前系统时区。
 */
export function resolveSystemTimezone(): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof timezone === "string" && timezone.trim()
    ? timezone.trim()
    : "UTC";
}

function normalizeTimezone(input: unknown): string | undefined {
  const timezone = typeof input === "string" ? input.trim() : "";
  return timezone || undefined;
}

/**
 * 从模型实例推导轻量可读标签。
 */
export function inferModelLabel(
  model: LanguageModel | undefined,
): string | undefined {
  if (!model || typeof model !== "object") return undefined;
  const record = model as Record<string, unknown>;
  const candidates = [
    record.modelId,
    record.model,
    record.id,
    record.name,
    record.label,
  ];
  for (const candidate of candidates) {
    const text = normalizeModelLabel(candidate);
    if (text) return text;
  }
  const constructorName =
    model.constructor && typeof model.constructor.name === "string"
      ? model.constructor.name.trim()
      : "";
  return constructorName || "configured-model";
}

/**
 * 读取当前 session 的 meta.json。
 */
export async function readSessionMetadata(
  input: ReadSessionMetadataInput,
): Promise<SessionHistoryMetaV1> {
  const filePath = getSdkAgentSessionMetaPath(
    input.projectRoot,
    input.agentId,
    input.sessionId,
  );
  try {
    const raw = (await fs.readJson(filePath)) as Partial<SessionHistoryMetaV1>;
    return {
      v: 1,
      sessionId: input.sessionId,
      agentId: input.agentId,
      createdAt:
        typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
          ? raw.createdAt
          : Date.now(),
      timezone: normalizeTimezone(raw.timezone) || resolveSystemTimezone(),
      updatedAt:
        typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
          ? raw.updatedAt
          : 0,
      pinnedSkillIds: Array.isArray(raw.pinnedSkillIds)
        ? raw.pinnedSkillIds
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean)
        : [],
      ...(typeof raw.lastArchiveId === "string" && raw.lastArchiveId.trim()
        ? { lastArchiveId: raw.lastArchiveId.trim() }
        : {}),
      ...(typeof raw.keepLastMessages === "number" &&
      Number.isFinite(raw.keepLastMessages)
        ? { keepLastMessages: raw.keepLastMessages }
        : {}),
      ...(typeof raw.maxInputTokensApprox === "number" &&
      Number.isFinite(raw.maxInputTokensApprox)
        ? { maxInputTokensApprox: raw.maxInputTokensApprox }
        : {}),
      ...(typeof raw.compactRatio === "number" && Number.isFinite(raw.compactRatio)
        ? { compactRatio: raw.compactRatio }
        : {}),
      ...(raw.sdkConfig && typeof raw.sdkConfig === "object"
        ? { sdkConfig: raw.sdkConfig as SessionHistorySdkConfigV1 }
        : {}),
    };
  } catch {
    return {
      v: 1,
      sessionId: input.sessionId,
      agentId: input.agentId,
      createdAt: Date.now(),
      timezone: resolveSystemTimezone(),
      updatedAt: 0,
      pinnedSkillIds: [],
    };
  }
}

/**
 * 写回当前 session 的 meta.json。
 */
export async function writeSessionMetadata(
  input: ReadSessionMetadataInput & {
    /**
     * 下一份 meta 数据。
     */
    meta: SessionHistoryMetaV1;
  },
): Promise<void> {
  const filePath = getSdkAgentSessionMetaPath(
    input.projectRoot,
    input.agentId,
    input.sessionId,
  );
  await fs.ensureFile(filePath);
  await fs.writeJson(filePath, input.meta, { spaces: 2 });
}

/**
 * 更新当前 session 的 SDK 配置摘要。
 */
export async function patchSessionModelLabel(
  input: ReadSessionMetadataInput & {
    /**
     * 当前模型实例。
     */
    model?: LanguageModel;
  },
): Promise<SessionHistoryMetaV1> {
  const current = await readSessionMetadata(input);
  const modelLabel = inferModelLabel(input.model);
  const next: SessionHistoryMetaV1 = {
    ...current,
    agentId: input.agentId,
    createdAt:
      typeof current.createdAt === "number" ? current.createdAt : Date.now(),
    timezone: normalizeTimezone(current.timezone) || resolveSystemTimezone(),
    updatedAt: Date.now(),
    ...(modelLabel
      ? {
          sdkConfig: {
            ...(current.sdkConfig || {}),
            modelLabel,
          },
        }
      : {}),
  };
  await writeSessionMetadata({
    ...input,
    meta: next,
  });
  return next;
}

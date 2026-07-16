/**
 * SDK Session 元数据辅助。
 *
 * 关键点（中文）
 * - 统一负责 `.downcity/agents/<agentId>/sessions/<sessionId>/messages/meta.json` 的 SDK 字段读写。
 * - 仅处理轻量配置摘要与索引信息，不负责消息 JSONL 的读写。
 */

import fs from "fs-extra";
import {
  inferAgentModelLabel,
  type AgentModel,
} from "@/agent/AgentModel.js";
import type { SessionHistoryMetaV1 } from "@/executor/types/SessionHistoryMeta.js";
import { getSdkAgentSessionMetaPath } from "@/session/storage/Paths.js";
import type { AgentSessionConfigSnapshot } from "@/types/agent/SessionTypes.js";

/** 刷新 Session metadata 的参数。 */
export interface TouchSessionMetadataParams {
  /** 当前项目根目录。 */
  projectRoot: string;
  /** 当前 Agent 稳定标识。 */
  agentId: string;
  /** 当前 Session 稳定标识。 */
  sessionId: string;
  /** 当前 Session configured state。 */
  sessionConfig: AgentSessionConfigSnapshot;
  /** 当前 canonical Message 总数。 */
  message_count?: number;
  /** 当前 Message 日志总字节数。 */
  history_bytes?: number;
  /** 最近一条用户可见 Message 的文本摘要。 */
  preview_text?: string;
}

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
 * 归一化 session 标题。
 */
export function normalizeSessionTitle(input: unknown): string | undefined {
  const title = typeof input === "string" ? input.trim() : "";
  return title || undefined;
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

function normalize_message_count(input: unknown): number | undefined {
  return typeof input === "number" && Number.isInteger(input) && input >= 0
    ? input
    : undefined;
}

function normalize_preview_text(input: unknown): string | undefined {
  const preview_text = typeof input === "string" ? input.trim() : "";
  return preview_text || undefined;
}

function normalize_history_bytes(input: unknown): number | undefined {
  return typeof input === "number" && Number.isInteger(input) && input >= 0
    ? input
    : undefined;
}

/**
 * 从模型实例推导轻量可读标签。
 */
export function inferModelLabel(
  model: AgentModel | undefined,
): string | undefined {
  return inferAgentModelLabel(model);
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
  return await readSessionMetadataFromPath({
    filePath,
    sessionId: input.sessionId,
    agentId: input.agentId,
  });
}

/**
 * 从指定路径读取 session meta.json。
 *
 * 关键点（中文）
 * - 供归档 session 等需要脱离默认 `sessions/` 目录的场景复用。
 * - 路径本身不做校验，调用方需保证可访问。
 */
export async function readSessionMetadataFromPath(input: {
  /** meta.json 文件路径。 */
  filePath: string;
  /** 当前 sessionId。 */
  sessionId: string;
  /** 当前 agentId。 */
  agentId: string;
}): Promise<SessionHistoryMetaV1> {
  try {
    const raw = (await fs.readJson(input.filePath)) as Partial<SessionHistoryMetaV1>;
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
      ...(normalizeSessionTitle(raw.title)
        ? { title: normalizeSessionTitle(raw.title) }
        : {}),
      ...(normalizeModelLabel(raw.modelLabel)
        ? { modelLabel: normalizeModelLabel(raw.modelLabel) }
        : {}),
      ...(normalize_message_count(raw.messageCount) !== undefined
        ? { messageCount: normalize_message_count(raw.messageCount) }
        : {}),
      ...(normalize_preview_text(raw.previewText)
        ? { previewText: normalize_preview_text(raw.previewText) }
        : {}),
      ...(normalize_history_bytes(raw.historyBytes) !== undefined
        ? { historyBytes: normalize_history_bytes(raw.historyBytes) }
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
    model?: AgentModel;
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
          modelLabel,
        }
      : {}),
  };
  await writeSessionMetadata({
    ...input,
    meta: next,
  });
  return next;
}

/** 根据 canonical Message 统计刷新当前 Session metadata。 */
export async function touchSessionMetadata(
  params: TouchSessionMetadataParams,
): Promise<void> {
  const current = await readSessionMetadata({
    projectRoot: params.projectRoot,
    agentId: params.agentId,
    sessionId: params.sessionId,
  });
  const next: SessionHistoryMetaV1 = {
    ...current,
    agentId: params.agentId,
    createdAt:
      typeof current.createdAt === "number" ? current.createdAt : Date.now(),
    updatedAt: Date.now(),
    ...(params.sessionConfig.modelLabel
      ? { modelLabel: params.sessionConfig.modelLabel }
      : {}),
    ...(typeof params.message_count === "number"
      ? { messageCount: params.message_count }
      : {}),
    ...(typeof params.history_bytes === "number"
      ? { historyBytes: params.history_bytes }
      : {}),
    ...(params.preview_text ? { previewText: params.preview_text } : {}),
  };
  await writeSessionMetadata({
    projectRoot: params.projectRoot,
    agentId: params.agentId,
    sessionId: params.sessionId,
    meta: next,
  });
}

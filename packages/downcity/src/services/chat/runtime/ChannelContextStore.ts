/**
 * ChannelContextStore：渠道目标与 contextId 映射存储。
 *
 * 关键点（中文）
 * - 映射文件位于 `.downcity/channel/meta.json`。
 * - contextId 由服务端随机生成并持久化，不依赖字符串拼接规则。
 * - 统一提供“按目标找 contextId / 按 contextId 找目标”能力。
 */

import fs from "fs-extra";
import { generateId } from "@utils/Id.js";
import { getDowncityChannelDirPath, getDowncityChannelMetaPath } from "@/console/env/Paths.js";
import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import type {
  ChannelContextMetaFileV1,
  ChannelContextRouteV1,
  ChannelContextTarget,
} from "@services/chat/types/ChannelContext.js";

function toOptionalTrimmedString(input: unknown): string | undefined {
  const value = String(input || "").trim();
  return value ? value : undefined;
}

function toOptionalThreadId(input: unknown): number | undefined {
  if (typeof input !== "number" || !Number.isFinite(input)) return undefined;
  const out = Math.trunc(input);
  if (out <= 0) return undefined;
  return out;
}

function normalizeTarget(target: ChannelContextTarget): ChannelContextTarget | null {
  const channel = toOptionalTrimmedString(target.channel);
  const chatId = toOptionalTrimmedString(target.chatId);
  if (!channel || !chatId) return null;
  return {
    channel: channel as ChannelContextTarget["channel"],
    chatId,
    ...(toOptionalTrimmedString(target.targetType)
      ? { targetType: toOptionalTrimmedString(target.targetType) }
      : {}),
    ...(toOptionalThreadId(target.threadId)
      ? { threadId: toOptionalThreadId(target.threadId) }
      : {}),
  };
}

function normalizeRoute(
  input: Partial<ChannelContextRouteV1> | null | undefined,
): ChannelContextRouteV1 | null {
  if (!input || typeof input !== "object") return null;
  const contextId = toOptionalTrimmedString(input.contextId);
  const channel = toOptionalTrimmedString(input.channel);
  const chatId = toOptionalTrimmedString(input.chatId);
  if (!contextId || !channel || !chatId) return null;
  return {
    v: 1,
    contextId,
    channel: channel as ChannelContextRouteV1["channel"],
    chatId,
    ...(toOptionalTrimmedString(input.targetType)
      ? { targetType: toOptionalTrimmedString(input.targetType) }
      : {}),
    ...(toOptionalThreadId(input.threadId)
      ? { threadId: toOptionalThreadId(input.threadId) }
      : {}),
    ...(toOptionalTrimmedString(input.messageId)
      ? { messageId: toOptionalTrimmedString(input.messageId) }
      : {}),
    ...(toOptionalTrimmedString(input.actorId)
      ? { actorId: toOptionalTrimmedString(input.actorId) }
      : {}),
    ...(toOptionalTrimmedString(input.actorName)
      ? { actorName: toOptionalTrimmedString(input.actorName) }
      : {}),
    ...(toOptionalTrimmedString(input.chatTitle)
      ? { chatTitle: toOptionalTrimmedString(input.chatTitle) }
      : {}),
    updatedAt:
      typeof input.updatedAt === "number" && Number.isFinite(input.updatedAt)
        ? input.updatedAt
        : Date.now(),
  };
}

function normalizeMetaFile(
  input: Partial<ChannelContextMetaFileV1> | null | undefined,
): ChannelContextMetaFileV1 {
  const routesByContextId: Record<string, ChannelContextRouteV1> = {};
  const contextIdByTargetKey: Record<string, string> = {};
  const rawRoutes =
    input && typeof input === "object" && input.routesByContextId
      ? input.routesByContextId
      : {};
  if (rawRoutes && typeof rawRoutes === "object") {
    for (const [contextId, rawRoute] of Object.entries(rawRoutes)) {
      const route = normalizeRoute(rawRoute as Partial<ChannelContextRouteV1>);
      if (!route) continue;
      routesByContextId[contextId] = route;
    }
  }

  const rawTargetMap =
    input && typeof input === "object" && input.contextIdByTargetKey
      ? input.contextIdByTargetKey
      : {};
  if (rawTargetMap && typeof rawTargetMap === "object") {
    for (const [targetKey, contextIdRaw] of Object.entries(rawTargetMap)) {
      const contextId = toOptionalTrimmedString(contextIdRaw);
      if (!targetKey || !contextId) continue;
      if (!routesByContextId[contextId]) continue;
      contextIdByTargetKey[targetKey] = contextId;
    }
  }

  return {
    v: 1,
    updatedAt:
      typeof input?.updatedAt === "number" && Number.isFinite(input.updatedAt)
        ? input.updatedAt
        : Date.now(),
    contextIdByTargetKey,
    routesByContextId,
  };
}

/**
 * 构造目标键。
 *
 * 关键点（中文）
 * - 目标键是纯内部索引，不对外暴露。
 */
export function buildChannelTargetKey(target: ChannelContextTarget): string {
  const normalized = normalizeTarget(target);
  if (!normalized) return "";
  return [
    normalized.channel,
    normalized.chatId,
    normalized.targetType || "",
    typeof normalized.threadId === "number" ? String(normalized.threadId) : "",
  ].join("|");
}

async function readMetaFile(params: {
  rootPath: string;
}): Promise<ChannelContextMetaFileV1> {
  const filePath = getDowncityChannelMetaPath(params.rootPath);
  const raw = (await fs.readJson(filePath).catch(() => null)) as
    | Partial<ChannelContextMetaFileV1>
    | null;
  return normalizeMetaFile(raw);
}

async function writeMetaFile(params: {
  rootPath: string;
  file: ChannelContextMetaFileV1;
}): Promise<void> {
  const dirPath = getDowncityChannelDirPath(params.rootPath);
  const filePath = getDowncityChannelMetaPath(params.rootPath);
  await fs.ensureDir(dirPath);
  await fs.writeJson(filePath, params.file, { spaces: 2 });
}

/**
 * 通过 contextId 读取路由信息。
 */
export async function readChannelContextRouteByContextId(params: {
  context: ServiceRuntime;
  contextId: string;
}): Promise<ChannelContextRouteV1 | null> {
  const rootPath = String(params.context.rootPath || "").trim();
  const contextId = toOptionalTrimmedString(params.contextId);
  if (!rootPath || !contextId) return null;
  const file = await readMetaFile({ rootPath });
  return normalizeRoute(file.routesByContextId[contextId]);
}

/**
 * 列出当前 agent 已记录的所有渠道路由条目。
 *
 * 关键点（中文）
 * - 数据源为 `.downcity/channel/meta.json` 的 `routesByContextId`。
 * - 默认按 `updatedAt` 倒序返回，便于展示“最近活跃”会话。
 */
export async function listChannelContextRoutes(params: {
  context: ServiceRuntime;
}): Promise<{
  updatedAt: number;
  routes: ChannelContextRouteV1[];
}> {
  const rootPath = String(params.context.rootPath || "").trim();
  if (!rootPath) {
    return {
      updatedAt: Date.now(),
      routes: [],
    };
  }
  const file = await readMetaFile({ rootPath });
  const routes = Object.values(file.routesByContextId)
    .map((route) => normalizeRoute(route))
    .filter((route): route is ChannelContextRouteV1 => Boolean(route))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    updatedAt: file.updatedAt,
    routes,
  };
}

/**
 * 根据渠道目标查找已有 contextId（不自动创建）。
 */
export async function resolveChannelContextIdByTarget(params: {
  context: ServiceRuntime;
  target: ChannelContextTarget;
}): Promise<string | null> {
  const rootPath = String(params.context.rootPath || "").trim();
  if (!rootPath) return null;
  const targetKey = buildChannelTargetKey(params.target);
  if (!targetKey) return null;
  const file = await readMetaFile({ rootPath });
  const contextId = toOptionalTrimmedString(file.contextIdByTargetKey[targetKey]);
  if (!contextId) return null;
  return file.routesByContextId[contextId] ? contextId : null;
}

/**
 * 根据渠道目标解析或创建 contextId。
 */
export async function resolveOrCreateChannelContextIdByTarget(params: {
  context: ServiceRuntime;
  target: ChannelContextTarget;
}): Promise<string | null> {
  const rootPath = String(params.context.rootPath || "").trim();
  if (!rootPath) return null;
  const normalizedTarget = normalizeTarget(params.target);
  if (!normalizedTarget) return null;
  const targetKey = buildChannelTargetKey(normalizedTarget);
  if (!targetKey) return null;

  const file = await readMetaFile({ rootPath });
  const existingContextId = toOptionalTrimmedString(file.contextIdByTargetKey[targetKey]);
  if (
    existingContextId &&
    file.routesByContextId[existingContextId] &&
    normalizeRoute(file.routesByContextId[existingContextId])
  ) {
    return existingContextId;
  }

  const nextContextId = `ctx_${generateId()}`;
  file.contextIdByTargetKey[targetKey] = nextContextId;
  file.routesByContextId[nextContextId] = {
    v: 1,
    contextId: nextContextId,
    channel: normalizedTarget.channel,
    chatId: normalizedTarget.chatId,
    ...(normalizedTarget.targetType ? { targetType: normalizedTarget.targetType } : {}),
    ...(typeof normalizedTarget.threadId === "number"
      ? { threadId: normalizedTarget.threadId }
      : {}),
    updatedAt: Date.now(),
  };
  file.updatedAt = Date.now();
  await writeMetaFile({ rootPath, file });
  return nextContextId;
}

/**
 * 更新指定 contextId 的渠道路由信息。
 */
export async function upsertChannelContextRouteByContextId(params: {
  context: ServiceRuntime;
  contextId: string;
  target: ChannelContextTarget;
  messageId?: string;
  actorId?: string;
  actorName?: string;
  chatTitle?: string;
}): Promise<void> {
  const rootPath = String(params.context.rootPath || "").trim();
  const contextId = toOptionalTrimmedString(params.contextId);
  const normalizedTarget = normalizeTarget(params.target);
  if (!rootPath || !contextId || !normalizedTarget) return;
  const targetKey = buildChannelTargetKey(normalizedTarget);
  if (!targetKey) return;

  const file = await readMetaFile({ rootPath });
  const prev = normalizeRoute(file.routesByContextId[contextId]);
  const nextRoute: ChannelContextRouteV1 = {
    v: 1,
    contextId,
    channel: normalizedTarget.channel,
    chatId: normalizedTarget.chatId,
    ...(normalizedTarget.targetType ? { targetType: normalizedTarget.targetType } : {}),
    ...(typeof normalizedTarget.threadId === "number"
      ? { threadId: normalizedTarget.threadId }
      : {}),
    ...(toOptionalTrimmedString(params.messageId)
      ? { messageId: toOptionalTrimmedString(params.messageId) }
      : prev?.messageId
        ? { messageId: prev.messageId }
        : {}),
    ...(toOptionalTrimmedString(params.actorId)
      ? { actorId: toOptionalTrimmedString(params.actorId) }
      : prev?.actorId
        ? { actorId: prev.actorId }
        : {}),
    ...(toOptionalTrimmedString(params.actorName)
      ? { actorName: toOptionalTrimmedString(params.actorName) }
      : prev?.actorName
        ? { actorName: prev.actorName }
        : {}),
    ...(toOptionalTrimmedString(params.chatTitle)
      ? { chatTitle: toOptionalTrimmedString(params.chatTitle) }
      : prev?.chatTitle
        ? { chatTitle: prev.chatTitle }
        : {}),
    updatedAt: Date.now(),
  };

  file.routesByContextId[contextId] = nextRoute;
  file.contextIdByTargetKey[targetKey] = contextId;
  file.updatedAt = Date.now();
  await writeMetaFile({ rootPath, file });
}

/**
 * 删除指定 contextId 的渠道路由映射。
 *
 * 关键点（中文）
 * - 会同步清理 `routesByContextId` 与 `contextIdByTargetKey` 双索引。
 * - 仅影响 chat 路由，不触碰 context/chat 历史文件。
 */
export async function removeChannelContextRouteByContextId(params: {
  context: ServiceRuntime;
  contextId: string;
}): Promise<{
  removed: boolean;
  route: ChannelContextRouteV1 | null;
}> {
  const rootPath = String(params.context.rootPath || "").trim();
  const contextId = toOptionalTrimmedString(params.contextId);
  if (!rootPath || !contextId) {
    return {
      removed: false,
      route: null,
    };
  }

  const file = await readMetaFile({ rootPath });
  const route = normalizeRoute(file.routesByContextId[contextId]);
  if (!route) {
    return {
      removed: false,
      route: null,
    };
  }

  delete file.routesByContextId[contextId];
  for (const [targetKey, mappedContextId] of Object.entries(
    file.contextIdByTargetKey,
  )) {
    if (mappedContextId === contextId) {
      delete file.contextIdByTargetKey[targetKey];
    }
  }

  file.updatedAt = Date.now();
  await writeMetaFile({ rootPath, file });
  return {
    removed: true,
    route,
  };
}

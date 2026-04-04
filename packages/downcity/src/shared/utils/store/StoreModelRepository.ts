/**
 * ConsoleStore 模型与 Provider 仓储。
 *
 * 关键点（中文）
 * - 只负责 model/provider 相关读写，不处理 env、channel account、secure settings。
 * - 对外暴露纯函数，`ConsoleStore` 作为门面调用。
 */

import { eq } from "drizzle-orm";
import type {
  StoredModel,
  StoredModelProvider,
  UpsertModelInput,
  UpsertModelProviderInput,
} from "@/shared/types/Store.js";
import { decryptText, encryptText } from "./crypto.js";
import { modelProvidersTable, modelsTable } from "./schema.js";
import type { ConsoleStoreContext } from "./StoreShared.js";
import { nowIso } from "./StoreShared.js";

/**
 * 列出 providers。
 */
export async function listStoredProviders(
  context: ConsoleStoreContext,
): Promise<StoredModelProvider[]> {
  const rows = context.db.select().from(modelProvidersTable).all();
  const result: StoredModelProvider[] = [];
  for (const row of rows) {
    let apiKey: string | undefined;
    if (row.apiKeyEncrypted) {
      apiKey = await decryptText(row.apiKeyEncrypted);
    }
    result.push({
      id: row.id,
      type: row.type as StoredModelProvider["type"],
      baseUrl: row.baseUrl || undefined,
      apiKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
  return result;
}

/**
 * 获取单个 provider。
 */
export async function getStoredProvider(
  context: ConsoleStoreContext,
  providerId: string,
): Promise<StoredModelProvider | null> {
  const row = context.db
    .select()
    .from(modelProvidersTable)
    .where(eq(modelProvidersTable.id, providerId))
    .get();
  if (!row) return null;
  let apiKey: string | undefined;
  if (row.apiKeyEncrypted) {
    apiKey = await decryptText(row.apiKeyEncrypted);
  }
  return {
    id: row.id,
    type: row.type as StoredModelProvider["type"],
    baseUrl: row.baseUrl || undefined,
    apiKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 新增或更新 provider。
 */
export async function upsertStoredProvider(
  context: ConsoleStoreContext,
  input: UpsertModelProviderInput,
): Promise<void> {
  const id = String(input.id || "").trim();
  if (!id) throw new Error("providerId cannot be empty");

  const existing = context.db
    .select()
    .from(modelProvidersTable)
    .where(eq(modelProvidersTable.id, id))
    .get();
  const createdAt = existing?.createdAt || nowIso();
  const updatedAt = nowIso();
  const hasApiKeyField = Object.prototype.hasOwnProperty.call(input, "apiKey");
  let apiKeyEncrypted: string | null = existing?.apiKeyEncrypted || null;
  if (hasApiKeyField) {
    if (typeof input.apiKey === "string" && input.apiKey.length > 0) {
      apiKeyEncrypted = await encryptText(input.apiKey);
    } else {
      apiKeyEncrypted = null;
    }
  }

  context.db
    .insert(modelProvidersTable)
    .values({
      id,
      type: input.type,
      baseUrl: input.baseUrl || null,
      apiKeyEncrypted,
      createdAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: modelProvidersTable.id,
      set: {
        type: input.type,
        baseUrl: input.baseUrl || null,
        apiKeyEncrypted,
        updatedAt,
      },
    })
    .run();
}

/**
 * 删除 provider。
 */
export function removeStoredProvider(
  context: ConsoleStoreContext,
  providerId: string,
): void {
  const refs = context.db
    .select()
    .from(modelsTable)
    .where(eq(modelsTable.providerId, providerId))
    .all();
  if (refs.length > 0) {
    throw new Error(
      `Provider "${providerId}" is referenced by models: ${refs.map((item) => item.id).join(", ")}`,
    );
  }
  context.db
    .delete(modelProvidersTable)
    .where(eq(modelProvidersTable.id, providerId))
    .run();
}

/**
 * 列出 models。
 */
export function listStoredModels(context: ConsoleStoreContext): StoredModel[] {
  const rows = context.db.select().from(modelsTable).all();
  return rows.map((row) => ({
    id: row.id,
    providerId: row.providerId,
    name: row.name,
    temperature: row.temperature ?? undefined,
    maxTokens: row.maxTokens ?? undefined,
    topP: row.topP ?? undefined,
    frequencyPenalty: row.frequencyPenalty ?? undefined,
    presencePenalty: row.presencePenalty ?? undefined,
    anthropicVersion: row.anthropicVersion ?? undefined,
    isPaused: Number(row.isPaused || 0) === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * 获取单个 model。
 */
export function getStoredModel(
  context: ConsoleStoreContext,
  modelId: string,
): StoredModel | null {
  const row = context.db
    .select()
    .from(modelsTable)
    .where(eq(modelsTable.id, modelId))
    .get();
  if (!row) return null;
  return {
    id: row.id,
    providerId: row.providerId,
    name: row.name,
    temperature: row.temperature ?? undefined,
    maxTokens: row.maxTokens ?? undefined,
    topP: row.topP ?? undefined,
    frequencyPenalty: row.frequencyPenalty ?? undefined,
    presencePenalty: row.presencePenalty ?? undefined,
    anthropicVersion: row.anthropicVersion ?? undefined,
    isPaused: Number(row.isPaused || 0) === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 新增或更新 model。
 */
export function upsertStoredModel(
  context: ConsoleStoreContext,
  input: UpsertModelInput,
): void {
  const id = String(input.id || "").trim();
  if (!id) throw new Error("modelId cannot be empty");
  const providerId = String(input.providerId || "").trim();
  if (!providerId) throw new Error("providerId cannot be empty");
  const provider = context.db
    .select()
    .from(modelProvidersTable)
    .where(eq(modelProvidersTable.id, providerId))
    .get();
  if (!provider) throw new Error(`Provider not found: ${providerId}`);

  const existing = context.db
    .select()
    .from(modelsTable)
    .where(eq(modelsTable.id, id))
    .get();
  const createdAt = existing?.createdAt || nowIso();
  const updatedAt = nowIso();

  context.db
    .insert(modelsTable)
    .values({
      id,
      providerId,
      name: input.name,
      temperature: input.temperature ?? null,
      maxTokens: input.maxTokens ?? null,
      topP: input.topP ?? null,
      frequencyPenalty: input.frequencyPenalty ?? null,
      presencePenalty: input.presencePenalty ?? null,
      anthropicVersion: input.anthropicVersion ?? null,
      isPaused: input.isPaused === true ? 1 : 0,
      createdAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: modelsTable.id,
      set: {
        providerId,
        name: input.name,
        temperature: input.temperature ?? null,
        maxTokens: input.maxTokens ?? null,
        topP: input.topP ?? null,
        frequencyPenalty: input.frequencyPenalty ?? null,
        presencePenalty: input.presencePenalty ?? null,
        anthropicVersion: input.anthropicVersion ?? null,
        isPaused: input.isPaused === true ? 1 : 0,
        updatedAt,
      },
    })
    .run();
}

/**
 * 切换 model 暂停状态。
 */
export function setStoredModelPaused(
  context: ConsoleStoreContext,
  modelId: string,
  paused: boolean,
): void {
  const id = String(modelId || "").trim();
  if (!id) throw new Error("modelId cannot be empty");
  const current = getStoredModel(context, id);
  if (!current) throw new Error(`Model not found: ${id}`);
  context.db
    .update(modelsTable)
    .set({
      isPaused: paused ? 1 : 0,
      updatedAt: nowIso(),
    })
    .where(eq(modelsTable.id, id))
    .run();
}

/**
 * 删除 model。
 */
export function removeStoredModel(
  context: ConsoleStoreContext,
  modelId: string,
): void {
  context.db.delete(modelsTable).where(eq(modelsTable.id, modelId)).run();
}

/**
 * 获取“model + provider”聚合信息。
 */
export async function getResolvedStoredModel(
  context: ConsoleStoreContext,
  modelId: string,
): Promise<{ model: StoredModel; provider: StoredModelProvider } | null> {
  const model = getStoredModel(context, modelId);
  if (!model) return null;
  const provider = await getStoredProvider(context, model.providerId);
  if (!provider) return null;
  return { model, provider };
}

/**
 * 清空模型相关表。
 */
export function clearStoredModelsAndProviders(
  context: ConsoleStoreContext,
): void {
  context.sqlite.exec("DELETE FROM models;");
  context.sqlite.exec("DELETE FROM model_providers;");
}

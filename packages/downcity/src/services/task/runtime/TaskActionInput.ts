/**
 * TaskActionInput：task service 的 CLI/API 输入映射模块。
 *
 * 关键点（中文）
 * - 统一处理命令行与 HTTP 请求到 task action payload 的转换。
 * - 参数校验尽量前置到输入层，避免进入执行层后才发现字段非法。
 */

import { resolveSessionId } from "@sessions/SessionId.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { ServiceActionCommandInput } from "@/types/Service.js";
import type { ShipTaskKind, ShipTaskStatus } from "@services/task/types/Task.js";
import type {
  TaskCreateRequest,
  TaskDeleteRequest,
  TaskRunRequest,
  TaskSetStatusRequest,
  TaskUpdateRequest,
} from "@services/task/types/TaskCommand.js";
import type { TaskListActionPayload } from "@/types/TaskService.js";

function parseJsonBodyObject(rawBody: JsonValue): JsonObject {
  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    return rawBody as JsonObject;
  }
  return {};
}

function getStringField(body: JsonObject, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

function getOptionalStringField(
  body: JsonObject,
  key: string,
): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

function getBooleanField(body: JsonObject, key: string): boolean {
  return body[key] === true;
}

function parseBooleanLike(value: JsonValue | undefined): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function getOptionalTaskStatusField(
  body: JsonObject,
  key: string,
): ShipTaskStatus | undefined {
  const value = body[key];
  if (value === "enabled" || value === "paused" || value === "disabled") {
    return value;
  }
  return undefined;
}

function getOptionalTaskKindField(
  body: JsonObject,
  key: string,
): ShipTaskKind | undefined {
  const value = body[key];
  if (value === "agent" || value === "script") {
    return value;
  }
  return undefined;
}

function getStringOpt(
  opts: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = opts[key];
  return typeof value === "string" ? value.trim() : undefined;
}

function getBooleanOpt(
  opts: Record<string, JsonValue>,
  key: string,
): boolean | undefined {
  const value = opts[key];
  return typeof value === "boolean" ? value : undefined;
}

function getBooleanLikeOpt(
  opts: Record<string, JsonValue>,
  key: string,
): boolean | undefined {
  return parseBooleanLike(opts[key]);
}

function readTaskStatusOrThrow(value?: string): ShipTaskStatus | undefined {
  if (!value) return undefined;
  if (value === "enabled" || value === "paused" || value === "disabled") {
    return value;
  }
  throw new Error(`Invalid task status: ${value}`);
}

function readTaskKindOrThrow(value?: string): ShipTaskKind | undefined {
  if (!value) return undefined;
  if (value === "agent" || value === "script") {
    return value;
  }
  throw new Error(`Invalid task kind: ${value}`);
}

function resolveSessionIdOrThrow(input?: string): string {
  const sessionId = resolveSessionId({ sessionId: input });
  if (!sessionId) {
    throw new Error(
      "Missing sessionId. Provide --session-id or ensure DC_SESSION_ID is available.",
    );
  }
  return sessionId;
}

function mapTaskListCommandInput(
  opts: Record<string, JsonValue>,
): TaskListActionPayload {
  const status = readTaskStatusOrThrow(getStringOpt(opts, "status"));
  return status ? { status } : {};
}

function mapTaskCreateCommandInput(
  opts: Record<string, JsonValue>,
): TaskCreateRequest {
  const title = String(getStringOpt(opts, "title") || "").trim();
  const description = String(getStringOpt(opts, "description") || "").trim();
  if (!title) throw new Error("Missing title");
  if (!description) throw new Error("Missing description");

  const sessionId = resolveSessionIdOrThrow(getStringOpt(opts, "sessionId"));
  const kind = readTaskKindOrThrow(getStringOpt(opts, "kind"));
  const review = getBooleanLikeOpt(opts, "review");
  const status = readTaskStatusOrThrow(getStringOpt(opts, "status"));
  const activate = getBooleanOpt(opts, "activate") === true;
  if (activate && status && status !== "enabled") {
    throw new Error("`--activate` conflicts with `--status` unless status=enabled");
  }
  const resolvedStatus = activate ? "enabled" : status;

  return {
    title,
    when: String(getStringOpt(opts, "when") || "@manual").trim() || "@manual",
    description,
    sessionId,
    ...(kind ? { kind } : {}),
    ...(typeof review === "boolean" ? { review } : {}),
    ...(resolvedStatus ? { status: resolvedStatus } : {}),
    ...(typeof getStringOpt(opts, "body") === "string"
      ? { body: getStringOpt(opts, "body") }
      : {}),
    overwrite: getBooleanOpt(opts, "overwrite") === true,
  };
}

function mapTaskUpdateCommandInput(params: {
  title: string;
  opts: Record<string, JsonValue>;
}): TaskUpdateRequest {
  const opts = params.opts;
  const kind = readTaskKindOrThrow(getStringOpt(opts, "kind"));
  const review = getBooleanLikeOpt(opts, "review");
  const status = readTaskStatusOrThrow(getStringOpt(opts, "status"));
  const activate = getBooleanOpt(opts, "activate") === true;

  // 关键点（中文）：set 与 clear 选项互斥，提前在命令入口做校验。
  const conflicts: string[] = [];
  if (
    typeof getStringOpt(opts, "body") === "string" &&
    getBooleanOpt(opts, "clearBody")
  ) {
    conflicts.push("`--body` conflicts with `--clear-body`");
  }
  if (
    typeof getStringOpt(opts, "when") === "string" &&
    getBooleanOpt(opts, "clearWhen")
  ) {
    conflicts.push("`--when` conflicts with `--clear-when`");
  }
  if (activate && status && status !== "enabled") {
    conflicts.push("`--activate` conflicts with `--status` unless status=enabled");
  }
  if (conflicts.length > 0) {
    throw new Error(conflicts.join("; "));
  }
  const resolvedStatus = activate ? "enabled" : status;

  const hasUpdate =
    typeof getStringOpt(opts, "title") === "string" ||
    typeof getStringOpt(opts, "when") === "string" ||
    typeof getStringOpt(opts, "description") === "string" ||
    typeof getStringOpt(opts, "sessionId") === "string" ||
    typeof kind === "string" ||
    typeof review === "boolean" ||
    getBooleanOpt(opts, "clearWhen") === true ||
    typeof resolvedStatus === "string" ||
    typeof getStringOpt(opts, "body") === "string" ||
    getBooleanOpt(opts, "clearBody") === true;

  if (!hasUpdate) {
    throw new Error("No update fields provided");
  }

  return {
    title: String(params.title || "").trim(),
    ...(typeof getStringOpt(opts, "title") === "string"
      ? { titleNext: getStringOpt(opts, "title") }
      : {}),
    ...(typeof getStringOpt(opts, "when") === "string"
      ? { when: getStringOpt(opts, "when") }
      : {}),
    ...(typeof getStringOpt(opts, "description") === "string"
      ? { description: getStringOpt(opts, "description") }
      : {}),
    ...(typeof getStringOpt(opts, "sessionId") === "string"
      ? { sessionId: getStringOpt(opts, "sessionId") }
      : {}),
    ...(typeof kind === "string" ? { kind } : {}),
    ...(typeof review === "boolean" ? { review } : {}),
    ...(getBooleanOpt(opts, "clearWhen") ? { clearWhen: true } : {}),
    ...(typeof resolvedStatus === "string" ? { status: resolvedStatus } : {}),
    ...(typeof getStringOpt(opts, "body") === "string"
      ? { body: getStringOpt(opts, "body") }
      : {}),
    ...(getBooleanOpt(opts, "clearBody") ? { clearBody: true } : {}),
  };
}

function mapTaskSetStatusCommandInput(params: {
  title: string;
  status: ShipTaskStatus;
}): TaskSetStatusRequest {
  return {
    title: String(params.title || "").trim(),
    status: params.status,
  };
}

function mapTaskDeleteCommandInput(titleInput: string): TaskDeleteRequest {
  const title = String(titleInput || "").trim();
  if (!title) throw new Error("Missing title");
  return { title };
}

function mapTaskListApiInput(query: { status?: string }): TaskListActionPayload {
  const status = readTaskStatusOrThrow(
    typeof query.status === "string" ? query.status.trim() : undefined,
  );
  return status ? { status } : {};
}

function mapTaskCreateApiInput(body: JsonObject): TaskCreateRequest {
  const status = getOptionalTaskStatusField(body, "status");
  const activate = getBooleanField(body, "activate");
  if (activate && status && status !== "enabled") {
    throw new Error("`activate` conflicts with `status` unless status=enabled");
  }
  const resolvedStatus = activate ? "enabled" : status;

  return {
    title: getStringField(body, "title"),
    when: getStringField(body, "when"),
    description: getStringField(body, "description"),
    sessionId: getStringField(body, "sessionId"),
    kind: getOptionalTaskKindField(body, "kind"),
    ...(typeof parseBooleanLike(body.review) === "boolean"
      ? { review: parseBooleanLike(body.review) }
      : {}),
    status: resolvedStatus,
    body: getOptionalStringField(body, "body"),
    overwrite: getBooleanField(body, "overwrite"),
  };
}

function mapTaskRunApiInput(body: JsonObject): TaskRunRequest {
  return {
    title: getStringField(body, "title"),
    ...(getOptionalStringField(body, "reason")
      ? { reason: getOptionalStringField(body, "reason") }
      : {}),
  };
}

function mapTaskUpdateApiInput(body: JsonObject): TaskUpdateRequest {
  const status = getOptionalTaskStatusField(body, "status");
  const activate = getBooleanField(body, "activate");
  if (activate && status && status !== "enabled") {
    throw new Error("`activate` conflicts with `status` unless status=enabled");
  }
  const resolvedStatus = activate ? "enabled" : status;

  return {
    title: getStringField(body, "title"),
    ...(getOptionalStringField(body, "titleNext")
      ? { titleNext: getOptionalStringField(body, "titleNext") }
      : {}),
    ...(getOptionalStringField(body, "description")
      ? { description: getOptionalStringField(body, "description") }
      : {}),
    ...(getOptionalStringField(body, "when")
      ? { when: getOptionalStringField(body, "when") }
      : {}),
    ...(getOptionalStringField(body, "sessionId")
      ? { sessionId: getOptionalStringField(body, "sessionId") }
      : {}),
    ...(getOptionalTaskKindField(body, "kind")
      ? { kind: getOptionalTaskKindField(body, "kind") }
      : {}),
    ...(typeof parseBooleanLike(body.review) === "boolean"
      ? { review: parseBooleanLike(body.review) }
      : {}),
    ...(getBooleanField(body, "clearWhen") ? { clearWhen: true } : {}),
    ...(resolvedStatus ? { status: resolvedStatus } : {}),
    ...(getOptionalStringField(body, "body")
      ? { body: getOptionalStringField(body, "body") }
      : {}),
    ...(getBooleanField(body, "clearBody") ? { clearBody: true } : {}),
  };
}

function mapTaskStatusApiInput(body: JsonObject): TaskSetStatusRequest {
  const status = getOptionalTaskStatusField(body, "status");
  if (!status) {
    throw new Error("Missing or invalid status");
  }
  return {
    title: getStringField(body, "title"),
    status,
  };
}

function mapTaskDeleteApiInput(body: JsonObject): TaskDeleteRequest {
  const title = getStringField(body, "title");
  if (!String(title || "").trim()) {
    throw new Error("Missing title");
  }
  return { title };
}

export function mapTaskListCommandPayload(
  input: ServiceActionCommandInput,
): TaskListActionPayload {
  return mapTaskListCommandInput(input.opts);
}

export function mapTaskCreateCommandPayload(
  input: ServiceActionCommandInput,
): TaskCreateRequest {
  return mapTaskCreateCommandInput(input.opts);
}

export function mapTaskRunCommandPayload(
  input: ServiceActionCommandInput,
): TaskRunRequest {
  const title = String(input.args[0] || "").trim();
  if (!title) throw new Error("Missing title");
  const reason = getStringOpt(input.opts, "reason");
  return {
    title,
    ...(reason ? { reason } : {}),
  };
}

export function mapTaskDeleteCommandPayload(
  input: ServiceActionCommandInput,
): TaskDeleteRequest {
  return mapTaskDeleteCommandInput(String(input.args[0] || ""));
}

export function mapTaskUpdateCommandPayload(
  input: ServiceActionCommandInput,
): TaskUpdateRequest {
  const title = String(input.args[0] || "").trim();
  if (!title) throw new Error("Missing title");
  return mapTaskUpdateCommandInput({
    title,
    opts: input.opts,
  });
}

export function mapTaskStatusCommandPayload(
  input: ServiceActionCommandInput,
): TaskSetStatusRequest {
  const title = String(input.args[0] || "").trim();
  const status = readTaskStatusOrThrow(String(input.args[1] || "").trim());
  if (!title) throw new Error("Missing title");
  if (!status) throw new Error("Missing or invalid status");
  return mapTaskSetStatusCommandInput({ title, status });
}

export function mapTaskEnableCommandPayload(
  input: ServiceActionCommandInput,
): TaskSetStatusRequest {
  const title = String(input.args[0] || "").trim();
  if (!title) throw new Error("Missing title");
  return mapTaskSetStatusCommandInput({
    title,
    status: "enabled",
  });
}

export function mapTaskDisableCommandPayload(
  input: ServiceActionCommandInput,
): TaskSetStatusRequest {
  const title = String(input.args[0] || "").trim();
  if (!title) throw new Error("Missing title");
  return mapTaskSetStatusCommandInput({
    title,
    status: "disabled",
  });
}

export function mapTaskListApiPayload(query: {
  status?: string;
}): TaskListActionPayload {
  return mapTaskListApiInput(query);
}

export async function mapTaskCreateApiPayload(c: {
  req: { json: () => Promise<JsonValue> };
}): Promise<TaskCreateRequest> {
  const body = parseJsonBodyObject(await c.req.json());
  return mapTaskCreateApiInput(body);
}

export async function mapTaskRunApiPayload(c: {
  req: { json: () => Promise<JsonValue> };
}): Promise<TaskRunRequest> {
  const body = parseJsonBodyObject(await c.req.json());
  return mapTaskRunApiInput(body);
}

export async function mapTaskUpdateApiPayload(c: {
  req: { json: () => Promise<JsonValue> };
}): Promise<TaskUpdateRequest> {
  const body = parseJsonBodyObject(await c.req.json());
  return mapTaskUpdateApiInput(body);
}

export async function mapTaskStatusApiPayload(c: {
  req: { json: () => Promise<JsonValue> };
}): Promise<TaskSetStatusRequest> {
  const body = parseJsonBodyObject(await c.req.json());
  return mapTaskStatusApiInput(body);
}

export async function mapTaskDeleteApiPayload(c: {
  req: { json: () => Promise<JsonValue> };
}): Promise<TaskDeleteRequest> {
  const body = parseJsonBodyObject(await c.req.json());
  return mapTaskDeleteApiInput(body);
}

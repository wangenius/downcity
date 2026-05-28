/**
 * PluginCommandRequest：统一 plugin runtime command 请求解析模块。
 *
 * 关键点（中文）
 * - 统一收口当前 HTTP 入口的请求体解析。
 * - plugin runtime 远程调用统一走 runtime command 协议，不再让 action 自带 HTTP route。
 * - ActionSchedule 参数（`schedule` / `delay` / `time`）也在这里一次性归一化。
 */

import type { JsonValue } from "@/types/common/Json.js";
import type { PluginActionScheduleInput } from "@/plugin/types/ActionSchedule.js";
import {
  normalizeRunAtMsOrThrow,
  parseActionScheduleRunAtMsOrThrow,
} from "@/plugin/core/ActionScheduleTime.js";

type JsonRecord = Record<string, unknown>;

/**
 * 统一 plugin runtime command 请求体。
 */
export type PluginCommandRequestBody = {
  /**
   * 目标 plugin 名称。
   */
  pluginName: string;
  /**
   * 目标 command / action 名称。
   */
  command: string;
  /**
   * 结构化 payload。
   */
  payload?: JsonValue;
  /**
   * 可选调度信息。
   */
  schedule?: PluginActionScheduleInput;
};

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * 从统一请求体中提取调度输入。
 */
function readScheduleInput(
  body: JsonRecord,
): PluginActionScheduleInput | undefined {
  const nestedSchedule = isJsonRecord(body.schedule) ? body.schedule : undefined;
  const nestedRunAtMs = nestedSchedule?.runAtMs;
  const topLevelDelay = body.delayMs ?? body.delay;
  const topLevelTime = body.sendAtMs ?? body.sendAt ?? body.time;

  if (body.schedule !== undefined && !nestedSchedule) {
    throw new Error("schedule must be an object");
  }
  if (nestedRunAtMs !== undefined && (topLevelDelay !== undefined || topLevelTime !== undefined)) {
    throw new Error("`schedule.runAtMs` cannot be used together with `delay/time`.");
  }
  if (nestedRunAtMs !== undefined) {
    return {
      runAtMs: normalizeRunAtMsOrThrow(
        nestedRunAtMs as string | number | undefined,
        "schedule.runAtMs",
      ),
    };
  }

  const runAtMs = parseActionScheduleRunAtMsOrThrow({
    delay: topLevelDelay as string | number | undefined,
    time: topLevelTime as string | number | undefined,
  });
  if (typeof runAtMs !== "number") return undefined;
  return { runAtMs };
}

/**
 * 解析统一 plugin runtime command 请求体。
 */
export function parsePluginCommandRequestBody(
  rawBody: JsonValue | undefined,
): PluginCommandRequestBody {
  const body = isJsonRecord(rawBody) ? rawBody : {};
  const schedule = readScheduleInput(body);
  return {
    pluginName: String(body.pluginName || "").trim(),
    command: String(body.command || "").trim(),
    ...(body.payload !== undefined ? { payload: body.payload as JsonValue } : {}),
    ...(schedule ? { schedule } : {}),
  };
}

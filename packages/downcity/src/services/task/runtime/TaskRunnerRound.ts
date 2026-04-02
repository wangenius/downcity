/**
 * TaskRunnerRound：task runner 单轮执行与输出解析模块。
 *
 * 关键点（中文）
 * - 收敛 agent/script 单轮执行、assistant 输出提取、模拟用户判定解析等逻辑。
 * - 这些逻辑可独立演进，不必与 run 目录产物写入混在一起。
 */

import path from "node:path";
import fs from "fs-extra";
import { execa } from "execa";
import { applyInternalAgentAuthEnv } from "@/main/auth/AuthEnv.js";
import type { SessionRunResult } from "@/types/SessionRun.js";
import type { JsonObject } from "@/types/Json.js";
import type {
  ChatSendOutputPick,
  ScriptExecutionResult,
  TaskResultValidation,
  TaskSessionRuntime,
  UserSimulatorDecision,
} from "@/types/TaskRunner.js";
import { withRequestContext } from "@sessions/RequestContext.js";
import { appendTaskRoundUserMessage } from "./TaskRunnerSession.js";

/**
 * 从文本中提取 JSON 对象（支持 ```json 代码块）。
 */
export function tryExtractJsonObject(text: string): JsonObject | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  const tryParse = (s: string): JsonObject | null => {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JsonObject;
      }
      return null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw);
  if (direct) return direct;

  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1].trim());
    if (parsed) return parsed;
  }

  const loose = raw.match(/\{[\s\S]*\}/);
  if (loose?.[0]) {
    const parsed = tryParse(loose[0]);
    if (parsed) return parsed;
  }

  return null;
}

function parsePossibleJsonObject(value: unknown): JsonObject | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  if (typeof value !== "string") return null;
  return tryExtractJsonObject(value);
}

function extractTextFromAssistantMessageParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  const texts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const p = part as { type?: unknown; text?: unknown };
    if (p.type !== "text" && p.type !== "input_text") continue;
    if (typeof p.text !== "string") continue;
    const value = p.text.trim();
    if (!value) continue;
    texts.push(value);
  }
  return texts.join("\n").trim();
}

function pickLastChatSendDeliveredText(parts: unknown): ChatSendOutputPick {
  if (!Array.isArray(parts)) return { text: "", delivered: false };
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    if (!part || typeof part !== "object") continue;
    const p = part as {
      type?: unknown;
      toolName?: unknown;
      tool?: unknown;
      input?: unknown;
      rawInput?: unknown;
      arguments?: unknown;
      output?: unknown;
      result?: unknown;
      state?: unknown;
    };
    if (p.type !== "tool-call") continue;
    const toolName = String(p.toolName ?? p.tool ?? "").trim();
    if (toolName !== "chat_send") continue;
    const inputObject = parsePossibleJsonObject(
      p.input ?? p.rawInput ?? p.arguments,
    );
    if (!inputObject) continue;
    const text = String(inputObject.text ?? "").trim();
    if (!text) continue;

    const state = String(p.state ?? "").trim();
    if (state === "output-error" || state === "output-denied") {
      return { text, delivered: false };
    }

    const outputObject = parsePossibleJsonObject(p.output ?? p.result);
    if (outputObject) {
      const success = outputObject.success;
      if (success === true) return { text, delivered: true };
      if (success === false) return { text, delivered: false };
    }

    if (state === "output-available") return { text, delivered: true };
    return { text, delivered: false };
  }
  return { text: "", delivered: false };
}

/**
 * 从 assistant 输出中提取最终用户可见文本。
 */
export function pickAgentOutput(
  assistantMessage: SessionRunResult["assistantMessage"],
): ChatSendOutputPick {
  const picked = pickLastChatSendDeliveredText(
    (assistantMessage as { parts?: unknown } | null)?.parts,
  );
  if (picked.text) return picked;
  return {
    text: extractTextFromAssistantMessageParts(
      (assistantMessage as { parts?: unknown } | null)?.parts,
    ),
    delivered: false,
  };
}

/**
 * 解析模拟用户 agent 的判定结果。
 */
export function parseUserSimulatorDecision(outputText: string): UserSimulatorDecision {
  const raw = String(outputText ?? "").trim();
  const obj = tryExtractJsonObject(raw);
  if (obj) {
    const satisfiedRaw = obj.satisfied;
    const satisfied =
      satisfiedRaw === true ||
      (typeof satisfiedRaw === "string" && satisfiedRaw.trim().toLowerCase() === "true");
    const reply = String(obj.reply ?? "").trim();
    const reason = String(obj.reason ?? "").trim();
    const scoreRaw = obj.score;
    const score =
      typeof scoreRaw === "number"
        ? scoreRaw
        : typeof scoreRaw === "string" && /^(\d+)(\.\d+)?$/.test(scoreRaw.trim())
          ? Number(scoreRaw)
          : undefined;
    const normalizedScore =
      typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 10
        ? score
        : undefined;
    return {
      satisfied,
      reply,
      reason,
      ...(typeof normalizedScore === "number" ? { score: normalizedScore } : {}),
      raw,
    };
  }

  const lower = raw.toLowerCase();
  const likelySatisfied =
    (lower.includes("satisfied") || lower.includes("满意") || lower.includes("通过")) &&
    !lower.includes("not satisfied") &&
    !lower.includes("不满意");

  return {
    satisfied: likelySatisfied,
    reply: raw,
    reason: likelySatisfied ? "heuristic satisfied" : "heuristic not satisfied",
    raw,
  };
}

/**
 * 构造执行 agent 的轮次输入。
 */
export function buildExecutorRoundQuery(params: {
  taskBody: string;
  round: number;
  lastOutputText?: string;
  lastFeedback?: string;
}): string {
  if (params.round <= 1) return params.taskBody;
  return [
    "# 任务目标（保持不变）",
    "",
    params.taskBody || "_(empty body)_",
    "",
    `# 这是第 ${params.round} 轮执行`,
    "",
    "请根据以下“模拟用户反馈”和“上一轮输出”进行修订，并给出新的完整结果。",
    "",
    "## 模拟用户反馈",
    "",
    params.lastFeedback ? params.lastFeedback : "_(no feedback)_",
    "",
    "## 上一轮输出",
    "",
    params.lastOutputText ? params.lastOutputText : "_(empty output)_",
    "",
  ].join("\n");
}

/**
 * 构造模拟用户 agent 的判定输入。
 */
export function buildUserSimulatorQuery(params: {
  taskTitle: string;
  taskDescription: string;
  taskBody: string;
  round: number;
  maxRounds: number;
  executorOutputText: string;
  ruleErrors: string[];
}): string {
  const ruleSection =
    params.ruleErrors.length > 0
      ? params.ruleErrors.map((x) => `- ${x}`).join("\n")
      : "- (none)";
  return [
    "你是一个“模拟用户”Agent。你要根据任务目标审阅执行结果，并给出用户回复。",
    "",
    "请严格输出 JSON 对象（不要输出 markdown）：",
    '{"satisfied": boolean, "reply": string, "reason": string, "score": number}',
    "",
    "规则：",
    "1) 如果结果还不满足目标，satisfied 必须是 false，reply 要像用户一样明确提出修改要求。",
    "2) 如果已经满足，satisfied=true，reply 给简短确认。",
    "3) score 范围 0-10。",
    "4) 如果系统规则校验有失败项（见下方），必须判定为不满意。",
    "",
    `任务标题: ${params.taskTitle}`,
    `任务描述: ${params.taskDescription}`,
    `当前轮次: ${params.round}/${params.maxRounds}`,
    "",
    "任务正文：",
    params.taskBody || "_(empty body)_",
    "",
    "系统规则校验失败项：",
    ruleSection,
    "",
    "执行 Agent 本轮输出：",
    params.executorOutputText || "_(empty output)_",
    "",
  ].join("\n");
}

/**
 * 执行一轮 agent.run。
 */
export async function runAgentRound(params: {
  taskSessionRuntime: TaskSessionRuntime;
  sessionId: string;
  taskId: string;
  query: string;
  actorId: string;
  actorName: string;
}): Promise<{ outputText: string; delivered: boolean; rawResult: SessionRunResult }> {
  try {
    await appendTaskRoundUserMessage({
      taskSessionRuntime: params.taskSessionRuntime,
      sessionId: params.sessionId,
      taskId: params.taskId,
      query: params.query,
      actorId: params.actorId,
      actorName: params.actorName,
    });
  } catch {
    // ignore
  }

  const result = await withRequestContext(
    {
      sessionId: params.sessionId,
    },
    () =>
      params.taskSessionRuntime.getRuntime(params.sessionId).run({
        query: params.query,
      }),
  );
  const outputPick = pickAgentOutput(result.assistantMessage);

  if (!result.success) {
    const reason = outputPick.text || "agent run returned success=false";
    throw new Error(reason);
  }

  if (!String(outputPick.text || "").trim()) {
    throw new Error("agent produced no user-visible output");
  }

  return {
    outputText: outputPick.text,
    delivered: outputPick.delivered,
    rawResult: result,
  };
}

/**
 * 执行 script 类型任务。
 */
export async function runScriptTask(params: {
  runDirAbs: string;
  sessionId: string;
  scriptBody: string;
}): Promise<ScriptExecutionResult> {
  const body = String(params.scriptBody || "");
  if (!body.trim()) throw new Error("script task body cannot be empty");

  const scriptAbs = path.join(params.runDirAbs, "task-script.sh");
  await fs.writeFile(scriptAbs, body.endsWith("\n") ? body : `${body}\n`, "utf-8");

  const execResult = await withRequestContext(
    { sessionId: params.sessionId },
    () => {
      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        DC_SESSION_ID: params.sessionId,
      };
      applyInternalAgentAuthEnv({
        targetEnv: childEnv,
        sourceEnv: process.env,
      });
      return execa("sh", [scriptAbs], {
        cwd: params.runDirAbs,
        reject: true,
        env: childEnv,
      });
    },
  );

  const stdout = String(execResult.stdout || "").trim();
  const stderr = String(execResult.stderr || "").trim();
  const combined = [stdout, stderr].filter(Boolean).join("\n");
  return {
    outputText: combined,
  };
}

/**
 * 校验任务结果是否满足“必须有结果”的规则。
 */
export async function validateTaskResult(params: {
  outputText: string;
}): Promise<TaskResultValidation> {
  const errors: string[] = [];
  const minOutputChars = 1;
  const outputChars = String(params.outputText ?? "").trim().length;
  if (outputChars < minOutputChars) {
    errors.push(`output too short: got ${outputChars}, expected >= ${minOutputChars}`);
  }

  if (errors.length > 0) {
    return {
      resultStatus: "invalid",
      errors,
    };
  }

  return {
    resultStatus: "valid",
    errors: [],
  };
}

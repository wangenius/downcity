/**
 * Task runner.
 *
 * 职责（中文）
 * - 创建 run 目录（timestamp）
 * - 以“干净历史”调用当前 runtime 的 Agent（逻辑与正常 chat 一致）
 * - 把执行过程与结果写入 run 目录（messages.jsonl / output.md / result.md / error.md）
 */

import fs from "fs-extra";
import path from "node:path";
import { execa } from "execa";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import { Agent } from "@agent/Agent.js";
import { withRequestContext } from "@agent/context/manager/RequestContext.js";
import { FilePersistor } from "@/agent/context/context-agent/components/FilePersistor.js";
import { SummaryCompactor } from "@/agent/context/context-agent/components/SummaryCompactor.js";
import { RuntimeOrchestrator } from "@/agent/context/context-agent/components/RuntimeOrchestrator.js";
import { PromptSystem } from "@agent/prompts/system/PromptSystem.js";
import { shellTools } from "@agent/tools/shell/Tool.js";
import type {
  ShipTaskKind,
  ShipTaskRunExecutionStatusV1,
  ShipTaskRunMetaV1,
  ShipTaskRunProgressEventV1,
  ShipTaskRunProgressPhaseV1,
  ShipTaskRunProgressStatusV1,
  ShipTaskRunProgressV1,
  ShipTaskRunResultStatusV1,
  ShipTaskRunStatusV1,
  ShipTaskRunTriggerV1,
} from "@services/task/types/Task.js";
import type { AgentResult } from "@agent/types/Agent.js";
import type { JsonObject } from "@/types/Json.js";
import {
  createTaskRunContextId,
  formatTaskRunTimestamp,
  getTaskRunDir,
} from "./Paths.js";
import { ensureRunDir, readTask } from "./Store.js";

/**
 * 把相对路径渲染为 markdown 行内链接文本。
 */
function toMdLink(relPath: string): string {
  const p = String(relPath || "").trim();
  return p ? `\`${p}\`` : "";
}

/**
 * 文本摘要裁剪。
 *
 * 关键点（中文）
 * - 用于 result.md/error 通知，避免写入超长原文。
 */
function summarizeText(text: string, maxChars: number): string {
  const t = String(text ?? "").trim();
  if (!t) return "";
  if (t.length <= maxChars) return t;
  return t.slice(0, Math.max(0, maxChars - 3)).trimEnd() + "...";
}

type RunProgressSnapshot = {
  status: ShipTaskRunProgressStatusV1;
  phase: ShipTaskRunProgressPhaseV1;
  message: string;
  round?: number;
  maxRounds?: number;
  endedAt?: number;
  runStatus?: ShipTaskRunStatusV1;
  executionStatus?: ShipTaskRunExecutionStatusV1;
  resultStatus?: ShipTaskRunResultStatusV1;
};

/**
 * 持续写入运行进度快照（run-progress.json）。
 *
 * 关键点（中文）
 * - run.json 只在结束时写入；该快照用于 UI 展示“执行中过程”。
 * - 写入失败不会阻塞主流程，避免影响任务执行。
 */
function createRunProgressWriter(params: {
  progressJsonPath: string;
  taskId: string;
  timestamp: string;
  trigger: ShipTaskRunTriggerV1;
  kind: ShipTaskKind;
  startedAt: number;
}) {
  const events: ShipTaskRunProgressEventV1[] = [];
  let current: RunProgressSnapshot = {
    status: "running",
    phase: "preparing",
    message: "任务已唤起，正在准备执行环境",
  };

  const persist = async (): Promise<void> => {
    const now = Date.now();
    const payload: ShipTaskRunProgressV1 = {
      v: 1,
      taskId: params.taskId,
      timestamp: params.timestamp,
      trigger: params.trigger,
      kind: params.kind,
      status: current.status,
      phase: current.phase,
      message: current.message,
      startedAt: params.startedAt,
      updatedAt: now,
      ...(typeof current.endedAt === "number" ? { endedAt: current.endedAt } : {}),
      ...(current.runStatus ? { runStatus: current.runStatus } : {}),
      ...(current.executionStatus ? { executionStatus: current.executionStatus } : {}),
      ...(current.resultStatus ? { resultStatus: current.resultStatus } : {}),
      ...(typeof current.round === "number" ? { round: current.round } : {}),
      ...(typeof current.maxRounds === "number" ? { maxRounds: current.maxRounds } : {}),
      events: [...events],
    };
    try {
      await fs.writeJson(params.progressJsonPath, payload, { spaces: 2 });
    } catch {
      // ignore
    }
  };

  const update = async (next: RunProgressSnapshot): Promise<void> => {
    current = { ...current, ...next };
    events.push({
      at: Date.now(),
      phase: current.phase,
      message: current.message,
      ...(typeof current.round === "number" ? { round: current.round } : {}),
      ...(typeof current.maxRounds === "number" ? { maxRounds: current.maxRounds } : {}),
    });
    if (events.length > 40) {
      events.splice(0, events.length - 40);
    }
    await persist();
  };

  return {
    update,
  };
}

type TaskResultValidation = {
  resultStatus: ShipTaskRunResultStatusV1;
  errors: string[];
};

type UserSimulatorDecision = {
  satisfied: boolean;
  reply: string;
  reason: string;
  score?: number;
  raw: string;
};

type DialogueRoundRecord = {
  round: number;
  executorOutput: string;
  ruleErrors: string[];
  userSimulator: UserSimulatorDecision;
};

const DEFAULT_MAX_DIALOGUE_ROUNDS = 3;

type ScriptExecutionResult = {
  outputText: string;
};

type TaskAgentRuntime = {
  getAgent(contextId: string): Agent;
  getPersistor(contextId: string): FilePersistor;
};

/**
 * 构建 task 专用 Agent 运行时（独立于 ContextManager 的 Agent 缓存）。
 *
 * 关键点（中文）
 * - task 场景使用独立 Agent 实例，不复用 `context.run/getAgent`。
 * - system 档位固定为 `task`，避免在 system 域根据 contextId 推断。
 */
function createTaskAgentRuntime(params: {
  runtime: ServiceRuntime;
  runDirAbs: string;
  runContextId: string;
  userSimulatorContextId: string;
}): TaskAgentRuntime {
  const { runtime, runDirAbs, runContextId, userSimulatorContextId } = params;
  const compactor = new SummaryCompactor({
    keepLastMessages: runtime.config.context?.messages?.keepLastMessages,
    maxInputTokensApprox: runtime.config.context?.messages?.maxInputTokensApprox,
    archiveOnCompact: runtime.config.context?.messages?.archiveOnCompact,
    compactRatio: runtime.config.context?.messages?.compactRatio,
  });
  const system = new PromptSystem({
    projectRoot: runtime.rootPath,
    getStaticSystemPrompts: () => runtime.systems,
    getRuntime: () => runtime,
    profile: "task",
  });
  const persistorsByContextId = new Map<string, FilePersistor>();
  const agentsByContextId = new Map<string, Agent>();

  const resolveTaskPersistor = (contextId: string): FilePersistor => {
    const existing = persistorsByContextId.get(contextId);
    if (existing) return existing;

    const key = String(contextId || "").trim();
    if (!key) {
      throw new Error("TaskAgentRuntime requires a non-empty contextId");
    }
    const runMessagesDirPath =
      key === runContextId
        ? runDirAbs
        : key === userSimulatorContextId
          ? path.join(runDirAbs, "user-simulator")
          : undefined;

    const created = new FilePersistor({
      rootPath: runtime.rootPath,
      contextId: key,
      ...(runMessagesDirPath
        ? {
            paths: {
              contextDirPath: runMessagesDirPath,
              messagesDirPath: runMessagesDirPath,
              messagesFilePath: path.join(runMessagesDirPath, "messages.jsonl"),
              metaFilePath: path.join(runMessagesDirPath, "meta.json"),
              archiveDirPath: path.join(runMessagesDirPath, "archive"),
            },
          }
        : {}),
    });
    persistorsByContextId.set(key, created);
    return created;
  };

  return {
    getPersistor(contextId: string): FilePersistor {
      return resolveTaskPersistor(contextId);
    },
    getAgent(contextId: string): Agent {
      const key = String(contextId || "").trim();
      if (!key) {
        throw new Error("TaskAgentRuntime.getAgent requires a non-empty contextId");
      }
      const existing = agentsByContextId.get(key);
      if (existing) return existing;

      const persistor = resolveTaskPersistor(key);
      const orchestrator = new RuntimeOrchestrator({
        contextId: key,
        getTools: () => shellTools,
      });
      const created = new Agent({
        model: runtime.context.model,
        logger: runtime.logger,
        persistor,
        compactor,
        orchestrator,
        prompter: system,
      });
      agentsByContextId.set(key, created);
      return created;
    },
  };
}

/**
 * 从文本中提取 JSON 对象（支持 ```json 代码块）。
 */
function tryExtractJsonObject(text: string): JsonObject | null {
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
    // 关键点（中文）：兼容 text/input_text 两种文本 part。
    if (p.type !== "text" && p.type !== "input_text") continue;
    if (typeof p.text !== "string") continue;
    const value = p.text.trim();
    if (!value) continue;
    texts.push(value);
  }
  return texts.join("\n").trim();
}

type ChatSendOutputPick = {
  text: string;
  delivered: boolean;
};

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
      errorText?: unknown;
      error?: unknown;
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

function pickAgentOutput(assistantMessage: AgentResult["assistantMessage"]): ChatSendOutputPick {
  // 关键点（中文）：task 成功要求 chat_send 成功送达。
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
 *
 * 关键点（中文）
 * - 优先 JSON 协议
 * - JSON 失败时使用保守启发式，默认不满意
 */
function parseUserSimulatorDecision(outputText: string): UserSimulatorDecision {
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
function buildExecutorRoundQuery(params: {
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
function buildUserSimulatorQuery(params: {
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
async function runAgentRound(params: {
  taskAgentRuntime: TaskAgentRuntime;
  contextId: string;
  taskId: string;
  query: string;
  actorId: string;
  actorName: string;
}): Promise<{ outputText: string; delivered: boolean; rawResult: AgentResult }> {
  const result = await withRequestContext(
    {
      contextId: params.contextId,
    },
    () =>
      params.taskAgentRuntime.getAgent(params.contextId).run({
        query: params.query,
      }),
  );
  const outputPick = pickAgentOutput(result.assistantMessage);

  // 关键点（中文）：agent.run 可能返回 success=false 但不抛异常；这里必须转为执行失败，避免误判为“多轮不满意”。
  if (!result.success) {
    const reason = outputPick.text || "agent run returned success=false";
    throw new Error(reason);
  }

  return {
    outputText: outputPick.text,
    delivered: outputPick.delivered,
    rawResult: result,
  };
}

/**
 * 执行 script 类型任务。
 *
 * 关键点（中文）
 * - 在任务配置的 contextId 语义下执行，透传 `SMA_CTX_CONTEXT_ID`
 * - 仅允许执行项目内 `.sh` 文件
 */
async function runScriptTask(params: {
  runDirAbs: string;
  contextId: string;
  scriptBody: string;
}): Promise<ScriptExecutionResult> {
  const body = String(params.scriptBody || "");
  if (!body.trim()) throw new Error("script task body cannot be empty");

  const scriptAbs = path.join(params.runDirAbs, "task-script.sh");
  await fs.writeFile(scriptAbs, body.endsWith("\n") ? body : `${body}\n`, "utf-8");

  const execResult = await withRequestContext(
    { contextId: params.contextId },
    () =>
      execa("sh", [scriptAbs], {
        cwd: params.runDirAbs,
        reject: true,
        env: {
          ...process.env,
          SMA_CTX_CONTEXT_ID: params.contextId,
        },
      }),
  );

  const stdout = String(execResult.stdout || "").trim();
  const stderr = String(execResult.stderr || "").trim();
  const combined = [stdout, stderr].filter(Boolean).join("\n");
  return {
    outputText: combined,
  };
}

/**
 * 把 executor 的 assistant 消息落盘到 run context persistor。
 */
async function appendExecutorAssistantMessage(params: {
  taskAgentRuntime: TaskAgentRuntime;
  runContextId: string;
  taskId: string;
  rawResult: AgentResult;
}): Promise<void> {
  const persistor = params.taskAgentRuntime.getPersistor(params.runContextId);
  const assistantMessage = params.rawResult?.assistantMessage;
  if (assistantMessage && typeof assistantMessage === "object") {
    await persistor.append(assistantMessage);
    return;
  }
}

/**
 * 校验任务结果是否满足“必须有结果”的规则。
 *
 * 关键点（中文）
 * - 统一要求输出至少 1 个字符。
 */
async function validateTaskResult(params: {
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

/**
 * 立即执行任务定义。
 *
 * 算法流程（中文）
 * 1) 解析 task + 创建 run 目录
 * 2) 在 scheduler 上下文里执行 agent
 * 3) 产物落盘（input/output/result/error/run.json）
 *
 * 返回值（中文）
 * - `ok`/`status`：任务执行结果。
 * - `runDir`/`runDirRel`：执行产物目录。
 */
export async function runTaskNow(params: {
  context: ServiceRuntime;
  taskId: string;
  trigger: ShipTaskRunTriggerV1;
  executionId?: string;
  projectRoot?: string;
}): Promise<{
  ok: boolean;
  status: ShipTaskRunStatusV1;
  executionStatus: ShipTaskRunExecutionStatusV1;
  resultStatus: ShipTaskRunResultStatusV1;
  resultErrors: string[];
  dialogueRounds: number;
  userSimulatorSatisfied: boolean;
  userSimulatorReply?: string;
  userSimulatorReason?: string;
  userSimulatorScore?: number;
  taskId: string;
  executionId: string;
  timestamp: string;
  runDir: string;
  runDirRel: string;
}> {
  const context = params.context;
  const root = String(params.projectRoot || context.rootPath || "").trim();
  if (!root) throw new Error("projectRoot is required");

  const startedAt = Date.now();
  const timestamp = formatTaskRunTimestamp(new Date(startedAt));
  const executionId = String(params.executionId || `${params.taskId}:${timestamp}`).trim();

  const task = await readTask({ taskId: params.taskId, projectRoot: root });
  const runDirAbs = getTaskRunDir(root, task.taskId, timestamp);
  const runDirRel = path.relative(root, runDirAbs).split(path.sep).join("/");

  await ensureRunDir({ taskId: task.taskId, timestamp, projectRoot: root });

  const inputMdPath = path.join(runDirAbs, "input.md");
  const outputMdPath = path.join(runDirAbs, "output.md");
  const resultMdPath = path.join(runDirAbs, "result.md");
  const errorMdPath = path.join(runDirAbs, "error.md");
  const dialogueMdPath = path.join(runDirAbs, "dialogue.md");
  const dialogueJsonPath = path.join(runDirAbs, "dialogue.json");
  const metaJsonPath = path.join(runDirAbs, "run.json");
  const progressJsonPath = path.join(runDirAbs, "run-progress.json");
  const maxDialogueRounds = DEFAULT_MAX_DIALOGUE_ROUNDS;
  const taskKind: ShipTaskKind = task.frontmatter.kind || "agent";
  const runProgress = createRunProgressWriter({
    progressJsonPath,
    taskId: task.taskId,
    timestamp,
    trigger: params.trigger,
    kind: taskKind,
    startedAt,
  });

  // input.md：把 frontmatter 摘要 + 正文快照写入 run 目录，方便审计。
  await fs.writeFile(
    inputMdPath,
    [
      `# Task Input`,
      ``,
      `- taskId: \`${task.taskId}\``,
      `- executionId: \`${executionId}\``,
      `- title: ${task.frontmatter.title}`,
      `- when: \`${task.frontmatter.when}\``,
      `- status: \`${task.frontmatter.status}\``,
      `- contextId: \`${task.frontmatter.contextId}\``,
      `- kind: \`${taskKind}\``,
      `- maxDialogueRounds: \`${maxDialogueRounds}\``,
      ``,
      `## Body`,
      ``,
      task.body ? task.body : "_(empty body)_",
      ``,
    ]
      .filter((x) => x !== null)
      .join("\n"),
    "utf-8",
  );
  await runProgress.update({
    status: "running",
    phase: "preparing",
    message: "执行输入已写入，准备开始任务执行",
    ...(taskKind === "agent" ? { maxRounds: maxDialogueRounds } : {}),
  });

  const runContextId = createTaskRunContextId(task.taskId, timestamp);
  const userSimulatorContextId = `task-user-sim:${task.taskId}:${timestamp}`;
  const taskAgentRuntime = createTaskAgentRuntime({
    runtime: context,
    runDirAbs,
    runContextId,
    userSimulatorContextId,
  });

  let ok = false;
  let status: ShipTaskRunStatusV1 = "failure";
  let executionStatus: ShipTaskRunExecutionStatusV1 = "failure";
  let resultStatus: ShipTaskRunResultStatusV1 = "not_checked";
  let resultErrors: string[] = [];
  let dialogueRounds = 0;
  let userSimulatorSatisfied = false;
  let userSimulatorReply = "";
  let userSimulatorReason = "";
  let userSimulatorScore: number | undefined;
  let outputText = "";
  let errorText = "";
  const dialogueRecords: DialogueRoundRecord[] = [];

  // phase 1：执行任务（按 kind 分支）
  if (taskKind === "script") {
    dialogueRounds = 1;
    executionStatus = "success";
    await runProgress.update({
      status: "running",
      phase: "script_running",
      message: "正在执行 script 任务",
      round: 1,
      maxRounds: 1,
    });
    try {
      const scriptResult = await runScriptTask({
        runDirAbs,
        contextId: task.frontmatter.contextId,
        scriptBody: task.body,
      });
      outputText = scriptResult.outputText;
      await runProgress.update({
        status: "running",
        phase: "validating",
        message: "script 执行完成，正在校验输出与产物",
        round: 1,
        maxRounds: 1,
      });
      const validation = await validateTaskResult({
        outputText,
      });
      if (validation.errors.length === 0) {
        ok = true;
        status = "success";
        resultStatus = "valid";
        resultErrors = [];
        userSimulatorSatisfied = true;
      } else {
        ok = false;
        status = "failure";
        resultStatus = "invalid";
        resultErrors = [...validation.errors];
        errorText = [
          "Script task result validation failed.",
          ...resultErrors.map((x) => `- ${x}`),
        ].join("\n");
        await runProgress.update({
          status: "running",
          phase: "validating",
          message: "输出校验未通过，准备写入失败产物",
          round: 1,
          maxRounds: 1,
        });
      }
    } catch (e) {
      executionStatus = "failure";
      status = "failure";
      resultStatus = "not_checked";
      resultErrors = [];
      errorText = `Script task execution failed: ${String(e)}`;
      await runProgress.update({
        status: "running",
        phase: "script_running",
        message: `script 执行失败: ${summarizeText(String(e), 160)}`,
        round: 1,
        maxRounds: 1,
      });
    }
  } else {
    // phase 1（agent）：双 agent 多轮对话（executor <-> user-simulator）
    // 关键点（中文）：直到“规则校验通过 + 模拟用户满意”或达到最大轮数。
    let lastRoundRuleErrors: string[] = [];
    let lastRoundDecision: UserSimulatorDecision | null = null;
    let lastFeedback = "";
    executionStatus = "success";

    for (let round = 1; round <= maxDialogueRounds; round++) {
      dialogueRounds = round;
      let executorRoundOutput = "";
      let executorDelivered = false;
      await runProgress.update({
        status: "running",
        phase: "agent_executor_round",
        message: `执行器正在第 ${round}/${maxDialogueRounds} 轮生成结果`,
        round,
        maxRounds: maxDialogueRounds,
      });

      try {
        const executorQuery = buildExecutorRoundQuery({
          taskBody: task.body,
          round,
          ...(outputText ? { lastOutputText: outputText } : {}),
          ...(lastFeedback ? { lastFeedback } : {}),
        });
        const executorRound = await runAgentRound({
          taskAgentRuntime,
          contextId: runContextId,
          taskId: task.taskId,
          query: executorQuery,
          actorId: "scheduler",
          actorName: "scheduler",
        });
        executorRoundOutput = executorRound.outputText;
        executorDelivered = executorRound.delivered;
        outputText = executorRound.outputText;

        // executor assistant 消息写入 runDir 对应的 context persistor（messages.jsonl）。
        try {
          await appendExecutorAssistantMessage({
            taskAgentRuntime,
            runContextId,
            taskId: task.taskId,
            rawResult: executorRound.rawResult,
          });
        } catch {
          // ignore
        }
      } catch (e) {
        executionStatus = "failure";
        errorText = `Executor agent failed at round ${round}: ${String(e)}`;
        await runProgress.update({
          status: "running",
          phase: "agent_executor_round",
          message: `执行器在第 ${round} 轮失败: ${summarizeText(String(e), 160)}`,
          round,
          maxRounds: maxDialogueRounds,
        });
        break;
      }

      if (!executorDelivered) {
        executionStatus = "failure";
        status = "failure";
        resultStatus = "not_checked";
        resultErrors = [];
        errorText = "chat_send delivery failed: output was not successfully sent to channel";
        await runProgress.update({
          status: "running",
          phase: "agent_executor_round",
          message: "执行器输出未成功发送到 channel，任务判定失败",
          round,
          maxRounds: maxDialogueRounds,
        });
        break;
      }

      const validation = await validateTaskResult({
        outputText: executorRoundOutput,
      });
      lastRoundRuleErrors = [...validation.errors];

      let decision: UserSimulatorDecision = {
        satisfied: false,
        reply: "",
        reason: "user simulator did not run",
        raw: "",
      };
      await runProgress.update({
        status: "running",
        phase: "agent_user_simulator_round",
        message: `模拟用户正在评估第 ${round}/${maxDialogueRounds} 轮结果`,
        round,
        maxRounds: maxDialogueRounds,
      });
      try {
        const simulatorQuery = buildUserSimulatorQuery({
          taskTitle: task.frontmatter.title,
          taskDescription: task.frontmatter.description,
          taskBody: task.body,
          round,
          maxRounds: maxDialogueRounds,
          executorOutputText: executorRoundOutput,
          ruleErrors: validation.errors,
        });
        const simulatorRound = await runAgentRound({
          taskAgentRuntime,
          contextId: userSimulatorContextId,
          taskId: task.taskId,
          query: simulatorQuery,
          actorId: "user_simulator",
          actorName: "user_simulator",
        });
        decision = parseUserSimulatorDecision(simulatorRound.outputText);
      } catch (e) {
        decision = {
          satisfied: false,
          reply: "",
          reason: `user simulator failed: ${String(e)}`,
          raw: String(e),
        };
      }

      // 关键点（中文）：系统规则校验失败时，强制判定不满意。
      const roundSatisfied = decision.satisfied && validation.errors.length === 0;
      userSimulatorSatisfied = roundSatisfied;
      userSimulatorReply = decision.reply;
      userSimulatorReason = decision.reason;
      userSimulatorScore = decision.score;
      lastRoundDecision = decision;

      dialogueRecords.push({
        round,
        executorOutput: executorRoundOutput,
        ruleErrors: [...validation.errors],
        userSimulator: {
          ...decision,
          satisfied: roundSatisfied,
        },
      });

      if (roundSatisfied) {
        ok = true;
        status = "success";
        resultStatus = "valid";
        resultErrors = [];
        await runProgress.update({
          status: "running",
          phase: "validating",
          message: `第 ${round} 轮校验通过，准备写入执行产物`,
          round,
          maxRounds: maxDialogueRounds,
        });
        break;
      }

      const feedbackLines: string[] = [];
      if (validation.errors.length > 0) {
        feedbackLines.push("系统规则校验失败：");
        for (const item of validation.errors) feedbackLines.push(`- ${item}`);
      }
      if (decision.reply) {
        feedbackLines.push("模拟用户回复：");
        feedbackLines.push(decision.reply);
      }
      if (decision.reason) {
        feedbackLines.push(`模拟用户理由：${decision.reason}`);
      }
      lastFeedback = feedbackLines.join("\n").trim();
      await runProgress.update({
        status: "running",
        phase: "validating",
        message: `第 ${round} 轮未通过，继续下一轮修订`,
        round,
        maxRounds: maxDialogueRounds,
      });
    }

    if (!ok) {
      if (executionStatus === "failure") {
        status = "failure";
        resultStatus = "not_checked";
        resultErrors = [];
      } else {
        status = "failure";
        resultStatus = "invalid";
        resultErrors = [
          ...lastRoundRuleErrors,
          ...(lastRoundDecision?.reason
            ? [`user simulator unsatisfied: ${lastRoundDecision.reason}`]
            : ["user simulator unsatisfied"]),
          `max dialogue rounds reached: ${maxDialogueRounds}`,
        ];
        errorText = [
          "Task result not satisfied after dialogue rounds.",
          ...resultErrors.map((x) => `- ${x}`),
        ].join("\n");
      }
    }
  }

  // phase 2：写入执行产物与元数据
  await runProgress.update({
    status: "running",
    phase: "writing_artifacts",
    message: "正在写入 output/result/run 元数据",
    ...(taskKind === "agent" ? { maxRounds: maxDialogueRounds } : { maxRounds: 1 }),
    ...(dialogueRounds > 0 ? { round: dialogueRounds } : {}),
  });
  const endedAt = Date.now();
  const durationMs = endedAt - startedAt;

  await fs.writeFile(
    outputMdPath,
    [`# Task Output`, ``, outputText ? outputText : "_(empty output)_", ``].join(
      "\n",
    ),
    "utf-8",
  );

  if (status === "failure") {
    await fs.writeFile(
      errorMdPath,
      [`# Task Error`, ``, errorText || "Unknown error", ``].join("\n"),
      "utf-8",
    );
  } else {
    // 清理旧 error.md（如果存在）
    try {
      await fs.remove(errorMdPath);
    } catch {
      // ignore
    }
  }

  await fs.writeJson(
    dialogueJsonPath,
    {
      v: 1,
      taskId: task.taskId,
      timestamp,
      maxDialogueRounds,
      rounds: dialogueRecords,
    },
    { spaces: 2 },
  );

  const dialogueLines: string[] = [];
  dialogueLines.push("# Task Dialogue");
  dialogueLines.push("");
  dialogueLines.push(`- taskId: \`${task.taskId}\``);
  dialogueLines.push(`- maxDialogueRounds: \`${maxDialogueRounds}\``);
  dialogueLines.push(`- dialogueRounds: \`${dialogueRounds}\``);
  dialogueLines.push(`- userSimulatorSatisfied: \`${String(userSimulatorSatisfied)}\``);
  dialogueLines.push("");
  for (const round of dialogueRecords) {
    dialogueLines.push(`## Round ${round.round}`);
    dialogueLines.push("");
    dialogueLines.push("### Executor output preview");
    dialogueLines.push("");
    dialogueLines.push("```");
    dialogueLines.push(summarizeText(round.executorOutput, 1200) || "_(empty output)_");
    dialogueLines.push("```");
    dialogueLines.push("");
    dialogueLines.push("### Rule checks");
    dialogueLines.push("");
    if (round.ruleErrors.length === 0) {
      dialogueLines.push("- PASS");
    } else {
      for (const item of round.ruleErrors) dialogueLines.push(`- FAIL: ${item}`);
    }
    dialogueLines.push("");
    dialogueLines.push("### User simulator");
    dialogueLines.push("");
    dialogueLines.push(`- satisfied: \`${String(round.userSimulator.satisfied)}\``);
    if (typeof round.userSimulator.score === "number") {
      dialogueLines.push(`- score: \`${round.userSimulator.score}\``);
    }
    if (round.userSimulator.reason) {
      dialogueLines.push(`- reason: ${round.userSimulator.reason}`);
    }
    if (round.userSimulator.reply) {
      dialogueLines.push("");
      dialogueLines.push("reply:");
      dialogueLines.push("```");
      dialogueLines.push(summarizeText(round.userSimulator.reply, 1200));
      dialogueLines.push("```");
    }
    dialogueLines.push("");
  }
  await fs.writeFile(dialogueMdPath, dialogueLines.join("\n"), "utf-8");

  const meta: ShipTaskRunMetaV1 = {
    v: 1,
    taskId: task.taskId,
    timestamp,
    executionId,
    contextId: task.frontmatter.contextId,
    trigger: params.trigger,
    status,
    executionStatus,
    resultStatus,
    ...(resultErrors.length > 0 ? { resultErrors } : {}),
    dialogueRounds,
    userSimulatorSatisfied,
    ...(userSimulatorReply ? { userSimulatorReply: summarizeText(userSimulatorReply, 2000) } : {}),
    ...(userSimulatorReason ? { userSimulatorReason: summarizeText(userSimulatorReason, 2000) } : {}),
    ...(typeof userSimulatorScore === "number" ? { userSimulatorScore } : {}),
    startedAt,
    endedAt,
    ...(status === "failure" && errorText ? { error: summarizeText(errorText, 800) } : {}),
  };
  await fs.writeJson(metaJsonPath, meta, { spaces: 2 });

  // result.md：面向人类的摘要
  const outputPreview = summarizeText(outputText, 1200);
  const resultLines: string[] = [];
  resultLines.push(`# Task Result`);
  resultLines.push("");
  resultLines.push(`- taskId: \`${task.taskId}\``);
  resultLines.push(`- executionId: \`${executionId}\``);
  resultLines.push(`- title: ${task.frontmatter.title}`);
  resultLines.push(`- trigger: \`${params.trigger.type}\``);
  resultLines.push(`- status: **${status.toUpperCase()}**`);
  resultLines.push(`- executionStatus: \`${executionStatus}\``);
  resultLines.push(`- resultStatus: \`${resultStatus}\``);
  resultLines.push(`- dialogueRounds: \`${dialogueRounds}/${maxDialogueRounds}\``);
  resultLines.push(`- userSimulatorSatisfied: \`${String(userSimulatorSatisfied)}\``);
  if (typeof userSimulatorScore === "number") {
    resultLines.push(`- userSimulatorScore: \`${userSimulatorScore}\``);
  }
  resultLines.push(`- startedAt: \`${new Date(startedAt).toISOString()}\``);
  resultLines.push(`- endedAt: \`${new Date(endedAt).toISOString()}\``);
  resultLines.push(`- durationMs: \`${durationMs}\``);
  resultLines.push(`- runDir: ${toMdLink(runDirRel)}`);
  resultLines.push("");
  resultLines.push(`## Artifacts`);
  resultLines.push("");
  resultLines.push(`- messages: ${toMdLink(path.posix.join(runDirRel, "messages.jsonl"))}`);
  resultLines.push(`- input: ${toMdLink(path.posix.join(runDirRel, "input.md"))}`);
  resultLines.push(`- output: ${toMdLink(path.posix.join(runDirRel, "output.md"))}`);
  resultLines.push(`- result: ${toMdLink(path.posix.join(runDirRel, "result.md"))}`);
  resultLines.push(`- dialogue: ${toMdLink(path.posix.join(runDirRel, "dialogue.md"))}`);
  resultLines.push(`- dialogueJson: ${toMdLink(path.posix.join(runDirRel, "dialogue.json"))}`);
  if (status === "failure") {
    resultLines.push(`- error: ${toMdLink(path.posix.join(runDirRel, "error.md"))}`);
  }
  resultLines.push("");

  resultLines.push(`## Result checks`);
  resultLines.push("");
  if (resultErrors.length === 0) {
    resultLines.push(`- PASS`);
  } else {
    for (const item of resultErrors) {
      resultLines.push(`- FAIL: ${item}`);
    }
  }
  resultLines.push("");

  if (outputPreview) {
    resultLines.push(`## Output preview`);
    resultLines.push("");
    resultLines.push("```");
    resultLines.push(outputPreview);
    resultLines.push("```");
    resultLines.push("");
  }

  if (status === "failure" && errorText) {
    resultLines.push(`## Error preview`);
    resultLines.push("");
    resultLines.push("```");
    resultLines.push(summarizeText(errorText, 1200));
    resultLines.push("```");
    resultLines.push("");
  }

  await fs.writeFile(resultMdPath, resultLines.join("\n"), "utf-8");
  await runProgress.update({
    status: status === "success" ? "success" : "failure",
    phase: "completed",
    message:
      status === "success"
        ? "任务执行完成"
        : `任务执行失败: ${summarizeText(errorText || "result invalid", 160)}`,
    ...(taskKind === "agent" ? { maxRounds: maxDialogueRounds } : { maxRounds: 1 }),
    ...(dialogueRounds > 0 ? { round: dialogueRounds } : {}),
    endedAt,
    runStatus: status,
    executionStatus,
    resultStatus,
  });

  return {
    ok,
    status,
    executionStatus,
    resultStatus,
    resultErrors,
    dialogueRounds,
    userSimulatorSatisfied,
    ...(userSimulatorReply ? { userSimulatorReply } : {}),
    ...(userSimulatorReason ? { userSimulatorReason } : {}),
    ...(typeof userSimulatorScore === "number" ? { userSimulatorScore } : {}),
    taskId: task.taskId,
    executionId,
    timestamp,
    runDir: runDirAbs,
    runDirRel,
  };
}

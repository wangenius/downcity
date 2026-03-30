/**
 * Task runner.
 *
 * 职责（中文）
 * - 创建 run 目录（timestamp）
 * - 以“干净历史”调用当前 runtime 的 SessionCore（逻辑与正常 chat 一致）
 * - 把执行过程与结果写入 run 目录（messages.jsonl / output.md / result.md / error.md）
 */

import fs from "fs-extra";
import path from "node:path";
import type { ExecutionRuntime } from "@/types/ExecutionRuntime.js";
import type {
  DialogueRoundRecord,
  UserSimulatorDecision,
} from "@/types/TaskRunner.js";
import type {
  ShipTaskKind,
  ShipTaskRunExecutionStatusV1,
  ShipTaskRunMetaV1,
  ShipTaskRunResultStatusV1,
  ShipTaskRunStatusV1,
  ShipTaskRunTriggerV1,
} from "@services/task/types/Task.js";
import {
  createTaskRunSessionId,
  formatTaskRunTimestamp,
  getTaskRunDir,
} from "./Paths.js";
import { ensureRunDir, readTask } from "./Store.js";
import {
  createRunProgressWriter,
  serializeDebugSnapshot,
  summarizeText,
  toMdLink,
} from "./TaskRunnerProgress.js";
import {
  appendTaskAssistantMessage,
  createTaskSessionRuntime,
} from "./TaskRunnerSession.js";
import {
  buildExecutorRoundQuery,
  buildUserSimulatorQuery,
  parseUserSimulatorDecision,
  runAgentRound,
  runScriptTask,
  validateTaskResult,
} from "./TaskRunnerRound.js";

const DEFAULT_MAX_DIALOGUE_ROUNDS = 3;
const DEFAULT_SINGLE_ROUND = 1;

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
  context: ExecutionRuntime;
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
  const taskKind: ShipTaskKind = task.frontmatter.kind || "agent";
  const reviewEnabled = taskKind === "agent" && task.frontmatter.review === true;
  const maxDialogueRounds =
    taskKind === "agent"
      ? reviewEnabled
        ? DEFAULT_MAX_DIALOGUE_ROUNDS
        : DEFAULT_SINGLE_ROUND
      : DEFAULT_SINGLE_ROUND;
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
      `- sessionId: \`${task.frontmatter.sessionId}\``,
      `- kind: \`${taskKind}\``,
      ...(taskKind === "agent" ? [`- review: \`${String(reviewEnabled)}\``] : []),
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

  const runSessionId = createTaskRunSessionId(task.taskId, timestamp);
  const userSimulatorSessionId = `task-user-sim:${task.taskId}:${timestamp}`;
  const taskSessionRuntime = createTaskSessionRuntime({
    runtime: context,
    runDirAbs,
    runSessionId,
    userSimulatorSessionId,
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
        sessionId: task.frontmatter.sessionId,
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
    // phase 1（agent）：
    // - 默认单轮执行
    // - 仅当 `review=true` 时启用“执行器 + 模拟用户”的多轮修订
    let lastRoundRuleErrors: string[] = [];
    let lastRoundDecision: UserSimulatorDecision | null = null;
    let lastFeedback = "";
    executionStatus = "success";

    for (let round = 1; round <= maxDialogueRounds; round++) {
      dialogueRounds = round;
      let executorRoundOutput = "";
      let executorDelivered = false;
      let executorQuery = "";
      let executorAssistantMessageSnapshot = "";
      let validationResultStatus: ShipTaskRunResultStatusV1 = "not_checked";
      let userSimulatorQuery = "";
      let userSimulatorOutput = "";
      let userSimulatorAssistantMessageSnapshot = "";
      await runProgress.update({
        status: "running",
        phase: "agent_executor_round",
        message: `执行器正在第 ${round}/${maxDialogueRounds} 轮生成结果`,
        round,
        maxRounds: maxDialogueRounds,
      });

      try {
        executorQuery = buildExecutorRoundQuery({
          taskBody: task.body,
          round,
          ...(outputText ? { lastOutputText: outputText } : {}),
          ...(lastFeedback ? { lastFeedback } : {}),
        });
        const executorRound = await runAgentRound({
          taskSessionRuntime,
          sessionId: runSessionId,
          taskId: task.taskId,
          query: executorQuery,
          actorId: "scheduler",
          actorName: "scheduler",
        });
        executorRoundOutput = executorRound.outputText;
        executorDelivered = executorRound.delivered;
        outputText = executorRound.outputText;
        executorAssistantMessageSnapshot = serializeDebugSnapshot(
          executorRound.rawResult.assistantMessage,
        );

        // executor assistant 消息写入 runDir 对应的 context persistor（messages.jsonl）。
        try {
          await appendTaskAssistantMessage({
            taskSessionRuntime,
            sessionId: runSessionId,
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

      const validation = await validateTaskResult({
        outputText: executorRoundOutput,
      });
      validationResultStatus = validation.resultStatus;
      lastRoundRuleErrors = [...validation.errors];

      let decision: UserSimulatorDecision = {
        satisfied: validation.errors.length === 0,
        reply: validation.errors.length === 0 ? "single-round execution accepted" : "",
        reason:
          validation.errors.length === 0
            ? "review disabled"
            : "review disabled and validation failed",
        raw: "",
      };
      if (reviewEnabled) {
        await runProgress.update({
          status: "running",
          phase: "agent_user_simulator_round",
          message: `模拟用户正在评估第 ${round}/${maxDialogueRounds} 轮结果`,
          round,
          maxRounds: maxDialogueRounds,
        });
        try {
          userSimulatorQuery = buildUserSimulatorQuery({
            taskTitle: task.frontmatter.title,
            taskDescription: task.frontmatter.description,
            taskBody: task.body,
            round,
            maxRounds: maxDialogueRounds,
            executorOutputText: executorRoundOutput,
            ruleErrors: validation.errors,
          });
          const simulatorRound = await runAgentRound({
            taskSessionRuntime,
            sessionId: userSimulatorSessionId,
            taskId: task.taskId,
            query: userSimulatorQuery,
            actorId: "user_simulator",
            actorName: "user_simulator",
          });
          userSimulatorOutput = simulatorRound.outputText;
          userSimulatorAssistantMessageSnapshot = serializeDebugSnapshot(
            simulatorRound.rawResult.assistantMessage,
          );
          try {
            await appendTaskAssistantMessage({
              taskSessionRuntime,
              sessionId: userSimulatorSessionId,
              taskId: task.taskId,
              rawResult: simulatorRound.rawResult,
            });
          } catch {
            // ignore
          }
          decision = parseUserSimulatorDecision(simulatorRound.outputText);
        } catch (e) {
          decision = {
            satisfied: false,
            reply: "",
            reason: `user simulator failed: ${String(e)}`,
            raw: String(e),
          };
        }
      }

      // 关键点（中文）：系统规则校验失败时，强制判定不满意。
      const roundSatisfied = decision.satisfied && validation.errors.length === 0;
      userSimulatorSatisfied = roundSatisfied;
      userSimulatorReply = decision.reply;
      userSimulatorReason = decision.reason;
      userSimulatorScore = decision.score;
      lastRoundDecision = decision;

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

      const roundRecord: DialogueRoundRecord = {
        reviewEnabled,
        round,
        executorQuery,
        executorOutput: executorRoundOutput,
        executorDelivered,
        ...(executorAssistantMessageSnapshot
          ? { executorAssistantMessageSnapshot }
          : {}),
        validationResultStatus,
        ruleErrors: [...validation.errors],
        ...(userSimulatorQuery ? { userSimulatorQuery } : {}),
        ...(userSimulatorOutput ? { userSimulatorOutput } : {}),
        ...(userSimulatorAssistantMessageSnapshot
          ? { userSimulatorAssistantMessageSnapshot }
          : {}),
        userSimulator: {
          ...decision,
          satisfied: roundSatisfied,
        },
        ...(lastFeedback ? { feedbackForNextRound: lastFeedback } : {}),
      };
      dialogueRecords.push(roundRecord);
      context.logger.info("[TASK] Agent task round evaluated", {
        taskId: task.taskId,
        executionId,
        round,
        reviewEnabled,
        executorDelivered,
        validationResultStatus,
        ruleErrors: validation.errors,
        userSimulatorSatisfied: roundSatisfied,
        userSimulatorReason: decision.reason,
        ...(decision.reply ? { userSimulatorReply: summarizeText(decision.reply, 500) } : {}),
        ...(userSimulatorOutput
          ? { userSimulatorOutput: summarizeText(userSimulatorOutput, 1000) }
          : {}),
        ...(lastFeedback ? { feedbackForNextRound: summarizeText(lastFeedback, 1000) } : {}),
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

      if (reviewEnabled && round < maxDialogueRounds) {
        await runProgress.update({
          status: "running",
          phase: "validating",
          message: `第 ${round} 轮未通过，继续下一轮修订`,
          round,
          maxRounds: maxDialogueRounds,
        });
      }
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
  dialogueLines.push(`- messages: ${toMdLink(path.posix.join(runDirRel, "messages.jsonl"))}`);
  if (reviewEnabled) {
    dialogueLines.push(
      `- userSimulatorMessages: ${toMdLink(path.posix.join(runDirRel, "user-simulator/messages.jsonl"))}`,
    );
  }
  dialogueLines.push("");
  for (const round of dialogueRecords) {
    dialogueLines.push(`## Round ${round.round}`);
    dialogueLines.push("");
    dialogueLines.push(`- reviewEnabled: \`${String(round.reviewEnabled)}\``);
    dialogueLines.push(`- executorDelivered: \`${String(round.executorDelivered)}\``);
    dialogueLines.push(`- validationResultStatus: \`${round.validationResultStatus}\``);
    dialogueLines.push("");
    dialogueLines.push("### Executor query");
    dialogueLines.push("");
    dialogueLines.push("```");
    dialogueLines.push(summarizeText(round.executorQuery, 4000) || "_(empty query)_");
    dialogueLines.push("```");
    dialogueLines.push("");
    dialogueLines.push("### Executor output preview");
    dialogueLines.push("");
    dialogueLines.push("```");
    dialogueLines.push(summarizeText(round.executorOutput, 1200) || "_(empty output)_");
    dialogueLines.push("```");
    dialogueLines.push("");
    if (round.executorAssistantMessageSnapshot) {
      dialogueLines.push("### Executor raw assistantMessage snapshot");
      dialogueLines.push("");
      dialogueLines.push("```json");
      dialogueLines.push(round.executorAssistantMessageSnapshot);
      dialogueLines.push("```");
      dialogueLines.push("");
    }
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
    if (round.userSimulatorQuery) {
      dialogueLines.push("");
      dialogueLines.push("query:");
      dialogueLines.push("```");
      dialogueLines.push(summarizeText(round.userSimulatorQuery, 4000));
      dialogueLines.push("```");
    }
    if (round.userSimulatorOutput) {
      dialogueLines.push("");
      dialogueLines.push("output:");
      dialogueLines.push("```");
      dialogueLines.push(summarizeText(round.userSimulatorOutput, 2000));
      dialogueLines.push("```");
    }
    if (round.userSimulator.reply) {
      dialogueLines.push("");
      dialogueLines.push("reply:");
      dialogueLines.push("```");
      dialogueLines.push(summarizeText(round.userSimulator.reply, 1200));
      dialogueLines.push("```");
    }
    if (round.userSimulatorAssistantMessageSnapshot) {
      dialogueLines.push("");
      dialogueLines.push("raw assistantMessage snapshot:");
      dialogueLines.push("```json");
      dialogueLines.push(round.userSimulatorAssistantMessageSnapshot);
      dialogueLines.push("```");
    }
    if (round.feedbackForNextRound) {
      dialogueLines.push("");
      dialogueLines.push("feedbackForNextRound:");
      dialogueLines.push("```");
      dialogueLines.push(summarizeText(round.feedbackForNextRound, 2000));
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
    sessionId: task.frontmatter.sessionId,
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
  if (taskKind === "agent" && reviewEnabled) {
    resultLines.push(
      `- userSimulatorMessages: ${toMdLink(path.posix.join(runDirRel, "user-simulator/messages.jsonl"))}`,
    );
  }
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

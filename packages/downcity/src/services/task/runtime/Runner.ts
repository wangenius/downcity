/**
 * Task runner。
 *
 * 职责（中文）
 * - 创建 run 目录（timestamp）。
 * - 以“干净历史”调用当前 runtime 的 SessionCore（逻辑与正常 chat 一致）。
 * - 协调 script / agent 两类执行主链。
 * - 把最终产物写入 run 目录的具体格式委托给 `TaskRunArtifacts.ts`。
 */

import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type {
  DialogueRoundRecord,
  UserSimulatorDecision,
} from "@/types/TaskRunner.js";
import type {
  ShipTaskKind,
  ShipTaskRunExecutionStatusV1,
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
import { createRunProgressWriter, serializeDebugSnapshot, summarizeText } from "./TaskRunnerProgress.js";
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
import {
  createTaskRunFilePaths,
  writeTaskRunArtifacts,
  writeTaskRunInputArtifact,
} from "./TaskRunArtifacts.js";

const DEFAULT_MAX_DIALOGUE_ROUNDS = 3;
const DEFAULT_SINGLE_ROUND = 1;

/**
 * 立即执行任务定义。
 *
 * 算法流程（中文）
 * 1) 解析 task + 创建 run 目录。
 * 2) 在 scheduler 上下文里执行 agent/script。
 * 3) 产物落盘（messages.jsonl / output.md / result.md / error.md / run.json）。
 */
export async function runTaskNow(params: {
  context: ExecutionContext;
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
  const { runDirRel } = await ensureRunDir({
    taskId: task.taskId,
    timestamp,
    projectRoot: root,
  });
  const filePaths = createTaskRunFilePaths(runDirAbs);

  const taskKind: ShipTaskKind = task.frontmatter.kind || "agent";
  const reviewEnabled = taskKind === "agent" && task.frontmatter.review === true;
  const maxDialogueRounds =
    taskKind === "agent"
      ? reviewEnabled
        ? DEFAULT_MAX_DIALOGUE_ROUNDS
        : DEFAULT_SINGLE_ROUND
      : DEFAULT_SINGLE_ROUND;
  const runProgress = createRunProgressWriter({
    progressJsonPath: filePaths.progressJsonPath,
    taskId: task.taskId,
    timestamp,
    trigger: params.trigger,
    kind: taskKind,
    startedAt,
  });

  await writeTaskRunInputArtifact({
    task,
    executionId,
    taskKind,
    reviewEnabled,
    maxDialogueRounds,
    inputMdPath: filePaths.inputMdPath,
  });
  await runProgress.update({
    status: "running",
    phase: "preparing",
    message: "执行输入已写入，准备开始任务执行",
    ...(taskKind === "agent" ? { maxRounds: maxDialogueRounds } : {}),
  });

  const runSessionId = createTaskRunSessionId(task.taskId, timestamp);
  const userSimulatorSessionId = `task-user-sim:${task.taskId}:${timestamp}`;
  const taskSessionRuntime = createTaskSessionRuntime({
    context,
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
      const validation = await validateTaskResult({ outputText });
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
          ...resultErrors.map((item) => `- ${item}`),
        ].join("\n");
        await runProgress.update({
          status: "running",
          phase: "validating",
          message: "输出校验未通过，准备写入失败产物",
          round: 1,
          maxRounds: 1,
        });
      }
    } catch (error) {
      executionStatus = "failure";
      status = "failure";
      resultStatus = "not_checked";
      resultErrors = [];
      errorText = `Script task execution failed: ${String(error)}`;
      await runProgress.update({
        status: "running",
        phase: "script_running",
        message: `script 执行失败: ${summarizeText(String(error), 160)}`,
        round: 1,
        maxRounds: 1,
      });
    }
  } else {
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
      } catch (error) {
        executionStatus = "failure";
        errorText = `Executor agent failed at round ${round}: ${String(error)}`;
        await runProgress.update({
          status: "running",
          phase: "agent_executor_round",
          message: `执行器在第 ${round} 轮失败: ${summarizeText(String(error), 160)}`,
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
        } catch (error) {
          decision = {
            satisfied: false,
            reply: "",
            reason: `user simulator failed: ${String(error)}`,
            raw: String(error),
          };
        }
      }

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
          ...resultErrors.map((item) => `- ${item}`),
        ].join("\n");
      }
    }
  }

  await runProgress.update({
    status: "running",
    phase: "writing_artifacts",
    message: "正在写入 output/result/run 元数据",
    ...(taskKind === "agent" ? { maxRounds: maxDialogueRounds } : { maxRounds: 1 }),
    ...(dialogueRounds > 0 ? { round: dialogueRounds } : {}),
  });
  const endedAt = Date.now();

  await writeTaskRunArtifacts({
    task,
    executionId,
    timestamp,
    trigger: params.trigger,
    runDirRel,
    filePaths,
    taskKind,
    reviewEnabled,
    maxDialogueRounds,
    dialogueRounds,
    dialogueRecords,
    ok,
    status,
    executionStatus,
    resultStatus,
    resultErrors,
    userSimulatorSatisfied,
    userSimulatorReply,
    userSimulatorReason,
    ...(typeof userSimulatorScore === "number" ? { userSimulatorScore } : {}),
    outputText,
    errorText,
    startedAt,
    endedAt,
  });
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

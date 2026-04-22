/**
 * AcpError：ACP 运行时错误归一化工具。
 *
 * 关键点（中文）
 * - 统一识别 ACP 子进程的启动/传输层异常，避免把上游 SDK 原始报错直接暴露给用户。
 * - 对已知可恢复错误提供“一次性重试”判定，供 executor 在 reset 后自动自愈。
 * - 最终错误文案保持面向使用者，而更细粒度的 stderr / invalid-json 细节继续留在日志侧排查。
 */

const KNOWN_STARTUP_TRANSPORT_PATTERNS = [
  /processtransport is not ready for writing/i,
  /cli output was not valid json/i,
  /hook_callback/i,
  /callback_id/i,
];

const KNOWN_INTERNAL_ERROR_PATTERNS = [
  /internal error \(code=-32603\)/i,
  /internal error/i,
];

function normalizeDiagnosticLines(lines: string[] | undefined): string[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function joinDiagnostics(params: {
  errorText: string;
  recentStderrLines?: string[];
  recentInvalidStdoutLines?: string[];
}): string {
  return [
    String(params.errorText || "").trim(),
    ...normalizeDiagnosticLines(params.recentStderrLines),
    ...normalizeDiagnosticLines(params.recentInvalidStdoutLines),
  ]
    .filter(Boolean)
    .join("\n");
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function resolveAgentLabel(agentType: string): string {
  const value = String(agentType || "").trim().toLowerCase();
  if (value === "claude") return "Claude";
  if (value === "kimi") return "Kimi";
  if (value === "codex") return "Codex";
  return value ? value.toUpperCase() : "ACP";
}

/**
 * 判断这次 ACP 失败是否值得 reset 后自动重试一次。
 */
export function shouldRetryAcpRuntimeFailure(params: {
  errorText: string;
  recentStderrLines?: string[];
  recentInvalidStdoutLines?: string[];
}): boolean {
  const combined = joinDiagnostics(params);
  if (!combined) return false;
  if (matchesAny(combined, KNOWN_STARTUP_TRANSPORT_PATTERNS)) return true;
  return /internal error \(code=-32603\)/i.test(String(params.errorText || ""));
}

/**
 * 生成面向用户的 ACP 失败文案。
 */
export function buildAcpRuntimeFailureMessage(params: {
  agentType: string;
  errorText: string;
  recentStderrLines?: string[];
  recentInvalidStdoutLines?: string[];
  retried?: boolean;
}): string {
  const agentLabel = resolveAgentLabel(params.agentType);
  const errorText = String(params.errorText || "").trim().replace(/^Error:\s*/i, "");
  const combined = joinDiagnostics({
    errorText,
    recentStderrLines: params.recentStderrLines,
    recentInvalidStdoutLines: params.recentInvalidStdoutLines,
  });
  const retriedSuffix = params.retried ? "系统已经自动重试过一次。" : "";

  if (matchesAny(combined, KNOWN_STARTUP_TRANSPORT_PATTERNS)) {
    let causeText = "启动阶段触发了上游 transport/hook 异常";
    if (/cli output was not valid json/i.test(combined)) {
      causeText = "启动阶段输出了无效的 ACP JSON";
    } else if (/processtransport is not ready for writing/i.test(combined)) {
      causeText = "启动阶段的传输层尚未就绪";
    } else if (/hook_callback|callback_id/i.test(combined)) {
      causeText = "启动阶段的 hook callback 调用异常";
    }
    return [
      `${agentLabel} ACP 运行时在生成结果前失败：${causeText}。`,
      "执行器已重置。",
      retriedSuffix,
      "请稍后重试；如果同一任务持续失败，请检查 agent server 日志与 hook 配置。",
    ]
      .filter(Boolean)
      .join("");
  }

  if (matchesAny(errorText, KNOWN_INTERNAL_ERROR_PATTERNS)) {
    return [
      `${agentLabel} ACP 运行时在生成结果前返回上游内部错误。`,
      "执行器已重置。",
      retriedSuffix,
      "请稍后重试；如果持续失败，请检查 agent server 日志。",
    ]
      .filter(Boolean)
      .join("");
  }

  if (/ACP agent exited unexpectedly/i.test(errorText)) {
    return [
      `${agentLabel} ACP 子进程在生成结果前异常退出。`,
      "执行器已重置。",
      retriedSuffix,
      "请检查 agent server 日志后重试。",
    ]
      .filter(Boolean)
      .join("");
  }

  return errorText || `${agentLabel} ACP 运行时执行失败。`;
}

/**
 * Voice 转写依赖安装器。
 *
 * 关键点（中文）
 * - 统一管理 `city voice` 的 Python 依赖安装逻辑。
 * - 根据模型自动推导 runner（funasr / transformers-whisper）并执行 `python -m pip install`。
 * - 返回结构化安装结果，供 CLI/日志/测试复用。
 */

import { execFile as execFileCb } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import fs from "fs-extra";
import type { VoiceModelId, VoiceTranscribeStrategy } from "@agent/types/Voice.js";

const execFileAsync = promisify(execFileCb);

const DEFAULT_PYTHON_BIN = "python3";
const DEFAULT_PIP_TIMEOUT_MS = 300_000;
const OUTPUT_TAIL_LIMIT = 1200;
const DEFAULT_VENV_DIR = path.join(os.homedir(), ".ship", "venvs", "voice");

/**
 * Voice 依赖 runner 类型。
 */
export type VoiceDependencyRunner = "funasr" | "transformers-whisper";

/**
 * 单个 runner 的安装摘要。
 */
export interface VoiceDependencyInstallItem {
  /**
   * 当前安装 runner。
   */
  runner: VoiceDependencyRunner;
  /**
   * Python 可执行文件。
   */
  pythonBin: string;
  /**
   * 执行参数（不含 pythonBin）。
   */
  args: string[];
  /**
   * 安装包列表。
   */
  packages: string[];
  /**
   * 实际执行的命令行（便于排查）。
   */
  command: string;
  /**
   * 执行耗时（毫秒）。
   */
  elapsedMs: number;
  /**
   * 是否跳过安装。
   *
   * 说明（中文）
   * - `true` 表示依赖已存在，仅做检查，不再重复安装。
   * - `false` 或缺省表示执行了实际安装。
   */
  skipped?: boolean;
  /**
   * 跳过原因（可选）。
   */
  skipReason?: string;
  /**
   * stdout 尾部（可选）。
   */
  stdoutTail?: string;
  /**
   * stderr 尾部（可选）。
   */
  stderrTail?: string;
}

/**
 * 依赖安装结果。
 */
export interface VoiceDependencyInstallResult {
  /**
   * 本次使用的 Python 可执行文件。
   */
  pythonBin: string;
  /**
   * 本次处理的 runner 列表。
   */
  runners: VoiceDependencyRunner[];
  /**
   * 各 runner 的安装摘要。
   */
  items: VoiceDependencyInstallItem[];
  /**
   * 是否使用了虚拟环境安装。
   */
  usedVirtualEnv: boolean;
  /**
   * 虚拟环境目录（仅 `usedVirtualEnv=true` 时存在）。
   */
  venvDir?: string;
  /**
   * 初始尝试使用的 Python（仅进入虚拟环境回退时存在）。
   */
  basePythonBin?: string;
}

/**
 * 依赖安装输入参数。
 */
export interface VoiceDependencyInstallInput {
  /**
   * Python 可执行文件（默认 `python3`）。
   */
  pythonBin?: string;
  /**
   * 需要安装的 runner 列表。
   */
  runners: VoiceDependencyRunner[];
  /**
   * 是否使用 `pip -U` 升级。
   */
  upgrade?: boolean;
  /**
   * pip 安装超时（毫秒）。
   */
  timeoutMs?: number;
  /**
   * 虚拟环境目录（可选）。
   *
   * 说明（中文）
   * - 当系统 Python 命中 PEP 668（不允许全局 pip install）时，自动回退到该目录。
   * - 默认 `~/.ship/venvs/voice`。
   */
  venvDir?: string;
}

function normalizePythonBin(input?: string): string {
  const text = String(input || "").trim();
  return text || DEFAULT_PYTHON_BIN;
}

function normalizeTimeoutMs(value?: number): number {
  if (!Number.isFinite(value as number)) return DEFAULT_PIP_TIMEOUT_MS;
  const ms = Math.floor(Number(value));
  if (ms < 5_000) return 5_000;
  if (ms > 1_800_000) return 1_800_000;
  return ms;
}

function normalizeVenvDir(input?: string): string {
  const text = String(input || "").trim();
  if (!text) return DEFAULT_VENV_DIR;
  return path.resolve(text);
}

function tailText(value: string): string | undefined {
  const text = String(value || "").trim();
  if (!text) return undefined;
  if (text.length <= OUTPUT_TAIL_LIMIT) return text;
  return text.slice(text.length - OUTPUT_TAIL_LIMIT);
}

function resolveVenvPythonBin(venvDir: string): string {
  return path.join(venvDir, "bin", "python");
}

/**
 * 判断是否为 PEP 668（externally-managed-environment）错误。
 */
export function isPep668InstallError(text: string): boolean {
  const msg = String(text || "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("externally-managed-environment") ||
    msg.includes("this environment is externally managed") ||
    msg.includes("pep 668") ||
    msg.includes("--break-system-packages")
  );
}

function dedupeRunners(runners: VoiceDependencyRunner[]): VoiceDependencyRunner[] {
  const seen = new Set<VoiceDependencyRunner>();
  const out: VoiceDependencyRunner[] = [];
  for (const runner of runners) {
    if (seen.has(runner)) continue;
    seen.add(runner);
    out.push(runner);
  }
  return out;
}

function getRunnerPackages(runner: VoiceDependencyRunner): string[] {
  if (runner === "funasr") {
    // 关键点（中文）：FunASR 在常见语音模型推理路径会依赖 torch/torchaudio。
    // 仅安装 funasr 会在转写阶段触发 `ModuleNotFoundError: torch`。
    return ["funasr", "torch", "torchaudio"];
  }
  return ["transformers", "torch", "torchaudio"];
}

async function checkRunnerPackagesInstalled(params: {
  pythonBin: string;
  packages: string[];
  timeoutMs: number;
}): Promise<{
  installed: boolean;
  args: string[];
  command: string;
}> {
  const args = ["-m", "pip", "show", ...params.packages];
  const command = [params.pythonBin, ...args].join(" ");
  try {
    await execFileAsync(params.pythonBin, args, {
      timeout: params.timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      installed: true,
      args,
      command,
    };
  } catch {
    return {
      installed: false,
      args,
      command,
    };
  }
}

type RunnerInstallFailure = {
  runner: VoiceDependencyRunner;
  command: string;
  reason: string;
};

type RunnerInstallAttempt =
  | {
      success: true;
      item: VoiceDependencyInstallItem;
    }
  | {
      success: false;
      failure: RunnerInstallFailure;
    };

async function installRunnerWithPython(params: {
  pythonBin: string;
  runner: VoiceDependencyRunner;
  upgrade: boolean;
  timeoutMs: number;
}): Promise<RunnerInstallAttempt> {
  const packages = getRunnerPackages(params.runner);
  const checkStartedAt = Date.now();
  const checkResult = await checkRunnerPackagesInstalled({
    pythonBin: params.pythonBin,
    packages,
    timeoutMs: params.timeoutMs,
  });
  if (checkResult.installed) {
    return {
      success: true,
      item: {
        runner: params.runner,
        pythonBin: params.pythonBin,
        args: checkResult.args,
        packages,
        command: checkResult.command,
        elapsedMs: Date.now() - checkStartedAt,
        skipped: true,
        skipReason: "already-installed",
      },
    };
  }

  const args = [
    "-m",
    "pip",
    "install",
    ...(params.upgrade ? ["-U"] : []),
    ...packages,
  ];
  const command = [params.pythonBin, ...args].join(" ");
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(params.pythonBin, args, {
      timeout: params.timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      success: true,
      item: {
        runner: params.runner,
        pythonBin: params.pythonBin,
        args,
        packages,
        command,
        elapsedMs: Date.now() - startedAt,
        ...(tailText(String(stdout || ""))
          ? { stdoutTail: tailText(String(stdout || "")) }
          : {}),
        ...(tailText(String(stderr || ""))
          ? { stderrTail: tailText(String(stderr || "")) }
          : {}),
      },
    };
  } catch (error) {
    const errorLike = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const stdoutTail = tailText(String(errorLike.stdout || ""));
    const stderrTail = tailText(String(errorLike.stderr || ""));
    const reason = stderrTail || stdoutTail || String(errorLike.message || error);
    return {
      success: false,
      failure: {
        runner: params.runner,
        command,
        reason,
      },
    };
  }
}

async function installAllRunnersWithPython(params: {
  pythonBin: string;
  runners: VoiceDependencyRunner[];
  upgrade: boolean;
  timeoutMs: number;
}): Promise<
  | {
      success: true;
      items: VoiceDependencyInstallItem[];
    }
  | {
      success: false;
      failure: RunnerInstallFailure;
    }
> {
  const items: VoiceDependencyInstallItem[] = [];
  for (const runner of params.runners) {
    const attempt = await installRunnerWithPython({
      pythonBin: params.pythonBin,
      runner,
      upgrade: params.upgrade,
      timeoutMs: params.timeoutMs,
    });
    if (!attempt.success) {
      return {
        success: false,
        failure: attempt.failure,
      };
    }
    items.push(attempt.item);
  }
  return {
    success: true,
    items,
  };
}

function formatRunnerInstallFailure(failure: RunnerInstallFailure): string {
  return `Failed to install voice dependencies for runner "${failure.runner}" via "${failure.command}": ${failure.reason}`;
}

async function ensureVoiceVirtualEnvPython(params: {
  basePythonBin: string;
  venvDir: string;
  timeoutMs: number;
}): Promise<string> {
  await fs.ensureDir(path.dirname(params.venvDir));
  const createArgs = ["-m", "venv", params.venvDir];
  const createCommand = [params.basePythonBin, ...createArgs].join(" ");
  try {
    await execFileAsync(params.basePythonBin, createArgs, {
      timeout: params.timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    const errorLike = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const stdoutTail = tailText(String(errorLike.stdout || ""));
    const stderrTail = tailText(String(errorLike.stderr || ""));
    const reason = stderrTail || stdoutTail || String(errorLike.message || error);
    throw new Error(
      `Failed to create voice virtual environment via "${createCommand}": ${reason}`,
    );
  }

  const venvPythonBin = resolveVenvPythonBin(params.venvDir);
  const upgradePipArgs = ["-m", "pip", "install", "-U", "pip"];
  const upgradePipCommand = [venvPythonBin, ...upgradePipArgs].join(" ");
  try {
    await execFileAsync(venvPythonBin, upgradePipArgs, {
      timeout: params.timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    const errorLike = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const stdoutTail = tailText(String(errorLike.stdout || ""));
    const stderrTail = tailText(String(errorLike.stderr || ""));
    const reason = stderrTail || stdoutTail || String(errorLike.message || error);
    throw new Error(
      `Failed to upgrade pip in voice virtual environment via "${upgradePipCommand}": ${reason}`,
    );
  }

  return venvPythonBin;
}

/**
 * 根据模型推导推荐 runner。
 */
export function resolveVoiceRunnerByModel(modelId: VoiceModelId): VoiceDependencyRunner {
  if (modelId === "whisper-large-v3-turbo") return "transformers-whisper";
  return "funasr";
}

/**
 * 根据模型列表推导去重后的 runner 列表。
 */
export function resolveVoiceRunnersByModels(
  modelIds: VoiceModelId[],
): VoiceDependencyRunner[] {
  return dedupeRunners(modelIds.map((modelId) => resolveVoiceRunnerByModel(modelId)));
}

/**
 * 根据模型推导推荐转写策略。
 */
export function resolveVoiceStrategyByModel(modelId: VoiceModelId): VoiceTranscribeStrategy {
  if (modelId === "whisper-large-v3-turbo") return "transformers-whisper";
  return "funasr";
}

/**
 * 安装 Voice 转写依赖。
 *
 * 关键点（中文）
 * - 逐个 runner 执行 pip 安装，任一失败即抛错。
 * - 错误信息携带 stderr/stdout 尾部，便于用户快速定位。
 */
export async function installVoiceTranscribeDependencies(
  input: VoiceDependencyInstallInput,
): Promise<VoiceDependencyInstallResult> {
  const basePythonBin = normalizePythonBin(input.pythonBin);
  const timeoutMs = normalizeTimeoutMs(input.timeoutMs);
  const upgrade = input.upgrade !== false;
  const runners = dedupeRunners(input.runners || []);
  const firstAttempt = await installAllRunnersWithPython({
    pythonBin: basePythonBin,
    runners,
    upgrade,
    timeoutMs,
  });
  if (firstAttempt.success) {
    return {
      pythonBin: basePythonBin,
      runners,
      items: firstAttempt.items,
      usedVirtualEnv: false,
    };
  }

  if (!isPep668InstallError(firstAttempt.failure.reason)) {
    throw new Error(formatRunnerInstallFailure(firstAttempt.failure));
  }

  // 关键点（中文）：命中 PEP 668 时自动回退到独立 venv，避免要求用户手工排障。
  const venvDir = normalizeVenvDir(input.venvDir);
  const venvPythonBin = await ensureVoiceVirtualEnvPython({
    basePythonBin,
    venvDir,
    timeoutMs,
  });
  const venvAttempt = await installAllRunnersWithPython({
    pythonBin: venvPythonBin,
    runners,
    upgrade,
    timeoutMs,
  });
  if (!venvAttempt.success) {
    throw new Error(formatRunnerInstallFailure(venvAttempt.failure));
  }

  return {
    pythonBin: venvPythonBin,
    runners,
    items: venvAttempt.items,
    usedVirtualEnv: true,
    venvDir,
    basePythonBin,
  };
}

/**
 * TTS 依赖安装器。
 *
 * 关键点（中文）
 * - 统一管理 `city tts` 的 Python 依赖安装逻辑。
 * - 根据模型自动推导 runner（qwen3 / kokoro）并执行 `python -m pip install`。
 */

import { execFile as execFileCb } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import fs from "fs-extra";
import type { TtsModelId, TtsRuntimeFamily } from "@/shared/types/Tts.js";

const execFileAsync = promisify(execFileCb);

const DEFAULT_PIP_TIMEOUT_MS = 300_000;
const OUTPUT_TAIL_LIMIT = 1200;
const DEFAULT_VENV_DIR = path.join(os.homedir(), ".downcity", "venvs", "tts");

/**
 * TTS 依赖 runner 类型。
 */
export type TtsDependencyRunner = TtsRuntimeFamily;

/**
 * 单个 runner 的安装摘要。
 */
export interface TtsDependencyInstallItem {
  /**
   * 当前安装 runner。
   */
  runner: TtsDependencyRunner;
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
   * 实际执行的命令行。
   */
  command: string;
  /**
   * 执行耗时（毫秒）。
   */
  elapsedMs: number;
  /**
   * 是否跳过安装。
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
export interface TtsDependencyInstallResult {
  /**
   * 本次使用的 Python 可执行文件。
   */
  pythonBin: string;
  /**
   * 本次处理的 runner 列表。
   */
  runners: TtsDependencyRunner[];
  /**
   * 各 runner 的安装摘要。
   */
  items: TtsDependencyInstallItem[];
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
export interface TtsDependencyInstallInput {
  /**
   * Python 可执行文件（默认 `python3`）。
   */
  pythonBin?: string;
  /**
   * 需要安装的 runner 列表。
   */
  runners: TtsDependencyRunner[];
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
   */
  venvDir?: string;
}

function normalizePythonBin(input?: string): string {
  const text = String(input || "").trim();
  return text || "python3";
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

export function resolveTtsVenvPythonBin(venvDir: string): string {
  return path.join(venvDir, "bin", "python");
}

/**
 * 返回 TTS 默认虚拟环境目录。
 */
export function resolveDefaultTtsVenvDir(): string {
  return DEFAULT_VENV_DIR;
}

/**
 * 返回 TTS 默认虚拟环境 Python 路径。
 */
export function resolveDefaultTtsVenvPythonBin(): string {
  return resolveTtsVenvPythonBin(DEFAULT_VENV_DIR);
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

function dedupeRunners(runners: TtsDependencyRunner[]): TtsDependencyRunner[] {
  const seen = new Set<TtsDependencyRunner>();
  const out: TtsDependencyRunner[] = [];
  for (const runner of runners) {
    if (seen.has(runner)) continue;
    seen.add(runner);
    out.push(runner);
  }
  return out;
}

function getRunnerPackages(runner: TtsDependencyRunner): string[] {
  if (runner === "qwen3") {
    return ["qwen-tts", "soundfile", "torch", "torchaudio", "transformers", "accelerate"];
  }
  return ["kokoro==0.7.16", "soundfile", "misaki[zh]", "torch"];
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
  const args = ["-m", "pip", "show", ...params.packages.map((item) => item.replace(/\[.*\]$/, "").replace(/==.+$/, ""))];
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
  runner: TtsDependencyRunner;
  command: string;
  reason: string;
};

type RunnerInstallAttempt =
  | {
      success: true;
      item: TtsDependencyInstallItem;
    }
  | {
      success: false;
      failure: RunnerInstallFailure;
    };

async function installRunnerWithPython(params: {
  pythonBin: string;
  runner: TtsDependencyRunner;
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
        stdoutTail: tailText(String(stdout || "")),
        stderrTail: tailText(String(stderr || "")),
      },
    };
  } catch (error) {
    const errorLike = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const reason =
      tailText(String(errorLike.stderr || "")) ||
      tailText(String(errorLike.stdout || "")) ||
      String(errorLike.message || error);
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

export async function ensureTtsVirtualEnv(params: {
  /**
   * 虚拟环境目录。
   */
  venvDir?: string;
  /**
   * 用于创建 venv 的基础 Python。
   */
  basePythonBin?: string;
}): Promise<string> {
  const venvDir = normalizeVenvDir(params.venvDir);
  const basePythonBin = normalizePythonBin(params.basePythonBin);
  const pythonBin = resolveTtsVenvPythonBin(venvDir);
  if (await fs.pathExists(pythonBin)) {
    return pythonBin;
  }
  await fs.ensureDir(venvDir);
  await execFileAsync(basePythonBin, ["-m", "venv", venvDir], {
    timeout: DEFAULT_PIP_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
  });
  return pythonBin;
}

async function installAllRunners(params: {
  pythonBin: string;
  runners: TtsDependencyRunner[];
  upgrade: boolean;
  timeoutMs: number;
}): Promise<{
  success: boolean;
  items: TtsDependencyInstallItem[];
  failures: RunnerInstallFailure[];
}> {
  const items: TtsDependencyInstallItem[] = [];
  const failures: RunnerInstallFailure[] = [];
  for (const runner of params.runners) {
    const result = await installRunnerWithPython({
      pythonBin: params.pythonBin,
      runner,
      upgrade: params.upgrade,
      timeoutMs: params.timeoutMs,
    });
    if (result.success) {
      items.push(result.item);
    } else {
      failures.push(result.failure);
    }
  }
  return {
    success: failures.length === 0,
    items,
    failures,
  };
}

/**
 * 安装 TTS Python 依赖。
 */
export async function installTtsDependencies(
  input: TtsDependencyInstallInput,
): Promise<TtsDependencyInstallResult> {
  const runners = dedupeRunners(input.runners);
  const basePythonBin = normalizePythonBin(input.pythonBin);
  const timeoutMs = normalizeTimeoutMs(input.timeoutMs);
  const upgrade = input.upgrade === true;
  const venvDir = normalizeVenvDir(input.venvDir);
  const venvPythonBin = await ensureTtsVirtualEnv({
    venvDir,
    basePythonBin,
  });
  const venvAttempt = await installAllRunners({
    pythonBin: venvPythonBin,
    runners,
    upgrade,
    timeoutMs,
  });
  if (!venvAttempt.success) {
    throw new Error(
      venvAttempt.failures
        .map((item) => `${item.runner}: ${item.reason}`)
        .join("\n"),
    );
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

/**
 * 根据模型列表推导需要安装的 runner 集合。
 */
export function resolveTtsRunnersByModels(modelIds: TtsModelId[]): TtsDependencyRunner[] {
  const runners = new Set<TtsDependencyRunner>();
  for (const modelId of modelIds) {
    if (modelId === "qwen3-tts-0.6b") {
      runners.add("qwen3");
      continue;
    }
    runners.add("kokoro");
  }
  return [...runners];
}

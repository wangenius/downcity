import path from "node:path";
import { exec as execWithShell, execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import fs from "fs-extra";
import type {
  VoiceModelId,
  VoiceProvider,
  VoiceTranscribeStrategy,
} from "@/types/Voice.js";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import { resolveVoiceModelsRootDir } from "./Paths.js";
import type { VoicePluginConfig } from "@/types/VoicePlugin.js";

const execShellAsync = promisify(execWithShell);
const execFileAsync = promisify(execFileCb);
const DEFAULT_TRANSCRIBE_TIMEOUT_MS = 120_000;

/**
 * Voice 转写输入参数。
 */
export interface VoiceTranscribeInput {
  /**
   * 运行时上下文（用于读取配置/根目录/日志）。
   */
  context: ExecutionContext;
  /**
   * 待转写音频路径（相对项目根目录或绝对路径）。
   */
  audioPath: string;
  /**
   * 语言提示（可选）。
   */
  language?: string;
}

/**
 * Voice 转写输出结果。
 */
export interface VoiceTranscribeResult {
  /**
   * 转写文本。
   */
  text: string;
  /**
   * 归一化后的音频绝对路径。
   */
  audioPath: string;
  /**
   * 本次使用的模型 ID。
   */
  modelId: VoiceModelId;
  /**
   * 本次使用的 provider。
   */
  provider: VoiceProvider;
  /**
   * 本次转写耗时（毫秒）。
   */
  elapsedMs: number;
  /**
   * 实际执行器标识。
   */
  runner: "funasr" | "transformers-whisper" | "command";
}

type VoiceConfigResolved = {
  config: VoicePluginConfig;
  modelId: VoiceModelId;
  provider: VoiceProvider;
  modelDir: string;
  audioPath: string;
  timeoutMs: number;
  language: string;
  pythonBin: string;
  commandTemplate?: string;
  strategy: VoiceTranscribeStrategy;
};

function normalizeLanguage(input?: string): string {
  const text = String(input || "").trim();
  return text || "zh";
}

function normalizeTimeoutMs(value?: number): number {
  if (!Number.isFinite(value as number)) return DEFAULT_TRANSCRIBE_TIMEOUT_MS;
  const ms = Number(value);
  if (ms < 1_000) return 1_000;
  if (ms > 600_000) return 600_000;
  return Math.floor(ms);
}

function normalizePythonBin(value?: string): string {
  const text = String(value || "").trim();
  return text || "python3";
}

function normalizeStrategy(strategy?: VoiceTranscribeStrategy): VoiceTranscribeStrategy {
  if (strategy === "funasr") return "funasr";
  if (strategy === "transformers-whisper") return "transformers-whisper";
  if (strategy === "command") return "command";
  return "auto";
}

function toAbsoluteAudioPath(context: ExecutionContext, input: string): string {
  const raw = String(input || "").trim();
  if (!raw) {
    throw new Error("voice transcribe requires audioPath");
  }
  if (path.isAbsolute(raw)) return path.resolve(raw);
  return path.resolve(context.rootPath, raw);
}

function pickLastNonEmptyLine(value: string): string {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : "";
}

function shellEscapeSingle(value: string): string {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

/**
 * 为 python 执行构建环境变量。
 *
 * 关键点（中文）
 * - 当 `pythonBin` 指向 venv 内解释器时，把其 `bin` 目录前置到 PATH，
 *   以便 python 子进程内调用 `pip`（FunASR 远程代码会用到）能正确命中同一 venv。
 */
function buildPythonExecEnv(pythonBin: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const raw = String(pythonBin || "").trim();
  if (!raw || (!raw.includes("/") && !raw.includes("\\"))) {
    return env;
  }
  const pythonDir = path.dirname(path.resolve(raw));
  const currentPath = String(env.PATH || "");
  const segments = currentPath
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!segments.includes(pythonDir)) {
    env.PATH = [pythonDir, ...segments].join(path.delimiter);
  }
  return env;
}

function renderCommandTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(audioPath|modelDir|modelId|language)\}/g, (_, key) => {
    const value = values[key] || "";
    return shellEscapeSingle(value);
  });
}

async function runCustomCommand(params: {
  template: string;
  values: Record<string, string>;
  timeoutMs: number;
}): Promise<string> {
  const command = renderCommandTemplate(params.template, params.values);
  const { stdout, stderr } = await execShellAsync(command, {
    timeout: params.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  const text = pickLastNonEmptyLine(String(stdout || ""));
  if (text) return text;
  const err = pickLastNonEmptyLine(String(stderr || ""));
  if (err) {
    throw new Error(`voice custom command produced no transcript: ${err}`);
  }
  throw new Error("voice custom command produced empty transcript");
}

async function runPythonInline(params: {
  pythonBin: string;
  script: string;
  args: string[];
  timeoutMs: number;
}): Promise<string> {
  let stdout = "";
  let stderr = "";
  try {
    const output = await execFileAsync(
      params.pythonBin,
      ["-c", params.script, ...params.args],
      {
        timeout: params.timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        env: buildPythonExecEnv(params.pythonBin),
      },
    );
    stdout = String(output.stdout || "");
    stderr = String(output.stderr || "");
  } catch (error) {
    const errorLike = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    stdout = String(errorLike.stdout || "");
    stderr = String(errorLike.stderr || "");
    const err = pickLastNonEmptyLine(stderr) || pickLastNonEmptyLine(stdout);
    if (err) {
      throw new Error(`python runner failed: ${err}`);
    }
    throw new Error(`python runner failed: ${String(errorLike.message || error)}`);
  }
  const text = pickLastNonEmptyLine(stdout);
  if (text) return text;
  const err = pickLastNonEmptyLine(stderr);
  if (err) {
    throw new Error(`python runner produced no transcript: ${err}`);
  }
  throw new Error("python runner produced empty transcript");
}

const FUNASR_INLINE_SCRIPT = [
  "from funasr import AutoModel",
  "import sys",
  "model_dir = sys.argv[1]",
  "audio_path = sys.argv[2]",
  "model = AutoModel(model=model_dir, trust_remote_code=True, disable_update=True)",
  "result = model.generate(input=audio_path)",
  "text = ''",
  "if isinstance(result, list) and len(result) > 0:",
  "    first = result[0]",
  "    if isinstance(first, dict):",
  "        text = str(first.get('text') or '')",
  "elif isinstance(result, dict):",
  "    text = str(result.get('text') or '')",
  "print(text.strip())",
].join("\n");

const TRANSFORMERS_WHISPER_INLINE_SCRIPT = [
  "from transformers import pipeline",
  "import sys",
  "model_dir = sys.argv[1]",
  "audio_path = sys.argv[2]",
  "language = sys.argv[3] if len(sys.argv) > 3 else ''",
  "pipe = pipeline('automatic-speech-recognition', model=model_dir)",
  "kwargs = {}",
  "if language:",
  "    kwargs['generate_kwargs'] = {'language': language}",
  "result = pipe(audio_path, **kwargs)",
  "text = ''",
  "if isinstance(result, dict):",
  "    text = str(result.get('text') or '')",
  "else:",
  "    text = str(result)",
  "print(text.strip())",
].join("\n");

async function runFunasrRunner(params: {
  pythonBin: string;
  modelDir: string;
  audioPath: string;
  timeoutMs: number;
}): Promise<string> {
  return runPythonInline({
    pythonBin: params.pythonBin,
    script: FUNASR_INLINE_SCRIPT,
    args: [params.modelDir, params.audioPath],
    timeoutMs: params.timeoutMs,
  });
}

async function runTransformersWhisperRunner(params: {
  pythonBin: string;
  modelDir: string;
  audioPath: string;
  language: string;
  timeoutMs: number;
}): Promise<string> {
  return runPythonInline({
    pythonBin: params.pythonBin,
    script: TRANSFORMERS_WHISPER_INLINE_SCRIPT,
    args: [params.modelDir, params.audioPath, params.language],
    timeoutMs: params.timeoutMs,
  });
}

async function resolveVoiceConfig(input: VoiceTranscribeInput): Promise<VoiceConfigResolved> {
  const pluginConfig =
    input.context.config.plugins?.asr &&
    typeof input.context.config.plugins.asr === "object" &&
    !Array.isArray(input.context.config.plugins.asr)
      ? input.context.config.plugins.asr
      : null;

  const enabled =
    pluginConfig && (pluginConfig as { enabled?: unknown }).enabled === true;
  if (!enabled) {
    throw new Error("ASR plugin is disabled. Run `city asr on` first.");
  }

  const provider = String(
    (pluginConfig as { provider?: unknown } | null)?.provider || "local",
  ) as VoiceProvider;
  if (!["local", "command"].includes(provider)) {
    throw new Error(`Unsupported asr provider: ${provider}`);
  }

  const modelId =
    String(
      (pluginConfig as { modelId?: unknown } | null)?.modelId || "SenseVoiceSmall",
    ).trim() || "SenseVoiceSmall";
  if (!modelId && provider === "local") {
    throw new Error("ASR active model is not configured. Run `city asr use <modelId>`.");
  }

  const modelsRootDir = resolveVoiceModelsRootDir({
    projectRoot: input.context.rootPath,
    modelsDir: String(
      (pluginConfig as { modelsDir?: unknown } | null)?.modelsDir || "",
    ).trim(),
  });
  const modelDir = path.resolve(modelsRootDir, modelId);
  if (provider === "local") {
    const modelDirExists = await fs.pathExists(modelDir);
    if (!modelDirExists) {
      throw new Error(`Voice model directory does not exist: ${modelDir}`);
    }
  }

  const audioPath = toAbsoluteAudioPath(input.context, input.audioPath);
  const audioExists = await fs.pathExists(audioPath);
  if (!audioExists) {
    throw new Error(`Audio file does not exist: ${audioPath}`);
  }

  const commandTemplate = String(
    (pluginConfig as { command?: unknown } | null)?.command || "",
  ).trim();
  const strategy = normalizeStrategy(
    ((pluginConfig as { strategy?: unknown } | null)?.strategy as
      | VoiceTranscribeStrategy
      | undefined) ||
      (provider === "command" ? "command" : "auto"),
  );

  return {
    config: (pluginConfig as VoicePluginConfig | null) || {
      provider: "local",
    },
    modelId: modelId as VoiceModelId,
    provider,
    modelDir,
    audioPath,
    timeoutMs: normalizeTimeoutMs(
      (pluginConfig as { timeoutMs?: unknown } | null)?.timeoutMs as number | undefined,
    ),
    language: normalizeLanguage(
      input.language ||
        String((pluginConfig as { language?: unknown } | null)?.language || ""),
    ),
    pythonBin: normalizePythonBin(
      String(
        (pluginConfig as { pythonBin?: unknown } | null)?.pythonBin || "",
      ),
    ),
    commandTemplate: commandTemplate || undefined,
    strategy,
  };
}

function resolveAutoRunnerOrder(modelId: VoiceModelId): Array<"funasr" | "transformers-whisper"> {
  if (modelId === "whisper-large-v3-turbo") {
    return ["transformers-whisper", "funasr"];
  }
  return ["funasr", "transformers-whisper"];
}

/**
 * 执行 ASR 音频转写。
 *
 * 关键点（中文）
 * - 该函数是 ASR plugin 对 chat 等 service 暴露的核心能力。
 * - 内置 runner 失败时会返回清晰报错，调用方可降级为附件流程。
 */
export async function transcribeVoiceAudio(
  input: VoiceTranscribeInput,
): Promise<VoiceTranscribeResult> {
  const startedAt = Date.now();
  const resolved = await resolveVoiceConfig(input);

  const runnerFailures: string[] = [];

  const tryRunner = async (
    runner: "funasr" | "transformers-whisper" | "command",
  ): Promise<VoiceTranscribeResult | null> => {
    try {
      let text = "";
      if (runner === "command") {
        const template = String(resolved.commandTemplate || "").trim();
        if (!template) {
          throw new Error(
            "ASR transcribe strategy=command requires plugins.asr.command",
          );
        }
        text = await runCustomCommand({
          template,
          timeoutMs: resolved.timeoutMs,
          values: {
            audioPath: resolved.audioPath,
            modelDir: resolved.modelDir,
            modelId: resolved.modelId,
            language: resolved.language,
          },
        });
      } else if (runner === "funasr") {
        text = await runFunasrRunner({
          pythonBin: resolved.pythonBin,
          modelDir: resolved.modelDir,
          audioPath: resolved.audioPath,
          timeoutMs: resolved.timeoutMs,
        });
      } else {
        text = await runTransformersWhisperRunner({
          pythonBin: resolved.pythonBin,
          modelDir: resolved.modelDir,
          audioPath: resolved.audioPath,
          language: resolved.language,
          timeoutMs: resolved.timeoutMs,
        });
      }

      const normalized = String(text || "").trim();
      if (!normalized) {
        throw new Error("transcript is empty");
      }

      return {
        text: normalized,
        audioPath: resolved.audioPath,
        modelId: resolved.modelId,
        provider: resolved.provider,
        elapsedMs: Date.now() - startedAt,
        runner,
      };
    } catch (error) {
      runnerFailures.push(`${runner}: ${String(error)}`);
      return null;
    }
  };

  if (resolved.strategy === "command") {
    const result = await tryRunner("command");
    if (result) return result;
  } else if (resolved.strategy === "funasr") {
    const result = await tryRunner("funasr");
    if (result) return result;
  } else if (resolved.strategy === "transformers-whisper") {
    const result = await tryRunner("transformers-whisper");
    if (result) return result;
  } else {
    for (const runner of resolveAutoRunnerOrder(resolved.modelId)) {
      const result = await tryRunner(runner);
      if (result) return result;
    }
  }

  throw new Error(
    `Voice transcription failed for model "${resolved.modelId}". ${runnerFailures.join(" | ")}`,
  );
}

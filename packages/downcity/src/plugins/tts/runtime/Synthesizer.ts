/**
 * TTS 语音合成 runtime。
 *
 * 关键点（中文）
 * - 读取本地模型目录，不再依赖 console 模型池。
 * - 根据模型族选择对应 Python runner，并把输出落到本地文件。
 */

import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import fs from "fs-extra";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { TtsPluginConfig, TtsSynthesizeInput } from "@/types/TtsPlugin.js";
import type { TtsAudioFormat, TtsModelId } from "@/types/Tts.js";
import { getCacheDirPath } from "@/main/env/Paths.js";
import { renderChatMessageFileTag } from "@/services/chat/runtime/ChatMessageMarkup.js";
import { getTtsModelCatalogItem, resolveTtsModelId } from "@/plugins/tts/runtime/Catalog.js";
import { resolveTtsModelsRootDir } from "@/plugins/tts/runtime/Paths.js";

const execFileAsync = promisify(execFileCb);
const DEFAULT_TTS_TIMEOUT_MS = 300_000;

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeFormat(value: unknown): TtsAudioFormat {
  return normalizeText(value).toLowerCase() === "flac" ? "flac" : "wav";
}

function normalizeSpeed(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Number.isNaN(value)) {
    return 1;
  }
  const next = Math.max(0.5, Math.min(2, value));
  return Number(next.toFixed(2));
}

function normalizeTimeoutMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Number.isNaN(value)) {
    return DEFAULT_TTS_TIMEOUT_MS;
  }
  if (value < 5_000) return 5_000;
  if (value > 900_000) return 900_000;
  return Math.floor(value);
}

function sanitizeFileStem(value: string): string {
  return value
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "tts";
}

function toProjectRelativePath(projectRoot: string, targetPath: string): string | null {
  const relative = path.relative(projectRoot, targetPath);
  if (!relative) return null;
  if (relative.startsWith("..")) return null;
  if (path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

function resolveOutputTarget(params: {
  context: ExecutionContext;
  format: TtsAudioFormat;
  output?: string;
  modelId: string;
}): { absPath: string; relativePath: string } {
  const output = normalizeText(params.output);
  const defaultDir = path.join(getCacheDirPath(params.context.rootPath), "tts");
  const target = output
    ? (path.isAbsolute(output)
        ? path.normalize(output)
        : path.resolve(params.context.rootPath, output))
    : defaultDir;

  const ext = `.${params.format}`;
  const hasExplicitFile = Boolean(path.extname(target));
  const filePath = hasExplicitFile
    ? target
    : path.join(
        target,
        `${Date.now()}-${sanitizeFileStem(params.modelId)}${ext}`,
      );
  const relativePath = toProjectRelativePath(params.context.rootPath, filePath);
  if (!relativePath) {
    throw new Error(`TTS output must stay inside project root: ${filePath}`);
  }
  return {
    absPath: filePath,
    relativePath,
  };
}

function pickLastNonEmptyLine(value: string): string {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : "";
}

function detectLanguageHint(input: string): "zh" | "en" {
  return /[\u3400-\u9fff]/u.test(input) ? "zh" : "en";
}

function resolveKokoroVoicePath(params: {
  modelDir: string;
  voice?: string;
  language: string;
}): string {
  const voicesDir = path.join(params.modelDir, "voices");
  const requested = normalizeText(params.voice);
  if (requested) {
    const requestedPath = requested.endsWith(".pt")
      ? path.resolve(voicesDir, requested)
      : path.resolve(voicesDir, `${requested}.pt`);
    if (fs.existsSync(requestedPath)) {
      return requestedPath;
    }
  }

  const preferred =
    params.language === "zh"
      ? ["zf_xiaoni.pt", "af_heart.pt"]
      : ["af_heart.pt", "zf_xiaoni.pt"];
  for (const fileName of preferred) {
    const candidate = path.join(voicesDir, fileName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const entries = fs.readdirSync(voicesDir).filter((item) => item.endsWith(".pt"));
  if (entries.length === 0) {
    throw new Error(`kokoro voice assets are missing: ${voicesDir}`);
  }
  return path.join(voicesDir, entries[0]);
}

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

async function runPythonInline(params: {
  pythonBin: string;
  script: string;
  args: string[];
  timeoutMs: number;
}): Promise<void> {
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
  const err = pickLastNonEmptyLine(stderr);
  if (err) {
    throw new Error(`python runner stderr: ${err}`);
  }
}

const KOKORO_INLINE_SCRIPT = [
  "import numpy as np",
  "import soundfile as sf",
  "import torch",
  "from kokoro import KModel, KPipeline",
  "config_path = __import__('sys').argv[1]",
  "model_path = __import__('sys').argv[2]",
  "voice_path = __import__('sys').argv[3]",
  "lang_code = __import__('sys').argv[4]",
  "text = __import__('sys').argv[5]",
  "output_path = __import__('sys').argv[6]",
  "speed = float(__import__('sys').argv[7])",
  "device = 'cuda' if torch.cuda.is_available() else 'cpu'",
  "model = KModel(config=config_path, model=model_path).to(device).eval()",
  "pipeline = KPipeline(lang_code=lang_code, model=model, device=device)",
  "chunks = []",
  "for _, _, audio in pipeline(text, voice=voice_path, speed=speed):",
  "    if audio is None:",
  "        continue",
  "    chunks.append(audio.cpu().numpy() if hasattr(audio, 'cpu') else np.asarray(audio))",
  "if not chunks:",
  "    raise RuntimeError('kokoro returned empty audio')",
  "wave = np.concatenate(chunks)",
  "sf.write(output_path, wave, 24000)",
  "print(output_path)",
].join("\n");

const QWEN3_INLINE_SCRIPT = [
  "import soundfile as sf",
  "import torch",
  "from qwen_tts import Qwen3TTSModel",
  "model_path = __import__('sys').argv[1]",
  "text = __import__('sys').argv[2]",
  "voice = __import__('sys').argv[3]",
  "language = __import__('sys').argv[4]",
  "output_path = __import__('sys').argv[5]",
  "speed = float(__import__('sys').argv[6])",
  "device = 'cuda' if torch.cuda.is_available() else 'cpu'",
  "dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32",
  "model = Qwen3TTSModel.from_pretrained(model_path, device_map=device, dtype=dtype)",
  "speakers = model.get_supported_speakers() or []",
  "speaker = voice if voice and voice in speakers else (speakers[0] if speakers else voice)",
  "if not speaker:",
  "    raise RuntimeError('qwen3 supported speaker list is empty')",
  "languages = model.get_supported_languages() or []",
  "resolved_language = language if language and language in languages else ('Auto' if 'Auto' in languages else (languages[0] if languages else 'Auto'))",
  "wavs, sample_rate = model.generate_custom_voice(text=text, speaker=speaker, language=resolved_language, non_streaming_mode=True, do_sample=True, top_p=0.9, temperature=0.7, repetition_penalty=1.05)",
  "wave = wavs[0] if isinstance(wavs, list) else wavs",
  "sf.write(output_path, wave, sample_rate)",
  "print(output_path)",
].join("\n");

async function runKokoroSynthesizer(params: {
  pythonBin: string;
  modelDir: string;
  text: string;
  voice?: string;
  language: string;
  outputPath: string;
  speed: number;
  timeoutMs: number;
}): Promise<void> {
  const voicePath = resolveKokoroVoicePath({
    modelDir: params.modelDir,
    voice: params.voice,
    language: params.language,
  });
  const configPath = path.join(params.modelDir, "config.json");
  const modelPath = path.join(params.modelDir, "kokoro-v1_0.pth");
  await runPythonInline({
    pythonBin: params.pythonBin,
    script: KOKORO_INLINE_SCRIPT,
    args: [
      configPath,
      modelPath,
      voicePath,
      params.language === "zh" ? "z" : "a",
      params.text,
      params.outputPath,
      String(params.speed),
    ],
    timeoutMs: params.timeoutMs,
  });
}

async function runQwen3Synthesizer(params: {
  pythonBin: string;
  modelDir: string;
  text: string;
  voice?: string;
  language: string;
  outputPath: string;
  speed: number;
  timeoutMs: number;
}): Promise<void> {
  await runPythonInline({
    pythonBin: params.pythonBin,
    script: QWEN3_INLINE_SCRIPT,
    args: [
      params.modelDir,
      params.text,
      normalizeText(params.voice),
      params.language === "zh" ? "Chinese" : params.language === "en" ? "English" : "Auto",
      params.outputPath,
      String(params.speed),
    ],
    timeoutMs: params.timeoutMs,
  });
}

/**
 * 执行一次 TTS 合成，并写出音频文件。
 */
export async function synthesizeSpeechFile(params: {
  /**
   * 当前执行上下文。
   */
  context: ExecutionContext;
  /**
   * 当前 plugin 配置。
   */
  config: TtsPluginConfig;
  /**
   * 本次合成输入。
   */
  input: TtsSynthesizeInput;
}): Promise<{
  /**
   * 输出相对路径。
   */
  outputPath: string;
  /**
   * 可发送文件标签。
   */
  fileTag: string;
  /**
   * 文件字节数。
   */
  bytes: number;
}> {
  const text = normalizeText(params.input.text);
  if (!text) {
    throw new Error("tts synthesize requires text");
  }

  const modelId = resolveTtsModelId(
    normalizeText(params.input.modelId || params.config.modelId),
  );
  if (!modelId) {
    throw new Error("tts modelId is missing");
  }

  const model = getTtsModelCatalogItem(modelId);
  if (!model) {
    throw new Error(`Unsupported tts model: ${modelId}`);
  }

  const format = normalizeFormat(params.input.format || params.config.format);
  const speed = normalizeSpeed(
    typeof params.input.speed === "number" ? params.input.speed : params.config.speed,
  );
  const language =
    normalizeText(params.input.language || params.config.language) ||
    detectLanguageHint(text);
  const pythonBin = normalizeText(params.config.pythonBin) || "python3";
  const timeoutMs = normalizeTimeoutMs(params.config.timeoutMs);
  const modelsRootDir = resolveTtsModelsRootDir({
    projectRoot: params.context.rootPath,
    modelsDir: params.config.modelsDir,
  });
  const modelDir = path.join(modelsRootDir, modelId);
  const output = resolveOutputTarget({
    context: params.context,
    format,
    output: normalizeText(params.input.output || params.config.outputDir),
    modelId,
  });

  await fs.ensureDir(path.dirname(output.absPath));
  if (model.family === "kokoro") {
    await runKokoroSynthesizer({
      pythonBin,
      modelDir,
      text,
      voice: params.input.voice || params.config.voice,
      language,
      outputPath: output.absPath,
      speed,
      timeoutMs,
    });
  } else {
    await runQwen3Synthesizer({
      pythonBin,
      modelDir,
      text,
      voice: params.input.voice || params.config.voice,
      language,
      outputPath: output.absPath,
      speed,
      timeoutMs,
    });
  }

  const stats = await fs.stat(output.absPath);
  return {
    outputPath: output.relativePath,
    fileTag: renderChatMessageFileTag({
      type: "audio",
      path: output.relativePath,
    }),
    bytes: stats.size,
  };
}

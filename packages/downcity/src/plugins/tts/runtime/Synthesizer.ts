/**
 * TTS 语音合成 runtime。
 *
 * 关键点（中文）
 * - 读取 console 模型池中的 OpenAI 兼容模型配置。
 * - 调用 `/audio/speech` 生成二进制音频。
 * - 把输出落到本地文件，并返回 `<file type="audio">` 可发送标记。
 */

import fs from "fs-extra";
import path from "node:path";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type {
  TtsAudioFormat,
  TtsPluginConfig,
  TtsSynthesizeInput,
} from "@/types/TtsPlugin.js";
import { ConsoleStore } from "@/utils/store/index.js";
import { getCacheDirPath } from "@/main/env/Paths.js";
import {
  normalizeBaseUrl,
  resolveEnvPlaceholder,
  resolveProviderDefaultBaseUrl,
} from "@/main/commands/ModelSupport.js";
import { renderChatMessageFileTag } from "@/services/chat/runtime/ChatMessageMarkup.js";

const OPENAI_COMPAT_PROVIDER_TYPES = new Set([
  "openai",
  "deepseek",
  "moonshot",
  "xai",
  "huggingface",
  "openrouter",
  "open-compatible",
  "open-responses",
]);

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeFormat(value: unknown): TtsAudioFormat {
  const format = normalizeText(value).toLowerCase();
  if (
    format === "mp3" ||
    format === "wav" ||
    format === "opus" ||
    format === "aac" ||
    format === "flac"
  ) {
    return format;
  }
  return "mp3";
}

function normalizeSpeed(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || Number.isNaN(value)) {
    return undefined;
  }
  const next = Math.max(0.25, Math.min(4, value));
  return Number(next.toFixed(2));
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
  voice: string;
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
        `${Date.now()}-${sanitizeFileStem(params.voice)}${ext}`,
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

async function resolveSpeechModel(params: {
  modelId: string;
}): Promise<{
  modelName: string;
  baseUrl: string;
  apiKey: string;
}> {
  const store = new ConsoleStore();
  try {
    const resolved = await store.getResolvedModel(params.modelId);
    if (!resolved) {
      throw new Error(`TTS model not found in console store: ${params.modelId}`);
    }
    if (!OPENAI_COMPAT_PROVIDER_TYPES.has(resolved.provider.type)) {
      throw new Error(
        `TTS provider must be OpenAI compatible: ${resolved.provider.type}`,
      );
    }

    const modelName = normalizeText(resolveEnvPlaceholder(resolved.model.name));
    if (!modelName) {
      throw new Error(`TTS model name is empty: ${params.modelId}`);
    }

    const apiKey = normalizeText(resolveEnvPlaceholder(resolved.provider.apiKey));
    if (!apiKey) {
      throw new Error(`TTS provider apiKey is missing: ${resolved.provider.id}`);
    }

    const baseUrl =
      normalizeBaseUrl(
        resolveEnvPlaceholder(resolved.provider.baseUrl) ||
          resolveProviderDefaultBaseUrl(resolved.provider.type),
      ) || "https://api.openai.com/v1";

    return {
      modelName,
      baseUrl,
      apiKey,
    };
  } finally {
    store.close();
  }
}

/**
 * 执行一次 TTS 合成，并写出音频文件。
 */
export async function synthesizeSpeechFile(params: {
  context: ExecutionContext;
  config: TtsPluginConfig;
  input: TtsSynthesizeInput;
}): Promise<{
  outputPath: string;
  fileTag: string;
  bytes: number;
}> {
  const text = normalizeText(params.input.text);
  if (!text) {
    throw new Error("tts synthesize requires text");
  }

  const modelId = normalizeText(params.input.modelId || params.config.modelId);
  if (!modelId) {
    throw new Error("tts modelId is missing");
  }

  const voice = normalizeText(params.input.voice || params.config.voice) || "alloy";
  const format = normalizeFormat(params.input.format || params.config.format);
  const speed = normalizeSpeed(
    typeof params.input.speed === "number" ? params.input.speed : params.config.speed,
  );
  const model = await resolveSpeechModel({ modelId });
  const output = resolveOutputTarget({
    context: params.context,
    format,
    output: normalizeText(params.input.output || params.config.outputDir),
    voice,
  });

  const response = await fetch(`${model.baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${model.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model.modelName,
      input: text,
      voice,
      response_format: format,
      ...(typeof speed === "number" ? { speed } : {}),
    }),
  });
  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(
      `tts synthesize request failed: ${response.status} ${response.statusText}${bodyText ? ` ${bodyText}` : ""}`,
    );
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  await fs.ensureDir(path.dirname(output.absPath));
  await fs.writeFile(output.absPath, audioBuffer);

  return {
    outputPath: output.relativePath,
    fileTag: renderChatMessageFileTag({
      type: "audio",
      path: output.relativePath,
    }),
    bytes: audioBuffer.length,
  };
}

import path from "node:path";
import fs from "node:fs";
import fsExtra from "fs-extra";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { VoiceModelCatalogItem, VoiceModelId } from "@main/types/Voice.js";

const HUGGINGFACE_HOST = "https://huggingface.co";

type HuggingFaceModelApiResponse = {
  siblings?: Array<{
    rfilename?: string;
  }>;
};

/**
 * Voice 模型安装结果。
 */
export interface VoiceModelInstallResult {
  /**
   * 模型目录（绝对路径）。
   */
  modelDir: string;
  /**
   * 本次下载文件数。
   */
  downloadedFiles: number;
  /**
   * 本次跳过文件数（已存在且未强制覆盖）。
   */
  skippedFiles: number;
  /**
   * 本次实际下载的文件路径（相对模型目录）。
   */
  downloadedFilePaths: string[];
  /**
   * 本次跳过的文件路径（相对模型目录）。
   */
  skippedFilePaths: string[];
  /**
   * 安装源仓库 ID。
   */
  repoId: string;
  /**
   * 安装源 revision。
   */
  revision: string;
}

/**
 * Voice 模型安装进度事件。
 */
export interface VoiceModelInstallProgressEvent {
  /**
   * 当前阶段。
   */
  stage:
    | "discover"
    | "skip"
    | "download_start"
    | "download_done"
    | "manifest";
  /**
   * 文件路径（相对模型目录，可选）。
   */
  filePath?: string;
  /**
   * 文件总数（可选）。
   */
  totalFiles?: number;
  /**
   * 当前文件序号（从 1 开始，可选）。
   */
  index?: number;
}

/**
 * 判断模型在本地是否已安装。
 *
 * 关键点（中文）
 * - 优先识别安装清单 `shipmyagent.voice.install.json`。
 * - 若无清单但目录非空，也视为已存在模型，避免重复下载。
 */
export async function detectLocalVoiceModelInstallState(input: {
  modelId: VoiceModelId;
  modelsRootDir: string;
}): Promise<{
  /**
   * 模型目录（绝对路径）。
   */
  modelDir: string;
  /**
   * 是否判断为“已安装”。
   */
  installed: boolean;
  /**
   * 已安装来源。
   */
  source?: "manifest" | "directory";
}> {
  const modelDir = path.resolve(input.modelsRootDir, input.modelId);
  const manifestPath = path.join(modelDir, "shipmyagent.voice.install.json");
  const hasManifest = await fsExtra.pathExists(manifestPath);
  if (hasManifest) {
    return {
      modelDir,
      installed: true,
      source: "manifest",
    };
  }

  const hasModelDir = await fsExtra.pathExists(modelDir);
  if (!hasModelDir) {
    return {
      modelDir,
      installed: false,
    };
  }

  const entries = await fsExtra.readdir(modelDir).catch(() => []);
  const hasPersistedFiles = entries.some(
    (entry) => !String(entry).endsWith(".downloading"),
  );
  if (!hasPersistedFiles) {
    return {
      modelDir,
      installed: false,
    };
  }

  return {
    modelDir,
    installed: true,
    source: "directory",
  };
}

function encodePathSegments(input: string): string {
  return input
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildAuthHeaders(token?: string): Record<string, string> | undefined {
  const t = String(token || "").trim();
  if (!t) return undefined;
  return { Authorization: `Bearer ${t}` };
}

function resolveSafeTargetPath(baseDir: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const target = path.resolve(baseDir, normalized);
  const base = path.resolve(baseDir);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new Error(`Unsafe file path from HuggingFace: ${relativePath}`);
  }
  return target;
}

async function readModelFiles(input: {
  repoId: string;
  hfToken?: string;
}): Promise<string[]> {
  const repoUrlPath = encodePathSegments(input.repoId);
  const metadataUrl = `${HUGGINGFACE_HOST}/api/models/${repoUrlPath}`;
  const response = await fetch(metadataUrl, {
    headers: {
      Accept: "application/json",
      ...(buildAuthHeaders(input.hfToken) || {}),
    },
  });
  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(
      `Failed to fetch model metadata (${input.repoId}): HTTP ${response.status}${responseText ? ` ${responseText.slice(0, 300)}` : ""}`,
    );
  }
  const payload = (await response.json()) as HuggingFaceModelApiResponse;
  const files = (Array.isArray(payload.siblings) ? payload.siblings : [])
    .map((item) => String(item?.rfilename || "").trim())
    .filter(Boolean)
    .filter((item) => item !== ".gitattributes");
  if (files.length === 0) {
    throw new Error(`No downloadable files found in repo: ${input.repoId}`);
  }
  return files;
}

async function downloadModelFile(input: {
  repoId: string;
  revision: string;
  filePath: string;
  targetPath: string;
  hfToken?: string;
}): Promise<void> {
  const repoPath = encodePathSegments(input.repoId);
  const revision = encodeURIComponent(input.revision);
  const filePath = encodePathSegments(input.filePath);
  const url = `${HUGGINGFACE_HOST}/${repoPath}/resolve/${revision}/${filePath}?download=1`;
  const response = await fetch(url, {
    headers: {
      ...(buildAuthHeaders(input.hfToken) || {}),
    },
  });
  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(
      `Failed to download ${input.filePath}: HTTP ${response.status}${responseText ? ` ${responseText.slice(0, 300)}` : ""}`,
    );
  }
  if (!response.body) {
    throw new Error(`Empty response body for file: ${input.filePath}`);
  }

  const tempPath = `${input.targetPath}.downloading`;
  await fsExtra.ensureDir(path.dirname(input.targetPath));
  try {
    const body = Readable.fromWeb(
      response.body as unknown as globalThis.ReadableStream<Uint8Array>,
    );
    await pipeline(body, fs.createWriteStream(tempPath));
    await fsExtra.move(tempPath, input.targetPath, { overwrite: true });
  } catch (error) {
    await fsExtra.remove(tempPath).catch(() => undefined);
    throw error;
  }
}

/**
 * 安装指定 voice 模型到本地目录。
 *
 * 关键点（中文）
 * - 使用 HTTP 文件级下载，不依赖 git-lfs。
 * - 默认复用已有文件；`force=true` 时覆盖重下。
 */
export async function installVoiceModelFromHuggingFace(input: {
  model: VoiceModelCatalogItem;
  modelsRootDir: string;
  force?: boolean;
  hfToken?: string;
  onProgress?: (event: VoiceModelInstallProgressEvent) => void;
}): Promise<VoiceModelInstallResult> {
  const modelDir = path.resolve(input.modelsRootDir, input.model.id);
  await fsExtra.ensureDir(modelDir);

  const files = await readModelFiles({
    repoId: input.model.huggingfaceRepo,
    hfToken: input.hfToken,
  });
  input.onProgress?.({
    stage: "discover",
    totalFiles: files.length,
  });

  let downloadedFiles = 0;
  let skippedFiles = 0;
  const downloadedFilePaths: string[] = [];
  const skippedFilePaths: string[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const filePath = files[i];
    const targetPath = resolveSafeTargetPath(modelDir, filePath);
    const exists = await fsExtra.pathExists(targetPath);
    if (exists && input.force !== true) {
      skippedFiles += 1;
      skippedFilePaths.push(filePath);
      input.onProgress?.({
        stage: "skip",
        filePath,
        index: i + 1,
        totalFiles: files.length,
      });
      continue;
    }
    input.onProgress?.({
      stage: "download_start",
      filePath,
      index: i + 1,
      totalFiles: files.length,
    });
    await downloadModelFile({
      repoId: input.model.huggingfaceRepo,
      revision: input.model.revision,
      filePath,
      targetPath,
      hfToken: input.hfToken,
    });
    downloadedFiles += 1;
    downloadedFilePaths.push(filePath);
    input.onProgress?.({
      stage: "download_done",
      filePath,
      index: i + 1,
      totalFiles: files.length,
    });
  }

  await fsExtra.writeJson(
    path.join(modelDir, "shipmyagent.voice.install.json"),
    {
      modelId: input.model.id,
      label: input.model.label,
      repoId: input.model.huggingfaceRepo,
      revision: input.model.revision,
      installedAt: new Date().toISOString(),
      downloadedFiles,
      skippedFiles,
    },
    { spaces: 2 },
  );
  input.onProgress?.({
    stage: "manifest",
  });

  return {
    modelDir,
    downloadedFiles,
    skippedFiles,
    downloadedFilePaths,
    skippedFilePaths,
    repoId: input.model.huggingfaceRepo,
    revision: input.model.revision,
  };
}

/**
 * TTS 模型安装器。
 *
 * 关键点（中文）
 * - 统一把 HuggingFace 资源下载到本地模型目录。
 * - 支持“整仓下载”与“仅下载指定文件”两种模式。
 */

import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import fsExtra from "fs-extra";
import type { TtsModelCatalogItem, TtsModelId } from "@/types/Tts.js";

const HUGGINGFACE_HOST = "https://huggingface.co";
const TTS_INSTALL_MANIFEST = "downcity.tts.install.json";

type HuggingFaceModelApiResponse = {
  siblings?: Array<{
    rfilename?: string;
  }>;
};

/**
 * TTS 模型安装结果。
 */
export interface TtsModelInstallResult {
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

async function readRepoFiles(input: {
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
 * 判断模型在本地是否已安装。
 *
 * 关键点（中文）
 * - 优先识别安装清单 `downcity.tts.install.json`。
 * - 若无清单但目录非空，也视为已存在模型，避免重复下载。
 */
export async function detectLocalTtsModelInstallState(input: {
  /**
   * 模型 ID。
   */
  modelId: TtsModelId;
  /**
   * TTS 模型根目录。
   */
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
  const manifestPath = path.join(modelDir, TTS_INSTALL_MANIFEST);
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

/**
 * 安装指定 TTS 模型到本地目录。
 *
 * 关键点（中文）
 * - 使用 HTTP 文件级下载，不依赖 git-lfs。
 * - 默认复用已有文件；`force=true` 时覆盖重下。
 */
export async function installTtsModelFromHuggingFace(input: {
  /**
   * 目标模型目录项。
   */
  model: TtsModelCatalogItem;
  /**
   * TTS 模型根目录。
   */
  modelsRootDir: string;
  /**
   * 是否强制覆盖。
   */
  force?: boolean;
  /**
   * HuggingFace Token（可选）。
   */
  hfToken?: string;
}): Promise<TtsModelInstallResult> {
  const modelDir = path.resolve(input.modelsRootDir, input.model.id);
  await fsExtra.ensureDir(modelDir);

  let downloadedFiles = 0;
  let skippedFiles = 0;
  const downloadedFilePaths: string[] = [];
  const skippedFilePaths: string[] = [];

  for (const asset of input.model.assets) {
    const assetFiles =
      Array.isArray(asset.files) && asset.files.length > 0
        ? asset.files
        : await readRepoFiles({
            repoId: asset.repoId,
            hfToken: input.hfToken,
          });
    const assetBaseDir = asset.targetSubdir
      ? path.resolve(modelDir, asset.targetSubdir)
      : modelDir;
    await fsExtra.ensureDir(assetBaseDir);

    for (const filePath of assetFiles) {
      const relativeToModel = asset.targetSubdir
        ? path.posix.join(asset.targetSubdir.replace(/\\/g, "/"), filePath)
        : filePath;
      const targetPath = resolveSafeTargetPath(assetBaseDir, filePath);
      const exists = await fsExtra.pathExists(targetPath);
      if (exists && input.force !== true) {
        skippedFiles += 1;
        skippedFilePaths.push(relativeToModel);
        continue;
      }
      await downloadModelFile({
        repoId: asset.repoId,
        revision: asset.revision,
        filePath,
        targetPath,
        hfToken: input.hfToken,
      });
      downloadedFiles += 1;
      downloadedFilePaths.push(relativeToModel);
    }
  }

  const manifestPath = path.join(modelDir, TTS_INSTALL_MANIFEST);
  await fsExtra.writeJson(
    manifestPath,
    {
      modelId: input.model.id,
      installedAt: new Date().toISOString(),
      assets: input.model.assets,
    },
    { spaces: 2 },
  );

  return {
    modelDir,
    downloadedFiles,
    skippedFiles,
    downloadedFilePaths,
    skippedFilePaths,
  };
}

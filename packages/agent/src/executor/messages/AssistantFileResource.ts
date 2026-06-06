/**
 * AssistantFileResource：assistant file part 的本地资源落盘工具。
 *
 * 关键点（中文）
 * - 只处理运行期产生的 assistant file part，不参与 user 附件注入。
 * - 将 `data:*;base64,...` 写入 `.downcity/resources`，历史中只保留 `file://` 绝对 URL。
 * - 资源文件按内容 hash 命名，天然去重并避免重复写入大文件。
 */

import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "fs-extra";
import type { FileUIPart } from "ai";
import { getDowncityResourcesDirPath } from "@/config/Paths.js";

type ParsedDataUrl = {
  /**
   * data URL 声明的媒体类型。
   */
  media_type: string;
  /**
   * data URL 解码后的二进制内容。
   */
  bytes: Buffer;
};

/**
 * assistant file part 资源落盘参数。
 */
export interface MaterializeAssistantFilePartsParams {
  /**
   * 当前项目根目录。
   *
   * 关键点（中文）
   * - 正常 session run 会显式传入 projectRoot。
   * - 旧入口未传时回退到 `process.cwd()`，保证行为可用。
   */
  projectRoot?: string;

  /**
   * 待处理的 assistant file parts。
   */
  parts: FileUIPart[];
}

function resolve_project_root(projectRoot: string | undefined): string {
  const raw = String(projectRoot || "").trim();
  return path.resolve(raw || process.cwd());
}

function parse_data_url(url: string): ParsedDataUrl | null {
  const raw = String(url || "").trim();
  if (!raw.startsWith("data:")) return null;
  const comma_index = raw.indexOf(",");
  if (comma_index < 0) return null;

  const header = raw.slice(5, comma_index);
  const body = raw.slice(comma_index + 1);
  const header_parts = header.split(";").filter(Boolean);
  const media_type =
    header_parts.find((item) => item.includes("/")) || "application/octet-stream";
  const is_base64 = header_parts.some((item) => item.toLowerCase() === "base64");

  try {
    const bytes = is_base64
      ? Buffer.from(body, "base64")
      : Buffer.from(decodeURIComponent(body), "utf8");
    if (bytes.length === 0) return null;
    return {
      media_type,
      bytes,
    };
  } catch {
    return null;
  }
}

function extension_from_media_type(mediaType: string): string {
  const value = String(mediaType || "").toLowerCase();
  if (value === "image/png") return ".png";
  if (value === "image/jpeg" || value === "image/jpg") return ".jpg";
  if (value === "image/webp") return ".webp";
  if (value === "image/gif") return ".gif";
  if (value === "application/pdf") return ".pdf";
  return ".bin";
}

function extension_from_filename(filename: string | undefined): string {
  const ext = path.extname(String(filename || "").trim()).toLowerCase();
  if (!ext || ext.length > 12) return "";
  return /^[.][a-z0-9]+$/u.test(ext) ? ext : "";
}

async function write_resource_file(params: {
  projectRoot: string;
  mediaType: string;
  filename?: string;
  bytes: Buffer;
}): Promise<string> {
  const hash = crypto.createHash("sha256").update(params.bytes).digest("hex");
  const ext =
    extension_from_filename(params.filename) ||
    extension_from_media_type(params.mediaType);
  const file_name = `${hash}${ext}`;
  const resources_dir = getDowncityResourcesDirPath(params.projectRoot);
  const file_path = path.join(resources_dir, file_name);

  await fs.ensureDir(resources_dir);
  try {
    await fs.writeFile(file_path, params.bytes, { flag: "wx" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw error;
  }

  return file_path;
}

/**
 * 将 assistant file part 中的 data URL 资源落盘为 `file://` 绝对 URL。
 */
export async function materializeAssistantFileParts(
  params: MaterializeAssistantFilePartsParams,
): Promise<FileUIPart[]> {
  const parts = Array.isArray(params.parts) ? params.parts : [];
  if (parts.length === 0) return [];

  const project_root = resolve_project_root(params.projectRoot);
  const out: FileUIPart[] = [];

  for (const part of parts) {
    const parsed = parse_data_url(String(part.url || ""));
    if (!parsed) {
      out.push(part);
      continue;
    }

    const media_type = String(part.mediaType || parsed.media_type || "").trim();
    const file_path = await write_resource_file({
      projectRoot: project_root,
      mediaType: media_type || parsed.media_type,
      filename: typeof part.filename === "string" ? part.filename : undefined,
      bytes: parsed.bytes,
    });

    out.push({
      ...part,
      mediaType: media_type || parsed.media_type,
      url: pathToFileURL(file_path).href,
    });
  }

  return out;
}

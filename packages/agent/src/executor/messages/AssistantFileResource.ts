/**
 * AssistantFileResource：assistant file part 的本地资源落盘工具。
 *
 * 关键点（中文）
 * - 只处理运行期产生的 assistant file part，不参与 user 附件注入。
 * - 将 data URL、远程 URL 与本地文件统一写入 `.downcity/resources`。
 * - 历史中只保留 `resources://<project-relative-path>`，避免暴露本机绝对路径。
 * - 资源文件按内容 hash 命名，天然去重并避免重复写入大文件。
 */

import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

function filename_from_url(raw_url: string): string | undefined {
  try {
    const parsed = new URL(raw_url);
    return path.basename(decodeURIComponent(parsed.pathname)) || undefined;
  } catch {
    return undefined;
  }
}

function to_resources_url(projectRoot: string, filePath: string): string {
  const relative = path
    .relative(projectRoot, filePath)
    .split(path.sep)
    .join("/");
  return `resources://${relative}`;
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

async function read_remote_resource(raw_url: string): Promise<{
  mediaType?: string;
  filename?: string;
  bytes: Buffer;
}> {
  const result = await fetch_with_retry(raw_url);
  if (!result.ok) {
    throw new Error(
      `Failed to download assistant file resource: ${result.status} :: url=${raw_url}`,
    );
  }
  const array_buffer = await result.arrayBuffer();
  const bytes = Buffer.from(array_buffer);
  if (bytes.length === 0) {
    throw new Error(`Downloaded assistant file resource is empty :: url=${raw_url}`);
  }
  return {
    mediaType: result.headers.get("content-type")?.split(";")[0]?.trim(),
    filename: filename_from_url(raw_url),
    bytes,
  };
}

/**
 * 带重试的 fetch 远程资源。
 *
 * 关键点（中文）
 * - 对 transient 网络错误（fetch failed / UND_ERR_* / ECONNRESET 等）做 2 次指数退避重试。
 * - 最终失败时把 error.cause 链展开到 message，方便定位是代理问题、DNS 问题还是上游问题。
 */
async function fetch_with_retry(
  raw_url: string,
): Promise<Response> {
  const delays_ms = [250, 1_000];
  const attempts = delays_ms.length + 1;
  let last_error: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(raw_url);
    } catch (error) {
      last_error = error;
      if (!is_transient_fetch_error(error) || attempt === attempts - 1) {
        throw enrich_fetch_error(error, raw_url);
      }
      const delay_ms = delays_ms[attempt] ?? 1_000;
      await new Promise((resolve) => setTimeout(resolve, delay_ms));
    }
  }
  throw enrich_fetch_error(last_error, raw_url);
}

function is_transient_fetch_error(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = `${error.message} ${describe_error_cause(error)}`;
  return /fetch failed|UND_ERR|ECONN(RESET|REFUSED|ABORTED)|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up/i.test(
    text,
  );
}

function enrich_fetch_error(error: unknown, url: string): Error {
  if (!(error instanceof Error)) {
    return new Error(`Download failed: ${String(error)} :: url=${url}`);
  }
  const cause_text = describe_error_cause(error);
  const enriched = new Error(
    `${error.message}${cause_text ? ` :: cause=${cause_text}` : ""} :: url=${url}`,
    error.cause ? { cause: error.cause } : undefined,
  );
  enriched.stack = error.stack;
  return enriched;
}

function describe_error_cause(error: Error): string {
  const parts: string[] = [];
  let current: unknown = (error as { cause?: unknown }).cause;
  let depth = 0;
  while (current && depth < 3) {
    if (current instanceof Error) {
      const code = (current as { code?: unknown }).code;
      const code_text = typeof code === "string" && code ? `[${code}] ` : "";
      parts.push(`${code_text}${current.message || current.name}`.trim());
      current = (current as { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
    depth += 1;
  }
  return parts.filter(Boolean).join(" -> ");
}

async function read_local_resource(
  projectRoot: string,
  raw_url: string,
): Promise<{
  mediaType?: string;
  filename?: string;
  bytes: Buffer;
}> {
  const raw = String(raw_url || "").trim();
  const file_path = raw.startsWith("file://")
    ? fileURLToPath(raw)
    : path.isAbsolute(raw)
      ? raw
      : path.resolve(projectRoot, raw);
  const bytes = await fs.readFile(file_path);
  if (bytes.length === 0) {
    throw new Error(`Assistant file resource is empty: ${file_path}`);
  }
  return {
    filename: path.basename(file_path),
    bytes,
  };
}

async function materialize_file_part(params: {
  projectRoot: string;
  part: FileUIPart;
}): Promise<FileUIPart> {
  const raw_url = String(params.part.url || "").trim();
  if (!raw_url) {
    throw new Error("Assistant file part url is required");
  }
  if (raw_url.startsWith("resources://")) return params.part;

  const parsed_data_url = parse_data_url(raw_url);
  if (parsed_data_url) {
    const media_type =
      String(params.part.mediaType || parsed_data_url.media_type || "").trim() ||
      "application/octet-stream";
    const file_path = await write_resource_file({
      projectRoot: params.projectRoot,
      mediaType: media_type,
      filename:
        typeof params.part.filename === "string" ? params.part.filename : undefined,
      bytes: parsed_data_url.bytes,
    });
    return {
      ...params.part,
      mediaType: media_type,
      url: to_resources_url(params.projectRoot, file_path),
    };
  }

  if (raw_url.startsWith("http://") || raw_url.startsWith("https://")) {
    try {
      const source = await read_remote_resource(raw_url);
      const media_type =
        String(params.part.mediaType || source.mediaType || "").trim() ||
        "application/octet-stream";
      const file_path = await write_resource_file({
        projectRoot: params.projectRoot,
        mediaType: media_type,
        filename:
          typeof params.part.filename === "string"
            ? params.part.filename
            : source.filename,
        bytes: source.bytes,
      });
      return {
        ...params.part,
        mediaType: media_type,
        url: to_resources_url(params.projectRoot, file_path),
      };
    } catch (error) {
      // 关键点（中文）：远程下载失败时保留原始 URL，不让整张图导致 action 失败。
      // 这样图片至少以链接形式存在，用户可手动点击或后续再试。
      console.warn(
        `[AssistantFileResource] remote download failed, keeping original url :: ${describe_error_cause(error instanceof Error ? error : new Error(String(error)))} :: url=${raw_url}`,
      );
      return params.part;
    }
  }

  const source = await read_local_resource(params.projectRoot, raw_url);
  const media_type =
    String(params.part.mediaType || source.mediaType || "").trim() ||
    "application/octet-stream";
  const file_path = await write_resource_file({
    projectRoot: params.projectRoot,
    mediaType: media_type,
    filename:
      typeof params.part.filename === "string"
        ? params.part.filename
        : source.filename,
    bytes: source.bytes,
  });
  return {
    ...params.part,
    mediaType: media_type,
    url: to_resources_url(params.projectRoot, file_path),
  };
}

/**
 * 将 assistant file part 中的资源统一落盘为 `resources://` 相对 URL。
 */
export async function materializeAssistantFileParts(
  params: MaterializeAssistantFilePartsParams,
): Promise<FileUIPart[]> {
  const parts = Array.isArray(params.parts) ? params.parts : [];
  if (parts.length === 0) return [];

  const project_root = resolve_project_root(params.projectRoot);
  const out: FileUIPart[] = [];

  for (const part of parts) {
    out.push(await materialize_file_part({ projectRoot: project_root, part }));
  }

  return out;
}

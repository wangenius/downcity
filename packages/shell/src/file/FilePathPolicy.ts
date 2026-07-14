/**
 * 文件工具路径策略。
 *
 * 关键点（中文）
 * - 所有相对路径基于 Shell 的项目根目录解析。
 * - 词法路径和真实路径都必须位于项目根目录内。
 * - 最终目标不允许是符号链接，避免原子替换时产生歧义或逃逸。
 */

import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { FileToolRuntimeError } from "@/file/FileToolError.js";

/** 已通过项目根目录约束的文件路径。 */
export interface ResolvedFileToolPath {
  /** 解析后的目标绝对路径。 */
  file_path: string;
  /** 解析后的项目根目录绝对路径。 */
  root_path: string;
}

/** 判断目标路径是否等于根目录或位于根目录之下。 */
function is_path_inside_root(root_path: string, target_path: string): boolean {
  const relative_path = path.relative(root_path, target_path);
  return (
    relative_path === "" ||
    (!relative_path.startsWith("..") && !path.isAbsolute(relative_path))
  );
}

/** 返回最接近目标且已经存在的祖先目录。 */
async function resolve_existing_ancestor(target_path: string): Promise<string> {
  let current_path = path.dirname(target_path);
  while (true) {
    try {
      const metadata = await lstat(current_path);
      if (metadata.isSymbolicLink()) return current_path;
      if (!metadata.isDirectory()) {
        throw new FileToolRuntimeError({
          error_code: "not_a_file",
          message: `Parent path is not a directory: ${current_path}`,
          file_path: target_path,
        });
      }
      return current_path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent_path = path.dirname(current_path);
    if (parent_path === current_path) return current_path;
    current_path = parent_path;
  }
}

/** 解析并校验一个项目内文件路径。 */
export async function resolve_file_tool_path(params: {
  /** Shell 当前绑定的项目根目录。 */
  root_path: string;
  /** 模型传入的相对路径或绝对路径。 */
  file_path: string;
  /** 目标文件不存在时是否仍允许返回路径。 */
  allow_missing: boolean;
}): Promise<ResolvedFileToolPath> {
  const raw_root_path = String(params.root_path || "").trim();
  const raw_file_path = String(params.file_path || "").trim();
  if (!raw_root_path) {
    throw new FileToolRuntimeError({
      error_code: "invalid_path",
      message: "Shell file tools require a non-empty root_path",
    });
  }
  if (!raw_file_path || raw_file_path.includes("\0")) {
    throw new FileToolRuntimeError({
      error_code: "invalid_path",
      message: "file_path must be a non-empty valid path",
    });
  }

  const root_path = path.resolve(raw_root_path);
  const root_real_path = await realpath(root_path);
  const file_path = path.resolve(
    path.isAbsolute(raw_file_path)
      ? raw_file_path
      : path.join(root_path, raw_file_path),
  );
  if (!is_path_inside_root(root_path, file_path)) {
    throw new FileToolRuntimeError({
      error_code: "sandbox_denied",
      message: `File path escapes project root: ${raw_file_path}`,
      file_path,
    });
  }

  try {
    const metadata = await lstat(file_path);
    if (metadata.isSymbolicLink()) {
      throw new FileToolRuntimeError({
        error_code: "sandbox_denied",
        message: `Symbolic link targets are not allowed: ${file_path}`,
        file_path,
      });
    }
    if (!metadata.isFile()) {
      throw new FileToolRuntimeError({
        error_code: "not_a_file",
        message: `Expected a regular file: ${file_path}`,
        file_path,
      });
    }
    const file_real_path = await realpath(file_path);
    if (!is_path_inside_root(root_real_path, file_real_path)) {
      throw new FileToolRuntimeError({
        error_code: "sandbox_denied",
        message: `Resolved file path escapes project root: ${file_path}`,
        file_path,
      });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (!params.allow_missing) {
      throw new FileToolRuntimeError({
        error_code: "file_not_found",
        message: `File not found: ${file_path}`,
        file_path,
      });
    }
    const ancestor_path = await resolve_existing_ancestor(file_path);
    const ancestor_real_path = await realpath(ancestor_path);
    if (!is_path_inside_root(root_real_path, ancestor_real_path)) {
      throw new FileToolRuntimeError({
        error_code: "sandbox_denied",
        message: `Resolved parent path escapes project root: ${file_path}`,
        file_path,
      });
    }
  }

  return { file_path, root_path };
}

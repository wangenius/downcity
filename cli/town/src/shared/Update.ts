/**
 * `town update`：更新当前全局安装来源对应的 downcity CLI 聚合包。
 *
 * 关键点（中文）
 * - 优先根据当前 CLI 所在的全局模块目录，自动判断是 npm 还是 pnpm 安装。
 * - 允许用户通过 `--manager` 显式覆盖包管理器选择。
 * - 实际更新只负责全局包升级，不自动重启已有 runtime 进程。
 */

import fs from "fs";
import path from "path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "url";
import { emitCliBlock } from "./CliReporter.js";
import { CliError } from "./CliError.js";
import { runWithSpinner } from "../utils/cli/Spinner.js";

export type UpdateManager = "npm" | "pnpm";

export interface UpdateCommandOptions {
  /**
   * 包管理器选择。
   *
   * - `auto`：按当前 CLI 所在的全局目录自动判断。
   * - `npm` / `pnpm`：强制使用指定包管理器。
   */
  manager?: UpdateManager | "auto";
}

const FALLBACK_GLOBAL_PACKAGE_NAME = "downcity";

/**
 * 解析当前 CLI 安装包根目录。
 *
 * 关键点（中文）
 * - 开发态路径是 `src/shared`，构建后路径是 `bin/shared`。
 * - 两种目录结构都可以通过回退三级拿到 package 根目录。
 */
function resolveInstalledPackageRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../..");
}

/**
 * 读取当前 CLI 实际对应的 npm 包名。
 */
function readInstalledPackageName(packageRoot: string): string {
  try {
    const packageJsonPath = path.join(packageRoot, "package.json");
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { name?: unknown };
    const packageName = typeof parsed.name === "string" ? parsed.name.trim() : "";
    return packageName || FALLBACK_GLOBAL_PACKAGE_NAME;
  } catch {
    return FALLBACK_GLOBAL_PACKAGE_NAME;
  }
}

/**
 * 检测当前 CLI 实际安装来源的包名。
 */
export function detectInstalledPackageName(): string {
  return readInstalledPackageName(resolveInstalledPackageRoot());
}

export function buildGlobalUpdateInvocation(
  manager: UpdateManager,
  packageName: string,
): {
  command: string;
  args: string[];
} {
  if (manager === "pnpm") {
    return {
      command: "pnpm",
      args: ["add", "-g", `${packageName}@latest`],
    };
  }

  return {
    command: "npm",
    args: ["install", "-g", `${packageName}@latest`],
  };
}

/**
 * 根据全局模块根目录判断当前 CLI 来源。
 */
export function resolveUpdateManagerFromGlobalRoots(params: {
  packageRoot: string;
  npmRoot?: string;
  pnpmRoot?: string;
}): UpdateManager | null {
  const packageRoot = normalizeRealPath(params.packageRoot) || path.resolve(params.packageRoot);
  const pnpmRoot = normalizeRealPath(params.pnpmRoot);
  const npmRoot = normalizeRealPath(params.npmRoot);

  if (pnpmRoot && isSubPath(packageRoot, pnpmRoot)) return "pnpm";
  if (npmRoot && isSubPath(packageRoot, npmRoot)) return "npm";
  return null;
}

function normalizeRealPath(target?: string): string | null {
  const raw = String(target || "").trim();
  if (!raw) return null;
  try {
    return fs.realpathSync(raw);
  } catch {
    return path.resolve(raw);
  }
}

function isSubPath(targetPath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function readGlobalRoot(manager: UpdateManager): string | null {
  try {
    const output = execFileSync(manager, ["root", "-g"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const trimmed = String(output || "").trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

/**
 * 自动判断当前全局安装使用的包管理器。
 */
export function detectInstalledUpdateManager(): UpdateManager {
  const packageRoot = resolveInstalledPackageRoot();
  const detected = resolveUpdateManagerFromGlobalRoots({
    packageRoot,
    npmRoot: readGlobalRoot("npm") || undefined,
    pnpmRoot: readGlobalRoot("pnpm") || undefined,
  });
  return detected || "npm";
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${String(code)}`));
    });
  });
}

/**
 * update 命令入口。
 */
export async function updateCommand(
  options: UpdateCommandOptions = {},
): Promise<void> {
  const packageName = detectInstalledPackageName();
  const manager =
    options.manager && options.manager !== "auto"
      ? options.manager
      : detectInstalledUpdateManager();
  const invocation = buildGlobalUpdateInvocation(manager, packageName);

  emitCliBlock({
    tone: "accent",
    title: "Updating downcity",
    facts: [
      {
        label: "Manager",
        value: manager,
      },
      {
        label: "Command",
        value: `${invocation.command} ${invocation.args.join(" ")}`,
      },
    ],
  });

  try {
    await runWithSpinner(
      () => runCommand(invocation.command, invocation.args),
      { text: `Installing ${packageName}@latest via ${manager}...` },
    );
  } catch (error) {
    throw new CliError({
      title: "Failed to update downcity",
      note: error instanceof Error ? error.message : String(error),
    });
  }

  emitCliBlock({
    tone: "success",
    title: "Downcity updated",
    facts: [
      {
        label: "Package",
        value: `${packageName}@latest`,
      },
      {
        label: "Manager",
        value: manager,
      },
    ],
    note: "如果当前已有 town runtime 在运行，建议执行 `town restart` 载入最新版本。",
  });
}

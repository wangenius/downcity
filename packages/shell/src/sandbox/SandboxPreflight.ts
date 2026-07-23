/**
 * SandboxPreflight：本机 shell sandbox 依赖预检。
 *
 * 关键点（中文）
 * - shell 命令必须进入 sandbox；这里提前检查 backend 依赖，避免启动后首次 shell 执行才失败。
 * - Linux backend 基于 bubblewrap，本质使用 Linux namespaces / bind mount 等内核能力。
 * - Windows backend 依赖 Microsoft MXC，并要求 Windows 11 24H2+ 与有效 isolation tier。
 * - 本模块只诊断并给出修复建议，不自动安装软件，也不修改宿主机 sysctl。
 */

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { delimiter } from "node:path";
import { inspect_windows_mxc_support } from "@/sandbox/WindowsMxcSupport.js";
import type {
  SandboxBackend,
  WindowsMxcSupport,
} from "@/types/Sandbox.js";

/**
 * sandbox 预检失败原因。
 */
export type SandboxPreflightIssueCode =
  | "unsupported-platform"
  | "missing-command"
  | "userns-disabled"
  | "unsupported-windows-version"
  | "sandbox-runtime-unavailable";

/**
 * 单条 sandbox 预检失败。
 */
export interface SandboxPreflightIssue {
  /**
   * 机器可读的失败原因。
   */
  code: SandboxPreflightIssueCode;

  /**
   * 人类可读的失败说明。
   */
  message: string;

  /**
   * 可复制的修复建议列表。
   */
  fixes: string[];
}

/**
 * sandbox 预检结果。
 */
export interface SandboxPreflightResult {
  /**
   * 当前平台是否满足 shell sandbox 启动要求。
   */
  ok: boolean;

  /**
   * 当前宿主平台。
   */
  platform: NodeJS.Platform;

  /**
   * 当前平台对应的 sandbox backend。
   */
  backend?: SandboxBackend;

  /**
   * 失败原因集合。
   */
  issues: SandboxPreflightIssue[];
}

/**
 * sandbox 预检宿主探测依赖。
 */
export interface ShellSandboxPreflightProbe {
  /**
   * 判断命令是否存在于 PATH 中。
   */
  commandExists(command: string): Promise<boolean>;

  /**
   * 读取 `/proc` 下整数配置。
   */
  readProcInt(filePath: string): Promise<number | null>;

  /**
   * 探测 Windows MXC runtime 与实际隔离层级。
   */
  inspectWindowsMxcSupport(): Promise<WindowsMxcSupport>;
}

async function commandExists(command: string): Promise<boolean> {
  const pathValue = String(process.env.PATH || "").trim();
  const dirs = pathValue ? pathValue.split(delimiter) : [];
  for (const dir of dirs) {
    const candidate = path.join(dir, command);
    try {
      await access(candidate);
      return true;
    } catch {
      // continue
    }
  }
  return false;
}

async function readProcInt(filePath: string): Promise<number | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const value = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(value) && !Number.isNaN(value) ? value : null;
  } catch {
    return null;
  }
}

async function isLinuxUserNamespaceEnabled(
  probe: ShellSandboxPreflightProbe,
): Promise<boolean> {
  const unprivilegedUsernsClone = await probe.readProcInt(
    "/proc/sys/kernel/unprivileged_userns_clone",
  );
  if (unprivilegedUsernsClone === 0) return false;

  const maxUserNamespaces = await probe.readProcInt("/proc/sys/user/max_user_namespaces");
  if (maxUserNamespaces === 0) return false;

  return true;
}

/**
 * 检查当前宿主是否满足 shell sandbox 运行要求。
 */
export async function checkShellSandboxPreflight(): Promise<SandboxPreflightResult> {
  return await checkShellSandboxPreflightWithProbe({
    commandExists,
    readProcInt,
    inspectWindowsMxcSupport: async () => inspect_windows_mxc_support(),
  });
}

/**
 * 使用注入探针检查当前宿主是否满足 shell sandbox 运行要求。
 */
export async function checkShellSandboxPreflightWithProbe(
  probe: ShellSandboxPreflightProbe,
): Promise<SandboxPreflightResult> {
  const platform = process.platform;
  const issues: SandboxPreflightIssue[] = [];

  if (platform === "darwin") {
    if (!(await probe.commandExists("sandbox-exec"))) {
      issues.push({
        code: "missing-command",
        message: "macOS shell sandbox requires sandbox-exec, but it was not found.",
        fixes: [
          "Use a macOS system that includes /usr/bin/sandbox-exec.",
        ],
      });
    }
    return {
      ok: issues.length === 0,
      platform,
      backend: "macos-seatbelt",
      issues,
    };
  }

  if (platform === "linux") {
    if (!(await probe.commandExists("bwrap"))) {
      issues.push({
        code: "missing-command",
        message: "Linux shell sandbox requires bubblewrap (bwrap), but it was not found.",
        fixes: [
          "Debian / Ubuntu: sudo apt install bubblewrap",
          "Fedora: sudo dnf install bubblewrap",
          "Arch: sudo pacman -S bubblewrap",
        ],
      });
    }

    if (!(await isLinuxUserNamespaceEnabled(probe))) {
      issues.push({
        code: "userns-disabled",
        message: "Linux user namespaces are disabled, so bubblewrap cannot create the sandbox.",
        fixes: [
          "Check: cat /proc/sys/kernel/unprivileged_userns_clone",
          "Check: cat /proc/sys/user/max_user_namespaces",
          "Debian / Ubuntu: sudo sysctl kernel.unprivileged_userns_clone=1",
        ],
      });
    }

    return {
      ok: issues.length === 0,
      platform,
      backend: "linux-bubblewrap",
      issues,
    };
  }

  if (platform === "win32") {
    if (!(await probe.commandExists("cmd.exe"))) {
      issues.push({
        code: "missing-command",
        message: "Windows MXC development sandbox requires cmd.exe, but it was not found.",
        fixes: [
          "Restore cmd.exe to the Windows system PATH.",
        ],
      });
    }
    const support = await probe.inspectWindowsMxcSupport().catch((error: unknown) => ({
      supported: false,
      windows_build: null,
      warnings: [],
      reason: error instanceof Error ? error.message : String(error),
    } satisfies WindowsMxcSupport));
    if (!support.supported) {
      const unsupported_version = support.windows_build !== null
        && support.windows_build < 26_100;
      issues.push({
        code: unsupported_version
          ? "unsupported-windows-version"
          : "sandbox-runtime-unavailable",
        message: support.reason || "Microsoft MXC Windows sandbox is unavailable.",
        fixes: unsupported_version
          ? ["Upgrade the host to Windows 11 24H2 build 26100 or newer."]
          : [
              "Reinstall @downcity/shell so the bundled MXC native binaries are present.",
              "Run the MXC platform probe on the target Windows host.",
            ],
      });
    }
    return {
      ok: issues.length === 0,
      platform,
      backend: "windows-mxc-dev",
      issues,
    };
  }

  return {
    ok: false,
    platform,
    issues: [
      {
        code: "unsupported-platform",
        message: `Shell sandbox is not supported on this platform: ${platform}.`,
        fixes: [
          "Use macOS or Linux for local shell execution.",
        ],
      },
    ],
  };
}

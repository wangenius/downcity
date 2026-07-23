/**
 * 跨平台 Shell 命令模型。
 *
 * 关键点（中文）
 * - POSIX Shell 使用 `-lc` / `-c`。
 * - Windows 原生命令统一交给 `cmd.exe /d /s /c`，避免 Node 的隐式 `shell: true`。
 * - 本模块只负责命令解释器语义，不承担 Sandbox 权限控制。
 */

import type { ShellCommandInvocation } from "@/types/ShellCommand.js";

function quote_windows_executable_path(value: string): string {
  if (!/[\s"]/u.test(value)) return value;
  let result = '"';
  let backslashes = 0;
  for (const character of value) {
    if (character === "\\") {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      result += "\\".repeat(backslashes * 2 + 1) + '"';
      backslashes = 0;
      continue;
    }
    result += "\\".repeat(backslashes) + character;
    backslashes = 0;
  }
  return result + "\\".repeat(backslashes * 2) + '"';
}

/**
 * 构造 MXC `CreateProcess` 使用的 `cmd.exe` 完整命令行。
 *
 * 关键点（中文）
 * - MXC 接收单个命令行字符串，不能像 Node `spawn(command, args)` 一样代为序列化参数。
 * - `cmd.exe /s /c` 要求命令正文由一对外层双引号包裹，正文中的双引号必须原样保留。
 * - cmd 不使用反斜杠转义双引号，因此不能套用通用的 Windows argv quoting 算法。
 */
export function build_windows_cmd_command_line(
  shell_path: string,
  cmd: string,
): string {
  return `${quote_windows_executable_path(shell_path)} /d /s /c "${cmd}"`;
}

/** 解析当前平台的默认 Shell 可执行文件。 */
export function resolve_default_shell_path(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform === "win32") {
    return String(env.ComSpec || env.COMSPEC || "cmd.exe").trim() || "cmd.exe";
  }
  const env_shell = String(env.SHELL || "").trim();
  if (env_shell) return env_shell;
  return platform === "darwin" ? "/bin/zsh" : "/bin/sh";
}

/** 构造对应平台的 Shell 进程参数。 */
export function build_shell_command_invocation(params: {
  /** Shell 可执行文件路径。 */
  shell_path: string;
  /** 要解释执行的完整命令文本。 */
  cmd: string;
  /** POSIX 平台是否启用 login shell。Windows 会忽略该选项。 */
  login: boolean;
  /** 目标操作系统平台。 */
  platform?: NodeJS.Platform;
}): ShellCommandInvocation {
  const platform = params.platform || process.platform;
  if (platform === "win32") {
    return {
      command: params.shell_path,
      args: ["/d", "/s", "/c", params.cmd],
    };
  }
  return {
    command: params.shell_path,
    args: [params.login ? "-lc" : "-c", params.cmd],
  };
}

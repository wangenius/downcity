/**
 * Downcity CLI 平台 Sandbox 装配根。
 *
 * 关键点（中文）
 * - 只有 CLI 可根据当前宿主自动选择平台实现。
 * - 动态导入严格收敛在此模块，使非当前系统的 optional package 不会被解析或安装。
 * - Windows 当前选择实验 MXC adapter；未来更换默认实现只需修改本组合根。
 */

import type { ShellSandboxAdapter } from "@downcity/shell";

/** 为当前 CLI 宿主创建唯一的平台 Sandbox Adapter。 */
export async function create_platform_sandbox(): Promise<ShellSandboxAdapter> {
  if (process.platform === "darwin") {
    const { MacOsSeatbeltSandbox } = await import("@downcity/sandbox-macos");
    return new MacOsSeatbeltSandbox();
  }
  if (process.platform === "linux") {
    const { LinuxBubblewrapSandbox } = await import("@downcity/sandbox-linux");
    return new LinuxBubblewrapSandbox();
  }
  if (process.platform === "win32") {
    const { WindowsMxcSandbox } = await import("@downcity/sandbox-windows-mxc");
    return new WindowsMxcSandbox();
  }
  throw new Error(`Downcity shell sandbox does not support platform: ${process.platform}`);
}

/** @file Agent 集成测试按当前宿主加载对应平台 Sandbox Adapter。 */

export async function create_platform_sandbox() {
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
  throw new Error(`Unsupported test platform: ${process.platform}`);
}

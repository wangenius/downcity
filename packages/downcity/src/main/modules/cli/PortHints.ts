/**
 * CLI 端口提示文案。
 *
 * 关键点（中文）
 * - 统一管理用户可见的端口职责说明，避免不同命令里文案漂移。
 * - 这里只输出“用户该怎么理解端口”，不参与任何监听或分配逻辑。
 */

export const DEFAULT_RUNTIME_API_PORT = 5314;
export const DEFAULT_CONSOLE_UI_PORT = 5315;

/**
 * 生成 city runtime 启动提示。
 */
export function buildRuntimePortFacts(): Array<{
  label: string;
  value: string;
}> {
  return [
    {
      label: "Port",
      value: String(DEFAULT_RUNTIME_API_PORT),
    },
    {
      label: "Usage",
      value: "Runtime API / service endpoints (health, service, task, plugin)",
    },
  ];
}

/**
 * 生成 Console 启动提示。
 */
export function buildConsolePortFacts(url: string): Array<{
  label: string;
  value: string;
}> {
  return [
    {
      label: "URL",
      value: url,
    },
    {
      label: "Port",
      value: String(DEFAULT_CONSOLE_UI_PORT),
    },
    {
      label: "Usage",
      value: "Console Web UI / control plane",
    },
  ];
}

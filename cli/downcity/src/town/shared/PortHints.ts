/**
 * CLI 端口提示文案。
 *
 * 关键点（中文）
 * - 统一管理用户可见的端口职责说明，避免不同命令里文案漂移。
 * - 这里只输出“用户该怎么理解端口”，不参与任何监听或分配逻辑。
 */

export const DEFAULT_RUNTIME_API_PORT = 5314;
export const DEFAULT_GATEWAY_UI_PORT = 5315;

/**
 * 生成 town runtime 启动提示。
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
      value: "Runtime API / plugin endpoints (health, plugin runtime, task, extension plugin)",
    },
  ];
}

/**
 * 生成 gateway 启动提示。
 */
export function buildGatewayPortFacts(
  url: string,
  options?: {
    publicUrl?: string | null;
  },
): Array<{
  label: string;
  value: string;
}> {
  return buildGatewayPortFactsWithOptions(url, options);
}

/**
 * 生成 gateway 启动提示。
 */
export function buildGatewayPortFactsWithOptions(
  url: string,
  options?: {
    publicUrl?: string | null;
  },
): Array<{
  label: string;
  value: string;
}> {
  return [
    {
      label: "URL",
      value: url,
    },
    ...(String(options?.publicUrl || "").trim()
      ? [
          {
            label: "Public URL",
            value: String(options?.publicUrl || "").trim(),
          },
        ]
      : []),
    {
      label: "Port",
      value: String(DEFAULT_GATEWAY_UI_PORT),
    },
    {
      label: "Usage",
      value: "Town runtime API",
    },
  ];
}

/**
 * contact 自身 endpoint 解析。
 *
 * 关键点（中文）
 * - endpoint 是 contact 协议内部字段，不暴露成普通用户命令参数。
 * - 优先使用明确配置的公开地址，避免服务器 / 反向代理 / tunnel 场景被误判。
 * - 监听 `0.0.0.0` 时只做本机网卡最佳努力探测，不访问外部网络。
 */

import os from "node:os";

export interface ResolveContactSelfEndpointInput {
  /**
   * 运行时监听 host。
   */
  host?: string;
  /**
   * 运行时监听 port。
   */
  port?: number;
  /**
   * 环境变量读取来源，测试可注入。
   */
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /**
   * 网卡信息读取来源，测试可注入。
   */
  interfaces?: NodeJS.Dict<os.NetworkInterfaceInfo[]>;
}

function normalizeUrl(value: string, fallbackPort: number): string {
  const raw = String(value || "").trim();
  if (!raw) return formatUrl("127.0.0.1", fallbackPort);
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, "");
  return formatUrl(raw, fallbackPort);
}

function formatUrl(host: string, port: number): string {
  const normalizedHost = String(host || "").trim() || "127.0.0.1";
  if (normalizedHost.startsWith("[")) return `http://${normalizedHost}:${String(port)}`;
  if (normalizedHost.includes(":") && !normalizedHost.includes(".")) {
    return `http://[${normalizedHost}]:${String(port)}`;
  }
  return `http://${normalizedHost}:${String(port)}`;
}

function isWildcardHost(host: string): boolean {
  const value = String(host || "").trim().toLowerCase();
  return !value || value === "0.0.0.0" || value === "::";
}

function isLoopbackHost(host: string): boolean {
  const value = String(host || "").trim().toLowerCase();
  return value === "127.0.0.1" || value === "::1" || value === "localhost";
}

function detectLanIpv4FromInterfaces(
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): string | null {
  for (const entries of Object.values(interfaces)) {
    const items = (entries || []) as Array<{
      address?: string;
      family?: string | number;
      internal?: boolean;
    }>;
    for (const rawItem of items) {
      const family =
        typeof rawItem.family === "string"
          ? rawItem.family
          : rawItem.family === 4
            ? "IPv4"
            : "unknown";
      if (family !== "IPv4") continue;
      if (rawItem.internal) continue;
      const address = String(rawItem.address || "").trim();
      if (address) return address;
    }
  }
  return null;
}

/**
 * 解析 contact link code 中写入的自身 endpoint。
 */
export function resolveContactSelfEndpoint(
  input: ResolveContactSelfEndpointInput,
): string {
  const env = input.env || process.env;
  const port = Number(input.port || env.DC_SERVER_PORT || 5314);

  // 关键点（中文）：公开 URL 是最可靠来源，适配域名、反向代理和 tunnel。
  const publicUrl = String(env.DOWNCITY_PUBLIC_URL || "").trim();
  if (publicUrl) return normalizeUrl(publicUrl, port);

  const publicHost = String(env.DOWNCITY_PUBLIC_HOST || "").trim();
  if (publicHost) return formatUrl(publicHost, port);

  const host = String(input.host || env.DC_SERVER_HOST || "127.0.0.1").trim();
  if (!isWildcardHost(host) && !isLoopbackHost(host)) return formatUrl(host, port);

  const lanIp = detectLanIpv4FromInterfaces(input.interfaces);
  if (lanIp) return formatUrl(lanIp, port);

  return formatUrl("127.0.0.1", port);
}

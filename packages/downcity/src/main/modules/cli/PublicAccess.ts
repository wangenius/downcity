/**
 * Console 公网访问提示解析。
 *
 * 关键点（中文）
 * - 优先使用用户显式声明的公网地址，避免 NAT / 反向代理场景误判。
 * - 仅在显式公网模式或 host 本身就是可直连地址时，才生成 Public URL。
 * - 自动探测只做“最佳努力”，不会为了猜公网 IP 访问外部网络。
 */

import os from "node:os";

/**
 * 从网卡列表中提取首个公网 IPv4。
 */
export function detectPublicIpv4FromInterfaces(
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): string | null {
  for (const entries of Object.values(interfaces)) {
    for (const rawItem of (entries || []) as Array<{
      address?: string;
      family?: string | number;
      internal?: boolean;
    }>) {
      const item = rawItem;
      const family =
        typeof item.family === "string"
          ? item.family
          : item.family === 4
            ? "IPv4"
            : "unknown";
      if (family !== "IPv4") continue;
      if (item.internal) continue;
      const address = String(item.address || "").trim();
      if (!address) continue;
      if (isPrivateIpv4(address)) continue;
      return address;
    }
  }

  return null;
}

/**
 * 解析 Console 对外可访问地址。
 */
export function resolveConsolePublicUrl(params: {
  bindHost: string;
  port: number;
  publicMode?: boolean;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  detectedPublicIp?: string | null;
}): string | null {
  const env = params.env || process.env;
  const explicitUrl = String(env.DOWNCITY_PUBLIC_URL || "").trim();
  if (explicitUrl) return normalizeUrl(explicitUrl, params.port);

  const explicitHost = String(env.DOWNCITY_PUBLIC_HOST || "").trim();
  if (explicitHost) return formatUrl(explicitHost, params.port);

  const bindHost = String(params.bindHost || "").trim();
  if (isDirectReachableHost(bindHost)) {
    return formatUrl(bindHost, params.port);
  }

  if (params.publicMode !== true) return null;
  const detectedPublicIp =
    String(params.detectedPublicIp || "").trim() || detectPublicIpv4FromInterfaces();
  if (!detectedPublicIp) return null;

  return formatUrl(detectedPublicIp, params.port);
}

function normalizeUrl(value: string, port: number): string {
  if (/^https?:\/\//i.test(value)) return value;
  return formatUrl(value, port);
}

function formatUrl(host: string, port: number): string {
  const normalizedHost = String(host || "").trim();
  if (!normalizedHost) return `http://127.0.0.1:${String(port)}`;
  if (normalizedHost.startsWith("[")) return `http://${normalizedHost}:${String(port)}`;
  if (normalizedHost.includes(":") && !normalizedHost.includes(".")) {
    return `http://[${normalizedHost}]:${String(port)}`;
  }
  return `http://${normalizedHost}:${String(port)}`;
}

function isDirectReachableHost(host: string): boolean {
  const value = String(host || "").trim().toLowerCase();
  if (!value) return false;
  if (value === "0.0.0.0" || value === "::") return false;
  if (value === "127.0.0.1" || value === "::1" || value === "localhost") return false;
  return true;
}

function isPrivateIpv4(address: string): boolean {
  if (address.startsWith("10.")) return true;
  if (address.startsWith("127.")) return true;
  if (address.startsWith("169.254.")) return true;
  if (address.startsWith("192.168.")) return true;

  const parts = address.split(".").map((item) => Number.parseInt(item, 10));
  if (parts.length !== 4 || parts.some((item) => Number.isNaN(item))) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

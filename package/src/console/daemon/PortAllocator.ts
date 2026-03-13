/**
 * Daemon 端口分配器。
 *
 * 关键点（中文）
 * - 当用户未显式传 `--port` 时，为每个 agent 自动挑选可用端口。
 * - 仅负责“本机可监听性”探测，不做跨进程强一致锁；最终仍以 listen 成功为准。
 */

import net from "node:net";

const DEFAULT_PORT_RANGE_START = 3000;
const DEFAULT_PORT_RANGE_END = 3999;

type AllocatePortParams = {
  start?: number;
  end?: number;
};

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * 探测单个端口是否可监听。
 *
 * 关键点（中文）
 * - 使用 127.0.0.1 探测本机监听能力，避免 0.0.0.0 在某些环境下的地址歧义。
 */
async function canListenPort(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => {
      resolve(false);
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * 在给定范围内分配一个可用端口。
 */
export async function allocateAvailablePort(
  params: AllocatePortParams = {},
): Promise<number> {
  const start = params.start ?? DEFAULT_PORT_RANGE_START;
  const end = params.end ?? DEFAULT_PORT_RANGE_END;
  if (!isValidPort(start) || !isValidPort(end) || start > end) {
    throw new Error(`Invalid port range: ${start}-${end}`);
  }

  for (let port = start; port <= end; port += 1) {
    // 关键点（中文）：逐个探测可用端口，找到即返回，避免强依赖外部状态文件。
    if (await canListenPort(port)) return port;
  }

  throw new Error(`No available port in range ${start}-${end}`);
}


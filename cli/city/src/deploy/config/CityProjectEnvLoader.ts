/**
 * City 项目本地环境变量加载器。
 *
 * 关键点（中文）
 * - `city deploy` 默认读取目标目录下的 `.env`，方便本地显式部署。
 * - `.env` 只用于本机部署参数，例如 Cloudflare account id 和验证 URL。
 * - Provider key、Stripe key 等业务密钥仍应写入 City env 表，而不是写入公开客户端。
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

/**
 * 加载 City 项目目录下的 `.env`。
 */
export function loadCityProjectEnv(project_dir: string): void {
  const env_path = join(project_dir, ".env");
  if (!existsSync(env_path)) return;
  config({ path: env_path, override: false });
}

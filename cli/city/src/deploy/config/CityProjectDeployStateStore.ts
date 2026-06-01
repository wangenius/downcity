/**
 * City 项目部署状态存储。
 *
 * 关键点（中文）
 * - `.city/deploy.json` 保存 CLI 生成的远端资源状态。
 * - `city.json` 只保留开发者手写的项目声明。
 * - 状态文件不保存 API token、provider key 或其他密钥。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  CityProjectDeployState,
  CityProjectDeployStateFile,
} from "../../types/CityProjectConfig.js";

/**
 * 读取 City 项目的部署状态。
 */
export function readCityProjectDeployState(project_dir: string): CityProjectDeployStateFile {
  const state_path = join(project_dir, ".city", "deploy.json");
  if (!existsSync(state_path)) {
    return { state_path, state: {} };
  }

  try {
    const parsed = JSON.parse(readFileSync(state_path, "utf-8")) as CityProjectDeployState;
    return {
      state_path,
      state: normalizeDeployState(parsed),
    };
  } catch {
    return { state_path, state: {} };
  }
}

/**
 * 写入 City 项目的部署状态。
 */
export function writeCityProjectDeployState(
  state_file: CityProjectDeployStateFile,
): void {
  mkdirSync(dirname(state_file.state_path), { recursive: true });
  writeFileSync(
    state_file.state_path,
    `${JSON.stringify(state_file.state, null, 2)}\n`,
  );
}

/**
 * 合并 Cloudflare 部署状态。
 */
export function mergeCloudflareDeployState(
  state_file: CityProjectDeployStateFile,
  cloudflare: NonNullable<CityProjectDeployState["cloudflare"]>,
): CityProjectDeployStateFile {
  return {
    ...state_file,
    state: {
      ...state_file.state,
      cloudflare: {
        ...state_file.state.cloudflare,
        ...cloudflare,
      },
    },
  };
}

/**
 * 规范化状态文件。
 */
function normalizeDeployState(input: CityProjectDeployState): CityProjectDeployState {
  if (!input || typeof input !== "object") return {};
  return {
    cloudflare: input.cloudflare && typeof input.cloudflare === "object"
      ? {
          account_id: typeof input.cloudflare.account_id === "string"
            ? input.cloudflare.account_id
            : undefined,
          database_id: typeof input.cloudflare.database_id === "string"
            ? input.cloudflare.database_id
            : undefined,
          worker_url: typeof input.cloudflare.worker_url === "string"
            ? input.cloudflare.worker_url
            : undefined,
        }
      : undefined,
  };
}

/**
 * City 项目本地部署环境文件。
 *
 * 关键点（中文）
 * - `city deploy` 默认读取目标目录下的 `.env`，方便本地显式部署。
 * - `.env` 只保存 City 项目自身真正需要的部署输入，例如 D1 name。
 * - Provider key、Stripe key 等业务密钥仍应写入 City env 表，而不是写入公开客户端。
 */
import type { FederationProjectDeployEnv, FederationProjectDeployEnvFile } from "../../../federation/types/FederationProjectConfig.js";
/**
 * 加载 City 项目目录下的 `.env`。
 */
export declare function loadFederationProjectEnv(project_dir: string): void;
/**
 * 读取 City 项目的本地部署环境。
 */
export declare function readFederationProjectDeployEnv(project_dir: string): FederationProjectDeployEnvFile;
/**
 * 合并并写入 City 项目的本地部署环境。
 */
export declare function writeFederationProjectDeployEnv(env_file: FederationProjectDeployEnvFile, next_env: Partial<FederationProjectDeployEnv>): FederationProjectDeployEnvFile;
//# sourceMappingURL=FederationProjectEnvLoader.d.ts.map
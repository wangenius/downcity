/**
 * ProjectSetup：runtime 启动前项目结构准备模块。
 *
 * 关键点（中文）
 * - 统一校验初始化必要文件（PROFILE.md / ship.json）。
 * - 统一确保 `.ship/*` 目录结构存在，避免调用方重复拼装目录逻辑。
 */

import fs from "fs-extra";
import path from "node:path";
import {
  getCacheDirPath,
  getLogsDirPath,
  getProfileMdPath,
  getShipConfigDirPath,
  getShipContextRootDirPath,
  getShipDataDirPath,
  getShipDebugDirPath,
  getShipDirPath,
  getShipJsonPath,
  getShipProfileDirPath,
  getShipPublicDirPath,
  getShipTasksDirPath,
} from "@/main/server/env/Paths.js";

/**
 * 校验项目初始化关键文件。
 */
function ensureContextFiles(projectRoot: string): void {
  // Check if initialized（启动入口一次性确认工程根目录与关键文件）
  if (!fs.existsSync(getProfileMdPath(projectRoot))) {
    console.error(
      '❌ Project not initialized. Please run "sma agent create" first',
    );
    process.exit(1);
  }

  if (!fs.existsSync(getShipJsonPath(projectRoot))) {
    console.error(
      '❌ ship.json does not exist. Please run "sma agent create" first',
    );
    process.exit(1);
  }
}

/**
 * 确保 `.ship` 运行目录结构完整。
 */
function ensureShipDirectories(projectRoot: string): void {
  // 关键点（中文）：尽量只在启动时确保目录结构存在，避免在 Agent/Tool 执行过程中反复 ensure。
  fs.ensureDirSync(getShipDirPath(projectRoot));
  fs.ensureDirSync(getShipTasksDirPath(projectRoot));
  fs.ensureDirSync(getLogsDirPath(projectRoot));
  fs.ensureDirSync(getCacheDirPath(projectRoot));
  fs.ensureDirSync(getShipProfileDirPath(projectRoot));
  fs.ensureDirSync(getShipDataDirPath(projectRoot));
  fs.ensureDirSync(getShipContextRootDirPath(projectRoot));
  fs.ensureDirSync(getShipPublicDirPath(projectRoot));
  fs.ensureDirSync(getShipConfigDirPath(projectRoot));
  fs.ensureDirSync(path.join(getShipDirPath(projectRoot), "schema"));
  fs.ensureDirSync(getShipDebugDirPath(projectRoot));
}

/**
 * runtime 启动前准备项目结构。
 */
export function ensureRuntimeProjectReady(projectRoot: string): void {
  ensureContextFiles(projectRoot);
  ensureShipDirectories(projectRoot);
}

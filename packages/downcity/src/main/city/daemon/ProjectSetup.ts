/**
 * ProjectSetup：runtime 启动前项目结构准备模块。
 *
 * 关键点（中文）
 * - 统一校验初始化必要文件（PROFILE.md / downcity.json）。
 * - 统一确保 `.downcity/*` 目录结构存在，避免调用方重复拼装目录逻辑。
 */

import fs from "fs-extra";
import path from "node:path";
import { loadDowncityConfig } from "@/main/city/env/Config.js";
import { ConsoleStore } from "@/shared/utils/store/index.js";
import {
  readProjectExecutionMode,
  readProjectPrimaryModelId,
  readProjectSessionAgentType,
} from "@/main/agent/project/ProjectExecutionBinding.js";
import {
  getCacheDirPath,
  getLogsDirPath,
  getProfileMdPath,
  getDowncityConfigDirPath,
  getDowncityDataDirPath,
  getDowncityDebugDirPath,
  getDowncityDirPath,
  getDowncityJsonPath,
  getDowncityProfileDirPath,
  getDowncityPublicDirPath,
  getDowncitySessionRootDirPath,
  getDowncityTasksDirPath,
} from "@/main/city/env/Paths.js";

/**
 * 校验项目初始化关键文件。
 */
function ensureContextFiles(projectRoot: string): void {
  // Check if initialized（启动入口一次性确认工程根目录与关键文件）
  if (!fs.existsSync(getProfileMdPath(projectRoot))) {
    console.error(
      '❌ Project not initialized. Please run "city agent create" first',
    );
    process.exit(1);
  }

  if (!fs.existsSync(getDowncityJsonPath(projectRoot))) {
    console.error(
      '❌ downcity.json does not exist. Please run "city agent create" first',
    );
    process.exit(1);
  }
}

/**
 * 确保 `.downcity` 运行目录结构完整。
 */
function ensureShipDirectories(projectRoot: string): void {
  // 关键点（中文）：尽量只在启动时确保目录结构存在，避免在 Agent/Tool 执行过程中反复 ensure。
  fs.ensureDirSync(getDowncityDirPath(projectRoot));
  fs.ensureDirSync(getDowncityTasksDirPath(projectRoot));
  fs.ensureDirSync(getLogsDirPath(projectRoot));
  fs.ensureDirSync(getCacheDirPath(projectRoot));
  fs.ensureDirSync(getDowncityProfileDirPath(projectRoot));
  fs.ensureDirSync(getDowncityDataDirPath(projectRoot));
  fs.ensureDirSync(getDowncitySessionRootDirPath(projectRoot));
  fs.ensureDirSync(getDowncityPublicDirPath(projectRoot));
  fs.ensureDirSync(getDowncityConfigDirPath(projectRoot));
  fs.ensureDirSync(path.join(getDowncityDirPath(projectRoot), "schema"));
  fs.ensureDirSync(getDowncityDebugDirPath(projectRoot));
}

/**
 * runtime 启动前准备项目结构。
 */
export function ensureRuntimeProjectReady(projectRoot: string): void {
  ensureContextFiles(projectRoot);
  ensureShipDirectories(projectRoot);
}

/**
 * 校验项目执行绑定是否可用于启动。
 *
 * 关键点（中文）
 * - `downcity.json.execution` 必须存在且合法。
 * - 若走模型模式，则 `execution.modelId` 必须在 console 模型池中可解析。
 * - 若模型被 pause，也要在启动前直接拒绝，避免进程拉起后秒退。
 */
export function ensureRuntimeExecutionBindingReady(projectRoot: string): void {
  let primaryModelId = "";
  let sessionAgentType = "";
  let executionMode = "";
  try {
    const config = loadDowncityConfig(projectRoot);
    executionMode = String(readProjectExecutionMode(config) || "").trim();
    primaryModelId = readProjectPrimaryModelId(config);
    sessionAgentType = String(readProjectSessionAgentType(config) || "").trim();
  } catch (error) {
    console.error("❌ Invalid downcity.json execution binding");
    console.error(`   project: ${projectRoot}`);
    console.error(`   error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (sessionAgentType) {
    return;
  }

  if (!executionMode || !primaryModelId) {
    console.error("❌ Invalid downcity.json execution binding");
    console.error(`   project: ${projectRoot}`);
    console.error('   error: "execution" must be either model or acp');
    process.exit(1);
  }

  const store = new ConsoleStore();
  try {
    const model = store.getModel(primaryModelId);
    if (!model) {
      console.error("❌ Model not found in console model pool");
      console.error(`   project: ${projectRoot}`);
      console.error(`   execution.modelId: ${primaryModelId}`);
      console.error("   fix: run `city model create` or `city model list`");
      process.exit(1);
    }
    if (model.isPaused === true) {
      console.error("❌ Model is paused");
      console.error(`   project: ${projectRoot}`);
      console.error(`   execution.modelId: ${primaryModelId}`);
      console.error(`   fix: run \`city model pause ${primaryModelId} --enabled false\``);
      process.exit(1);
    }
  } finally {
    store.close();
  }
}

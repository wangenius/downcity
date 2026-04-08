/**
 * LMP（Local Model Provider）Plugin 类型定义。
 *
 * 关键点（中文）
 * - 本地模型资产、下载配置、`llama-server` 生命周期参数统一收敛到 `plugins.lmp`。
 * - `execution.type = "local"` 只表达“走本地执行器”，不再承载模型路径等细节。
 * - 当前阶段 LMP 只实现 `llama.cpp` 链路，但类型命名保持 provider 视角，便于后续扩展。
 */

import type { JsonValue } from "@/shared/types/Json.js";

/**
 * LMP plugin 项目级配置。
 */
export interface LmpPluginConfig {
  /**
   * 兼容统一结构化配置约束的索引签名。
   */
  [key: string]: JsonValue | undefined;

  /**
   * 当前激活的本地 provider。
   *
   * 说明（中文）
   * - 现阶段固定支持 `llama`。
   */
  provider?: "llama";

  /**
   * 当前激活的本地模型文件名或绝对路径。
   *
   * 说明（中文）
   * - 只写文件名时，会基于 `modelsDir` 解析。
   * - 允许直接写绝对路径，便于使用外部模型目录。
   */
  model?: string;

  /**
   * 本地模型根目录。
   *
   * 说明（中文）
   * - 默认 `~/.models`。
   * - 仅当 `model` 不是绝对路径时参与拼接。
   */
  modelsDir?: string;

  /**
   * `llama-server` 可执行命令。
   *
   * 说明（中文）
   * - 默认 `llama-server`。
   * - 可用于适配自定义安装路径或 wrapper。
   */
  command?: string;

  /**
   * 传给 `llama-server` 的额外参数。
   */
  args?: string[];

  /**
   * 本地服务监听 host。
   */
  host?: string;

  /**
   * 本地服务监听端口。
   *
   * 说明（中文）
   * - 为空时运行时自动分配。
   */
  port?: number;

  /**
   * llama.cpp 上下文窗口大小。
   */
  contextSize?: number;

  /**
   * GPU offload 层数。
   */
  gpuLayers?: number;

  /**
   * 是否允许运行时自动拉起 `llama-server`。
   *
   * 说明（中文）
   * - 默认 `true`。
   * - 设为 `false` 时，本地执行器只会复用显式指定端口上的现有服务。
   */
  autoStart?: boolean;

  /**
   * 已发现或已下载的本地模型文件列表。
   *
   * 说明（中文）
   * - 仅作为状态快照与 UI 展示使用。
   * - 真实可用性仍以文件系统扫描结果为准。
   */
  installedModels?: string[];
}

/**
 * LMP plugin 安装输入。
 */
export interface LmpInstallInput {
  /**
   * 兼容统一结构化配置约束的索引签名。
   */
  [key: string]: JsonValue | undefined;

  /**
   * Hugging Face 仓库 ID。
   *
   * 说明（中文）
   * - 例如 `unsloth/gemma-4-E4B-it-GGUF`。
   */
  repoId?: string;

  /**
   * 需要下载的单个文件名。
   *
   * 说明（中文）
   * - 当前安装入口优先面向单文件 GGUF 下载。
   */
  filename?: string;

  /**
   * 安装完成后激活的模型文件名或绝对路径。
   */
  activeModel?: string;

  /**
   * 模型目录（可选）。
   */
  modelsDir?: string;

  /**
   * 是否跳过下载，只写入当前配置。
   */
  skipDownload?: boolean;

  /**
   * Hugging Face token（可选）。
   */
  hfToken?: string;
}

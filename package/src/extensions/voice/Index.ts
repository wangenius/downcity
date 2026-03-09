/**
 * Voice extension。
 *
 * 关键点（中文）
 * - 统一管理本地语音识别模型：选择、安装、启停、激活模型。
 * - 通过 `extensions.voice` 落盘配置，作为 chat 渠道接入 STT 的单一事实源。
 */

import type { Command } from "commander";
import prompts from "prompts";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { Extension } from "@/main/extension/ExtensionManager.js";
import type {
  VoiceModelId,
  VoiceExtensionConfig,
  VoiceTranscribeConfig,
} from "@/main/types/Voice.js";
import {
  VOICE_MODEL_CATALOG,
  getVoiceModelCatalogItem,
  resolveVoiceModelId,
} from "./runtime/Catalog.js";
import {
  dedupeVoiceModelIds,
  ensureVoiceExtensionConfig,
  persistShipConfig,
  resolveVoiceModelsRootDir,
  toPortableRelativePath,
} from "./runtime/ConfigStore.js";
import {
  detectLocalVoiceModelInstallState,
  installVoiceModelFromHuggingFace,
  type VoiceModelInstallProgressEvent,
} from "./runtime/Installer.js";
import {
  installVoiceTranscribeDependencies,
  resolveVoiceRunnersByModels,
  resolveVoiceStrategyByModel,
  type VoiceDependencyInstallResult,
} from "./runtime/DependencyInstaller.js";
import { transcribeVoiceAudio } from "./runtime/Transcriber.js";

/**
 * `voice on` 命令 payload。
 */
type VoiceOnPayload = {
  /**
   * 需要启用/安装的模型列表。
   */
  modelIds: VoiceModelId[];
  /**
   * 是否执行下载安装。
   */
  install: boolean;
  /**
   * 是否强制覆盖已存在文件。
   */
  force: boolean;
  /**
   * 模型根目录（可选，默认 `~/.ship/models/voice`）。
   */
  modelsDir?: string;
  /**
   * 指定激活模型（可选，默认取首个 modelIds）。
   */
  activeModel?: VoiceModelId;
  /**
   * HuggingFace token（可选，私有/Gated 模型场景使用）。
   */
  hfToken?: string;
};

/**
 * `voice install` 命令 payload。
 */
type VoiceInstallPayload = {
  /**
   * 需要安装的模型列表。
   */
  modelIds: VoiceModelId[];
  /**
   * 是否强制覆盖已存在文件。
   */
  force: boolean;
  /**
   * 模型根目录（可选，默认 `~/.ship/models/voice`）。
   */
  modelsDir?: string;
  /**
   * HuggingFace token（可选）。
   */
  hfToken?: string;
};

/**
 * `voice init` 命令 payload。
 */
type VoiceInitPayload = {
  /**
   * 需要初始化的模型列表。
   */
  modelIds: VoiceModelId[];
  /**
   * 是否执行模型下载。
   */
  installModel: boolean;
  /**
   * 是否安装 Python 转写依赖。
   */
  installDeps: boolean;
  /**
   * 是否强制覆盖已存在模型文件。
   */
  force: boolean;
  /**
   * 模型根目录（可选，默认 `~/.ship/models/voice`）。
   */
  modelsDir?: string;
  /**
   * 指定激活模型（默认取首个 modelIds）。
   */
  activeModel: VoiceModelId;
  /**
   * HuggingFace token（可选）。
   */
  hfToken?: string;
  /**
   * Python 可执行文件（默认 `python3`）。
   */
  pythonBin?: string;
  /**
   * 是否使用 pip `-U` 安装依赖。
   */
  pipUpgrade: boolean;
  /**
   * pip 安装超时（毫秒，可选）。
   */
  pipTimeoutMs?: number;
  /**
   * 虚拟环境目录（可选）。
   */
  venvDir?: string;
};

/**
 * `voice use` 命令 payload。
 */
type VoiceUsePayload = {
  /**
   * 需要设为 active 的模型 ID。
   */
  modelId: VoiceModelId;
};

/**
 * `voice transcribe` 命令 payload。
 */
type VoiceTranscribePayload = {
  /**
   * 待转写音频路径（相对项目根目录或绝对路径）。
   */
  audioPath: string;
  /**
   * 语言提示（可选）。
   */
  language?: string;
};

function getStringOpt(opts: Record<string, JsonValue>, key: string): string | undefined {
  const value = opts[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function getBooleanOpt(
  opts: Record<string, JsonValue>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = opts[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  }
  return defaultValue;
}

function getNumberOpt(
  opts: Record<string, JsonValue>,
  key: string,
): number | undefined {
  const value = opts[key];
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Number.isNaN(value)) return undefined;
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return undefined;
    const parsed = Number.parseInt(text, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      throw new Error(`Invalid numeric option "${key}": ${value}`);
    }
    return parsed;
  }
  return undefined;
}

function parseVoiceModelIdOrThrow(input: string): VoiceModelId {
  const modelId = resolveVoiceModelId(input);
  if (!modelId) {
    const supported = VOICE_MODEL_CATALOG.map((item) => item.id).join(", ");
    throw new Error(`Unsupported voice model: ${input}. Supported: ${supported}`);
  }
  return modelId;
}

function parseVoiceModelArgs(args: string[]): VoiceModelId[] {
  const parsed: VoiceModelId[] = [];
  for (const arg of args) {
    const text = String(arg || "").trim();
    if (!text) continue;
    parsed.push(parseVoiceModelIdOrThrow(text));
  }
  return dedupeVoiceModelIds(parsed);
}

async function selectVoiceModelsInteractively(params: {
  message: string;
  /**
   * 默认勾选模型（可选）。
   *
   * 说明（中文）
   * - 传空数组表示不预选任何模型，强制用户显式选择。
   */
  defaultSelectedModelIds?: VoiceModelId[];
}): Promise<VoiceModelId[]> {
  const defaultSelectedSet = new Set<VoiceModelId>(
    Array.isArray(params.defaultSelectedModelIds)
      ? params.defaultSelectedModelIds
      : ["SenseVoiceSmall"],
  );
  const answer = await prompts({
    type: "multiselect",
    name: "selectedModels",
    message: params.message,
    hint: "- Space 选择 · Enter 确认",
    instructions: false,
    min: 1,
    choices: VOICE_MODEL_CATALOG.map((item) => ({
      title: `${item.label}  (${item.description})`,
      value: item.id,
      selected: defaultSelectedSet.has(item.id),
    })),
  });
  const selected = Array.isArray(answer.selectedModels)
    ? (answer.selectedModels as VoiceModelId[])
    : [];
  if (selected.length === 0) {
    throw new Error("No voice model selected");
  }
  return dedupeVoiceModelIds(selected);
}

/**
 * 判断当前进程是否可进行交互式提问。
 */
function canPromptInteractively(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/**
 * 在多模型场景下交互选择 active model。
 */
async function selectActiveVoiceModelInteractively(params: {
  modelIds: VoiceModelId[];
  message: string;
}): Promise<VoiceModelId> {
  const modelIds = dedupeVoiceModelIds(params.modelIds);
  if (modelIds.length === 1) return modelIds[0];
  const answer = await prompts({
    type: "select",
    name: "activeModel",
    message: params.message,
    choices: modelIds.map((modelId) => {
      const catalogItem = getVoiceModelCatalogItem(modelId);
      const label = catalogItem ? catalogItem.label : modelId;
      return {
        title: `${label} (${modelId})`,
        value: modelId,
      };
    }),
    initial: 0,
  });
  const activeModel = resolveVoiceModelId(String(answer.activeModel || ""));
  if (!activeModel || !modelIds.includes(activeModel)) {
    throw new Error("No active voice model selected");
  }
  return activeModel;
}

function readInstalledModelIds(raw: unknown): VoiceModelId[] {
  if (!Array.isArray(raw)) return [];
  const parsed: VoiceModelId[] = [];
  for (const item of raw) {
    const modelId = resolveVoiceModelId(String(item || ""));
    if (!modelId) continue;
    parsed.push(modelId);
  }
  return dedupeVoiceModelIds(parsed);
}

function toVoiceTranscribeJson(
  value: VoiceTranscribeConfig | null | undefined,
): JsonObject | null {
  if (!value) return null;
  const out: JsonObject = {};
  if (typeof value.strategy === "string") out.strategy = value.strategy;
  if (typeof value.command === "string") out.command = value.command;
  if (typeof value.timeoutMs === "number") out.timeoutMs = value.timeoutMs;
  if (typeof value.pythonBin === "string") out.pythonBin = value.pythonBin;
  if (typeof value.language === "string") out.language = value.language;
  return out;
}

function toVoiceConfigJson(
  value: VoiceExtensionConfig | null | undefined,
): Record<string, JsonValue> | null {
  if (!value) return null;
  const out: Record<string, JsonValue> = {};
  if (typeof value.enabled === "boolean") out.enabled = value.enabled;
  if (typeof value.provider === "string") out.provider = value.provider;
  if (typeof value.activeModel === "string") out.activeModel = value.activeModel;
  if (typeof value.modelsDir === "string") out.modelsDir = value.modelsDir;
  if (Array.isArray(value.installedModels)) {
    out.installedModels = value.installedModels.map((item) => String(item));
  }
  const transcribe = toVoiceTranscribeJson(value.transcribe);
  if (transcribe) out.transcribe = transcribe;
  return out;
}

function toVoiceCatalogJson(): Array<Record<string, JsonValue>> {
  return VOICE_MODEL_CATALOG.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    huggingfaceRepo: item.huggingfaceRepo,
    revision: item.revision,
  }));
}

function toInstallProgressJson(
  event: VoiceModelInstallProgressEvent,
): Record<string, JsonValue> {
  return {
    stage: event.stage,
    ...(typeof event.filePath === "string" ? { filePath: event.filePath } : {}),
    ...(typeof event.index === "number" ? { index: event.index } : {}),
    ...(typeof event.totalFiles === "number"
      ? { totalFiles: event.totalFiles }
      : {}),
  };
}

function toDependencyInstallJson(
  value: VoiceDependencyInstallResult,
): Record<string, JsonValue> {
  return {
    pythonBin: value.pythonBin,
    runners: value.runners,
    usedVirtualEnv: value.usedVirtualEnv,
    ...(typeof value.venvDir === "string" ? { venvDir: value.venvDir } : {}),
    ...(typeof value.basePythonBin === "string"
      ? { basePythonBin: value.basePythonBin }
      : {}),
    items: value.items.map((item) => ({
      runner: item.runner,
      pythonBin: item.pythonBin,
      args: item.args,
      packages: item.packages,
      command: item.command,
      elapsedMs: item.elapsedMs,
      ...(item.skipped === true ? { skipped: true } : {}),
      ...(typeof item.skipReason === "string" ? { skipReason: item.skipReason } : {}),
      ...(typeof item.stdoutTail === "string" ? { stdoutTail: item.stdoutTail } : {}),
      ...(typeof item.stderrTail === "string" ? { stderrTail: item.stderrTail } : {}),
    })),
  };
}

async function installVoiceModelsWithSkip(params: {
  modelIds: VoiceModelId[];
  modelsRootDir: string;
  force: boolean;
  hfToken?: string;
  logger: {
    info(message: string, payload?: Record<string, JsonValue>): void;
  };
}): Promise<Array<Record<string, JsonValue>>> {
  const installResults: Array<Record<string, JsonValue>> = [];
  for (const modelId of params.modelIds) {
    const model = getVoiceModelCatalogItem(modelId);
    if (!model) {
      throw new Error(`Voice model catalog entry not found: ${modelId}`);
    }

    const localState = await detectLocalVoiceModelInstallState({
      modelId,
      modelsRootDir: params.modelsRootDir,
    });
    if (!params.force && localState.installed) {
      params.logger.info("Voice model already exists, skip install", {
        modelId,
        modelDir: localState.modelDir,
        skipSource: localState.source || "unknown",
      });
      installResults.push({
        modelId,
        modelDir: localState.modelDir,
        repoId: model.huggingfaceRepo,
        revision: model.revision,
        downloadedFiles: 0,
        skippedFiles: 0,
        downloadedFilePaths: [],
        skippedFilePaths: [],
        skipped: true,
        skipSource: localState.source || "unknown",
        progressEvents: [toInstallProgressJson({ stage: "skip" })],
      });
      continue;
    }

    const progressEvents: Array<Record<string, JsonValue>> = [];
    const installed = await installVoiceModelFromHuggingFace({
      model,
      modelsRootDir: params.modelsRootDir,
      force: params.force,
      hfToken: params.hfToken,
      onProgress: (event) => {
        progressEvents.push(toInstallProgressJson(event));
      },
    });
    installResults.push({
      modelId,
      modelDir: installed.modelDir,
      repoId: installed.repoId,
      revision: installed.revision,
      downloadedFiles: installed.downloadedFiles,
      skippedFiles: installed.skippedFiles,
      downloadedFilePaths: installed.downloadedFilePaths,
      skippedFilePaths: installed.skippedFilePaths,
      progressEvents,
    });
  }
  return installResults;
}

export const voiceExtension: Extension = {
  name: "voice",
  actions: {
    models: {
      command: {
        description: "列出内置语音模型目录",
        mapInput() {
          return {};
        },
      },
      api: {
        method: "GET",
      },
      execute() {
        return {
          success: true,
          data: {
            models: toVoiceCatalogJson(),
          },
        };
      },
    },
    status: {
      command: {
        description: "查看 voice extension 当前配置",
        mapInput() {
          return {};
        },
      },
      api: {
        method: "GET",
      },
      execute(params) {
        return {
          success: true,
          data: {
            voice: toVoiceConfigJson(params.context.config.extensions?.voice || null),
          },
        };
      },
    },
    on: {
      command: {
        description: "启用 voice extension，并可交互选择模型安装",
        configure(command: Command) {
          command
            .argument("[models...]")
            .option("--models-dir <path>", "模型目录（默认 ~/.ship/models/voice）")
            .option("--active-model <modelId>", "激活模型 ID（必须在所选模型中）")
            .option("--no-install", "仅写入配置，不执行下载")
            .option("--force", "强制覆盖并重下已存在模型文件")
            .option("--hf-token <token>", "HuggingFace token（私有/Gated 模型场景）");
        },
        async mapInput({ args, opts }): Promise<VoiceOnPayload> {
          const fromArgs = parseVoiceModelArgs(args);
          const modelIds =
            fromArgs.length > 0
              ? fromArgs
              : await selectVoiceModelsInteractively({
                  message: "请选择要启用/安装的语音识别模型（可多选）",
                });
          const activeModel = getStringOpt(opts, "activeModel")
            ? parseVoiceModelIdOrThrow(String(getStringOpt(opts, "activeModel")))
            : modelIds[0];
          if (!modelIds.includes(activeModel)) {
            throw new Error(
              `active-model "${activeModel}" is not in selected models: ${modelIds.join(", ")}`,
            );
          }
          return {
            modelIds,
            install: getBooleanOpt(opts, "install", true),
            force: getBooleanOpt(opts, "force", false),
            modelsDir: getStringOpt(opts, "modelsDir"),
            activeModel,
            hfToken: getStringOpt(opts, "hfToken"),
          };
        },
      },
      async execute(params) {
        const payload = params.payload as VoiceOnPayload;
        const modelsRootDir = resolveVoiceModelsRootDir({
          projectRoot: params.context.rootPath,
          modelsDir: payload.modelsDir,
        });
        const installResults = payload.install
          ? await installVoiceModelsWithSkip({
              modelIds: payload.modelIds,
              modelsRootDir,
              force: payload.force,
              hfToken: payload.hfToken,
              logger: params.context.logger,
            })
          : [];

        const voiceConfig = ensureVoiceExtensionConfig(params.context.config);
        const existingInstalled = readInstalledModelIds(voiceConfig.installedModels);
        voiceConfig.enabled = true;
        voiceConfig.provider = "local";
        voiceConfig.activeModel = payload.activeModel;
        voiceConfig.modelsDir = toPortableRelativePath(
          params.context.rootPath,
          modelsRootDir,
        );
        voiceConfig.installedModels = dedupeVoiceModelIds([
          ...existingInstalled,
          ...payload.modelIds,
        ]);
        const shipJsonPath = await persistShipConfig({
          projectRoot: params.context.rootPath,
          config: params.context.config,
        });
        params.context.logger.info("Voice extension enabled", {
          activeModel: voiceConfig.activeModel,
          modelsDir: voiceConfig.modelsDir,
          install: payload.install,
        });
        return {
          success: true,
          data: {
            shipJsonPath,
            voice: toVoiceConfigJson(voiceConfig),
            install: payload.install,
            installResults,
          },
        };
      },
    },
    init: {
      command: {
        description: "从零初始化 voice（启用 + 安装模型 + 自动安装转写依赖）",
        configure(command: Command) {
          command
            .argument("[models...]")
            .option("--models-dir <path>", "模型目录（默认 ~/.ship/models/voice）")
            .option("--active-model <modelId>", "激活模型 ID（必须在所选模型中）")
            .option("--no-install-model", "跳过模型下载，仅写入配置")
            .option("--no-install-deps", "跳过 Python 转写依赖安装")
            .option("--python <bin>", "Python 可执行文件（默认 python3）")
            .option(
              "--venv-dir <path>",
              "PEP 668 回退虚拟环境目录（默认 ~/.ship/venvs/voice）",
            )
            .option("--no-pip-upgrade", "安装依赖时不带 pip -U")
            .option("--pip-timeout-ms <ms>", "pip 安装超时毫秒（默认 300000）")
            .option("--force", "强制覆盖并重下已存在模型文件")
            .option("--hf-token <token>", "HuggingFace token（私有/Gated 模型场景）");
        },
        async mapInput({ args, opts }): Promise<VoiceInitPayload> {
          const fromArgs = parseVoiceModelArgs(args);
          let modelIds: VoiceModelId[] = [];
          if (fromArgs.length > 0) {
            modelIds = fromArgs;
          } else {
            if (!canPromptInteractively()) {
              throw new Error(
                'No voice models provided in non-interactive mode. Pass models explicitly, for example: "sma voice init SenseVoiceSmall".',
              );
            }
            modelIds = await selectVoiceModelsInteractively({
              message: "请选择要初始化的语音识别模型（可多选）",
              defaultSelectedModelIds: [],
            });
          }
          const activeModelOpt = getStringOpt(opts, "activeModel");
          const activeModel = activeModelOpt
            ? parseVoiceModelIdOrThrow(String(activeModelOpt))
            : fromArgs.length > 0
              ? modelIds[0]
              : await selectActiveVoiceModelInteractively({
                  modelIds,
                  message: "请选择默认激活模型（active model）",
                });
          if (!modelIds.includes(activeModel)) {
            throw new Error(
              `active-model "${activeModel}" is not in selected models: ${modelIds.join(", ")}`,
            );
          }

          return {
            modelIds,
            installModel: getBooleanOpt(opts, "installModel", true),
            installDeps: getBooleanOpt(opts, "installDeps", true),
            force: getBooleanOpt(opts, "force", false),
            modelsDir: getStringOpt(opts, "modelsDir"),
            activeModel,
            hfToken: getStringOpt(opts, "hfToken"),
            pythonBin: getStringOpt(opts, "python"),
            pipUpgrade: getBooleanOpt(opts, "pipUpgrade", true),
            pipTimeoutMs: getNumberOpt(opts, "pipTimeoutMs"),
            venvDir: getStringOpt(opts, "venvDir"),
          };
        },
      },
      async execute(params) {
        const payload = params.payload as VoiceInitPayload;
        const modelsRootDir = resolveVoiceModelsRootDir({
          projectRoot: params.context.rootPath,
          modelsDir: payload.modelsDir,
        });

        const installResults = payload.installModel
          ? await installVoiceModelsWithSkip({
              modelIds: payload.modelIds,
              modelsRootDir,
              force: payload.force,
              hfToken: payload.hfToken,
              logger: params.context.logger,
            })
          : [];

        const voiceConfig = ensureVoiceExtensionConfig(params.context.config);
        const existingInstalled = readInstalledModelIds(voiceConfig.installedModels);
        const localInstalledFromDisk: VoiceModelId[] = [];
        for (const modelId of payload.modelIds) {
          const localState = await detectLocalVoiceModelInstallState({
            modelId,
            modelsRootDir,
          });
          if (localState.installed) {
            localInstalledFromDisk.push(modelId);
          }
        }
        const installedSet = new Set<VoiceModelId>([
          ...existingInstalled,
          ...localInstalledFromDisk,
        ]);
        if (
          !payload.installModel &&
          !installedSet.has(payload.activeModel)
        ) {
          throw new Error(
            `active-model "${payload.activeModel}" is not installed. Remove --no-install-model or run "sma voice install ${payload.activeModel}" first.`,
          );
        }
        const installedFromInit = payload.installModel
          ? payload.modelIds
          : localInstalledFromDisk;
        voiceConfig.enabled = true;
        voiceConfig.provider = "local";
        voiceConfig.activeModel = payload.activeModel;
        voiceConfig.modelsDir = toPortableRelativePath(
          params.context.rootPath,
          modelsRootDir,
        );
        voiceConfig.installedModels = dedupeVoiceModelIds([
          ...existingInstalled,
          ...installedFromInit,
        ]);
        let dependencyInstall: Record<string, JsonValue> | undefined;
        if (payload.installDeps) {
          const runners = resolveVoiceRunnersByModels(payload.modelIds);
          const installedDeps = await installVoiceTranscribeDependencies({
            pythonBin: payload.pythonBin,
            runners,
            upgrade: payload.pipUpgrade,
            timeoutMs: payload.pipTimeoutMs,
            venvDir: payload.venvDir,
          });
          for (const item of installedDeps.items) {
            if (item.skipped !== true) continue;
            params.context.logger.info("Voice transcribe dependencies already exist, skip install", {
              runner: item.runner,
              pythonBin: item.pythonBin,
              packages: item.packages,
              reason: item.skipReason || "already-installed",
            });
          }
          dependencyInstall = toDependencyInstallJson(installedDeps);
          voiceConfig.transcribe = {
            ...(voiceConfig.transcribe || {}),
            pythonBin: installedDeps.pythonBin,
          };
        }
        voiceConfig.transcribe = {
          ...(voiceConfig.transcribe || {}),
          strategy: resolveVoiceStrategyByModel(payload.activeModel),
        };

        const shipJsonPath = await persistShipConfig({
          projectRoot: params.context.rootPath,
          config: params.context.config,
        });
        params.context.logger.info("Voice extension initialized", {
          activeModel: voiceConfig.activeModel,
          modelsDir: voiceConfig.modelsDir,
          installModel: payload.installModel,
          installDeps: payload.installDeps,
        });

        return {
          success: true,
          data: {
            shipJsonPath,
            voice: toVoiceConfigJson(voiceConfig),
            installModel: payload.installModel,
            installDeps: payload.installDeps,
            installResults,
            ...(dependencyInstall ? { dependencyInstall } : {}),
          },
        };
      },
    },
    off: {
      command: {
        description: "关闭 voice extension（保留已安装模型记录）",
        mapInput() {
          return {};
        },
      },
      async execute(params) {
        const voiceConfig = ensureVoiceExtensionConfig(params.context.config);
        const previousEnabled = voiceConfig.enabled === true;
        voiceConfig.enabled = false;
        const shipJsonPath = await persistShipConfig({
          projectRoot: params.context.rootPath,
          config: params.context.config,
        });
        params.context.logger.info("Voice extension disabled");
        return {
          success: true,
          data: {
            shipJsonPath,
            previousEnabled,
            voice: toVoiceConfigJson(voiceConfig),
          },
        };
      },
    },
    install: {
      command: {
        description: "安装 voice 模型（不改变 enabled 状态）",
        configure(command: Command) {
          command
            .argument("[models...]")
            .option("--models-dir <path>", "模型目录（默认 ~/.ship/models/voice）")
            .option("--force", "强制覆盖并重下已存在模型文件")
            .option("--hf-token <token>", "HuggingFace token（私有/Gated 模型场景）");
        },
        async mapInput({ args, opts }): Promise<VoiceInstallPayload> {
          const fromArgs = parseVoiceModelArgs(args);
          const modelIds =
            fromArgs.length > 0
              ? fromArgs
              : await selectVoiceModelsInteractively({
                  message: "请选择要安装的语音识别模型（可多选）",
                });
          return {
            modelIds,
            force: getBooleanOpt(opts, "force", false),
            modelsDir: getStringOpt(opts, "modelsDir"),
            hfToken: getStringOpt(opts, "hfToken"),
          };
        },
      },
      async execute(params) {
        const payload = params.payload as VoiceInstallPayload;
        const modelsRootDir = resolveVoiceModelsRootDir({
          projectRoot: params.context.rootPath,
          modelsDir: payload.modelsDir,
        });
        const installResults = await installVoiceModelsWithSkip({
          modelIds: payload.modelIds,
          modelsRootDir,
          force: payload.force,
          hfToken: payload.hfToken,
          logger: params.context.logger,
        });

        const voiceConfig = ensureVoiceExtensionConfig(params.context.config);
        const existingInstalled = readInstalledModelIds(voiceConfig.installedModels);
        voiceConfig.provider = "local";
        voiceConfig.modelsDir = toPortableRelativePath(
          params.context.rootPath,
          modelsRootDir,
        );
        voiceConfig.installedModels = dedupeVoiceModelIds([
          ...existingInstalled,
          ...payload.modelIds,
        ]);
        if (!voiceConfig.activeModel && payload.modelIds.length > 0) {
          voiceConfig.activeModel = payload.modelIds[0];
        }
        const shipJsonPath = await persistShipConfig({
          projectRoot: params.context.rootPath,
          config: params.context.config,
        });
        params.context.logger.info("Voice model install completed", {
          models: payload.modelIds,
          modelsDir: voiceConfig.modelsDir,
        });
        return {
          success: true,
          data: {
            shipJsonPath,
            voice: toVoiceConfigJson(voiceConfig),
            installResults,
          },
        };
      },
    },
    use: {
      command: {
        description: "切换 voice active 模型",
        configure(command: Command) {
          command.argument("<modelId>");
        },
        mapInput({ args }): VoiceUsePayload {
          const modelId = parseVoiceModelIdOrThrow(String(args[0] || ""));
          return { modelId };
        },
      },
      async execute(params) {
        const payload = params.payload as VoiceUsePayload;
        const voiceConfig = ensureVoiceExtensionConfig(params.context.config);
        const installed = readInstalledModelIds(voiceConfig.installedModels);
        if (!installed.includes(payload.modelId)) {
          return {
            success: false,
            error: `Model "${payload.modelId}" is not installed. Run "sma voice install ${payload.modelId}" first.`,
          };
        }
        voiceConfig.provider = "local";
        voiceConfig.activeModel = payload.modelId;
        const shipJsonPath = await persistShipConfig({
          projectRoot: params.context.rootPath,
          config: params.context.config,
        });
        params.context.logger.info("Voice active model switched", {
          activeModel: payload.modelId,
        });
        return {
          success: true,
          data: {
            shipJsonPath,
            voice: toVoiceConfigJson(voiceConfig),
          },
        };
      },
    },
    transcribe: {
      command: {
        description: "转写本地音频文件（用于联调）",
        configure(command: Command) {
          command
            .argument("<audioPath>")
            .option("--language <code>", "语言提示（可选，例如 zh / en）");
        },
        mapInput({ args, opts }): VoiceTranscribePayload {
          const audioPath = String(args[0] || "").trim();
          if (!audioPath) {
            throw new Error("audioPath is required");
          }
          return {
            audioPath,
            language: getStringOpt(opts, "language"),
          };
        },
      },
      api: {
        method: "POST",
      },
      async execute(params) {
        const payload = params.payload as VoiceTranscribePayload;
        const result = await transcribeVoiceAudio({
          runtime: params.context,
          audioPath: payload.audioPath,
          language: payload.language,
        });
        return {
          success: true,
          data: {
            text: result.text,
            modelId: result.modelId,
            provider: result.provider,
            elapsedMs: result.elapsedMs,
            runner: result.runner,
            audioPath: result.audioPath,
          },
        };
      },
    },
  },
};

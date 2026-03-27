/**
 * Voice 转写 Asset。
 *
 * 关键点（中文）
 * - 这是 voice 插件的底层 Asset 封装层。
 * - Plugin 只依赖 `voice.transcriber` 这个 Asset 名称，不直接理解模型与依赖安装细节。
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { Asset, AssetRuntimeLike } from "@/types/Asset.js";
import type { JsonObject } from "@/types/Json.js";
import type {
  VoiceTranscriberAssetConfig,
  VoiceTranscriberAssetInstallInput,
  VoiceTranscriberHandle,
} from "@/types/VoicePlugin.js";
import { transcribeVoiceAudio } from "@/plugins/voice/runtime/Transcriber.js";
import {
  VOICE_MODEL_CATALOG,
  resolveVoiceModelId,
} from "@/plugins/voice/runtime/Catalog.js";
import {
  detectLocalVoiceModelInstallState,
  installVoiceModelFromHuggingFace,
} from "@/plugins/voice/runtime/Installer.js";
import {
  installVoiceTranscribeDependencies,
  resolveVoiceRunnersByModels,
  resolveVoiceStrategyByModel,
} from "@/plugins/voice/runtime/DependencyInstaller.js";
import { resolveVoiceModelsRootDir } from "@/plugins/voice/runtime/Paths.js";
import type { VoiceModelId } from "@/agent/types/Voice.js";
import { persistProjectPluginConfig } from "@/console/plugin/ProjectConfigStore.js";

const execFileAsync = promisify(execFileCb);

function normalizeAssetConfig(
  runtime: AssetRuntimeLike,
): VoiceTranscriberAssetConfig {
  const current = runtime.config.assets?.["voice.transcriber"];
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return {
      provider: "local",
    };
  }
  return {
    provider: "local",
    ...(current as VoiceTranscriberAssetConfig),
  };
}

function toJsonObject(
  input: VoiceTranscriberAssetConfig,
): JsonObject {
  const output: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    output[key] = value;
  }
  return output;
}

async function checkLocalProviderAvailability(
  runtime: AssetRuntimeLike,
  config: VoiceTranscriberAssetConfig,
): Promise<{ available: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  const modelId = resolveVoiceModelId(String(config.modelId || ""));
  if (!modelId) {
    reasons.push("voice transcriber asset modelId is missing");
    return {
      available: false,
      reasons,
    };
  }

  const modelsRootDir = resolveVoiceModelsRootDir({
    projectRoot: runtime.rootPath,
    modelsDir: config.modelsDir,
  });
  const installState = await detectLocalVoiceModelInstallState({
    modelId,
    modelsRootDir,
  });
  if (!installState.installed) {
    reasons.push(`voice model is not installed: ${modelId}`);
  }

  const pythonBin = String(config.pythonBin || "").trim() || "python3";
  try {
    await execFileAsync(pythonBin, ["--version"], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    reasons.push(`python runtime missing: ${String(error)}`);
  }

  return {
    available: reasons.length === 0,
    reasons,
  };
}

/**
 * voice.transcriber：统一封装转写资源。
 */
export const voiceTranscriberAsset: Asset<
  VoiceTranscriberHandle,
  VoiceTranscriberAssetConfig,
  VoiceTranscriberAssetInstallInput
> = {
  name: "voice.transcriber",
  scope: "project",
  config: {
    asset: "voice.transcriber",
    scope: "project",
    defaultValue: {
      provider: "local",
      modelId: "SenseVoiceSmall",
    },
  },
  async check(runtime) {
    const config = normalizeAssetConfig(runtime);
    if (config.provider === "command") {
      const command = String(config.command || "").trim();
      return {
        available: Boolean(command),
        reasons: command ? [] : ["voice transcriber command is missing"],
      };
    }
    return checkLocalProviderAvailability(runtime, config);
  },
  async install(runtime, input) {
    const config = normalizeAssetConfig(runtime);
    if (config.provider === "command") {
      return {
        success: true,
        message: "voice.transcriber command provider does not require install",
      };
    }

    const requestedModelIds =
      (Array.isArray(input?.modelIds) ? input?.modelIds : [])
        .map((item) => resolveVoiceModelId(String(item || "").trim()))
        .filter((item): item is VoiceModelId => Boolean(item));
    const selectedModelIds: VoiceModelId[] =
      requestedModelIds.length > 0
        ? requestedModelIds
        : [resolveVoiceModelId(String(config.modelId || "SenseVoiceSmall")) || "SenseVoiceSmall"];

    const modelsRootDir = resolveVoiceModelsRootDir({
      projectRoot: runtime.rootPath,
      modelsDir: input?.modelsDir || config.modelsDir,
    });

    for (const modelId of selectedModelIds) {
      const model = VOICE_MODEL_CATALOG.find((item) => item.id === modelId);
      if (!model) {
        throw new Error(`Unsupported voice model: ${modelId}`);
      }
      await installVoiceModelFromHuggingFace({
        model,
        modelsRootDir,
        force: input?.force === true,
        hfToken: input?.hfToken,
      });
    }

    if (input?.installDeps !== false) {
      await installVoiceTranscribeDependencies({
        pythonBin:
          String(input?.pythonBin || config.pythonBin || "").trim() || "python3",
        runners: resolveVoiceRunnersByModels(selectedModelIds),
      });
    }

    const activeModelId =
      resolveVoiceModelId(String(input?.activeModel || "")) ||
      selectedModelIds[0];

    const nextConfig: VoiceTranscriberAssetConfig = {
      ...config,
      provider: "local",
      modelId: activeModelId,
      modelsDir: modelsRootDir,
      pythonBin:
        String(input?.pythonBin || config.pythonBin || "").trim() || undefined,
      ...(config.command ? { command: config.command } : {}),
      language:
        typeof config.language === "string" && config.language.trim()
          ? config.language.trim()
          : undefined,
      strategy: resolveVoiceStrategyByModel(activeModelId),
      installedModels: selectedModelIds,
    };
    if (!runtime.config.assets) {
      runtime.config.assets = {};
    }
    runtime.config.assets["voice.transcriber"] = toJsonObject(nextConfig);
    await persistProjectPluginConfig({
      projectRoot: runtime.rootPath,
      sections: {
        assets: runtime.config.assets,
      },
    });

    return {
      success: true,
      message: "voice.transcriber installed",
      details: {
        modelIds: selectedModelIds,
        activeModel: activeModelId,
        modelsRootDir,
      },
    };
  },
  async resolve(runtime) {
    return {
      async transcribe(input) {
        try {
          const result = await transcribeVoiceAudio({
            runtime,
            audioPath: input.audioPath,
            language: input.language,
          });
          return {
            success: true,
            text: result.text,
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
          };
        }
      },
    };
  },
};

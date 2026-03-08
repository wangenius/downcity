import type { VoiceModelCatalogItem, VoiceModelId } from "@main/types/Voice.js";

/**
 * Voice extension 内置模型目录。
 *
 * 关键点（中文）
 * - 统一维护 CLI 展示、下载源与配置落盘 ID。
 * - 只保留“稳定字段”，避免目录频繁变动影响外部调用。
 */
export const VOICE_MODEL_CATALOG: readonly VoiceModelCatalogItem[] = [
  {
    id: "SenseVoiceSmall",
    label: "SenseVoiceSmall",
    description: "中文优先，体积较小，推荐默认选择。",
    huggingfaceRepo: "FunAudioLLM/SenseVoiceSmall",
    revision: "main",
  },
  {
    id: "paraformer-zh-streaming",
    label: "paraformer-zh-streaming",
    description: "中文流式场景友好，低延迟。",
    huggingfaceRepo: "funasr/paraformer-zh-streaming",
    revision: "main",
  },
  {
    id: "whisper-large-v3-turbo",
    label: "whisper-large-v3-turbo",
    description: "多语言能力稳定，泛化较强。",
    huggingfaceRepo: "openai/whisper-large-v3-turbo",
    revision: "main",
  },
] as const;

const VOICE_MODEL_ALIAS_MAP: Record<string, VoiceModelId> = {
  sensevoicesmall: "SenseVoiceSmall",
  "sensevoice-small": "SenseVoiceSmall",
  "paraformer-zh-streaming": "paraformer-zh-streaming",
  paraformer_zh_streaming: "paraformer-zh-streaming",
  "whisper-large-v3-turbo": "whisper-large-v3-turbo",
  whisper_large_v3_turbo: "whisper-large-v3-turbo",
};

const CATALOG_BY_ID: Record<VoiceModelId, VoiceModelCatalogItem> =
  VOICE_MODEL_CATALOG.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<VoiceModelId, VoiceModelCatalogItem>,
  );

/**
 * 解析用户输入为稳定模型 ID（支持别名与大小写）。
 */
export function resolveVoiceModelId(input: string): VoiceModelId | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const exact = VOICE_MODEL_CATALOG.find((item) => item.id === raw);
  if (exact) return exact.id;
  return VOICE_MODEL_ALIAS_MAP[raw.toLowerCase()] || null;
}

/**
 * 读取目录项；不存在返回 null。
 */
export function getVoiceModelCatalogItem(id: VoiceModelId): VoiceModelCatalogItem | null {
  return CATALOG_BY_ID[id] || null;
}

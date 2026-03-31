/**
 * TTS 内置模型目录。
 *
 * 关键点（中文）
 * - 默认主推 `Qwen 0.6B` 与 `Kokoro`。
 * - 目录只保留 Console/UI 需要的稳定元数据，不暴露底层实现细节。
 */

import type { TtsModelCatalogItem, TtsModelId } from "@/types/Tts.js";

/**
 * 内置 TTS 模型目录。
 */
export const TTS_MODEL_CATALOG: readonly TtsModelCatalogItem[] = [
  {
    id: "qwen3-tts-0.6b",
    label: "Qwen3-TTS 0.6B",
    description: "中英文与多语言能力更强，作为主推荐模型。",
    family: "qwen3",
    recommended: true,
    assets: [
      {
        repoId: "Qwen/Qwen3-TTS-0.6B",
        revision: "main",
      },
    ],
  },
  {
    id: "kokoro-82m",
    label: "Kokoro 82M",
    description: "体积更小，启动更轻，适合本地快速合成。",
    family: "kokoro",
    recommended: true,
    assets: [
      {
        repoId: "hexgrad/Kokoro-82M",
        revision: "main",
        files: [
          "config.json",
          "kokoro-v1_0.pth",
          "voices/af_heart.pt",
          "voices/zf_xiaoni.pt",
        ],
      },
    ],
  },
] as const;

const TTS_MODEL_ALIAS_MAP: Record<string, TtsModelId> = {
  "qwen3-tts-0.6b": "qwen3-tts-0.6b",
  qwen3tts06b: "qwen3-tts-0.6b",
  qwen_06b: "qwen3-tts-0.6b",
  "kokoro-82m": "kokoro-82m",
  kokoro82m: "kokoro-82m",
};

const CATALOG_BY_ID: Record<TtsModelId, TtsModelCatalogItem> = TTS_MODEL_CATALOG.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<TtsModelId, TtsModelCatalogItem>,
);

/**
 * 解析用户输入为稳定模型 ID（支持别名与大小写）。
 */
export function resolveTtsModelId(input: string): TtsModelId | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const exact = TTS_MODEL_CATALOG.find((item) => item.id === raw);
  if (exact) return exact.id;
  return TTS_MODEL_ALIAS_MAP[raw.toLowerCase()] || null;
}

/**
 * 读取目录项；不存在返回 null。
 */
export function getTtsModelCatalogItem(id: TtsModelId): TtsModelCatalogItem | null {
  return CATALOG_BY_ID[id] || null;
}

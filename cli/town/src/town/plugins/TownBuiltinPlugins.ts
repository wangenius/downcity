/**
 * TownBuiltinPlugins：Town 宿主侧内建 plugin 装配。
 *
 * 关键点（中文）
 * - `@downcity/plugins` 只定义内建 plugin 与工厂，不直接读取 Town 登录态。
 * - Town 在这里把当前 City user 的 AI 能力注入给 image / asr / tts plugin。
 * - 静态 CLI catalog 仍可直接使用 `createBuiltinPlugins()`，避免 help/list 依赖 City 登录。
 */

import { createBuiltinPlugins } from "@downcity/plugins";
import type { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import type { ImagePluginInput } from "@downcity/plugins";
import type { AsrPluginInput } from "@downcity/plugins";
import type { TtsPluginInput } from "@downcity/plugins";
import { CityUserManager } from "../../shared/CityUserManager.js";

const city_user_manager = new CityUserManager();

/**
 * 创建 Town agent 运行期应启用的完整内建 plugin 集合。
 */
export async function createTownBuiltinPlugins(input: {
  /**
   * 宿主显式注入的 env，用于支持 DOWNCITY_CITY_* 覆盖项。
   */
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
} = {}): Promise<BasePlugin[]> {
  const { client } = await city_user_manager.createUserClient({
    env: input.env ?? process.env,
  });

  return createBuiltinPlugins({
    image: {
      image_create: async (image_input: ImagePluginInput) =>
        await client.ai.image_create(image_input),
      image_result: async (image_input) =>
        await client.ai.image_result(image_input),
    },
    asr: {
      asr: async (asr_input: AsrPluginInput) =>
        await client.ai.asr(asr_input),
    },
    tts: {
      tts: async (tts_input: TtsPluginInput) =>
        await client.ai.tts(tts_input),
    },
  });
}

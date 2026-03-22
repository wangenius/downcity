/**
 * Asset 注册表。
 *
 * 关键点（中文）
 * - 统一管理 Asset 的注册、检查、安装、解析与配置访问。
 * - Plugin 只通过 Asset 名称消费资源句柄，不关心底层实现细节。
 */

import type {
  Asset,
  AssetInstallInput,
  AssetCheckResult,
  AssetInstallResult,
  AssetRuntimeLike,
  AssetRuntimeView,
  StructuredConfig,
} from "@/types/Asset.js";
import type { JsonObject } from "@/types/Json.js";
import { persistProjectPluginConfig } from "@/console/plugin/ProjectConfigStore.js";

type RuntimeResolver = () => AssetRuntimeLike;

/**
 * AssetRegistry：Asset 注册与调度实现。
 */
export class AssetRegistry {
  private readonly runtimeResolver: RuntimeResolver;

  private readonly assets = new Map<
    string,
    Asset<unknown, StructuredConfig, AssetInstallInput>
  >();

  constructor(runtimeResolver: RuntimeResolver) {
    this.runtimeResolver = runtimeResolver;
  }

  /**
   * 注册单个 Asset。
   */
  register(asset: Asset<unknown, StructuredConfig, AssetInstallInput>): void {
    const key = String(asset.name || "").trim();
    if (!key) {
      throw new Error("Asset name is required");
    }
    if (this.assets.has(key)) {
      throw new Error(`Asset already registered: ${key}`);
    }
    this.assets.set(key, asset);
  }

  /**
   * 列出全部 Asset。
   */
  list(): AssetRuntimeView[] {
    return Array.from(this.assets.values())
      .map((asset) => ({
        name: asset.name,
        scope: asset.scope,
        hasConfig: Boolean(asset.config),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 获取 Asset 定义。
   */
  get(assetName: string): Asset<unknown, StructuredConfig, AssetInstallInput> | null {
    return this.assets.get(String(assetName || "").trim()) || null;
  }

  /**
   * 检查指定 Asset。
   */
  async check(assetName: string): Promise<AssetCheckResult> {
    const asset = this.get(assetName);
    if (!asset) {
      return {
        available: false,
        reasons: [`Unknown asset: ${assetName}`],
      };
    }
    try {
      return await asset.check(this.runtimeResolver());
    } catch (error) {
      return {
        available: false,
        reasons: [String(error)],
      };
    }
  }

  /**
   * 安装指定 Asset。
   */
  async install<TInstallInput extends AssetInstallInput = AssetInstallInput>(
    assetName: string,
    input?: TInstallInput,
  ): Promise<AssetInstallResult> {
    const asset = this.get(assetName);
    if (!asset) {
      return {
        success: false,
        message: `Unknown asset: ${assetName}`,
      };
    }
    try {
      return await asset.install(this.runtimeResolver(), input);
    } catch (error) {
      return {
        success: false,
        message: String(error),
      };
    }
  }

  /**
   * 解析指定 Asset 句柄。
   */
  async use<THandle = unknown>(assetName: string): Promise<THandle> {
    const asset = this.get(assetName);
    if (!asset) {
      throw new Error(`Unknown asset: ${assetName}`);
    }
    return (await asset.resolve(this.runtimeResolver())) as THandle;
  }

  /**
   * 读取 Asset 配置。
   *
   * 关键点（中文）
   * - 当前阶段统一落在 `config.assets[assetName]`。
   * - 若未声明配置定义，返回 null。
   */
  async getConfig<TConfig extends StructuredConfig = StructuredConfig>(
    assetName: string,
  ): Promise<TConfig | null> {
    const asset = this.get(assetName);
    if (!asset?.config) return null;
    const runtime = this.runtimeResolver();
    const assetStore = runtime.config.assets || {};
    const current = assetStore[asset.name];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return { ...(asset.config.defaultValue as TConfig) };
    }
    return {
      ...(asset.config.defaultValue as TConfig),
      ...(current as TConfig),
    };
  }

  /**
   * 更新 Asset 配置。
   */
  async setConfig<TConfig extends StructuredConfig = StructuredConfig>(
    assetName: string,
    value: Partial<TConfig>,
  ): Promise<TConfig> {
    const asset = this.get(assetName);
    if (!asset?.config) {
      throw new Error(`Asset does not declare config: ${assetName}`);
    }
    const runtime = this.runtimeResolver();
    if (!runtime.config.assets) {
      runtime.config.assets = {};
    }
    const current = await this.getConfig<TConfig>(assetName);
    const next = {
      ...(current || (asset.config.defaultValue as TConfig)),
      ...value,
    } as TConfig;
    runtime.config.assets[asset.name] = next as unknown as JsonObject;
    await persistProjectPluginConfig({
      projectRoot: runtime.rootPath,
      sections: {
        assets: runtime.config.assets,
      },
    });
    return next;
  }
}

/**
 * Capability 注册表。
 *
 * 关键点（中文）
 * - 统一注册与调用全部 Plugin Capability。
 * - 调用方只依赖 Capability 名，不依赖 Plugin 名。
 */

import type {
  CapabilityInvokeResult,
  PluginCapability,
  PluginRuntime,
} from "@/types/Plugin.js";
import type { JsonValue } from "@/types/Json.js";

type RuntimeResolver = () => PluginRuntime;

type CapabilityRecord = {
  pluginName: string;
  handler: PluginCapability<JsonValue, JsonValue>;
};

/**
 * CapabilityRegistry：Capability 注册与调用实现。
 */
export class CapabilityRegistry {
  private readonly runtimeResolver: RuntimeResolver;

  private readonly records = new Map<string, CapabilityRecord>();

  constructor(runtimeResolver: RuntimeResolver) {
    this.runtimeResolver = runtimeResolver;
  }

  /**
   * 注册单个 Capability。
   */
  register(
    capabilityName: string,
    pluginName: string,
    handler: PluginCapability<JsonValue, JsonValue>,
  ): void {
    const key = String(capabilityName || "").trim();
    if (!key) {
      throw new Error("Capability name is required");
    }
    if (this.records.has(key)) {
      throw new Error(`Capability already registered: ${key}`);
    }
    this.records.set(key, {
      pluginName: String(pluginName || "").trim(),
      handler,
    });
  }

  /**
   * 判断 Capability 是否已存在。
   */
  has(capabilityName: string): boolean {
    return this.records.has(String(capabilityName || "").trim());
  }

  /**
   * 列出全部 Capability 名称。
   */
  list(): string[] {
    return Array.from(this.records.keys()).sort((a, b) => a.localeCompare(b));
  }

  /**
   * 调用 Capability。
   */
  async invoke(params: {
    capability: string;
    payload?: JsonValue;
  }): Promise<CapabilityInvokeResult> {
    const key = String(params.capability || "").trim();
    if (!key) {
      return {
        success: false,
        error: "capability is required",
      };
    }

    const record = this.records.get(key);
    if (!record) {
      return {
        success: false,
        error: `Unknown capability: ${key}`,
      };
    }

    try {
      const data = await record.handler({
        runtime: this.runtimeResolver(),
        payload: (params.payload ?? {}) as JsonValue,
        plugin: record.pluginName,
      });
      return {
        success: true,
        ...(data !== undefined ? { data } : {}),
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }
}

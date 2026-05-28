/**
 * Agent 配置域环境变量占位符解析模块。
 *
 * 职责说明（中文）
 * - 负责把配置树中的 `${ENV_NAME}` 形式占位符替换为运行时可见的环境变量值。
 * - 服务 `downcity.json` 等配置载体的解析流程，让配置读取相关逻辑集中留在 `config/` 语义域。
 *
 * 边界说明（中文）
 * - 该模块只处理结构遍历与替换，不读取文件，也不决定环境变量来源优先级。
 * - 这里只负责“如何替换”，不负责“缺失变量时是否报错”的业务策略。
 */

import type { JsonObject } from "@/types/common/Json.js";
import type { ResolvedConfigValue } from "@/types/common/ResolvedConfigValue.js";

/**
 * 递归解析配置值中的环境变量占位符。
 *
 * 关键点（中文）
 * - 仅替换“整个字符串就是 `${VAR}`”的场景，不处理字符串内插值拼接。
 * - 数组与对象会递归遍历，保持原有结构不变。
 * - 未命中的环境变量会返回 `undefined`，由调用方决定后续行为。
 */
export function resolveEnvPlaceholdersDeep(
  value: ResolvedConfigValue,
  resolveEnvVar: (name: string) => string | undefined,
): ResolvedConfigValue {
  if (typeof value === "string") {
    const match = value.match(/^\$\{([A-Z0-9_]+)\}$/);
    if (!match) return value;
    const envVar = match[1];
    return resolveEnvVar(envVar);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveEnvPlaceholdersDeep(item, resolveEnvVar));
  }

  if (value && typeof value === "object") {
    const obj = value as JsonObject;
    const out: { [key: string]: ResolvedConfigValue } = {};
    for (const [key, child] of Object.entries(obj)) {
      out[key] = resolveEnvPlaceholdersDeep(
        child as ResolvedConfigValue,
        resolveEnvVar,
      );
    }
    return out;
  }

  return value;
}

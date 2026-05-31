/**
 * AI 模型类型（对应 core service/ai/types.ts PublicModel）。
 *
 * 关键点（中文）
 * - CityModel 是跨 package 共享协议，定义在 @downcity/type。
 * - UserModelRef 保留为 Gate 内部语义别名，避免一次性扩大改名范围。
 */

import type { CityModel, CityModelEnvRequirement } from "@downcity/type";

export type UserModelEnvRequirement = CityModelEnvRequirement;

/** 客户端可见的 Model 引用。 */
export type UserModelRef = CityModel;

/** 模型标识（Ref 或 ID 字符串）。 */
export type UserModelInput = UserModelRef | string;

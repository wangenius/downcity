/**
 * 配置值递归结构类型。
 *
 * 职责说明（中文）
 * - 描述 `downcity.json` 在“读取原始 JSON -> 解析环境变量占位符”阶段可接受的值结构。
 * - 允许对象、数组、JSON 标量与 `undefined` 递归嵌套，供配置解析工具复用。
 * - 该类型只服务配置装配阶段，不承诺运行时最终配置的严格业务语义。
 */
export type ResolvedConfigValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | { [key: string]: ResolvedConfigValue }
  | ResolvedConfigValue[];

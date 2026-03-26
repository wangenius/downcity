/**
 * Downcity UI SDK 通用工具。
 *
 * 关键说明（中文）
 * - `cn` 统一合并条件类名与 Tailwind 冲突类。
 * - 所有基础组件都应复用这个方法，避免类名覆盖顺序不一致。
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

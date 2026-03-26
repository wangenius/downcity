/**
 * Downcity UI SDK 公共类型定义。
 *
 * 关键说明（中文）
 * - 基础组件的公共联合类型统一集中到 `types/` 目录。
 * - 这里只放跨组件共享或对外公开的类型，不放实现细节。
 */

/**
 * Button 组件支持的视觉变体。
 */
export type DowncityButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive"
  | "link";

/**
 * Button 组件支持的尺寸。
 */
export type DowncityButtonSize =
  | "default"
  | "xs"
  | "sm"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

/**
 * Card 组件支持的尺寸。
 */
export type DowncityCardSize = "default" | "sm";

/**
 * DropdownMenu Item 组件支持的变体。
 */
export type DowncityDropdownMenuItemVariant = "default" | "destructive";

/**
 * Toaster 支持的主题模式。
 */
export type DowncityToasterTheme = "light" | "dark" | "system";

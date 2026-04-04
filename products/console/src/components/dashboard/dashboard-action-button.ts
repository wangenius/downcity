/**
 * Dashboard 行内图标按钮样式。
 *
 * 关键点（中文）
 * - 统一所有 section / item 内的小型 icon action button 外观。
 * - 基准样式对齐 Channel Accounts item action button。
 * - 危险操作只改变语义颜色，不改变尺寸、圆角与交互节奏。
 */

export const dashboardIconButtonClass =
  "h-8 w-8 rounded-[11px] bg-transparent text-muted-foreground hover:bg-foreground/8 hover:text-foreground"

export const dashboardDangerIconButtonClass =
  "h-8 w-8 rounded-[11px] bg-transparent text-destructive hover:bg-foreground/8 hover:text-destructive"

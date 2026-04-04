/**
 * Console UI Toaster 包装层。
 *
 * 关键说明（中文）
 * - 基础实现来自 `@downcity/ui`。
 * - 当前文件继续桥接 `next-themes`，保持主题行为不变。
 */

import { Toaster as DowncityToaster } from "@downcity/ui";
import { useTheme } from "next-themes";
import type { ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return <DowncityToaster theme={theme as ToasterProps["theme"]} {...props} />;
};

export { Toaster };

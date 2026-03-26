/**
 * Downcity Input 基础组件。
 *
 * 关键说明（中文）
 * - 用于单行文本、搜索、参数等输入场景。
 * - 保持与 Console 一致的轻量背景、聚焦态与错误态反馈。
 */

import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "../lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-[12px] border border-transparent bg-secondary/85 px-3 py-2 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/45 disabled:opacity-50 aria-invalid:bg-destructive/5 aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

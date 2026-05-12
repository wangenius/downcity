/**
 * Downcity Skeleton 基础组件。
 *
 * 关键说明（中文）
 * - 用于异步加载中的占位骨架。
 * - 默认仅提供最小样式，宿主可通过 `className` 定制尺寸与形状。
 */

import type * as React from "react";

import { cn } from "../lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };

/**
 * Downcity Label 基础组件。
 *
 * 关键说明（中文）
 * - 用于表单字段标题、辅助说明入口和分组命名。
 * - 默认兼容 `peer-disabled` 与 `group-data-[disabled=true]` 状态透传。
 */

import type * as React from "react";

import { cn } from "../lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };

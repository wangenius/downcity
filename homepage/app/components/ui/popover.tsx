"use client";

/**
 * Homepage Popover 组件组合层。
 *
 * 关键说明（中文）
 * - 基础 Popover 行为统一复用 `@downcity/ui`。
 * - Header/Title/Description 继续保留在首页工程内，方便文案型浮层复用。
 */

import type * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Popover, PopoverContent, PopoverTrigger, cn } from "@downcity/ui";

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  );
}

function PopoverTitle({
  className,
  ...props
}: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};

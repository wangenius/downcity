/**
 * 文本域组件（shadcn 风格）。
 */

import * as React from "react";
import { cn } from "../../lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[96px] w-full rounded-[16px] border border-transparent bg-secondary/85 px-3 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-55",
          className,
        )}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";

/**
 * 全局提示条。
 */

import { cn } from "../../lib/utils";

export interface ToastMessageProps {
  /**
   * 提示内容。
   */
  message: string;
  /**
   * 提示类型。
   */
  type: "info" | "success" | "error";
}

export function ToastMessage(props: ToastMessageProps) {
  const { message, type } = props;

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-50 rounded-xl border px-4 py-2 text-sm shadow-lg",
        type === "success" && "border-border bg-card text-foreground",
        type === "error" && "border-destructive/35 bg-destructive/10 text-destructive",
        type === "info" && "border-border bg-card text-muted-foreground",
      )}
    >
      {message}
    </div>
  );
}

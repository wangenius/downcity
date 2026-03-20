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
        "fixed right-5 bottom-5 z-50 rounded-[18px] px-4 py-2.5 text-sm shadow-[0_10px_26px_rgba(24,24,27,0.06)] backdrop-blur-sm",
        type === "success" && "bg-card text-foreground",
        type === "error" && "bg-destructive/10 text-destructive",
        type === "info" && "bg-card text-muted-foreground",
      )}
    >
      {message}
    </div>
  );
}

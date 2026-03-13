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
        "fixed bottom-5 right-5 z-50 rounded-xl border px-4 py-2 text-sm shadow-lg backdrop-blur",
        type === "success" && "border-emerald-300 bg-emerald-50 text-emerald-700",
        type === "error" && "border-red-300 bg-red-50 text-red-700",
        type === "info" && "border-neutral-300 bg-white text-neutral-700",
      )}
    >
      {message}
    </div>
  );
}

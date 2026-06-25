import React, { useContext, useState } from "react";
import { Copy, Check } from "lucide-react";

/**
 * 原始 Markdown 内容上下文。
 * 用于在 clientLoader 组件中传递当前页面的原始 Markdown 内容。
 */
export const RawMarkdownContext = React.createContext<string>("");

/**
 * 复制 Markdown 按钮组件。
 * 点击后将当前文档的原始 Markdown 内容复制到剪贴板，便于用户粘贴给 AI Agent 使用。
 */
export function CopyMarkdownButton() {
  const rawMarkdown = useContext(RawMarkdownContext);
  const [copied, setCopied] = useState(false);

  if (!rawMarkdown) return null;

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(rawMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 忽略复制失败
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-fd-accent"
      title="复制原始 Markdown 内容"
    >
      {copied ? (
        <Check className="size-3.5 text-green-600" />
      ) : (
        <Copy className="size-3.5" />
      )}
      <span>{copied ? "已复制" : "复制 Markdown"}</span>
    </button>
  );
}

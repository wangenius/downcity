/**
 * Side Panel 消息 Markdown 渲染组件。
 *
 * 关键点（中文）：
 * - Assistant 消息使用 streamdown 支持流式 Markdown。
 * - User 消息保持纯文本，避免用户输入被误解释为 Markdown。
 */

import { Streamdown } from "streamdown";

/**
 * Markdown 消息属性。
 */
export interface MarkdownMessageProps {
  /**
   * 消息角色。
   */
  role: "user" | "assistant" | "system";
  /**
   * 消息文本。
   */
  text: string;
  /**
   * 是否正在流式输出。
   */
  streaming?: boolean;
}

/**
 * Markdown 消息。
 */
export function MarkdownMessage(props: MarkdownMessageProps) {
  if (props.role !== "assistant") {
    return (
      <div className="min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {props.text}
      </div>
    );
  }

  return (
    <Streamdown
      animated
      isAnimating={props.streaming === true}
      parseIncompleteMarkdown
      className="side-panel-markdown text-[13px] leading-6"
    >
      {props.text}
    </Streamdown>
  );
}

/**
 * Prompt 构成区。
 */

import { Button } from "../ui/button";
import type { UiPromptResponse } from "../../types/Dashboard";

export interface PromptSectionProps {
  /**
   * prompt 数据。
   */
  prompt: UiPromptResponse | null;
  /**
   * local ui context id。
   */
  localUiContextId: string;
  /**
   * 刷新动作。
   */
  onRefresh: () => void;
}

export function PromptSection(props: PromptSectionProps) {
  const { prompt, localUiContextId, onRefresh } = props;
  const sections = Array.isArray(prompt?.sections) ? prompt.sections : [];

  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-center justify-between border-b border-border/70 pb-2">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Prompt</div>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          刷新
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {prompt && sections.length > 0
          ? `context: ${prompt.contextId || localUiContextId} · messages ${prompt.totalMessages || 0} · chars ${prompt.totalChars || 0}`
          : "暂无 prompt 数据"}
      </div>

      <div className="max-h-[42vh] min-w-0 space-y-2 overflow-auto pr-1">
        {sections.map((section, sectionIndex) => {
          const title = String(section.title || section.key || "section");
          const items = Array.isArray(section.items) ? section.items : [];
          return (
            <details
              key={`${title}-${sectionIndex}`}
              open={sectionIndex <= 1}
              className="border-b border-border/60 pb-2"
            >
              <summary className="cursor-pointer py-1 text-xs font-semibold text-foreground/80">{`${title} · ${items.length}`}</summary>
              <div className="space-y-2 pt-1">
                {items.map((item, itemIndex) => (
                  <div key={itemIndex} className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">#{String(item.index || "-")}</div>
                    <pre className="overflow-auto border border-border/70 bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground/85">
                      {String(item.content || "")}
                    </pre>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

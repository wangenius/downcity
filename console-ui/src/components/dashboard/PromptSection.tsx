/**
 * Prompt 构成区。
 */

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
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
    <Card className="min-w-0 border-border/80 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle>Prompt 构成</CardTitle>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
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
                className="rounded-xl border border-border/70 bg-background/70"
              >
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-foreground/80">{`${title} · ${items.length}`}</summary>
                <div className="space-y-2 border-t border-dashed border-border/60 px-3 py-2">
                  {items.map((item, itemIndex) => (
                    <div key={itemIndex} className="space-y-1">
                      <div className="text-[11px] text-muted-foreground">#{String(item.index || "-")}</div>
                      <pre className="overflow-auto rounded-lg border border-border/70 bg-muted/30 p-2 font-mono text-[11px] leading-relaxed text-foreground/85">
                        {String(item.content || "")}
                      </pre>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

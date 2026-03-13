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
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Prompt 构成</CardTitle>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
          {prompt && sections.length > 0
            ? `context: ${prompt.contextId || localUiContextId} · messages ${prompt.totalMessages || 0} · chars ${prompt.totalChars || 0}`
            : "暂无 prompt 数据"}
        </div>

        <div className="max-h-[44vh] space-y-2 overflow-auto pr-1">
          {sections.map((section, sectionIndex) => {
            const title = String(section.title || section.key || "section");
            const items = Array.isArray(section.items) ? section.items : [];
            return (
              <details
                key={`${title}-${sectionIndex}`}
                open={sectionIndex <= 1}
                className="rounded-xl border border-neutral-200 bg-white"
              >
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-neutral-700">{`${title} · ${items.length}`}</summary>
                <div className="space-y-2 border-t border-dashed border-neutral-200 px-3 py-2">
                  {items.map((item, itemIndex) => (
                    <div key={itemIndex} className="space-y-1">
                      <div className="text-[11px] text-neutral-500">#{String(item.index || "-")}</div>
                      <pre className="overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-2 font-mono text-[11px] leading-relaxed text-neutral-700">
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

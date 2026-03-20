/**
 * Prompt 构成区。
 */

import { Button } from "../ui/button";
import { DashboardModule } from "./DashboardModule";
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
    <DashboardModule
      title="Prompt"
      description={
        prompt && sections.length > 0
          ? `context: ${prompt.contextId || localUiContextId} · messages ${prompt.totalMessages || 0} · chars ${prompt.totalChars || 0}`
          : "暂无 prompt 数据"
      }
      actions={
        <Button size="sm" variant="outline" onClick={onRefresh}>
          刷新
        </Button>
      }
      bodyClassName="min-w-0"
    >
      {sections.length === 0 ? (
        <div className="rounded-[20px] bg-secondary/85 px-4 py-6 text-sm text-muted-foreground">
          当前 context 还没有可展示的 prompt 分段
        </div>
      ) : (
        <div className="max-h-[42vh] min-w-0 overflow-auto rounded-[20px] bg-secondary/85">
          {sections.map((section, sectionIndex) => {
            const title = String(section.title || section.key || "section");
            const items = Array.isArray(section.items) ? section.items : [];
            return (
              <details
                key={`${title}-${sectionIndex}`}
                open={sectionIndex <= 1}
                className="group border-b border-border/45 px-3 py-3 last:border-b-0"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] px-1 py-1 text-xs font-semibold text-foreground/82 transition-colors hover:bg-background/55">
                  <span className="truncate">{title}</span>
                  <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{items.length}</span>
                </summary>
                <div className="space-y-2 pt-3">
                  {items.length === 0 ? (
                    <div className="rounded-[14px] bg-background/72 px-3 py-2.5 text-xs text-muted-foreground">
                      空分段
                    </div>
                  ) : (
                    items.map((item, itemIndex) => (
                      <div key={itemIndex} className="space-y-1.5 rounded-[16px] bg-background/72 p-3">
                        <div className="text-[11px] text-muted-foreground">#{String(item.index || "-")}</div>
                        <pre className="overflow-auto font-mono text-[11px] leading-relaxed text-foreground/85">
                          {String(item.content || "")}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </DashboardModule>
  );
}

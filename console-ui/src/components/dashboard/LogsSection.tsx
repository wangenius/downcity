/**
 * 日志区。
 */

import type { UiLogItem } from "../../types/Dashboard";

export interface LogsSectionProps {
  /**
   * 日志列表。
   */
  logs: UiLogItem[];
  /**
   * 时间格式化方法。
   */
  formatTime: (ts?: number | string) => string;
}

export function LogsSection(props: LogsSectionProps) {
  const { logs, formatTime } = props;

  return (
    <section className="space-y-2">
      <div className="border-b border-border/70 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Recent Logs
      </div>
      <pre className="max-h-[68vh] overflow-auto border border-border/70 bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">
        {logs.length === 0
          ? "暂无日志"
          : logs
              .map((item) => {
                const time = formatTime(item.timestamp);
                const level = String(item.type || item.level || "info").toUpperCase();
                const message = String(item.message || "");
                return `[${time}] [${level}] ${message}`;
              })
              .join("\n")}
      </pre>
    </section>
  );
}

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
    <section className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Recent Logs
      </div>
      <pre className="max-h-[68vh] overflow-auto rounded-[22px] bg-card px-4 py-3.5 font-mono text-[11px] leading-relaxed text-foreground shadow-[0_1px_0_rgba(15,23,42,0.02)]">
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

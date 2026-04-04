/**
 * 日志区。
 */

import { DashboardModule } from "./DashboardModule";
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
  const lines =
    logs.length === 0
      ? "暂无日志"
      : logs
          .map((item) => {
            const time = formatTime(item.timestamp);
            const level = String(item.type || item.level || "info").toUpperCase();
            const message = String(item.message || "");
            return `[${time}] [${level}] ${message}`;
          })
          .join("\n");

  return (
    <DashboardModule
      title="Recent Logs"
      description={`最近 ${logs.length} 条日志输出。`}
      bodyClassName="gap-0"
    >
      <div className="overflow-hidden rounded-[20px] bg-secondary/85">
        <pre className="max-h-[68vh] overflow-auto px-4 py-4 font-mono text-[11px] leading-relaxed text-foreground/88">
          {lines}
        </pre>
      </div>
    </DashboardModule>
  );
}

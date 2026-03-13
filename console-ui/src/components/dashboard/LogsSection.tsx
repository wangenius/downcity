/**
 * 日志区。
 */

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
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
    <Card className="border-border/80 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle>Recent Logs</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="max-h-96 overflow-auto rounded-xl border border-zinc-700/70 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
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
      </CardContent>
    </Card>
  );
}

/**
 * Services 运行状态区。
 */

import * as React from "react";
import { Loader2Icon, PlayIcon, RotateCwIcon, SquareIcon } from "lucide-react";
import { Button } from "@downcity/ui";
import { useConfirmDialog } from "../ui/confirm-dialog";
import { dashboardDangerIconButtonClass, dashboardIconButtonClass } from "./dashboard-action-button";
import { DashboardModule } from "./DashboardModule";
import type { UiServiceItem } from "../../types/Dashboard";

export interface ServicesSectionProps {
  /**
   * service 列表。
   */
  services: UiServiceItem[];
  /**
   * 状态 -> 徽标变体映射。
   */
  statusBadgeVariant: (status?: string) => "ok" | "warn" | "bad";
  /**
   * service 控制回调。
   */
  onControlService: (serviceName: string, action: string) => void;
}

export function ServicesSection(props: ServicesSectionProps) {
  const { services, statusBadgeVariant, onControlService } = props;
  const confirm = useConfirmDialog();
  const runningCount = services.filter((svc) => {
    const state = String(svc.state || "").toLowerCase();
    return state === "running" || state === "active" || state === "ok";
  }).length;
  const stoppedCount = services.length - runningCount;

  const badgeClass = (status?: string): string => {
    const tone = statusBadgeVariant(status);
    if (tone === "ok") return "bg-emerald-500/10 text-emerald-700";
    if (tone === "bad") return "bg-destructive/10 text-destructive";
    return "bg-secondary text-muted-foreground";
  };

  const dotClass = (status?: string): string => {
    const tone = statusBadgeVariant(status);
    if (tone === "ok") return "bg-emerald-600";
    if (tone === "bad") return "bg-destructive";
    return "bg-muted-foreground/55";
  };

  return (
    <DashboardModule
      title="Services Runtime"
      description={`运行中 ${runningCount} 个 · 其余 ${stoppedCount} 个`}
    >
      {services.length === 0 ? (
        <div className="rounded-[18px] bg-secondary px-4 py-6 text-sm text-muted-foreground">暂无 service 数据</div>
      ) : (
        <div className="space-y-2">
          {services.map((svc) => {
            const name = String(svc.name || "").trim() || "unknown";
            const status = String(svc.state || "").toLowerCase() || "unknown";
            const tone = statusBadgeVariant(status);
            const isRunning = tone === "ok";
            const canStop = isRunning;

            return (
              <article
                key={name}
                className="rounded-[20px] bg-transparent px-4 py-3 transition-colors hover:bg-secondary"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`mt-0.5 size-2.5 shrink-0 rounded-full ${dotClass(status)}`} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-[15px] font-semibold text-foreground">{name}</div>
                        <span className={`inline-flex h-6 items-center rounded-full px-2 font-mono text-[11px] ${badgeClass(status)}`}>
                          {status}
                        </span>
                      </div>
                      <div className="truncate text-[12px] text-muted-foreground">
                        {isRunning ? "service is available" : "service is not running"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                    <span className="inline-flex h-7 items-center rounded-full bg-secondary px-2.5 text-[11px] text-muted-foreground">
                      {`runtime ${status}`}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={dashboardIconButtonClass}
                      onClick={() => onControlService(name, "start")}
                      aria-label="start"
                      title="start"
                    >
                      <PlayIcon className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={dashboardIconButtonClass}
                      onClick={() => onControlService(name, "restart")}
                      aria-label="restart"
                      title="restart"
                    >
                      <RotateCwIcon className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={dashboardDangerIconButtonClass}
                      onClick={() => {
                        void (async () => {
                          const confirmed = await confirm({
                            title: "停止 Service",
                            description: `确认停止 service「${name}」吗？`,
                            confirmText: "停止",
                            confirmVariant: "destructive",
                          });
                          if (!confirmed) return;
                          onControlService(name, "stop");
                        })();
                      }}
                      aria-label="stop"
                      title="stop"
                      disabled={!canStop}
                    >
                      <SquareIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </DashboardModule>
  );
}

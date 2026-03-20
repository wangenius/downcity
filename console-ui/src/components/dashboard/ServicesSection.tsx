/**
 * Services 运行状态区。
 */

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
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
  const runningCount = services.filter((svc) => {
    const state = String(svc.state || svc.status || "").toLowerCase();
    return state === "running" || state === "active" || state === "ok";
  }).length;
  const stoppedCount = services.length - runningCount;

  const badgeClass = (status?: string): string => {
    const tone = statusBadgeVariant(status);
    if (tone === "ok") return "bg-secondary text-foreground";
    if (tone === "bad") return "border-destructive/40 bg-destructive/10 text-destructive";
    return "bg-card text-muted-foreground";
  };

  return (
    <DashboardModule
      title="Services Runtime"
      description={`运行中 ${runningCount} 个 · 其余 ${stoppedCount} 个`}
      className="shadow-[0_1px_0_rgba(17,17,19,0.02)]"
    >
      {services.length === 0 ? (
        <div className="py-4 text-sm text-muted-foreground">暂无 service 数据</div>
      ) : (
        <div className="overflow-auto rounded-[18px] bg-secondary/82 p-1.5">
          <table className="w-full border-separate border-spacing-y-1.5">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-0 py-2 font-medium">Service</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => {
                const name = String(svc.name || svc.service || "unknown");
                const status = String(svc.state || svc.status || "unknown");
                return (
                  <tr key={name} className="bg-transparent transition-colors hover:bg-background/80">
                    <td className="rounded-l-[16px] px-3 py-2.5 text-sm font-medium">{name}</td>
                    <td className="px-2 py-2">
                      <Badge variant="outline" className={badgeClass(status)}>
                        {status}
                      </Badge>
                    </td>
                    <td className="rounded-r-[16px] px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => onControlService(name, "start")}>
                          start
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onControlService(name, "restart")}>
                          restart
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => onControlService(name, "stop")}>
                          stop
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardModule>
  );
}

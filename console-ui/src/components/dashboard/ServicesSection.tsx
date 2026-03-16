/**
 * Services 运行状态区。
 */

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
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

  const badgeClass = (status?: string): string => {
    const tone = statusBadgeVariant(status);
    if (tone === "ok") return "border-border bg-muted/45 text-foreground";
    if (tone === "bad") return "border-destructive/40 bg-destructive/10 text-destructive";
    return "border-border bg-muted/35 text-muted-foreground";
  };

  return (
    <section className="space-y-2">
      <div className="border-b border-border/70 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Services Runtime
      </div>
      {services.length === 0 ? (
        <div className="py-4 text-sm text-muted-foreground">暂无 service 数据</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
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
                  <tr key={name} className="border-b border-border/50">
                    <td className="px-0 py-2 text-sm font-medium">{name}</td>
                    <td className="px-2 py-2">
                      <Badge variant="outline" className={badgeClass(status)}>
                        {status}
                      </Badge>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => onControlService(name, "start")}>
                          start
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onControlService(name, "restart")}>
                          restart
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onControlService(name, "stop")}>
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
    </section>
  );
}

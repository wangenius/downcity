/**
 * Services 运行状态区。
 */

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
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
    <Card className="border-border/80 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle>Services Runtime</CardTitle>
      </CardHeader>
      <CardContent>
        {services.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            暂无 service 数据
          </div>
        ) : (
          <div className="overflow-auto rounded-xl border border-border/70 bg-background/75">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((svc) => {
                  const name = String(svc.name || svc.service || "unknown");
                  const status = String(svc.state || svc.status || "unknown");
                  return (
                    <TableRow key={name}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={badgeClass(status)}>
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

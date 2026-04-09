/**
 * Workboard 复合展示组件。
 *
 * 关键点（中文）
 * - 组件只消费结构化快照，不负责请求。
 * - 布局采用“主视图 + Inspector”关系，借鉴 teamprofile 的选中态表达方式。
 */

import { ActivityIcon, BotIcon, Clock3Icon, RefreshCwIcon, ServerCogIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Separator } from "./separator";
import type {
  DowncityWorkboardActivityItem,
  DowncityWorkboardProps,
} from "../types/workboard";

function formatTimestamp(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusBadgeVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "running") return "default";
  if (status === "error") return "destructive";
  if (status === "idle") return "outline";
  return "secondary";
}

function itemIcon(kind: string) {
  if (kind === "session") return ActivityIcon;
  if (kind === "task") return Clock3Icon;
  return BotIcon;
}

function resolveSelectedActivity(params: {
  snapshot: DowncityWorkboardProps["snapshot"];
  selectedActivityId?: string;
}): DowncityWorkboardActivityItem | null {
  const items = [...(params.snapshot?.current || []), ...(params.snapshot?.recent || [])];
  if (items.length === 0) return null;
  const explicit = items.find((item) => item.id === params.selectedActivityId);
  return explicit || items[0] || null;
}

export function Workboard(props: DowncityWorkboardProps) {
  const { snapshot, loading, selectedActivityId, onRefresh, onSelectActivity, className } = props;
  const selected = resolveSelectedActivity({ snapshot, selectedActivityId });

  if (!snapshot) {
    return (
      <Card className={cn("border-dashed", className)}>
        <CardContent className="flex min-h-52 items-center justify-center text-sm text-muted-foreground">
          {loading ? "正在加载 workboard..." : "当前没有可展示的 workboard 快照。"}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden border-border/70 bg-background/95", className)}>
      <CardHeader className="border-b bg-muted/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={snapshot.agent.running ? "default" : "outline"}>
                {snapshot.agent.running ? "running" : "stopped"}
              </Badge>
              <Badge variant="secondary">{snapshot.agent.executionMode}</Badge>
              {snapshot.agent.modelId ? <Badge variant="outline">{snapshot.agent.modelId}</Badge> : null}
            </div>
            <CardTitle className="text-xl">{snapshot.agent.name}</CardTitle>
            <p className="max-w-3xl text-sm text-muted-foreground">{snapshot.agent.statusText}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="grid min-w-64 grid-cols-3 gap-2">
              <div className="rounded-xl border bg-background px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Executing</div>
                <div className="mt-1 text-lg font-semibold">{snapshot.summary.executingSessions}</div>
              </div>
              <div className="rounded-xl border bg-background px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Recent</div>
                <div className="mt-1 text-lg font-semibold">{snapshot.summary.recentActivities}</div>
              </div>
              <div className="rounded-xl border bg-background px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Services</div>
                <div className="mt-1 text-lg font-semibold">{snapshot.summary.degradedServices}</div>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={!onRefresh}
            >
              <RefreshCwIcon className={cn("size-4", loading ? "animate-spin" : "")} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 p-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6 p-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Current
              </h3>
              <span className="text-xs text-muted-foreground">
                collected {formatTimestamp(snapshot.agent.collectedAt)}
              </span>
            </div>
            <div className="space-y-3">
              {snapshot.current.map((item) => {
                const Icon = itemIcon(item.kind);
                const active = selected?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectActivity?.(item.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                      active ? "border-foreground/60 bg-muted/50" : "border-border/70 hover:bg-muted/30",
                    )}
                  >
                    <span className="mt-0.5 rounded-xl bg-muted p-2">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.title}</span>
                        <Badge variant={statusBadgeVariant(item.status)}>{item.status}</Badge>
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">{item.summary}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Recent
            </h3>
            <div className="space-y-2">
              {snapshot.recent.length === 0 ? (
                <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
                  暂无近期活动。
                </div>
              ) : (
                snapshot.recent.map((item) => {
                  const active = selected?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectActivity?.(item.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors",
                        active ? "border-foreground/60 bg-muted/50" : "border-border/70 hover:bg-muted/30",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{item.title}</span>
                        <span className="mt-1 block truncate text-sm text-muted-foreground">
                          {item.summary}
                        </span>
                      </span>
                      <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                        {formatTimestamp(item.updatedAt)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <aside className="border-t bg-muted/15 p-6 lg:border-l lg:border-t-0">
          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Inspector
              </h3>
              {selected ? (
                <div className="rounded-2xl border bg-background px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold">{selected.title}</span>
                    <Badge variant={statusBadgeVariant(selected.status)}>{selected.status}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{selected.summary}</p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Updated</dt>
                      <dd className="text-right">{formatTimestamp(selected.updatedAt)}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Started</dt>
                      <dd className="text-right">{formatTimestamp(selected.startedAt)}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Session</dt>
                      <dd className="text-right">{selected.sessionId || "-"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-muted-foreground">Tags</dt>
                      <dd className="flex flex-wrap justify-end gap-1">
                        {selected.tags.length === 0 ? (
                          <span>-</span>
                        ) : (
                          selected.tags.map((tag) => (
                            <Badge key={`${selected.id}:${tag}`} variant="outline">
                              {tag}
                            </Badge>
                          ))
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
                  选择一条活动查看详情。
                </div>
              )}
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <ServerCogIcon className="size-4" />
                Services
              </h3>
              <div className="space-y-2">
                {snapshot.services.map((service) => (
                  <div key={service.name} className="rounded-2xl border bg-background px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{service.name}</span>
                      <Badge variant={service.state === "running" ? "secondary" : "outline"}>
                        {service.state}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      updated {formatTimestamp(service.updatedAt)}
                    </div>
                    {service.lastError ? (
                      <div className="mt-2 text-xs text-destructive">{service.lastError}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Tasks
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border bg-background px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Enabled</div>
                  <div className="mt-1 text-lg font-semibold">{snapshot.tasks.enabled}</div>
                </div>
                <div className="rounded-2xl border bg-background px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Paused</div>
                  <div className="mt-1 text-lg font-semibold">{snapshot.tasks.paused}</div>
                </div>
                <div className="rounded-2xl border bg-background px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Disabled</div>
                  <div className="mt-1 text-lg font-semibold">{snapshot.tasks.disabled}</div>
                </div>
                <div className="rounded-2xl border bg-background px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Total</div>
                  <div className="mt-1 text-lg font-semibold">{snapshot.tasks.total}</div>
                </div>
              </div>
            </section>
          </div>
        </aside>
      </CardContent>
    </Card>
  );
}

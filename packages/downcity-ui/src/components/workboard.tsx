/**
 * Workboard 复合展示组件。
 *
 * 关键点（中文）
 * - 组件只消费结构化快照，不负责请求。
 * - 这里展示的是对外模糊公开态，不呈现内部 session / service / task 细节。
 * - 布局采用“主舞台 + 轨迹 + Inspector”关系，延续 teamprofile 的选中联动方式。
 */

import {
  ActivityIcon,
  BotIcon,
  PauseCircleIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, CardContent } from "./card";
import type {
  DowncityWorkboardActivityItem,
  DowncityWorkboardProps,
  DowncityWorkboardSignalItem,
} from "../types/workboard";

function formatTimestamp(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatRelativeTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  const now = Date.now();
  if (Number.isNaN(date.getTime())) return value;
  const delta = Math.max(0, now - date.getTime());
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function itemIcon(kind: string) {
  if (kind === "focus") return SparklesIcon;
  if (kind === "progress") return ActivityIcon;
  return PauseCircleIcon;
}

function statusBadgeVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "active") return "default";
  if (status === "issue") return "destructive";
  if (status === "waiting") return "outline";
  return "secondary";
}

function accentClass(status: string): string {
  if (status === "active") return "bg-emerald-500";
  if (status === "issue") return "bg-rose-500";
  if (status === "waiting") return "bg-stone-400";
  return "bg-amber-500";
}

function signalToneClass(signal: DowncityWorkboardSignalItem): string {
  if (signal.tone === "accent") return "border-emerald-200/70 bg-emerald-50/80";
  if (signal.tone === "warning") return "border-amber-300/70 bg-amber-50/85";
  return "border-border/70 bg-background/78";
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

function StageCard(props: {
  item: DowncityWorkboardActivityItem;
  active: boolean;
  onSelect?: (activityId: string) => void;
}) {
  const Icon = itemIcon(props.item.kind);

  return (
    <button
      type="button"
      onClick={() => props.onSelect?.(props.item.id)}
      className={cn(
        "group relative flex w-full items-start gap-3 overflow-hidden rounded-[24px] border px-4 py-4 text-left transition-all duration-200",
        props.active
          ? "border-foreground/16 bg-[linear-gradient(145deg,rgba(251,248,240,0.96),rgba(255,255,255,0.88))] shadow-[0_14px_30px_rgba(17,17,19,0.08)]"
          : "border-border/70 bg-background/82 hover:-translate-y-0.5 hover:border-foreground/12 hover:bg-background",
      )}
    >
      <span className="absolute left-0 top-0 h-full w-1.5 rounded-r-full bg-transparent">
        <span className={cn("block h-full w-full", accentClass(props.item.status))} />
      </span>
      <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-[16px] border border-foreground/10 bg-background/78 text-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[0.98rem] font-semibold tracking-[-0.03em] text-foreground">
            {props.item.title}
          </span>
          <Badge variant={statusBadgeVariant(props.item.status)}>{props.item.status}</Badge>
        </span>
        <span className="mt-2 block text-sm leading-6 text-muted-foreground">{props.item.summary}</span>
        <span className="mt-3 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-foreground/45">
          <span>{props.item.kind}</span>
          <span>{formatRelativeTime(props.item.updatedAt)}</span>
        </span>
      </span>
    </button>
  );
}

function TrailItem(props: {
  item: DowncityWorkboardActivityItem;
  active: boolean;
  onSelect?: (activityId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => props.onSelect?.(props.item.id)}
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-[20px] px-3 py-3 text-left transition-colors",
        props.active ? "bg-background/88" : "hover:bg-background/65",
      )}
    >
      <span className="relative mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center">
        <span className="absolute inset-x-1 top-0 bottom-0 mx-auto w-px bg-border/80" />
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full ring-4 ring-background", accentClass(props.item.status))} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3">
          <span className="truncate font-medium text-foreground">{props.item.title}</span>
          <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-foreground/42">
            {formatRelativeTime(props.item.updatedAt)}
          </span>
        </span>
        <span className="mt-1 block text-sm leading-6 text-muted-foreground">{props.item.summary}</span>
      </span>
    </button>
  );
}

export function Workboard(props: DowncityWorkboardProps) {
  const { snapshot, loading, selectedActivityId, onRefresh, onSelectActivity, className } = props;
  const selected = resolveSelectedActivity({ snapshot, selectedActivityId });

  if (!snapshot) {
    return (
      <Card
        className={cn(
          "overflow-hidden border border-dashed border-border/80 bg-[linear-gradient(145deg,rgba(247,244,236,0.84),rgba(255,255,255,0.95))]",
          className,
        )}
      >
        <CardContent className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">
          {loading ? "正在加载 workboard..." : "当前没有可展示的 workboard 快照。"}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "relative overflow-hidden border border-border/70 bg-[linear-gradient(145deg,rgba(247,244,236,0.95),rgba(255,255,255,0.98)_42%,rgba(229,238,234,0.72))]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(17,17,19,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(17,17,19,0.03)_1px,transparent_1px)] bg-[size:26px_26px] opacity-30" />
      <div className="pointer-events-none absolute left-6 top-6 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(190,106,40,0.16),transparent_68%)]" />
      <div className="pointer-events-none absolute bottom-4 right-4 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(54,107,96,0.18),transparent_70%)]" />

      <CardContent className="relative p-4 md:p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(20rem,0.82fr)]">
          <section className="space-y-5">
            <div className="rounded-[28px] border border-foreground/10 bg-background/84 p-5 shadow-[0_18px_36px_rgba(17,17,19,0.05)]">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={snapshot.agent.running ? "default" : "outline"}>
                      {snapshot.agent.running ? "public view" : "standby"}
                    </Badge>
                    <Badge variant="secondary">{snapshot.summary.posture}</Badge>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-[1.5rem] font-semibold tracking-[-0.05em] text-foreground">
                      {snapshot.summary.headline}
                    </h3>
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                      {snapshot.summary.visibilityNote}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="grid grid-cols-3 gap-2 rounded-[20px] border border-border/70 bg-muted/35 p-2">
                    <div className="min-w-20 rounded-[14px] bg-background px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/48">Current</div>
                      <div className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">
                        {snapshot.current.length}
                      </div>
                    </div>
                    <div className="min-w-20 rounded-[14px] bg-background px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/48">Trail</div>
                      <div className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">
                        {snapshot.recent.length}
                      </div>
                    </div>
                    <div className="min-w-20 rounded-[14px] bg-background px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/48">Signals</div>
                      <div className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">
                        {snapshot.signals.length}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={!onRefresh}
                    className="rounded-[14px]"
                  >
                    <RefreshCwIcon className={cn("size-4", loading ? "animate-spin" : "")} />
                    Refresh
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(16rem,0.92fr)]">
                <div className="rounded-[24px] border border-foreground/8 bg-[linear-gradient(145deg,rgba(251,248,240,0.96),rgba(255,255,255,0.86))] p-5">
                  <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42">
                    <SparklesIcon className="size-4" />
                    Selected moment
                  </div>
                  {selected ? (
                    <div className="mt-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[1.2rem] font-semibold tracking-[-0.04em] text-foreground">
                          {selected.title}
                        </span>
                        <Badge variant={statusBadgeVariant(selected.status)}>{selected.status}</Badge>
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">{selected.summary}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-[18px] border border-border/70 bg-background/88 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">Updated</div>
                          <div className="mt-1 text-sm font-medium text-foreground">
                            {formatRelativeTime(selected.updatedAt)}
                          </div>
                        </div>
                        <div className="rounded-[18px] border border-border/70 bg-background/88 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">Tags</div>
                          <div className="mt-1 text-sm font-medium text-foreground">
                            {selected.tags.join(" / ") || "-"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[20px] border border-dashed border-border/80 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
                      当前没有可选中的状态。
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42">
                      Current stage
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-foreground/38">
                      collected {formatTimestamp(snapshot.agent.collectedAt)}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {snapshot.current.length === 0 ? (
                      <div className="rounded-[22px] border border-dashed border-border/80 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
                        当前没有明显活动。
                      </div>
                    ) : (
                      snapshot.current.map((item) => (
                        <StageCard
                          key={item.id}
                          item={item}
                          active={selected?.id === item.id}
                          onSelect={onSelectActivity}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-foreground/10 bg-background/82 p-5 shadow-[0_16px_32px_rgba(17,17,19,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42">
                    Recent trail
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    这里只展示公开可见的近期片段，用来表达最近是否有新的展开。
                  </p>
                </div>
                <Badge variant="outline">{snapshot.recent.length} items</Badge>
              </div>
              <div className="mt-4 rounded-[24px] border border-border/70 bg-muted/18 px-2 py-2">
                {snapshot.recent.length === 0 ? (
                  <div className="rounded-[18px] bg-background/78 px-4 py-5 text-sm text-muted-foreground">
                    暂无近期轨迹。
                  </div>
                ) : (
                  snapshot.recent.map((item) => (
                    <TrailItem
                      key={item.id}
                      item={item}
                      active={selected?.id === item.id}
                      onSelect={onSelectActivity}
                    />
                  ))
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-[28px] border border-foreground/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(241,245,243,0.88))] p-5 shadow-[0_18px_36px_rgba(17,17,19,0.05)]">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42">
                <BotIcon className="size-4" />
                Inspector
              </div>
              <div className="mt-4 rounded-[22px] border border-border/70 bg-background/85 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">Status</div>
                <div className="mt-2 text-base font-semibold tracking-[-0.03em] text-foreground">
                  {snapshot.agent.statusText}
                </div>
              </div>
              <div className="mt-3 rounded-[22px] border border-border/70 bg-background/72 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">Momentum</div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  当前呈现出 <span className="font-medium text-foreground">{snapshot.summary.momentum}</span> 的节奏。
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-foreground/10 bg-background/84 p-5 shadow-[0_16px_32px_rgba(17,17,19,0.05)]">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42">
                <ActivityIcon className="size-4" />
                Public cues
              </div>
              <div className="mt-4 space-y-3">
                {snapshot.signals.map((signal) => (
                  <div
                    key={signal.label}
                    className={cn(
                      "rounded-[20px] border px-4 py-4",
                      signalToneClass(signal),
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">
                      {signal.label}
                    </div>
                    <div className="mt-2 text-base font-semibold tracking-[-0.03em] text-foreground">
                      {signal.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}

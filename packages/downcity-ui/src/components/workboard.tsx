/**
 * Workboard 全局看板组件。
 *
 * 关键点（中文）
 * - 组件展示的是“所有 agents 的公开状态总览”，不是单个 agent 面板。
 * - 布局参考 teamprofile：左侧全景总览，右侧选中详情。
 * - 这里只消费聚合后的公开数据，不负责请求。
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
  DowncityWorkboardAgentItem,
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

function resolveSelectedAgent(params: {
  board: DowncityWorkboardProps["board"];
  selectedAgentId?: string;
}): DowncityWorkboardAgentItem | null {
  const items = params.board?.agents || [];
  if (items.length === 0) return null;
  const explicit = items.find((item) => item.id === params.selectedAgentId);
  return explicit || items[0] || null;
}

function activityIcon(kind: string) {
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

function toneClass(tone: string): string {
  if (tone === "accent") return "border-emerald-200/70 bg-emerald-50/80";
  if (tone === "warning") return "border-amber-300/70 bg-amber-50/85";
  return "border-border/70 bg-background/80";
}

function accentClass(status: string): string {
  if (status === "active") return "bg-emerald-500";
  if (status === "issue") return "bg-rose-500";
  if (status === "waiting") return "bg-stone-400";
  return "bg-amber-500";
}

function AgentNode(props: {
  item: DowncityWorkboardAgentItem;
  active: boolean;
  onSelect?: (agentId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => props.onSelect?.(props.item.id)}
      className={cn(
        "group relative overflow-hidden rounded-[26px] border p-4 text-left transition-all duration-200",
        props.active
          ? "border-foreground/18 bg-[linear-gradient(145deg,rgba(251,248,240,0.96),rgba(255,255,255,0.9))] shadow-[0_18px_34px_rgba(17,17,19,0.08)]"
          : "border-border/70 bg-background/84 hover:-translate-y-1 hover:border-foreground/12 hover:bg-background",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex h-2.5 w-2.5 rounded-full", props.item.running ? "bg-emerald-500" : "bg-stone-400")} />
            <span className="truncate text-[1rem] font-semibold tracking-[-0.03em] text-foreground">
              {props.item.name}
            </span>
          </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">{props.item.headline}</div>
        </div>
        <Badge variant={props.item.running ? "secondary" : "outline"}>
          {props.item.posture}
        </Badge>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-[16px] border border-border/70 bg-muted/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">Now</div>
          <div className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">{props.item.currentCount}</div>
        </div>
        <div className="rounded-[16px] border border-border/70 bg-muted/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">Recent</div>
          <div className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">{props.item.recentCount}</div>
        </div>
        <div className="rounded-[16px] border border-border/70 bg-muted/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">Cues</div>
          <div className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">{props.item.signalCount}</div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.12em] text-foreground/42">
        <span>{props.item.momentum}</span>
        <span>{formatRelativeTime(props.item.collectedAt)}</span>
      </div>
    </button>
  );
}

function ActivityLine(props: { item: DowncityWorkboardActivityItem }) {
  const Icon = activityIcon(props.item.kind);

  return (
    <div className="flex items-start gap-3 rounded-[18px] border border-border/70 bg-background/78 px-3 py-3">
      <span className={cn("mt-1 inline-flex size-8 items-center justify-center rounded-[12px] text-foreground", accentClass(props.item.status))}>
        <Icon className="size-4 text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{props.item.title}</span>
          <Badge variant={statusBadgeVariant(props.item.status)}>{props.item.status}</Badge>
        </div>
        <div className="mt-1 text-sm leading-6 text-muted-foreground">{props.item.summary}</div>
      </div>
    </div>
  );
}

function CueCard(props: { item: DowncityWorkboardSignalItem }) {
  return (
    <div className={cn("rounded-[18px] border px-4 py-4", toneClass(props.item.tone))}>
      <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">{props.item.label}</div>
      <div className="mt-2 text-base font-semibold tracking-[-0.03em] text-foreground">{props.item.value}</div>
    </div>
  );
}

export function Workboard(props: DowncityWorkboardProps) {
  const { board, loading, selectedAgentId, onRefresh, onSelectAgent, className } = props;
  const selected = resolveSelectedAgent({ board, selectedAgentId });

  if (!board) {
    return (
      <Card className={cn("overflow-hidden border border-dashed border-border/80 bg-[linear-gradient(145deg,rgba(247,244,236,0.84),rgba(255,255,255,0.95))]", className)}>
        <CardContent className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">
          {loading ? "正在加载 workboard..." : "当前没有可展示的 workboard 板面。"}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("relative overflow-hidden border border-border/70 bg-[linear-gradient(145deg,rgba(247,244,236,0.95),rgba(255,255,255,0.98)_42%,rgba(229,238,234,0.72))]", className)}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(17,17,19,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(17,17,19,0.03)_1px,transparent_1px)] bg-[size:26px_26px] opacity-30" />
      <div className="pointer-events-none absolute left-6 top-6 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(190,106,40,0.16),transparent_68%)]" />
      <div className="pointer-events-none absolute bottom-4 right-4 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(54,107,96,0.18),transparent_70%)]" />

      <CardContent className="relative p-4 md:p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.22fr)_minmax(22rem,0.78fr)]">
          <section className="space-y-5">
            <div className="rounded-[28px] border border-foreground/10 bg-background/84 p-5 shadow-[0_18px_36px_rgba(17,17,19,0.05)]">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Global public board</Badge>
                    <Badge variant="outline">all agents</Badge>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-[1.55rem] font-semibold tracking-[-0.05em] text-foreground">
                      当前所有 agents 的公开状态总览
                    </h3>
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                      这块板面展示的是每个 agent 对外呈现出的状态、近期变化和公开线索。
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="grid grid-cols-4 gap-2 rounded-[20px] border border-border/70 bg-muted/35 p-2">
                    <div className="min-w-20 rounded-[14px] bg-background px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/48">Agents</div>
                      <div className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">{board.summary.totalAgents}</div>
                    </div>
                    <div className="min-w-20 rounded-[14px] bg-background px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/48">Live</div>
                      <div className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">{board.summary.liveAgents}</div>
                    </div>
                    <div className="min-w-20 rounded-[14px] bg-background px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/48">Active</div>
                      <div className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">{board.summary.activeAgents}</div>
                    </div>
                    <div className="min-w-20 rounded-[14px] bg-background px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/48">Quiet</div>
                      <div className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">{board.summary.quietAgents}</div>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={!onRefresh} className="rounded-[14px]">
                    <RefreshCwIcon className={cn("size-4", loading ? "animate-spin" : "")} />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-foreground/10 bg-background/82 p-5 shadow-[0_16px_32px_rgba(17,17,19,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42">Agents stage</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">点击任一 agent，右侧会展开它当前的公开状态细节。</p>
                </div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-foreground/40">
                  collected {formatTimestamp(board.collectedAt)}
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {board.agents.map((item) => (
                  <AgentNode
                    key={item.id}
                    item={item}
                    active={selected?.id === item.id}
                    onSelect={onSelectAgent}
                  />
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-[28px] border border-foreground/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(241,245,243,0.88))] p-5 shadow-[0_18px_36px_rgba(17,17,19,0.05)]">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42">
                <BotIcon className="size-4" />
                Inspector
              </div>
              {selected ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-[22px] border border-border/70 bg-background/85 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold tracking-[-0.03em] text-foreground">{selected.name}</span>
                      <Badge variant={selected.running ? "secondary" : "outline"}>{selected.posture}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.statusText}</p>
                    <div className="mt-3 text-xs uppercase tracking-[0.12em] text-foreground/42">
                      {selected.momentum} · {formatRelativeTime(selected.collectedAt)}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42">Current public moments</div>
                    {(selected.snapshot.current || []).map((item) => (
                      <ActivityLine key={item.id} item={item} />
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42">Recent fragments</div>
                    {(selected.snapshot.recent || []).length === 0 ? (
                      <div className="rounded-[18px] border border-dashed border-border/80 bg-background/72 px-4 py-4 text-sm text-muted-foreground">
                        暂无近期片段。
                      </div>
                    ) : (
                      (selected.snapshot.recent || []).map((item) => (
                        <ActivityLine key={item.id} item={item} />
                      ))
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42">Public cues</div>
                    {(selected.snapshot.signals || []).map((item) => (
                      <CueCard key={item.label} item={item} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[20px] border border-dashed border-border/80 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
                  当前没有可查看的 agent。
                </div>
              )}
            </div>
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}

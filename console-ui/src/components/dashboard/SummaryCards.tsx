/**
 * Summary 卡片区。
 */

import { Card, CardContent } from "../ui/card";
import type { UiAgentOption, UiOverviewResponse, UiServiceItem } from "../../types/Dashboard";

export interface SummaryCardsProps {
  /**
   * 当前选中 agent。
   */
  selectedAgent: UiAgentOption | null;
  /**
   * 概览数据。
   */
  overview: UiOverviewResponse | null;
  /**
   * service 列表。
   */
  services: UiServiceItem[];
  /**
   * local ui context id。
   */
  localUiContextId: string;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="relative overflow-hidden border-border/70 bg-linear-to-br from-card via-card to-blue-50/40 shadow-sm">
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-blue-200/30 blur-xl" />
      <CardContent className="relative space-y-2 p-4">
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

export function SummaryCards(props: SummaryCardsProps) {
  const { selectedAgent, overview, services, localUiContextId } = props;

  if (!selectedAgent) {
    return (
      <Card className="border-dashed border-border bg-card/60">
        <CardContent className="p-5 text-sm text-muted-foreground">未选择可用 agent</CardContent>
      </Card>
    );
  }

  const contexts = Array.isArray(overview?.contexts?.items) ? overview?.contexts?.items : [];
  const statusCount = overview?.tasks?.statusCount;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Agent"
        value={selectedAgent.name || "-"}
        sub={`pid ${selectedAgent.daemonPid || "-"} · ${selectedAgent.host || "-"}:${selectedAgent.port || "-"}`}
      />
      <StatCard label="Services" value={String(services.length)} sub="runtime services" />
      <StatCard
        label="Tasks"
        value={String(overview?.tasks?.total || 0)}
        sub={`enabled ${statusCount?.enabled || 0} / paused ${statusCount?.paused || 0} / disabled ${statusCount?.disabled || 0}`}
      />
      <StatCard
        label="Contexts"
        value={String(overview?.contexts?.total || 0)}
        sub={`local_ui ${contexts.some((item) => item.contextId === localUiContextId) ? "exists" : "missing"}`}
      />
    </div>
  );
}

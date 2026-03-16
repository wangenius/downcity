/**
 * Agent 概览主区。
 */

import type {
  UiAgentOption,
  UiConfigStatusItem,
  UiOverviewResponse,
  UiServiceItem,
} from "../../types/Dashboard";

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
  /**
   * 配置文件状态列表。
   */
  configStatus: UiConfigStatusItem[];
}

function StatItem({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="space-y-1 border-b border-border/70 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tracking-tight text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

export function SummaryCards(props: SummaryCardsProps) {
  const { selectedAgent, overview, services, localUiContextId, configStatus } = props;

  if (!selectedAgent) {
    return <div className="border-b border-dashed border-border py-6 text-sm text-muted-foreground">未选择可用 agent</div>;
  }

  const contexts = Array.isArray(overview?.contexts?.items) ? overview?.contexts?.items : [];
  const statusCount = overview?.tasks?.statusCount;
  const chatProfiles = Array.isArray(selectedAgent.chatProfiles) ? selectedAgent.chatProfiles : [];
  const agentConfigItems = configStatus.filter((item) => item.scope === "agent");
  const promptFileOrder = [
    "PROFILE.md",
    "SOUL.md",
    "USER.md",
    "Agent ship.json",
    ".ship/schema/ship.schema.json",
    ".ship/memory/index.sqlite",
  ];
  const orderedConfigItems = [
    ...promptFileOrder
      .map((label) => agentConfigItems.find((item) => item.label === label))
      .filter((item): item is UiConfigStatusItem => Boolean(item)),
    ...agentConfigItems.filter((item) => !promptFileOrder.includes(item.label)),
  ];
  const okCount = agentConfigItems.filter((item) => item.status === "ok").length;

  return (
    <div className="space-y-7">
      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Overview</div>
        <div className="grid gap-x-8 md:grid-cols-2 xl:grid-cols-4">
          <StatItem
            label="Agent"
            value={selectedAgent.name || "-"}
            sub={`pid ${selectedAgent.daemonPid || "-"} · ${selectedAgent.host || "-"}:${selectedAgent.port || "-"}`}
          />
          <StatItem label="Services" value={String(services.length)} sub="runtime services" />
          <StatItem
            label="Tasks"
            value={String(overview?.tasks?.total || 0)}
            sub={`enabled ${statusCount?.enabled || 0} / paused ${statusCount?.paused || 0} / disabled ${statusCount?.disabled || 0}`}
          />
          <StatItem
            label="Contexts"
            value={String(overview?.contexts?.total || 0)}
            sub={`local_ui ${contexts.some((item) => item.contextId === localUiContextId) ? "exists" : "missing"}`}
          />
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between border-b border-border/70 pb-2">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Agent Config Files</div>
          <div className="text-xs text-muted-foreground">{`ok ${okCount}/${agentConfigItems.length}`}</div>
        </div>

        {orderedConfigItems.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground">当前未加载到 agent 配置文件状态</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-0 py-2 font-medium">File</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Reason</th>
                  <th className="px-2 py-2 font-medium">Path</th>
                </tr>
              </thead>
              <tbody>
                {orderedConfigItems.map((item) => (
                  <tr key={`${item.scope}:${item.key}:${item.path}`} className="border-b border-border/50">
                    <td className="px-0 py-2 text-sm font-medium text-foreground">{item.label}</td>
                    <td className="px-2 py-2 text-xs text-foreground">{item.status}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{item.reason || "-"}</td>
                    <td className="max-w-[28rem] truncate px-2 py-2 font-mono text-[11px] text-muted-foreground" title={item.path}>
                      {item.path}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="border-b border-border/70 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Agent Chat Channels
        </div>
        {chatProfiles.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground">当前没有已启动的 chat channel</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-0 py-2 font-medium">Channel</th>
                  <th className="px-2 py-2 font-medium">Identity</th>
                  <th className="px-2 py-2 font-medium">Link</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {chatProfiles.map((profile, index) => (
                  <tr key={`${profile.channel || "chat"}-${index}`} className="border-b border-border/50">
                    <td className="px-0 py-2 text-sm font-medium text-foreground">{profile.channel || "-"}</td>
                    <td className="px-2 py-2 text-xs text-foreground">{profile.identity || "-"}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{profile.linkState || "-"}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{profile.statusText || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

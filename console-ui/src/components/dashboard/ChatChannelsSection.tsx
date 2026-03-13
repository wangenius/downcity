/**
 * Chat 渠道状态区。
 */

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import type { UiChatChannelStatus } from "../../types/Dashboard";

export interface ChatChannelsSectionProps {
  /**
   * chat 渠道列表。
   */
  chatChannels: UiChatChannelStatus[];
  /**
   * 状态 -> 徽标变体映射。
   */
  statusBadgeVariant: (status?: string) => "ok" | "warn" | "bad";
  /**
   * 刷新渠道状态。
   */
  onRefresh: () => void;
  /**
   * chat 动作。
   */
  onAction: (action: "test" | "reconnect", channel: string) => void;
}

export function ChatChannelsSection(props: ChatChannelsSectionProps) {
  const { chatChannels, statusBadgeVariant, onRefresh, onAction } = props;

  const badgeClass = (status?: string): string => {
    const tone = statusBadgeVariant(status);
    if (tone === "ok") return "border-emerald-300 text-emerald-700";
    if (tone === "bad") return "border-destructive/40 text-destructive";
    return "border-amber-300 text-amber-700";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat Channels</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onAction("reconnect", "")}>全部重连</Button>
          <Button size="sm" variant="outline" onClick={onRefresh}>刷新连接</Button>
        </div>
      </CardHeader>
      <CardContent>
        {chatChannels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-500">
            暂无 chat 渠道状态
          </div>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Runtime</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chatChannels.map((item) => {
                  const channel = String(item.channel || "unknown");
                  const linkState = String(item.linkState || "unknown");
                  const statusText = String(item.statusText || "unknown");
                  const actionDisabled = !(item.enabled === true && item.configured === true);
                  const runtimeLabel =
                    item.enabled === true
                      ? item.configured === true
                        ? item.running === true
                          ? statusText
                          : "stopped"
                        : "config_missing"
                      : "disabled";

                  return (
                    <TableRow key={channel}>
                      <TableCell className="font-medium">{channel}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={badgeClass(linkState)}>
                          {linkState}
                        </Badge>
                      </TableCell>
                      <TableCell>{runtimeLabel}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionDisabled}
                            onClick={() => onAction("test", channel)}
                          >
                            test
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionDisabled}
                            onClick={() => onAction("reconnect", channel)}
                          >
                            reconnect
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

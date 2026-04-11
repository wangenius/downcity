/**
 * Workboard 主舞台子组件与布局工具。
 *
 * 关键点（中文）
 * - 这里封装 cluster stage / focused cluster stage 的空间化表达。
 * - 逻辑参考 teamprofile：先看全局簇，再进入局部簇内舞台。
 * - 节点只表达位置与存在感，详情统一交给浮动 inspector。
 */

import * as React from "react";
import { ParallaxPxlKitIcon } from "@pxlkit/core";
import { RetroJoystick } from "@pxlkit/parallax";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { WorkboardPixelAgent } from "./workboard-pixel-agent";
import {
  PixelFocusedField,
  PixelHoverTag,
  PixelRoute,
  PixelZoneTiles,
  WORKBOARD_ZONE_LAYOUT,
} from "./workboard-stage-map";
import type { DowncityWorkboardGameMapConfig } from "../types/workboard-game-map";
import type {
  DowncityWorkboardAgentItem,
  DowncityWorkboardProps,
} from "../types/workboard";
import type {
  DowncityWorkboardFocusedStageNode,
  DowncityWorkboardHoverTag,
  DowncityWorkboardMotionFrame,
  DowncityWorkboardStageNode,
  DowncityWorkboardStagePoint,
  DowncityWorkboardZoneAgentPlacement,
  DowncityWorkboardZoneDefinition,
  DowncityWorkboardZoneId,
} from "../types/workboard-stage";

const PIXEL_PANEL_CLIP = "polygon(0 6px,6px 6px,6px 0,calc(100% - 6px) 0,calc(100% - 6px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 6px) calc(100% - 6px),calc(100% - 0px) 100%,6px 100%,6px calc(100% - 6px),0 calc(100% - 6px))";

export const WORKBOARD_STAGE_HEIGHT = 640;
export const WORKBOARD_STAGE_WIDTH = 1000;

const NODE_PLACEMENTS: DowncityWorkboardZoneAgentPlacement[] = [
  { left: 18, top: 26, delay: 0.0 },
  { left: 42, top: 19, delay: 0.4 },
  { left: 66, top: 29, delay: 0.8 },
  { left: 29, top: 54, delay: 1.2 },
  { left: 57, top: 56, delay: 1.6 },
  { left: 75, top: 47, delay: 2.0 },
  { left: 14, top: 70, delay: 2.4 },
  { left: 46, top: 74, delay: 2.8 },
];

const FOCUSED_STATIONS: Array<{ x: number; y: number }> = [
  { x: 212, y: 150 },
  { x: 396, y: 138 },
  { x: 714, y: 162 },
  { x: 166, y: 320 },
  { x: 812, y: 304 },
  { x: 248, y: 510 },
  { x: 486, y: 552 },
  { x: 748, y: 498 },
];

export const WORKBOARD_ZONE_DEFINITIONS: DowncityWorkboardZoneDefinition[] = [
  {
    id: "engaged",
    title: "展开中",
    subtitle: "active field",
    description: "当前对外最有动势的一组 agent。",
    badge: "Live",
    areaClassName:
      "bg-[linear-gradient(145deg,rgba(238,248,244,0.92),rgba(248,251,249,0.78))]",
    borderClassName: "border-emerald-300/65",
    glowClassName:
      "bg-[radial-gradient(circle,rgba(52,144,111,0.18),transparent_70%)]",
    nodeClassName:
      "border-emerald-300/70 bg-[linear-gradient(145deg,rgba(248,252,250,0.98),rgba(235,247,242,0.94))]",
    lineClassName: "stroke-emerald-400/55",
  },
  {
    id: "steady",
    title: "持续推进",
    subtitle: "steady lane",
    description: "处于稳定节奏，持续向前推进的一组 agent。",
    badge: "Steady",
    areaClassName:
      "bg-[linear-gradient(145deg,rgba(244,246,236,0.9),rgba(252,250,244,0.75))]",
    borderClassName: "border-lime-300/60",
    glowClassName:
      "bg-[radial-gradient(circle,rgba(151,169,72,0.16),transparent_72%)]",
    nodeClassName:
      "border-lime-300/65 bg-[linear-gradient(145deg,rgba(252,252,247,0.98),rgba(243,246,233,0.95))]",
    lineClassName: "stroke-lime-400/50",
  },
  {
    id: "quiet",
    title: "静候中",
    subtitle: "quiet deck",
    description: "暂时安静、等待下一次触发的一组 agent。",
    badge: "Quiet",
    areaClassName:
      "bg-[linear-gradient(145deg,rgba(244,243,239,0.92),rgba(251,250,248,0.76))]",
    borderClassName: "border-stone-300/65",
    glowClassName:
      "bg-[radial-gradient(circle,rgba(130,124,112,0.14),transparent_72%)]",
    nodeClassName:
      "border-stone-300/65 bg-[linear-gradient(145deg,rgba(252,251,249,0.98),rgba(241,239,234,0.96))]",
    lineClassName: "stroke-stone-400/50",
  },
  {
    id: "drift",
    title: "轻微波动",
    subtitle: "watch deck",
    description: "出现中断、告警或需要重新观察的一组 agent。",
    badge: "Watch",
    areaClassName:
      "bg-[linear-gradient(145deg,rgba(251,241,235,0.92),rgba(252,248,244,0.76))]",
    borderClassName: "border-amber-300/70",
    glowClassName:
      "bg-[radial-gradient(circle,rgba(194,121,55,0.18),transparent_72%)]",
    nodeClassName:
      "border-amber-300/70 bg-[linear-gradient(145deg,rgba(253,250,245,0.98),rgba(249,239,229,0.95))]",
    lineClassName: "stroke-amber-400/55",
  },
];

function createHoverTag(params: {
  id: string;
  label: string;
  point: DowncityWorkboardStagePoint;
}): DowncityWorkboardHoverTag {
  return {
    id: params.id,
    label: params.label,
    x: params.point.x,
    y: params.point.y,
  };
}

function resolveStagePoint(params: {
  agentId: string;
  fallback: DowncityWorkboardStagePoint;
  motionFrames?: Record<string, DowncityWorkboardMotionFrame>;
}): DowncityWorkboardStagePoint {
  return params.motionFrames?.[params.agentId] || params.fallback;
}

function ActiveSpeechBubble(props: {
  item: DowncityWorkboardAgentItem | null;
  point: DowncityWorkboardStagePoint | null;
}) {
  if (!props.item || !props.point) {
    return null;
  }

  const line =
    props.item.snapshot.current[0]?.summary ||
    props.item.snapshot.recent[0]?.summary ||
    props.item.headline;

  return (
    <div
      className="pointer-events-none absolute z-30 max-w-[22rem] border-2 border-border/70 bg-[rgba(255,252,247,0.96)] px-3 py-2 text-sm shadow-[0_3px_0_rgba(17,17,19,0.12)]"
      style={{
        left: Math.min(Math.max(props.point.x + 28, 48), WORKBOARD_STAGE_WIDTH - 260),
        top: Math.min(Math.max(props.point.y - 74, 20), WORKBOARD_STAGE_HEIGHT - 72),
        clipPath: PIXEL_PANEL_CLIP,
      }}
    >
      <p className="text-[10px] uppercase tracking-[0.14em] text-foreground/44">
        {props.item.name} · {props.item.posture}
      </p>
      <p className="mt-1 leading-6 text-foreground">“{line}”</p>
      <span className="absolute -bottom-[10px] left-4 block h-[10px] w-[14px] border-x-2 border-b-2 border-border/70 bg-[rgba(255,252,247,0.96)]" />
    </div>
  );
}

export function resolveZoneId(item: DowncityWorkboardAgentItem): DowncityWorkboardZoneId {
  const hasIssue =
    item.snapshot.current.some((entry) => entry.status === "issue") ||
    item.snapshot.recent.some((entry) => entry.status === "issue") ||
    item.snapshot.signals.some((entry) => entry.tone === "warning");
  if (hasIssue) return "drift";

  const hasActive = item.snapshot.current.some((entry) => entry.status === "active");
  if (hasActive) return "engaged";

  const hasRecentMotion =
    item.running &&
    (item.snapshot.current.length > 0 || item.snapshot.recent.length > 0 || item.currentCount > 0);
  if (hasRecentMotion) return "steady";

  return "quiet";
}

export function resolveZoneDefinition(
  zoneId: DowncityWorkboardZoneId,
): DowncityWorkboardZoneDefinition {
  return WORKBOARD_ZONE_DEFINITIONS.find((item) => item.id === zoneId) || WORKBOARD_ZONE_DEFINITIONS[0];
}

export function formatWorkboardRelativeTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const delta = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(delta / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function buildWorkboardCurvePath(params: {
  from: { x: number; y: number };
  to: { x: number; y: number };
}): string {
  const midX = params.from.x + (params.to.x - params.from.x) * 0.5;
  return `M ${params.from.x} ${params.from.y} C ${midX} ${params.from.y}, ${midX} ${params.to.y}, ${params.to.x} ${params.to.y}`;
}

export function toStagePoint(
  zoneId: DowncityWorkboardZoneId,
  placement: DowncityWorkboardZoneAgentPlacement,
): DowncityWorkboardStagePoint {
  const zone = WORKBOARD_ZONE_LAYOUT[zoneId];
  const left = zone.x + (zone.w * placement.left) / 100;
  const top = zone.y + (zone.h * placement.top) / 100;
  return {
    x: (left / 100) * WORKBOARD_STAGE_WIDTH,
    y: (top / 100) * WORKBOARD_STAGE_HEIGHT,
  };
}

export function toZoneHubPoint(zoneId: DowncityWorkboardZoneId): DowncityWorkboardStagePoint {
  const zone = WORKBOARD_ZONE_LAYOUT[zoneId];
  return {
    x: (zone.hubX / 100) * WORKBOARD_STAGE_WIDTH,
    y: (zone.hubY / 100) * WORKBOARD_STAGE_HEIGHT,
  };
}

export function deriveStageNodes(
  board: DowncityWorkboardProps["board"],
): DowncityWorkboardStageNode[] {
  const items = board?.agents || [];
  const buckets = new Map<DowncityWorkboardZoneId, DowncityWorkboardAgentItem[]>();

  items.forEach((item) => {
    const zoneId = resolveZoneId(item);
    const group = buckets.get(zoneId) || [];
    group.push(item);
    buckets.set(zoneId, group);
  });

  return WORKBOARD_ZONE_DEFINITIONS.flatMap((zone) => {
    const group = buckets.get(zone.id) || [];
    return group.map((item, index) => ({
      item,
      zone,
      placement: NODE_PLACEMENTS[index % NODE_PLACEMENTS.length],
    }));
  });
}

export function deriveFocusedClusterNodes(
  items: DowncityWorkboardAgentItem[],
): DowncityWorkboardFocusedStageNode[] {
  return items.map((item, index) => {
    const station = FOCUSED_STATIONS[index % FOCUSED_STATIONS.length];
    return {
      item,
      x: station.x,
      y: station.y,
      delay: index * 0.18,
    };
  });
}

export function buildOverviewPatrolRoute(params: {
  zoneId: DowncityWorkboardZoneId;
  placement: DowncityWorkboardZoneAgentPlacement;
}): DowncityWorkboardStagePoint[] {
  const anchor = toStagePoint(params.zoneId, params.placement);
  const hub = toZoneHubPoint(params.zoneId);
  const laneIndex = Math.round((params.placement.left + params.placement.top) / 32) % 3;

  if (params.zoneId === "engaged") {
    const corridors = [
      [
        { x: 188, y: 110 },
        { x: 256, y: 110 },
        { x: 320, y: 110 },
      ],
      [
        { x: 164, y: 178 },
        { x: 240, y: 178 },
        { x: 316, y: 178 },
      ],
      [
        { x: 168, y: 246 },
        { x: 242, y: 246 },
        { x: 308, y: 246 },
      ],
    ][laneIndex];
    return [hub, ...corridors, anchor, { x: anchor.x - 16, y: anchor.y + 10 }];
  }

  if (params.zoneId === "steady") {
    const corridors = [
      [
        { x: 520, y: 116 },
        { x: 600, y: 116 },
        { x: 686, y: 116 },
      ],
      [
        { x: 544, y: 176 },
        { x: 620, y: 176 },
        { x: 700, y: 176 },
      ],
      [
        { x: 560, y: 236 },
        { x: 636, y: 236 },
        { x: 708, y: 236 },
      ],
    ][laneIndex];
    return [hub, ...corridors, anchor, { x: anchor.x - 12, y: anchor.y + 12 }];
  }

  if (params.zoneId === "quiet") {
    const corridors = [
      [
        { x: 138, y: 368 },
        { x: 138, y: 430 },
        { x: 138, y: 492 },
      ],
      [
        { x: 214, y: 382 },
        { x: 214, y: 448 },
        { x: 214, y: 510 },
      ],
      [
        { x: 286, y: 396 },
        { x: 286, y: 456 },
        { x: 286, y: 518 },
      ],
    ][laneIndex];
    return [hub, ...corridors, anchor, { x: anchor.x + 10, y: anchor.y - 12 }];
  }

  const corridors = [
    [
      { x: 546, y: 370 },
      { x: 620, y: 370 },
      { x: 700, y: 370 },
      { x: 782, y: 370 },
    ],
    [
      { x: 560, y: 442 },
      { x: 638, y: 442 },
      { x: 720, y: 442 },
      { x: 806, y: 442 },
    ],
    [
      { x: 574, y: 514 },
      { x: 654, y: 514 },
      { x: 736, y: 514 },
      { x: 818, y: 514 },
    ],
  ][laneIndex];
  return [hub, ...corridors, anchor, { x: anchor.x - 12, y: anchor.y - 10 }];
}

export function buildFocusedPatrolRoute(params: {
  index: number;
}): DowncityWorkboardStagePoint[] {
  const lane = params.index % 3;
  if (lane === 0) {
    return [
      { x: 184, y: 156 },
      { x: 422, y: 150 },
      { x: 642, y: 150 },
      { x: 786, y: 202 },
      { x: 802, y: 332 },
      { x: 704, y: 488 },
      { x: 472, y: 528 },
      { x: 244, y: 490 },
      { x: 168, y: 352 },
      { x: 176, y: 212 },
    ];
  }

  if (lane === 1) {
    return [
      { x: 292, y: 236 },
      { x: 438, y: 216 },
      { x: 594, y: 224 },
      { x: 676, y: 298 },
      { x: 656, y: 402 },
      { x: 530, y: 454 },
      { x: 384, y: 432 },
      { x: 300, y: 344 },
    ];
  }

  return [
    { x: 220, y: 320 },
    { x: 320, y: 286 },
    { x: 504, y: 286 },
    { x: 688, y: 312 },
    { x: 748, y: 388 },
    { x: 620, y: 470 },
    { x: 406, y: 486 },
    { x: 260, y: 430 },
  ];
}

export function WorkboardStageZone(props: {
  zone: DowncityWorkboardZoneDefinition;
  count: number;
  active: boolean;
  onSelect?: (zoneId: DowncityWorkboardZoneId) => void;
  onHoverChange?: (tag: DowncityWorkboardHoverTag | null) => void;
}) {
  const layout = WORKBOARD_ZONE_LAYOUT[props.zone.id];
  const hubPoint = {
    x: (layout.hubX / 100) * WORKBOARD_STAGE_WIDTH,
    y: (layout.hubY / 100) * WORKBOARD_STAGE_HEIGHT,
  };

  return (
    <button
      type="button"
      onClick={() => props.onSelect?.(props.zone.id)}
      onMouseEnter={() =>
        props.onHoverChange?.(
          createHoverTag({
            id: `zone-${props.zone.id}`,
            label: `${props.zone.title} · ${props.count}`,
            point: { x: hubPoint.x + 24, y: hubPoint.y - 18 },
          }),
        )
      }
      onMouseLeave={() => props.onHoverChange?.(null)}
      onFocus={() =>
        props.onHoverChange?.(
          createHoverTag({
            id: `zone-${props.zone.id}`,
            label: `${props.zone.title} · ${props.count}`,
            point: { x: hubPoint.x + 24, y: hubPoint.y - 18 },
          }),
        )
      }
      onBlur={() => props.onHoverChange?.(null)}
      className={cn(
        "absolute z-10 bg-transparent text-left transition-all duration-300 focus:outline-none",
        props.active
          ? "shadow-[inset_0_0_0_2px_rgba(17,17,19,0.18)]"
          : "hover:shadow-[inset_0_0_0_2px_rgba(17,17,19,0.12)]",
      )}
      aria-label={`${props.zone.title} ${props.count}`}
      style={{
        left: `${layout.x}%`,
        top: `${layout.y}%`,
        width: `${layout.w}%`,
        height: `${layout.h}%`,
        clipPath: "polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) calc(100% - 16px),calc(100% - 16px) 100%,0 100%)",
      }}
    />
  );
}

export function WorkboardStageAgentNode(props: {
  item: DowncityWorkboardAgentItem;
  zone: DowncityWorkboardZoneDefinition;
  point: DowncityWorkboardStagePoint | DowncityWorkboardMotionFrame;
  active: boolean;
  faded: boolean;
  mode: "overview" | "focused";
  onSelect?: (agentId: string) => void;
  onHoverChange?: (tag: DowncityWorkboardHoverTag | null) => void;
}) {
  const compact = props.mode === "overview";
  const avatarSize = compact ? 28 : 36;
  const direction = "direction" in props.point ? props.point.direction : undefined;
  const walking = "state" in props.point ? props.point.state === "walking" : false;

  return (
    <button
      type="button"
      onClick={() => props.onSelect?.(props.item.id)}
      onMouseEnter={() =>
        props.onHoverChange?.(
          createHoverTag({
            id: `agent-${props.item.id}`,
            label: `${props.item.name} · ${props.item.posture}`,
            point: props.point,
          }),
        )
      }
      onMouseLeave={() => props.onHoverChange?.(null)}
      onFocus={() =>
        props.onHoverChange?.(
          createHoverTag({
            id: `agent-${props.item.id}`,
            label: `${props.item.name} · ${props.item.posture}`,
            point: props.point,
          }),
        )
      }
      onBlur={() => props.onHoverChange?.(null)}
      className={cn(
        "group absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 focus:outline-none",
        props.active
          ? "scale-[1.08]"
          : "hover:scale-[1.04] focus-visible:scale-[1.04]",
        props.faded ? "opacity-30 saturate-50" : "opacity-100",
      )}
      style={{
        left: props.point.x,
        top: props.point.y,
      }}
      aria-label={props.item.name}
    >
      <span className="relative block">
        {props.active ? (
          <>
            <span
              className="pointer-events-none absolute -inset-2 border border-foreground/45"
              style={{ animation: "workboard-pulse 1.6s steps(2, end) infinite" }}
            />
            <span className="pointer-events-none absolute -left-1 -top-1 h-1.5 w-1.5 bg-foreground/70" />
            <span className="pointer-events-none absolute -right-1 -bottom-1 h-1.5 w-1.5 bg-foreground/60" />
          </>
        ) : null}
        {!props.active && !props.faded ? (
          <span className="pointer-events-none absolute -inset-1 border border-foreground/22 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />
        ) : null}
        <WorkboardPixelAgent
          agentId={props.item.id}
          name={props.item.name}
          size={avatarSize}
          active={props.active}
          faded={props.faded}
          direction={direction}
          walking={walking}
          className={cn(
            props.active ? "shadow-[0_0_0_1px_rgba(17,17,19,0.14),0_3px_0_rgba(17,17,19,0.22)]" : "",
            compact ? "" : "scale-[1.03]",
          )}
        />
        <span
          className={cn(
            "absolute -bottom-1 -right-1 inline-flex size-2.5 rounded-full border border-[rgba(255,252,247,0.88)]",
            props.item.running ? "bg-emerald-500" : "bg-stone-400",
          )}
        />
      </span>
    </button>
  );
}

export function FocusedClusterStage(props: {
  zone: DowncityWorkboardZoneDefinition;
  items: DowncityWorkboardAgentItem[];
  gameMap: DowncityWorkboardGameMapConfig;
  selectedAgentId?: string;
  motionFrames?: Record<string, DowncityWorkboardMotionFrame>;
  flowMode: "cruise" | "turbo";
  onBack?: () => void;
  onSelectAgent?: (agentId: string) => void;
}) {
  const [hoveredTag, setHoveredTag] = React.useState<DowncityWorkboardHoverTag | null>(null);
  const hubPoint = React.useMemo(
    () =>
      props.gameMap.pointsOfInterest.find((item) => item.kind === "hub") || {
        id: `${props.zone.id}-hub-fallback`,
        kind: "hub" as const,
        x: WORKBOARD_STAGE_WIDTH / 2,
        y: WORKBOARD_STAGE_HEIGHT / 2,
      },
    [props.gameMap.pointsOfInterest, props.zone.id],
  );
  const center = { x: hubPoint.x, y: hubPoint.y };
  const focusedNodes = React.useMemo(
    () =>
      props.gameMap.actors
        .filter((actor) => actor.zoneId === props.zone.id && actor.focusedAnchor)
        .map((actor) => ({
          item: actor.agent,
          x: actor.focusedAnchor?.x || hubPoint.x,
          y: actor.focusedAnchor?.y || hubPoint.y,
          delay: 0,
          routeId: actor.focusedRouteId,
        })),
    [hubPoint.x, hubPoint.y, props.gameMap.actors, props.zone.id],
  );
  const activeItem = React.useMemo(
    () => props.items.find((item) => item.id === props.selectedAgentId) || props.items[0] || null,
    [props.items, props.selectedAgentId],
  );
  const activePoint = React.useMemo(() => {
    if (!activeItem) {
      return null;
    }

    const node = focusedNodes.find((entry) => entry.item.id === activeItem.id);
    if (!node) {
      return null;
    }

    return resolveStagePoint({
      agentId: node.item.id,
      fallback: { x: node.x, y: node.y },
      motionFrames: props.motionFrames,
    });
  }, [activeItem, focusedNodes, props.motionFrames]);

  return (
    <div
      className={cn(
        "relative overflow-hidden border-2 bg-[linear-gradient(145deg,rgba(251,250,247,0.96),rgba(245,248,245,0.88))]",
        props.zone.borderClassName,
      )}
      style={{ height: WORKBOARD_STAGE_HEIGHT, clipPath: PIXEL_PANEL_CLIP }}
    >
      <PixelFocusedField
        zone={props.zone}
        stageWidth={WORKBOARD_STAGE_WIDTH}
        stageHeight={WORKBOARD_STAGE_HEIGHT}
        pointsOfInterest={props.gameMap.pointsOfInterest}
        areaLabels={props.gameMap.areaLabels}
      />
      <div className={cn("pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2", props.zone.glowClassName)} />
      <PixelZoneTiles zone={props.zone} />

      <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="rounded-none border-2 bg-[rgba(255,252,247,0.92)] shadow-[0_2px_0_rgba(17,17,19,0.12)]" onClick={props.onBack}>
          <ArrowLeftIcon className="size-4" />
          Back to atlas
        </Button>
        <div className="border-2 border-border/70 bg-background/82 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-foreground/50" style={{ clipPath: PIXEL_PANEL_CLIP }}>
          {props.zone.subtitle}
        </div>
      </div>

      <div className="absolute right-3 top-3 z-20 border-2 border-border/70 bg-background/82 px-3 py-2 text-right" style={{ clipPath: PIXEL_PANEL_CLIP }}>
        <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/42">flow</div>
        <div className="mt-1 text-sm font-semibold text-foreground">{props.flowMode}</div>
      </div>

      <svg
        viewBox={`0 0 ${WORKBOARD_STAGE_WIDTH} ${WORKBOARD_STAGE_HEIGHT}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {props.gameMap.patrols.map((route) => {
          return (
            <PixelRoute
              key={route.id}
              points={route.points}
              className={cn("stroke-foreground/10", route.active ? "opacity-100" : "opacity-70")}
              dashed
            />
          );
        })}
        {focusedNodes.map((node) => (
          <g key={`focused-station-${node.item.id}`} opacity={props.selectedAgentId === node.item.id ? 0.86 : 0.42}>
            <rect
              x={node.x - 8}
              y={node.y - 8}
              width="16"
              height="16"
              fill="rgba(255,252,247,0.9)"
              stroke="rgba(17,17,19,0.34)"
              strokeWidth="2"
            />
            <rect
              x={node.x - 3}
              y={node.y - 3}
              width="6"
              height="6"
              fill="rgba(17,17,19,0.28)"
            />
          </g>
        ))}
        {focusedNodes.map((node) => {
          const point = resolveStagePoint({
            agentId: node.item.id,
            fallback: { x: node.x, y: node.y },
            motionFrames: props.motionFrames,
          });
          const path = buildWorkboardCurvePath({
            from: center,
            to: point,
          });

          return (
            <path
              key={`focused-line-${node.item.id}`}
              d={path}
              fill="none"
              className={cn(
                props.zone.lineClassName,
                props.selectedAgentId === node.item.id ? "opacity-78" : "opacity-34",
              )}
              strokeWidth={props.selectedAgentId === node.item.id ? 2.8 : 1.5}
              strokeDasharray={props.selectedAgentId === node.item.id ? "6 8" : "4 10"}
              style={{
                animation: `workboard-dash ${props.flowMode === "turbo" ? "1.6s" : "2.8s"} linear infinite`,
              }}
            />
          );
        })}
      </svg>

      <div
        className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
        style={{ left: hubPoint.x, top: hubPoint.y }}
      >
        <div className="relative grid h-14 w-14 place-items-center border-2 border-border/70 bg-[rgba(255,252,247,0.92)] shadow-[0_4px_0_rgba(17,17,19,0.14)]">
          <ParallaxPxlKitIcon
            icon={RetroJoystick}
            size={34}
            colorful
            strength={10}
            perspective={220}
            className="pointer-events-auto"
            interactive={false}
            aria-label={`${props.zone.title} hub`}
          />
        </div>
      </div>

      <div
        className="pointer-events-none absolute z-20 -translate-x-1/2"
        style={{ left: hubPoint.x, top: hubPoint.y - 92 }}
      >
        <div className="border-2 border-border/70 bg-[rgba(255,252,247,0.94)] px-3 py-1.5 text-center shadow-[0_3px_0_rgba(17,17,19,0.12)]" style={{ clipPath: PIXEL_PANEL_CLIP }}>
          <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/44">{props.zone.badge}</div>
          <div className="mt-1 text-sm font-semibold tracking-[-0.04em] text-foreground">{props.zone.title}</div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute z-20 border-2 border-border/70 bg-[rgba(255,252,247,0.94)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-foreground/56 shadow-[0_3px_0_rgba(17,17,19,0.12)]"
        style={{ left: hubPoint.x + 38, top: hubPoint.y + 18, clipPath: PIXEL_PANEL_CLIP }}
      >
        agents {props.items.length}
      </div>

      {focusedNodes.map((node) => {
        const point = resolveStagePoint({
          agentId: node.item.id,
          fallback: { x: node.x, y: node.y },
          motionFrames: props.motionFrames,
        });

        return (
          <WorkboardStageAgentNode
            key={`focused-node-${node.item.id}`}
            item={node.item}
            zone={props.zone}
            point={point}
            active={props.selectedAgentId === node.item.id}
            faded={false}
            mode="focused"
            onSelect={props.onSelectAgent}
            onHoverChange={setHoveredTag}
          />
        );
      })}

      <ActiveSpeechBubble item={activeItem} point={activePoint} />
      <svg
        viewBox={`0 0 ${WORKBOARD_STAGE_WIDTH} ${WORKBOARD_STAGE_HEIGHT}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <PixelHoverTag tag={hoveredTag} stageWidth={WORKBOARD_STAGE_WIDTH} stageHeight={WORKBOARD_STAGE_HEIGHT} />
      </svg>
    </div>
  );
}

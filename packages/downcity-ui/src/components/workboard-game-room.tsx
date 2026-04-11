/**
 * Workboard 游戏化 cluster room 场景。
 *
 * 关键点（中文）
 * - 这里对应 teamprofile 的局部地图层，进入某个状态簇后只渲染这个 room。
 * - room 不再包含返回按钮、普通工具条等 dashboard chrome，控制行为交给上层 HUD。
 * - agent 以 sprite 的方式在 station 与 patrol lane 之间巡游，右侧 codex log 负责详情。
 */

import * as React from "react";
import { ParallaxPxlKitIcon } from "@pxlkit/core";
import { RetroJoystick } from "@pxlkit/parallax";
import { cn } from "../lib/utils";
import {
  PixelFocusedField,
  PixelHoverTag,
  PixelRoute,
  PixelZoneTiles,
} from "./workboard-stage-map";
import {
  WORKBOARD_STAGE_HEIGHT,
  WORKBOARD_STAGE_WIDTH,
  WorkboardStageAgentNode,
  buildWorkboardCurvePath,
} from "./workboard-stage";
import type {
  DowncityWorkboardActivityItem,
  DowncityWorkboardAgentItem,
} from "../types/workboard";
import type { DowncityWorkboardGameRoomProps } from "../types/workboard-game-ui";
import type {
  DowncityWorkboardHoverTag,
  DowncityWorkboardMotionFrame,
  DowncityWorkboardStagePoint,
} from "../types/workboard-stage";

const PIXEL_PANEL_CLIP = "polygon(0 6px,6px 6px,6px 0,calc(100% - 6px) 0,calc(100% - 6px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 6px) calc(100% - 6px),calc(100% - 0px) 100%,6px 100%,6px calc(100% - 6px),0 calc(100% - 6px))";

function resolveRoomPoint(params: {
  agentId: string;
  fallback: DowncityWorkboardStagePoint;
  motionFrames?: Record<string, DowncityWorkboardMotionFrame>;
}): DowncityWorkboardStagePoint | DowncityWorkboardMotionFrame {
  return params.motionFrames?.[params.agentId] || params.fallback;
}

function ActiveSpeechBubble(props: {
  item: DowncityWorkboardAgentItem | null;
  point: DowncityWorkboardStagePoint | DowncityWorkboardMotionFrame | null;
}) {
  if (!props.item || !props.point) return null;

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

/**
 * 从公开快照中提取 room 内的任务条目。
 */
function resolveQuestEntries(item: DowncityWorkboardAgentItem | null): DowncityWorkboardActivityItem[] {
  if (!item) return [];

  return [...item.snapshot.current, ...item.snapshot.recent].slice(0, 3);
}

/**
 * 渲染 room 左下角的像素任务栏。
 */
function WorkboardRoomQuestLedger(props: {
  item: DowncityWorkboardAgentItem | null;
}) {
  const entries = resolveQuestEntries(props.item);

  return (
    <div
      className="absolute bottom-20 left-3 z-20 w-64 border-2 border-border/70 bg-[rgba(255,252,247,0.9)] px-3 py-2 shadow-[0_3px_0_rgba(17,17,19,0.12)]"
      style={{ clipPath: PIXEL_PANEL_CLIP }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/42">quest ledger</div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/42">
          {props.item ? props.item.posture : "empty"}
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        {entries.length > 0 ? (
          entries.map((entry, index) => (
            <div key={entry.id} className="grid grid-cols-[1.5rem_1fr] gap-2 text-xs">
              <span className="grid h-5 place-items-center border border-foreground/24 bg-background/70 text-[9px] font-semibold text-foreground/56">
                Q{index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold leading-5 text-foreground">{entry.title}</span>
                <span className="block truncate text-[11px] leading-4 text-foreground/48">{entry.status}</span>
              </span>
            </div>
          ))
        ) : (
          <div className="text-xs leading-5 text-foreground/48">No public quest beats in this room.</div>
        )}
      </div>
    </div>
  );
}

/**
 * 渲染 room 右下角的小地图，帮助用户理解 station 与当前 sprite 的位置。
 */
function WorkboardRoomMiniMap(props: {
  activePoint: DowncityWorkboardStagePoint | DowncityWorkboardMotionFrame | null;
  activeItemId?: string;
  nodes: Array<{ item: DowncityWorkboardAgentItem; x: number; y: number }>;
}) {
  const miniWidth = 132;
  const miniHeight = 84;
  const scaleX = miniWidth / WORKBOARD_STAGE_WIDTH;
  const scaleY = miniHeight / WORKBOARD_STAGE_HEIGHT;

  return (
    <div
      className="absolute bottom-20 right-3 z-20 border-2 border-border/70 bg-[rgba(255,252,247,0.9)] p-2 shadow-[0_3px_0_rgba(17,17,19,0.12)]"
      style={{ clipPath: PIXEL_PANEL_CLIP }}
      aria-hidden="true"
    >
      <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-foreground/42">mini map</div>
      <svg width={miniWidth} height={miniHeight} viewBox={`0 0 ${miniWidth} ${miniHeight}`} shapeRendering="crispEdges">
        <rect x="0" y="0" width={miniWidth} height={miniHeight} fill="rgba(236,232,224,0.5)" />
        <rect x="6" y="6" width={miniWidth - 12} height={miniHeight - 12} fill="rgba(255,252,247,0.82)" stroke="rgba(17,17,19,0.22)" strokeWidth="2" />
        <line x1="12" y1={miniHeight / 2} x2={miniWidth - 12} y2={miniHeight / 2} stroke="rgba(17,17,19,0.12)" strokeWidth="2" />
        <line x1={miniWidth / 2} y1="12" x2={miniWidth / 2} y2={miniHeight - 12} stroke="rgba(17,17,19,0.12)" strokeWidth="2" />
        {props.nodes.map((node) => {
          const active = node.item.id === props.activeItemId;
          return (
            <rect
              key={node.item.id}
              x={Math.max(8, Math.min(miniWidth - 10, node.x * scaleX))}
              y={Math.max(8, Math.min(miniHeight - 10, node.y * scaleY))}
              width={active ? 6 : 4}
              height={active ? 6 : 4}
              fill={active ? "rgba(17,17,19,0.78)" : "rgba(17,17,19,0.34)"}
            />
          );
        })}
        {props.activePoint ? (
          <rect
            x={Math.max(8, Math.min(miniWidth - 12, props.activePoint.x * scaleX)) - 3}
            y={Math.max(8, Math.min(miniHeight - 12, props.activePoint.y * scaleY)) - 3}
            width="10"
            height="10"
            fill="none"
            stroke="rgba(17,17,19,0.72)"
            strokeWidth="2"
          />
        ) : null}
      </svg>
    </div>
  );
}

/**
 * 渲染进入某个状态簇后的局部游戏房间。
 */
export function WorkboardGameRoom(props: DowncityWorkboardGameRoomProps) {
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
  const roomNodes = React.useMemo(
    () =>
      props.gameMap.actors
        .filter((actor) => actor.zoneId === props.zone.id && actor.focusedAnchor)
        .map((actor) => ({
          item: actor.agent,
          x: actor.focusedAnchor?.x || hubPoint.x,
          y: actor.focusedAnchor?.y || hubPoint.y,
          routeId: actor.focusedRouteId,
        })),
    [hubPoint.x, hubPoint.y, props.gameMap.actors, props.zone.id],
  );
  const activeItem = React.useMemo(
    () => props.items.find((item) => item.id === props.selectedAgentId) || props.items[0] || null,
    [props.items, props.selectedAgentId],
  );
  const activeNode = React.useMemo(
    () => (activeItem ? roomNodes.find((entry) => entry.item.id === activeItem.id) || null : null),
    [activeItem, roomNodes],
  );
  const activePoint = React.useMemo(() => {
    if (!activeItem || !activeNode) return null;

    return resolveRoomPoint({
      agentId: activeNode.item.id,
      fallback: { x: activeNode.x, y: activeNode.y },
      motionFrames: props.motionFrames,
    });
  }, [activeItem, activeNode, props.motionFrames]);

  return (
    <div
      className={cn(
        "relative overflow-hidden border-2 bg-[linear-gradient(145deg,rgba(251,250,247,0.96),rgba(245,248,245,0.88))]",
        props.zone.borderClassName,
      )}
      style={{ width: WORKBOARD_STAGE_WIDTH, height: WORKBOARD_STAGE_HEIGHT, clipPath: PIXEL_PANEL_CLIP, imageRendering: "pixelated" }}
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

      <div
        className="absolute left-3 top-3 z-20 border-2 border-border/70 bg-background/82 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-foreground/50"
        style={{ clipPath: PIXEL_PANEL_CLIP }}
      >
        {props.zone.subtitle}
      </div>
      <div
        className="absolute right-3 top-3 z-20 border-2 border-border/70 bg-background/82 px-3 py-2 text-right"
        style={{ clipPath: PIXEL_PANEL_CLIP }}
      >
        <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/42">room flow</div>
        <div className="mt-1 text-sm font-semibold text-foreground">{props.flowMode}</div>
      </div>

      <svg
        viewBox={`0 0 ${WORKBOARD_STAGE_WIDTH} ${WORKBOARD_STAGE_HEIGHT}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {props.gameMap.patrols.map((route) => (
          <PixelRoute
            key={route.id}
            points={route.points}
            className={cn("stroke-foreground/10", route.active ? "opacity-100" : "opacity-70")}
            dashed
          />
        ))}
        {activePoint ? (
          <g>
            <path
              d={buildWorkboardCurvePath({ from: center, to: activePoint })}
              fill="none"
              className={props.zone.lineClassName}
              strokeWidth="7"
              strokeOpacity="0.16"
              strokeLinecap="square"
            />
            <rect
              x={activePoint.x - 14}
              y={activePoint.y - 14}
              width="28"
              height="28"
              fill="none"
              className={props.zone.lineClassName}
              strokeWidth="2"
              strokeDasharray="4 5"
              style={{ animation: "workboard-dash 1.5s linear infinite" }}
            />
            <rect
              x={center.x - 7}
              y={center.y - 7}
              width="14"
              height="14"
              fill="none"
              className={props.zone.lineClassName}
              strokeWidth="2"
              strokeOpacity="0.72"
            />
          </g>
        ) : null}
        {roomNodes.map((node, index) => (
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
            <rect x={node.x - 3} y={node.y - 3} width="6" height="6" fill="rgba(17,17,19,0.28)" />
            <text
              x={node.x + 12}
              y={node.y + 4}
              fill="rgba(17,17,19,0.56)"
              fontSize="9"
              fontWeight="700"
              fontFamily="var(--font-geist-mono, var(--font-sans))"
            >
              S{index + 1}
            </text>
          </g>
        ))}
        {roomNodes.map((node) => {
          const point = resolveRoomPoint({
            agentId: node.item.id,
            fallback: { x: node.x, y: node.y },
            motionFrames: props.motionFrames,
          });
          const path = buildWorkboardCurvePath({ from: center, to: point });

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
        <div
          className="border-2 border-border/70 bg-[rgba(255,252,247,0.94)] px-3 py-1.5 text-center shadow-[0_3px_0_rgba(17,17,19,0.12)]"
          style={{ clipPath: PIXEL_PANEL_CLIP }}
        >
          <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/44">{props.zone.badge}</div>
          <div className="mt-1 text-sm font-semibold tracking-[-0.04em] text-foreground">{props.zone.title}</div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute z-20 border-2 border-border/70 bg-[rgba(255,252,247,0.94)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-foreground/56 shadow-[0_3px_0_rgba(17,17,19,0.12)]"
        style={{ left: hubPoint.x + 38, top: hubPoint.y + 18, clipPath: PIXEL_PANEL_CLIP }}
      >
        sprites {props.items.length}
      </div>

      {roomNodes.map((node) => {
        const point = resolveRoomPoint({
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

      <WorkboardRoomQuestLedger item={activeItem} />
      <WorkboardRoomMiniMap activePoint={activePoint} activeItemId={activeItem?.id} nodes={roomNodes} />
      <ActiveSpeechBubble item={activeItem} point={activePoint} />
      <svg
        viewBox={`0 0 ${WORKBOARD_STAGE_WIDTH} ${WORKBOARD_STAGE_HEIGHT}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <PixelHoverTag tag={hoveredTag} stageWidth={WORKBOARD_STAGE_WIDTH} stageHeight={WORKBOARD_STAGE_HEIGHT} />
      </svg>
    </div>
  );
}

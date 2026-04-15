/**
 * Workboard 游戏化 cluster room 场景。
 *
 * 关键点（中文）
 * - 这里对应 teamprofile 的局部地图层，进入某个状态簇后只渲染这个 room。
 * - room 不再包含返回按钮、普通工具条等 dashboard chrome，控制行为交给上层 HUD。
 * - agent 以 sprite 的方式在 station 与 patrol lane 之间巡游，右侧 codex log 负责详情。
 */

import * as React from "react";
import { cn } from "../lib/utils";
import { WorkboardRoomField } from "./workboard-room-field";
import { PixelHoverTag } from "./workboard-stage-map";
import {
  WORKBOARD_STAGE_HEIGHT,
  WORKBOARD_STAGE_WIDTH,
  WorkboardStageAgentNode,
  buildWorkboardTilePath,
} from "./workboard-stage";
import type {
  DowncityWorkboardActivityItem,
  DowncityWorkboardAgentItem,
} from "../types/workboard";
import type { DowncityWorkboardGameRoomProps } from "../types/workboard-game-ui";
import type { DowncityWorkboardGameRoute } from "../types/workboard-game-map";
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
      className="pointer-events-none absolute z-30 max-w-[20rem] border-[3px] border-[#6e4d2f] bg-[#fff1bd] px-3 py-2 text-sm shadow-[5px_5px_0_rgba(72,50,33,0.22)]"
      style={{
        left: Math.min(Math.max(props.point.x + 28, 48), WORKBOARD_STAGE_WIDTH - 260),
        top: Math.min(Math.max(props.point.y - 74, 20), WORKBOARD_STAGE_HEIGHT - 72),
        clipPath: PIXEL_PANEL_CLIP,
      }}
    >
      <p className="text-[9px] uppercase tracking-[0.14em] text-[#6e4d2f]/70">
        {props.item.name} · {props.item.posture}
      </p>
      <p className="mt-1 leading-6 text-[#352516]">“{line}”</p>
      <span className="absolute -bottom-[11px] left-5 block h-[11px] w-[16px] border-x-[3px] border-b-[3px] border-[#6e4d2f] bg-[#fff1bd]" />
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
      className="pointer-events-none absolute left-[128px] top-[662px] z-10 w-64 border-[3px] border-[#6e4d2f] bg-[#c48752] px-3 py-2 shadow-[5px_5px_0_rgba(72,50,33,0.24)]"
      style={{ clipPath: PIXEL_PANEL_CLIP }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] uppercase tracking-[0.18em] text-[#fff1bd]/80">wall board</div>
        <div className="text-[9px] uppercase tracking-[0.14em] text-[#fff1bd]/70">
          {props.item ? props.item.posture : "empty"}
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        {entries.length > 0 ? (
          entries.map((entry, index) => (
            <div key={entry.id} className="grid grid-cols-[1.5rem_1fr] gap-2 bg-[#fff1bd]/88 px-1.5 py-1 text-xs shadow-[2px_2px_0_rgba(72,50,33,0.18)]">
              <span className="grid h-5 place-items-center border border-[#6e4d2f]/35 bg-[#f8de8d] text-[9px] font-semibold text-[#6e4d2f]/70">
                Q{index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold leading-5 text-[#352516]">{entry.title}</span>
                <span className="block truncate text-[11px] leading-4 text-[#6e4d2f]/70">{entry.status}</span>
              </span>
            </div>
          ))
        ) : (
          <div className="bg-[#fff1bd]/88 px-2 py-1 text-xs leading-5 text-[#6e4d2f]/70">No public quest beats.</div>
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
  const miniWidth = 144;
  const miniHeight = 88;
  const scaleX = miniWidth / WORKBOARD_STAGE_WIDTH;
  const scaleY = miniHeight / WORKBOARD_STAGE_HEIGHT;

  return (
    <div
      className="pointer-events-none absolute left-[1228px] top-[662px] z-10 border-[3px] border-[#6e4d2f] bg-[#8a6040] p-2 shadow-[5px_5px_0_rgba(72,50,33,0.24)]"
      style={{ clipPath: PIXEL_PANEL_CLIP }}
      aria-hidden="true"
    >
      <div className="mb-1 text-[9px] uppercase tracking-[0.16em] text-[#fff1bd]/75">floor plan</div>
      <svg width={miniWidth} height={miniHeight} viewBox={`0 0 ${miniWidth} ${miniHeight}`} shapeRendering="crispEdges">
        <rect x="0" y="0" width={miniWidth} height={miniHeight} fill="rgba(241,225,166,0.95)" />
        <rect x="6" y="6" width={miniWidth - 12} height={miniHeight - 12} fill="rgba(255,241,189,0.9)" stroke="rgba(110,77,47,0.42)" strokeWidth="2" />
        <line x1="12" y1={miniHeight / 2} x2={miniWidth - 12} y2={miniHeight / 2} stroke="rgba(110,77,47,0.18)" strokeWidth="2" />
        <line x1={miniWidth / 2} y1="12" x2={miniWidth / 2} y2={miniHeight - 12} stroke="rgba(110,77,47,0.18)" strokeWidth="2" />
        {props.nodes.map((node) => {
          const active = node.item.id === props.activeItemId;
          return (
            <rect
              key={node.item.id}
              x={Math.max(8, Math.min(miniWidth - 10, node.x * scaleX))}
              y={Math.max(8, Math.min(miniHeight - 10, node.y * scaleY))}
              width={active ? 6 : 4}
              height={active ? 6 : 4}
              fill={active ? "rgba(53,37,22,0.86)" : "rgba(110,77,47,0.48)"}
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
            stroke="rgba(53,37,22,0.86)"
            strokeWidth="2"
          />
        ) : null}
      </svg>
    </div>
  );
}

function RoomEntranceSign(props: {
  zone: DowncityWorkboardGameRoomProps["zone"];
  flowMode: DowncityWorkboardGameRoomProps["flowMode"];
}) {
  return (
    <div
      className="pointer-events-none absolute left-[674px] top-[850px] z-10 border-[3px] border-[#6e4d2f] bg-[#fff1bd] px-3 py-2 text-center shadow-[4px_4px_0_rgba(72,50,33,0.22)]"
      style={{ clipPath: PIXEL_PANEL_CLIP }}
      aria-hidden="true"
    >
      <div className="text-[9px] uppercase tracking-[0.18em] text-[#6e4d2f]/65">{props.zone.subtitle}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#352516]">
        {props.flowMode} room
      </div>
    </div>
  );
}

function buildRoomPolylinePath(points: DowncityWorkboardStagePoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function RoomPatrolTrail(props: { route: DowncityWorkboardGameRoute }) {
  const d = buildRoomPolylinePath(props.route.points);
  return (
    <g opacity={props.route.active ? 0.68 : 0.34}>
      <path
        d={d}
        fill="none"
        stroke="rgba(101,75,52,0.34)"
        strokeWidth={props.route.active ? 12 : 8}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <path
        d={d}
        fill="none"
        stroke="rgba(245,211,142,0.38)"
        strokeWidth={props.route.active ? 4 : 3}
        strokeDasharray="6 12"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      {props.route.points.map((point, index) => (
        <rect
          key={`${props.route.id}-trail-${index}`}
          x={point.x - 4}
          y={point.y - 4}
          width="8"
          height="8"
          fill="rgba(245,211,142,0.52)"
        />
      ))}
    </g>
  );
}

function RoomHubMapObject(props: {
  badge: string;
  title: string;
  point: DowncityWorkboardStagePoint;
}) {
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
      style={{ left: props.point.x, top: props.point.y }}
      aria-hidden="true"
    >
      <div className="relative h-24 w-28">
        <div className="absolute left-4 top-5 h-14 w-20 border-[3px] border-[#6e4d2f] bg-[#f8de8d] shadow-[4px_4px_0_rgba(72,50,33,0.28)]" />
        <div className="absolute left-8 top-8 h-7 w-12 bg-[#6b8f83]" />
        <div className="absolute left-11 top-11 h-2 w-6 bg-[#cde6d9]" />
        <div className="absolute left-7 top-[3.9rem] h-3 w-4 bg-[#6e4d2f]" />
        <div className="absolute right-7 top-[3.9rem] h-3 w-4 bg-[#6e4d2f]" />
        <div className="absolute left-1/2 top-0 -translate-x-1/2 border-2 border-[#6e4d2f] bg-[#fff1bd] px-2 py-1 text-center shadow-[3px_3px_0_rgba(72,50,33,0.18)]">
          <div className="text-[8px] uppercase tracking-[0.13em] text-[#6e4d2f]/70">{props.badge}</div>
          <div className="max-w-20 truncate text-[10px] font-bold leading-3 text-[#352516]">{props.title}</div>
        </div>
      </div>
    </div>
  );
}

function renderRoomStationObject(params: {
  node: { item: DowncityWorkboardAgentItem; x: number; y: number };
  index: number;
  active: boolean;
}): React.ReactNode {
  const deskFill = params.active ? "rgba(158,107,65,0.98)" : "rgba(138,96,65,0.84)";
  const chairFill = params.active ? "rgba(93,128,103,0.95)" : "rgba(91,91,78,0.72)";

  return (
    <g key={`focused-station-${params.node.item.id}`} opacity={params.active ? 0.96 : 0.66}>
      <rect x={params.node.x - 23} y={params.node.y - 19} width="46" height="24" fill={deskFill} stroke="rgba(72,50,33,0.56)" strokeWidth="3" />
      <rect x={params.node.x - 15} y={params.node.y - 14} width="18" height="7" fill="rgba(231,211,148,0.76)" />
      <rect x={params.node.x + 7} y={params.node.y - 15} width="10" height="9" fill="rgba(79,102,96,0.9)" />
      <rect x={params.node.x - 12} y={params.node.y + 8} width="24" height="12" fill={chairFill} />
      <rect x={params.node.x - 21} y={params.node.y + 22} width="8" height="7" fill="rgba(72,50,33,0.34)" />
      <rect x={params.node.x + 13} y={params.node.y + 22} width="8" height="7" fill="rgba(72,50,33,0.34)" />
      <rect x={params.node.x + 20} y={params.node.y - 26} width="22" height="14" fill="rgba(250,236,178,0.92)" stroke="rgba(110,77,47,0.54)" strokeWidth="2" />
      <text
        x={params.node.x + 31}
        y={params.node.y - 16}
        textAnchor="middle"
        fill="rgba(72,50,33,0.78)"
        fontSize="8"
        fontWeight="800"
        fontFamily="var(--font-geist-mono, var(--font-sans))"
      >
        {params.index + 1}
      </text>
      {params.active ? (
        <rect x={params.node.x - 29} y={params.node.y - 25} width="58" height="58" fill="none" stroke="rgba(17,17,19,0.42)" strokeWidth="2" strokeDasharray="4 5" />
      ) : null}
    </g>
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
      <WorkboardRoomField
        zone={props.zone}
        stageWidth={WORKBOARD_STAGE_WIDTH}
        stageHeight={WORKBOARD_STAGE_HEIGHT}
        pointsOfInterest={props.gameMap.pointsOfInterest}
        areaLabels={props.gameMap.areaLabels}
      />
      <div className={cn("pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2", props.zone.glowClassName)} />
      <RoomEntranceSign zone={props.zone} flowMode={props.flowMode} />

      <svg
        viewBox={`0 0 ${WORKBOARD_STAGE_WIDTH} ${WORKBOARD_STAGE_HEIGHT}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {props.gameMap.patrols.map((route) => (
          <RoomPatrolTrail key={route.id} route={route} />
        ))}
        {activePoint ? (
          <g>
            <path
              d={buildWorkboardTilePath({ from: center, to: activePoint })}
              fill="none"
              stroke="rgba(245,211,142,0.58)"
              strokeWidth="10"
              strokeOpacity="0.52"
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
        {roomNodes.map((node) => {
          const point = resolveRoomPoint({
            agentId: node.item.id,
            fallback: { x: node.x, y: node.y },
            motionFrames: props.motionFrames,
          });
          const path = buildWorkboardTilePath({ from: center, to: point });

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
        {roomNodes.map((node, index) =>
          renderRoomStationObject({
            node,
            index,
            active: props.selectedAgentId === node.item.id,
          }),
        )}
      </svg>

      <RoomHubMapObject badge={props.zone.badge} title={props.zone.title} point={hubPoint} />

      <div
        className="pointer-events-none absolute z-20 border-2 border-[#6e4d2f]/70 bg-[#fff1bd]/90 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#6e4d2f]/70 shadow-[3px_3px_0_rgba(72,50,33,0.16)]"
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

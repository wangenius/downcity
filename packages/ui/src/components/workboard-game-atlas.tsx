/**
 * Workboard 游戏化 atlas 世界地图。
 *
 * 关键点（中文）
 * - 这里只负责全局 world atlas 的地图渲染与热点交互。
 * - 角色、gate、corridor 都从 gameMapConfig 读取，不再在主组件里散落计算。
 * - 该组件对应 teamprofile 的全局地图层，点击 zone 后进入局部房间。
 */

import * as React from "react";
import { cn } from "../lib/utils";
import { PixelAtlasMap, PixelHoverTag, PixelRoute } from "./workboard-stage-map";
import {
  WORKBOARD_STAGE_HEIGHT,
  WORKBOARD_STAGE_WIDTH,
  WorkboardStageAgentNode,
  WorkboardStageZone,
  resolveZoneDefinition,
  toZoneHubPoint,
} from "./workboard-stage";
import type { DowncityWorkboardGameAtlasProps } from "../types/workboard-game-ui";
import type { DowncityWorkboardHoverTag } from "../types/workboard-stage";

const PIXEL_PANEL_CLIP = "polygon(0 6px,6px 6px,6px 0,calc(100% - 6px) 0,calc(100% - 6px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 6px) calc(100% - 6px),calc(100% - 0px) 100%,6px 100%,6px calc(100% - 6px),0 calc(100% - 6px))";

/**
 * 渲染 atlas 中当前活跃状态簇的入口标记。
 */
function WorkboardAtlasPortalSign(props: {
  activeZoneId: DowncityWorkboardGameAtlasProps["activeZoneId"];
  zones: DowncityWorkboardGameAtlasProps["gameMap"]["zones"];
  onSelectZone: DowncityWorkboardGameAtlasProps["onSelectZone"];
}) {
  const zone = props.zones.find((item) => item.id === props.activeZoneId) || props.zones[0];
  if (!zone) return null;

  const point = toZoneHubPoint(zone.id);
  const left = Math.min(Math.max(point.x + 22, 18), WORKBOARD_STAGE_WIDTH - 198);
  const top = Math.min(Math.max(point.y - 54, 76), WORKBOARD_STAGE_HEIGHT - 120);

  return (
    <button
      type="button"
      onClick={() => props.onSelectZone(zone.id)}
      className="absolute z-30 w-40 border-[3px] border-[#6e4d2f] bg-[#f8de8d] px-3 py-2 text-left shadow-[5px_5px_0_rgba(72,50,33,0.28)] transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-105 focus:outline-none focus-visible:-translate-y-0.5"
      style={{ left, top, clipPath: PIXEL_PANEL_CLIP }}
    >
      <span className="absolute left-3 top-full h-5 w-2 bg-[#6e4d2f]" />
      <span className="absolute right-3 top-full h-5 w-2 bg-[#6e4d2f]" />
      <span className="block text-[9px] uppercase tracking-[0.18em] text-[#6e4d2f]/70">zone gate</span>
      <span className="mt-1 block truncate text-sm font-semibold leading-5 tracking-[-0.04em] text-[#352516]">
        {zone.title}
      </span>
      <span className="mt-1 grid grid-cols-[1fr_auto] items-center gap-2">
        <span className="h-2 border border-[#6e4d2f]/35 bg-[#fff1bd]">
          <span
            className="block h-full bg-[#6e4d2f]/70"
            style={{ width: `${Math.max(8, Math.min(100, zone.count * 18))}%` }}
          />
        </span>
        <span className="text-[10px] font-semibold text-[#6e4d2f]/75">{zone.count}</span>
      </span>
    </button>
  );
}

/**
 * 渲染全局 atlas 世界地图。
 */
export function WorkboardGameAtlas(props: DowncityWorkboardGameAtlasProps) {
  const [hoveredTag, setHoveredTag] = React.useState<DowncityWorkboardHoverTag | null>(null);
  const zones = props.gameMap.zones;
  const actors = props.gameMap.actors;

  return (
    <div
      className="relative overflow-hidden border-2 border-border/70 bg-[linear-gradient(145deg,rgba(251,250,247,0.96),rgba(245,248,245,0.88))]"
      style={{ width: WORKBOARD_STAGE_WIDTH, height: WORKBOARD_STAGE_HEIGHT, clipPath: PIXEL_PANEL_CLIP, imageRendering: "pixelated" }}
    >
      <div className="absolute left-3 top-3 z-20 px-1">
        <div className="text-[10px] uppercase tracking-[0.2em] text-foreground/42">world atlas</div>
        <div className="mt-1 text-[11px] text-foreground/66">enter a zone</div>
      </div>

      <div
        className="absolute right-3 top-3 z-20 border border-border/50 bg-background/72 px-2 py-1 text-right"
        style={{ clipPath: PIXEL_PANEL_CLIP }}
      >
        <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/42">{props.flowMode}</div>
      </div>

      <PixelAtlasMap zones={zones} stageWidth={WORKBOARD_STAGE_WIDTH} stageHeight={WORKBOARD_STAGE_HEIGHT} />

      {zones.map((zone) => (
        <WorkboardStageZone
          key={zone.id}
          zone={resolveZoneDefinition(zone.id)}
          count={zone.count}
          active={zone.id === props.activeZoneId}
          onSelect={props.onSelectZone}
          onHoverChange={setHoveredTag}
        />
      ))}
      <WorkboardAtlasPortalSign
        activeZoneId={props.activeZoneId}
        zones={zones}
        onSelectZone={props.onSelectZone}
      />

      <svg
        viewBox={`0 0 ${WORKBOARD_STAGE_WIDTH} ${WORKBOARD_STAGE_HEIGHT}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {props.gameMap.corridors.map((route) => (
          <PixelRoute
            key={route.id}
            points={route.points}
            className={cn("stroke-foreground/8", route.active ? "opacity-100" : "opacity-60")}
            dashed
          />
        ))}
        {actors.map((actor) => {
          const faded = actor.zoneId !== props.activeZoneId;
          return (
            <g key={`gate-${actor.id}`} opacity={faded ? 0.18 : 0.72}>
              <rect
                x={actor.overviewGate.x - 5}
                y={actor.overviewGate.y - 5}
                width="10"
                height="10"
                fill="rgba(255,252,247,0.92)"
                stroke="rgba(17,17,19,0.36)"
                strokeWidth="2"
              />
              {props.selectedAgentId === actor.id ? (
                <rect
                  x={actor.overviewGate.x - 9}
                  y={actor.overviewGate.y - 9}
                  width="18"
                  height="18"
                  fill="none"
                  stroke="rgba(17,17,19,0.42)"
                  strokeWidth="2"
                  strokeDasharray="3 4"
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      {actors.map((actor) => (
        <WorkboardStageAgentNode
          key={actor.id}
          item={actor.agent}
          zone={resolveZoneDefinition(actor.zoneId)}
          point={props.motionFrames[actor.id] || actor.overviewAnchor}
          active={props.selectedAgentId === actor.id}
          faded={actor.zoneId !== props.activeZoneId}
          mode="overview"
          onSelect={(agentId) => props.onSelectAgent?.(agentId, actor.zoneId)}
          onHoverChange={setHoveredTag}
        />
      ))}

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

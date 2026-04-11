/**
 * Workboard 像素地图辅助组件。
 *
 * 关键点（中文）
 * - 这里集中处理像素 tile、路径和簇边界纹理，避免主舞台文件继续膨胀。
 * - 所有图形都服务于 teamprofile 式的“地图感”，不承载业务数据本身。
 */

import * as React from "react";
import { cn } from "../lib/utils";
import type {
  DowncityWorkboardGameAreaLabel,
  DowncityWorkboardGamePointOfInterest,
  DowncityWorkboardGameZone,
} from "../types/workboard-game-map";
import type {
  DowncityWorkboardHoverTag,
  DowncityWorkboardZoneLayout,
  DowncityWorkboardStagePoint,
  DowncityWorkboardZoneDefinition,
  DowncityWorkboardZoneId,
} from "../types/workboard-stage";

/**
 * Workboard 全局 atlas 中每个状态簇的外部布局。
 */
export const WORKBOARD_ZONE_LAYOUT: Record<DowncityWorkboardZoneId, DowncityWorkboardZoneLayout> = {
  engaged: { x: 4, y: 5, w: 40, h: 34, hubX: 13, hubY: 15 },
  steady: { x: 49, y: 8, w: 28, h: 28, hubX: 57, hubY: 17 },
  quiet: { x: 7, y: 50, w: 30, h: 24, hubX: 14, hubY: 61 },
  drift: { x: 46, y: 44, w: 44, h: 30, hubX: 57, hubY: 56 },
};

const ZONE_PIXEL_PALETTE: Record<
  DowncityWorkboardZoneId,
  { fill: string; fillStrong: string; stroke: string; line: string }
> = {
  engaged: {
    fill: "rgba(214,240,229,0.84)",
    fillStrong: "rgba(169,219,198,0.92)",
    stroke: "rgba(59,130,96,0.92)",
    line: "rgba(52,144,111,0.78)",
  },
  steady: {
    fill: "rgba(234,241,210,0.86)",
    fillStrong: "rgba(204,219,146,0.94)",
    stroke: "rgba(132,152,58,0.88)",
    line: "rgba(145,161,63,0.72)",
  },
  quiet: {
    fill: "rgba(236,233,225,0.88)",
    fillStrong: "rgba(212,205,191,0.96)",
    stroke: "rgba(120,113,104,0.86)",
    line: "rgba(130,124,112,0.7)",
  },
  drift: {
    fill: "rgba(247,229,208,0.9)",
    fillStrong: "rgba(239,193,142,0.94)",
    stroke: "rgba(184,117,50,0.88)",
    line: "rgba(194,121,55,0.78)",
  },
};

const ZONE_TILE_FIELDS: Record<DowncityWorkboardZoneId, Array<{ x: number; y: number; w: number; h: number }>> = {
  engaged: [
    { x: 6, y: 8, w: 9, h: 2 },
    { x: 6, y: 12, w: 15, h: 2 },
    { x: 17, y: 17, w: 8, h: 2 },
    { x: 24, y: 18, w: 12, h: 2 },
    { x: 10, y: 27, w: 9, h: 2 },
  ],
  steady: [
    { x: 53, y: 12, w: 9, h: 2 },
    { x: 53, y: 17, w: 13, h: 2 },
    { x: 66, y: 16, w: 5, h: 2 },
    { x: 60, y: 22, w: 10, h: 2 },
  ],
  quiet: [
    { x: 11, y: 55, w: 10, h: 2 },
    { x: 11, y: 60, w: 13, h: 2 },
    { x: 18, y: 66, w: 9, h: 2 },
  ],
  drift: [
    { x: 52, y: 49, w: 15, h: 2 },
    { x: 59, y: 55, w: 17, h: 2 },
    { x: 54, y: 62, w: 10, h: 2 },
    { x: 69, y: 67, w: 11, h: 2 },
  ],
};

const ZONE_WALL_SEGMENTS: Record<
  DowncityWorkboardZoneId,
  Array<{ x1: number; y1: number; x2: number; y2: number }>
> = {
  engaged: [
    { x1: 7, y1: 7, x2: 31, y2: 7 },
    { x1: 7, y1: 7, x2: 7, y2: 23 },
    { x1: 7, y1: 23, x2: 14, y2: 23 },
    { x1: 18, y1: 23, x2: 31, y2: 23 },
    { x1: 31, y1: 7, x2: 31, y2: 23 },
    { x1: 15, y1: 15, x2: 22, y2: 15 },
  ],
  steady: [
    { x1: 52, y1: 10, x2: 72, y2: 10 },
    { x1: 52, y1: 10, x2: 52, y2: 29 },
    { x1: 72, y1: 10, x2: 72, y2: 29 },
    { x1: 52, y1: 29, x2: 59, y2: 29 },
    { x1: 63, y1: 29, x2: 72, y2: 29 },
    { x1: 59, y1: 18, x2: 68, y2: 18 },
  ],
  quiet: [
    { x1: 10, y1: 53, x2: 31, y2: 53 },
    { x1: 10, y1: 53, x2: 10, y2: 72 },
    { x1: 10, y1: 72, x2: 25, y2: 72 },
    { x1: 29, y1: 72, x2: 31, y2: 72 },
    { x1: 31, y1: 53, x2: 31, y2: 72 },
    { x1: 18, y1: 63, x2: 25, y2: 63 },
  ],
  drift: [
    { x1: 51, y1: 46, x2: 84, y2: 46 },
    { x1: 51, y1: 46, x2: 51, y2: 71 },
    { x1: 84, y1: 46, x2: 84, y2: 71 },
    { x1: 51, y1: 71, x2: 63, y2: 71 },
    { x1: 67, y1: 71, x2: 84, y2: 71 },
    { x1: 63, y1: 57, x2: 74, y2: 57 },
  ],
};

const FOCUSED_ZONE_PATCHES: Record<
  DowncityWorkboardZoneId,
  Array<{ x: number; y: number; w: number; h: number }>
> = {
  engaged: [
    { x: 10, y: 11, w: 18, h: 12 },
    { x: 33, y: 14, w: 16, h: 11 },
    { x: 61, y: 16, w: 18, h: 12 },
    { x: 19, y: 62, w: 17, h: 11 },
    { x: 63, y: 58, w: 15, h: 12 },
  ],
  steady: [
    { x: 15, y: 17, w: 14, h: 11 },
    { x: 39, y: 15, w: 19, h: 12 },
    { x: 66, y: 19, w: 13, h: 11 },
    { x: 22, y: 59, w: 16, h: 10 },
    { x: 59, y: 60, w: 16, h: 11 },
  ],
  quiet: [
    { x: 14, y: 18, w: 15, h: 11 },
    { x: 44, y: 13, w: 15, h: 11 },
    { x: 67, y: 18, w: 12, h: 10 },
    { x: 23, y: 58, w: 14, h: 10 },
    { x: 58, y: 61, w: 17, h: 11 },
  ],
  drift: [
    { x: 12, y: 17, w: 17, h: 11 },
    { x: 35, y: 15, w: 17, h: 11 },
    { x: 66, y: 17, w: 15, h: 12 },
    { x: 22, y: 60, w: 15, h: 11 },
    { x: 56, y: 58, w: 18, h: 12 },
  ],
};

const ATLAS_CORRIDOR_FIELDS: Array<{
  a: DowncityWorkboardZoneId;
  b: DowncityWorkboardZoneId;
  cells: Array<{ x: number; y: number; w: number; h: number }>;
}> = [
  {
    a: "engaged",
    b: "steady",
    cells: [
      { x: 33, y: 17, w: 4, h: 2 },
      { x: 37, y: 17, w: 4, h: 2 },
      { x: 41, y: 17, w: 4, h: 2 },
      { x: 45, y: 17, w: 4, h: 2 },
      { x: 49, y: 17, w: 4, h: 2 },
    ],
  },
  {
    a: "engaged",
    b: "quiet",
    cells: [
      { x: 13, y: 24, w: 2, h: 4 },
      { x: 13, y: 28, w: 2, h: 4 },
      { x: 13, y: 32, w: 2, h: 4 },
      { x: 13, y: 36, w: 2, h: 4 },
      { x: 13, y: 40, w: 2, h: 4 },
      { x: 13, y: 44, w: 2, h: 4 },
      { x: 13, y: 48, w: 2, h: 4 },
    ],
  },
  {
    a: "steady",
    b: "drift",
    cells: [
      { x: 58, y: 27, w: 2, h: 4 },
      { x: 58, y: 31, w: 2, h: 4 },
      { x: 58, y: 35, w: 2, h: 4 },
      { x: 58, y: 39, w: 2, h: 4 },
      { x: 58, y: 43, w: 2, h: 4 },
    ],
  },
  {
    a: "quiet",
    b: "drift",
    cells: [
      { x: 30, y: 60, w: 4, h: 2 },
      { x: 34, y: 60, w: 4, h: 2 },
      { x: 38, y: 60, w: 4, h: 2 },
      { x: 42, y: 60, w: 4, h: 2 },
      { x: 46, y: 60, w: 4, h: 2 },
      { x: 50, y: 60, w: 4, h: 2 },
    ],
  },
];

const FOCUSED_WALKABLE_FIELDS: Array<{ x: number; y: number; w: number; h: number }> = [
  { x: 18, y: 30, w: 62, h: 3 },
  { x: 22, y: 48, w: 56, h: 3 },
  { x: 30, y: 66, w: 40, h: 3 },
  { x: 28, y: 24, w: 3, h: 16 },
  { x: 50, y: 22, w: 3, h: 34 },
  { x: 70, y: 26, w: 3, h: 16 },
  { x: 24, y: 48, w: 3, h: 18 },
  { x: 74, y: 48, w: 3, h: 16 },
];

function estimateTextWidth(text: string): number {
  return Array.from(text).reduce((acc, char) => acc + (char.charCodeAt(0) > 255 ? 9 : 6), 0);
}

function fitPixelLabel(text: string, maxWidth: number): string {
  if (estimateTextWidth(text) <= maxWidth) {
    return text;
  }

  let current = "";
  for (const char of Array.from(text)) {
    const next = `${current}${char}`;
    if (estimateTextWidth(`${next}…`) > maxWidth) {
      return current.length > 0 ? `${current}…` : text;
    }
    current = next;
  }

  return current;
}

function renderFocusedProp(params: {
  kind: "desk" | "rack" | "console" | "crate" | "bench" | "plant";
  x: number;
  y: number;
}): React.ReactNode {
  if (params.kind === "desk") {
    return (
      <g>
        <rect x={params.x} y={params.y} width={26} height={8} fill="rgba(137,101,75,0.9)" />
        <rect x={params.x + 3} y={params.y + 8} width={3} height={8} fill="rgba(76,58,46,0.88)" />
        <rect x={params.x + 20} y={params.y + 8} width={3} height={8} fill="rgba(76,58,46,0.88)" />
      </g>
    );
  }

  if (params.kind === "rack") {
    return (
      <g>
        <rect x={params.x} y={params.y} width={8} height={24} fill="rgba(96,88,80,0.9)" />
        <rect x={params.x + 2} y={params.y + 4} width={16} height={4} fill="rgba(170,154,120,0.86)" />
        <rect x={params.x + 2} y={params.y + 11} width={16} height={4} fill="rgba(170,154,120,0.86)" />
        <rect x={params.x + 2} y={params.y + 18} width={16} height={4} fill="rgba(170,154,120,0.86)" />
      </g>
    );
  }

  if (params.kind === "console") {
    return (
      <g>
        <rect x={params.x} y={params.y} width={18} height={12} fill="rgba(72,95,86,0.92)" />
        <rect x={params.x + 3} y={params.y + 3} width={12} height={4} fill="rgba(215,236,222,0.9)" />
        <rect x={params.x + 4} y={params.y + 12} width={3} height={6} fill="rgba(56,64,60,0.86)" />
        <rect x={params.x + 11} y={params.y + 12} width={3} height={6} fill="rgba(56,64,60,0.86)" />
      </g>
    );
  }

  if (params.kind === "bench") {
    return (
      <g>
        <rect x={params.x} y={params.y} width={30} height={6} fill="rgba(153,118,82,0.9)" />
        <rect x={params.x + 4} y={params.y + 6} width={3} height={8} fill="rgba(87,67,52,0.9)" />
        <rect x={params.x + 22} y={params.y + 6} width={3} height={8} fill="rgba(87,67,52,0.9)" />
      </g>
    );
  }

  if (params.kind === "plant") {
    return (
      <g>
        <rect x={params.x + 5} y={params.y + 10} width={10} height={8} fill="rgba(133,95,66,0.9)" />
        <rect x={params.x + 3} y={params.y + 4} width={14} height={10} fill="rgba(112,152,88,0.9)" />
        <rect x={params.x + 7} y={params.y} width={6} height={8} fill="rgba(141,182,108,0.88)" />
      </g>
    );
  }

  return (
    <g>
      <rect x={params.x} y={params.y + 4} width={14} height={12} fill="rgba(148,112,76,0.88)" />
      <rect x={params.x + 14} y={params.y + 8} width={8} height={8} fill="rgba(182,144,103,0.9)" />
    </g>
  );
}

export function PixelStageBackdrop() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(17,17,19,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(17,17,19,0.04)_1px,transparent_1px)] bg-[size:18px_18px] opacity-32" />
      <div className="pointer-events-none absolute left-3 top-3 h-2 w-2 bg-foreground/18" />
      <div className="pointer-events-none absolute right-3 top-3 h-2 w-2 bg-foreground/14" />
      <div className="pointer-events-none absolute bottom-3 left-3 h-2 w-2 bg-foreground/12" />
      <div className="pointer-events-none absolute bottom-3 right-3 h-2 w-2 bg-foreground/10" />
    </>
  );
}

/**
 * 全局 atlas 背景 SVG。
 */
export function PixelAtlasMap(props: {
  zones: DowncityWorkboardGameZone[];
  stageWidth: number;
  stageHeight: number;
}) {
  return (
    <svg
      viewBox={`0 0 ${props.stageWidth} ${props.stageHeight}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <defs>
        <pattern id="workboard-atlas-grid" width="18" height="18" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="18" height="18" fill="rgba(250,248,243,0.92)" />
          <rect x="0" y="0" width="9" height="9" fill="rgba(234,231,224,0.22)" />
          <rect x="9" y="9" width="9" height="9" fill="rgba(234,231,224,0.22)" />
        </pattern>
      </defs>

      <rect x={0} y={0} width={props.stageWidth} height={props.stageHeight} fill="url(#workboard-atlas-grid)" />

      {ATLAS_CORRIDOR_FIELDS.map((corridor, corridorIndex) => {
        const activeZoneId = props.zones.find((zone) => zone.active)?.id;
        const active = corridor.a === activeZoneId || corridor.b === activeZoneId;
        return corridor.cells.map((cell, index) => (
          <g key={`corridor-${corridorIndex}-${index}`}>
            <rect
              x={`${cell.x}%`}
              y={`${cell.y}%`}
              width={`${cell.w}%`}
              height={`${cell.h}%`}
              fill={active ? "rgba(86,96,88,0.32)" : "rgba(86,96,88,0.14)"}
            />
            {active ? (
              <rect
                x={`${cell.x + 0.4}%`}
                y={`${cell.y + 0.2}%`}
                width={`${Math.max(cell.w - 0.8, 0.8)}%`}
                height={`${Math.max(cell.h - 0.4, 0.8)}%`}
                fill="rgba(255,252,247,0.42)"
              >
                <animate
                  attributeName="opacity"
                  values="0.15;0.85;0.15"
                  dur={`${1.1 + index * 0.12}s`}
                  repeatCount="indefinite"
                />
              </rect>
            ) : null}
          </g>
        ));
      })}

      {props.zones.map((zone) => {
        const active = zone.active;
        const layout = WORKBOARD_ZONE_LAYOUT[zone.id];
        const label = fitPixelLabel(zone.title, 128);

        return (
          <g key={`atlas-zone-${zone.id}`}>
            {ZONE_TILE_FIELDS[zone.id].map((tile, index) => (
              <rect
                key={`${zone.id}-tile-${index}`}
                x={`${tile.x}%`}
                y={`${tile.y}%`}
                width={`${tile.w}%`}
                height={`${tile.h}%`}
                fill={ZONE_PIXEL_PALETTE[zone.id].fill}
                opacity={active ? 0.92 : 0.56}
              />
            ))}

            {ZONE_WALL_SEGMENTS[zone.id].map((wall, index) => (
              <line
                key={`${zone.id}-wall-${index}`}
                x1={`${wall.x1}%`}
                y1={`${wall.y1}%`}
                x2={`${wall.x2}%`}
                y2={`${wall.y2}%`}
                stroke={ZONE_PIXEL_PALETTE[zone.id].line}
                strokeOpacity={active ? 0.95 : 0.48}
                strokeWidth={active ? 2.6 : 1.8}
                strokeLinecap="square"
              />
            ))}

            <rect
              x={`${layout.hubX}%`}
              y={`${layout.hubY}%`}
              width="16"
              height="16"
              transform="translate(-8 -8)"
              fill={ZONE_PIXEL_PALETTE[zone.id].fillStrong}
              opacity={0.96}
            />
            <rect
              x={`${layout.hubX}%`}
              y={`${layout.hubY}%`}
              width="8"
              height="8"
              transform="translate(-4 -4)"
              fill={ZONE_PIXEL_PALETTE[zone.id].stroke}
              opacity={0.96}
            />

            <rect
              x={`${layout.x + 1.2}%`}
              y={`${layout.y + 1.2}%`}
              width={Math.max(66, label.length * 8)}
              height="20"
              fill="rgba(255,252,247,0.92)"
              stroke="rgba(17,17,19,0.38)"
              strokeWidth="2"
            />
            <text
              x={`${layout.x + 2.1}%`}
              y={`${layout.y + 3.5}%`}
              fill="rgba(17,17,19,0.78)"
              fontSize="10"
              fontWeight="700"
              fontFamily="var(--font-geist-mono, var(--font-sans))"
            >
              {label}
            </text>
            <text
              x={`${layout.x + layout.w - 2.2}%`}
              y={`${layout.y + layout.h - 2}%`}
              textAnchor="end"
              fill="rgba(17,17,19,0.6)"
              fontSize="20"
              fontWeight="700"
              fontFamily="var(--font-geist-mono, var(--font-sans))"
            >
              {zone.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function PixelZoneTiles(props: { zone: DowncityWorkboardZoneDefinition }) {
  const tiles = ZONE_TILE_FIELDS[props.zone.id] || [];

  return (
    <>
      {tiles.map((tile, index) => (
        <div
          key={`${props.zone.id}-tile-${index}`}
          className={cn("pointer-events-none absolute border border-foreground/10 bg-background/40", props.zone.borderClassName)}
          style={{
            left: `${tile.x}%`,
            top: `${tile.y}%`,
            width: `${tile.w}%`,
            height: `${tile.h}%`,
          }}
        />
      ))}
    </>
  );
}

export function PixelRoute(props: {
  points: DowncityWorkboardStagePoint[];
  className?: string;
  dashed?: boolean;
}) {
  if (props.points.length < 2) {
    return null;
  }

  const d = props.points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <path
      d={d}
      fill="none"
      className={props.className}
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeDasharray={props.dashed ? "5 8" : undefined}
    />
  );
}

/**
 * 簇内局部地图底板。
 */
export function PixelFocusedField(props: {
  zone: DowncityWorkboardZoneDefinition;
  stageWidth: number;
  stageHeight: number;
  pointsOfInterest: DowncityWorkboardGamePointOfInterest[];
  areaLabels: DowncityWorkboardGameAreaLabel[];
}) {
  const patches = FOCUSED_ZONE_PATCHES[props.zone.id] || [];
  return (
    <svg
      viewBox={`0 0 ${props.stageWidth} ${props.stageHeight}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <defs>
        <pattern id={`workboard-focused-grid-${props.zone.id}`} width="18" height="18" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="18" height="18" fill="rgba(250,248,243,0.94)" />
          <rect x="0" y="0" width="9" height="9" fill="rgba(236,232,224,0.18)" />
          <rect x="9" y="9" width="9" height="9" fill="rgba(236,232,224,0.18)" />
        </pattern>
      </defs>

      <rect
        x={0}
        y={0}
        width={props.stageWidth}
        height={props.stageHeight}
        fill={`url(#workboard-focused-grid-${props.zone.id})`}
      />

      {FOCUSED_WALKABLE_FIELDS.map((field, index) => (
        <rect
          key={`walk-${index}`}
          x={`${field.x}%`}
          y={`${field.y}%`}
          width={`${field.w}%`}
          height={`${field.h}%`}
          fill="rgba(92,88,80,0.12)"
        />
      ))}

      {props.pointsOfInterest.map((item, index) => (
        <g key={`prop-${index}`} opacity={0.92}>
          {item.kind === "hub" ? null : renderFocusedProp(item)}
        </g>
      ))}

      {props.areaLabels.map((item, index) => (
        <g key={`label-${index}`} opacity={0.94}>
          <rect
            x={item.x}
            y={item.y}
            width={Math.max(72, estimateTextWidth(item.label) + 16)}
            height="18"
            fill="rgba(255,252,247,0.92)"
            stroke="rgba(17,17,19,0.34)"
            strokeWidth="2"
          />
          <text
            x={item.x + 7}
            y={item.y + 12}
            fill="rgba(17,17,19,0.72)"
            fontSize="9"
            fontWeight="700"
            fontFamily="var(--font-geist-mono, var(--font-sans))"
          >
            {item.label}
          </text>
        </g>
      ))}

      {patches.map((patch, index) => (
        <g key={`${props.zone.id}-patch-${index}`}>
          <rect
            x={`${patch.x}%`}
            y={`${patch.y}%`}
            width={`${patch.w}%`}
            height={`${patch.h}%`}
            fill={ZONE_PIXEL_PALETTE[props.zone.id].fill}
            opacity={0.32}
          />
          <rect
            x={`${patch.x}%`}
            y={`${patch.y}%`}
            width={`${patch.w}%`}
            height={`${patch.h}%`}
            fill="none"
            stroke={ZONE_PIXEL_PALETTE[props.zone.id].stroke}
            opacity={0.36}
            strokeWidth="2"
          />
        </g>
      ))}

      <rect x="45.8%" y="45.2%" width="8.4%" height="9.6%" fill="rgba(255,252,247,0.94)" stroke={ZONE_PIXEL_PALETTE[props.zone.id].line} strokeWidth="2" opacity={0.94} />
      <rect x="46.5%" y="46%" width="7%" height="8%" fill={ZONE_PIXEL_PALETTE[props.zone.id].fillStrong} opacity={0.86} />
      <rect x="48.2%" y="47.6%" width="3.6%" height="4.8%" fill={ZONE_PIXEL_PALETTE[props.zone.id].stroke} opacity={0.92} />
      <rect x="49%" y="44.2%" width="2%" height="2%" fill="rgba(255,252,247,0.92)" stroke={ZONE_PIXEL_PALETTE[props.zone.id].line} strokeWidth="2" />

      <line x1="28%" y1="25%" x2="48%" y2="49%" stroke={ZONE_PIXEL_PALETTE[props.zone.id].line} strokeOpacity={0.24} strokeWidth="2" />
      <line x1="70%" y1="25%" x2="52%" y2="49%" stroke={ZONE_PIXEL_PALETTE[props.zone.id].line} strokeOpacity={0.24} strokeWidth="2" />
      <line x1="30%" y1="66%" x2="48%" y2="51%" stroke={ZONE_PIXEL_PALETTE[props.zone.id].line} strokeOpacity={0.24} strokeWidth="2" />
      <line x1="70%" y1="66%" x2="52%" y2="51%" stroke={ZONE_PIXEL_PALETTE[props.zone.id].line} strokeOpacity={0.24} strokeWidth="2" />
    </svg>
  );
}

/**
 * SVG 像素 hover 标签。
 */
export function PixelHoverTag(props: {
  tag: DowncityWorkboardHoverTag | null;
  stageWidth: number;
  stageHeight: number;
}) {
  if (!props.tag) {
    return null;
  }

  const text = fitPixelLabel(props.tag.label, 160);
  const width = Math.max(78, estimateTextWidth(text) + 18);
  const height = 20;
  const x = Math.min(Math.max(props.tag.x - width / 2, 6), props.stageWidth - width - 6);
  const y = Math.min(Math.max(props.tag.y - height - 14, 6), props.stageHeight - height - 6);

  return (
    <g pointerEvents="none">
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="rgba(255,252,247,0.98)"
        stroke="rgba(17,17,19,0.44)"
        strokeWidth="2"
      />
      <rect
        x={x + 10}
        y={y + height}
        width="10"
        height="6"
        fill="rgba(255,252,247,0.98)"
        stroke="rgba(17,17,19,0.44)"
        strokeWidth="2"
      />
      <text
        x={x + 8}
        y={y + 13}
        fill="rgba(17,17,19,0.72)"
        fontSize="10"
        fontWeight="700"
        fontFamily="var(--font-geist-mono, var(--font-sans))"
      >
        {text}
      </text>
    </g>
  );
}

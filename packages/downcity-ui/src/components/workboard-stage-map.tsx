/**
 * Workboard 像素地图辅助组件。
 *
 * 关键点（中文）
 * - 地图统一使用 25 x 16 的 tile 坐标系，每个 tile 对应 40px 正方块。
 * - atlas 与 room 都从 tile-map 渲染，不再使用会被全屏拉伸的百分比散块。
 * - 所有地图元素只表达公开状态的空间关系，不承载内部 runtime 细节。
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
  DowncityWorkboardStagePoint,
  DowncityWorkboardZoneDefinition,
  DowncityWorkboardZoneId,
  DowncityWorkboardZoneLayout,
} from "../types/workboard-stage";
import type {
  WorkboardTilePoint as TilePoint,
  WorkboardTileRect as TileRect,
  WorkboardTownBuilding as TownBuilding,
} from "../types/workboard-stage-map";

const TILE_SIZE = 40;
const GRID_COLS = 25;
const GRID_ROWS = 16;
const STAGE_WIDTH = TILE_SIZE * GRID_COLS;
const STAGE_HEIGHT = TILE_SIZE * GRID_ROWS;

/**
 * Workboard 全局 atlas 中每个状态簇的外部布局。
 */
export const WORKBOARD_ZONE_LAYOUT: Record<DowncityWorkboardZoneId, DowncityWorkboardZoneLayout> = {
  engaged: { x: 8, y: 12.5, w: 32, h: 31.25, hubX: 22, hubY: 28.125 },
  steady: { x: 60, y: 12.5, w: 32, h: 31.25, hubX: 74, hubY: 28.125 },
  quiet: { x: 8, y: 56.25, w: 32, h: 31.25, hubX: 22, hubY: 78.125 },
  drift: { x: 60, y: 56.25, w: 32, h: 31.25, hubX: 74, hubY: 78.125 },
};

const ZONE_PIXEL_PALETTE: Record<
  DowncityWorkboardZoneId,
  { fill: string; fillStrong: string; stroke: string; line: string; shadow: string }
> = {
  engaged: {
    fill: "rgba(195,230,214,0.9)",
    fillStrong: "rgba(126,190,162,0.96)",
    stroke: "rgba(39,110,80,0.95)",
    line: "rgba(52,144,111,0.78)",
    shadow: "rgba(37,86,66,0.24)",
  },
  steady: {
    fill: "rgba(225,235,184,0.92)",
    fillStrong: "rgba(186,207,103,0.96)",
    stroke: "rgba(112,132,38,0.92)",
    line: "rgba(145,161,63,0.72)",
    shadow: "rgba(98,112,35,0.2)",
  },
  quiet: {
    fill: "rgba(225,221,211,0.94)",
    fillStrong: "rgba(190,183,169,0.98)",
    stroke: "rgba(103,96,87,0.9)",
    line: "rgba(130,124,112,0.7)",
    shadow: "rgba(84,78,71,0.18)",
  },
  drift: {
    fill: "rgba(245,214,178,0.94)",
    fillStrong: "rgba(231,162,92,0.96)",
    stroke: "rgba(161,91,32,0.92)",
    line: "rgba(194,121,55,0.78)",
    shadow: "rgba(146,78,28,0.2)",
  },
};

const TOWN_PATH_TILES: TileRect[] = [
  { col: 0, row: 7, cols: 25, rows: 2 },
  { col: 11, row: 0, cols: 2, rows: 16 },
  { col: 5, row: 4, cols: 6, rows: 1 },
  { col: 14, row: 4, cols: 6, rows: 1 },
  { col: 5, row: 11, cols: 6, rows: 1 },
  { col: 14, row: 11, cols: 6, rows: 1 },
];

const TOWN_WATER_TILES: TileRect[] = [
  { col: 0, row: 0, cols: 4, rows: 1 },
  { col: 21, row: 0, cols: 4, rows: 1 },
  { col: 0, row: 14, cols: 5, rows: 2 },
  { col: 20, row: 14, cols: 5, rows: 2 },
];

const TOWN_FENCE_TILES: TileRect[] = [
  { col: 1, row: 1, cols: 9, rows: 1 },
  { col: 15, row: 1, cols: 9, rows: 1 },
  { col: 1, row: 14, cols: 9, rows: 1 },
  { col: 15, row: 14, cols: 9, rows: 1 },
];

const TOWN_BUILDINGS: TownBuilding[] = [
  {
    col: 2,
    row: 2,
    cols: 8,
    rows: 5,
    zoneId: "engaged",
    floor: "rgba(230,199,170,0.98)",
    wall: "rgba(135,73,56,0.96)",
    walls: [
      { col: 5, row: 2, cols: 1, rows: 3 },
      { col: 2, row: 4, cols: 8, rows: 1 },
    ],
    props: [
      { col: 3, row: 3, cols: 1, rows: 1, kind: "desk" },
      { col: 7, row: 3, cols: 2, rows: 1, kind: "shelf" },
      { col: 4, row: 5, cols: 2, rows: 1, kind: "table" },
      { col: 7, row: 5, cols: 1, rows: 1, kind: "sofa" },
    ],
  },
  {
    col: 15,
    row: 2,
    cols: 8,
    rows: 5,
    zoneId: "steady",
    floor: "rgba(244,236,174,0.98)",
    wall: "rgba(118,95,68,0.96)",
    walls: [
      { col: 18, row: 2, cols: 1, rows: 3 },
      { col: 15, row: 4, cols: 8, rows: 1 },
    ],
    props: [
      { col: 16, row: 3, cols: 1, rows: 1, kind: "desk" },
      { col: 20, row: 3, cols: 2, rows: 1, kind: "shelf" },
      { col: 16, row: 5, cols: 2, rows: 1, kind: "table" },
      { col: 20, row: 5, cols: 1, rows: 1, kind: "bed" },
    ],
  },
  {
    col: 2,
    row: 9,
    cols: 8,
    rows: 5,
    zoneId: "quiet",
    floor: "rgba(231,226,207,0.98)",
    wall: "rgba(116,107,97,0.96)",
    walls: [
      { col: 5, row: 9, cols: 1, rows: 3 },
      { col: 2, row: 11, cols: 8, rows: 1 },
    ],
    props: [
      { col: 3, row: 10, cols: 1, rows: 1, kind: "bed" },
      { col: 7, row: 10, cols: 2, rows: 1, kind: "shelf" },
      { col: 4, row: 12, cols: 2, rows: 1, kind: "table" },
      { col: 8, row: 12, cols: 1, rows: 1, kind: "sofa" },
    ],
  },
  {
    col: 15,
    row: 9,
    cols: 8,
    rows: 5,
    zoneId: "drift",
    floor: "rgba(244,211,166,0.98)",
    wall: "rgba(155,85,43,0.96)",
    walls: [
      { col: 18, row: 9, cols: 1, rows: 3 },
      { col: 15, row: 11, cols: 8, rows: 1 },
    ],
    props: [
      { col: 16, row: 10, cols: 1, rows: 1, kind: "desk" },
      { col: 20, row: 10, cols: 2, rows: 1, kind: "shelf" },
      { col: 16, row: 12, cols: 2, rows: 1, kind: "table" },
      { col: 20, row: 12, cols: 1, rows: 1, kind: "sofa" },
    ],
  },
];

const TOWN_TREE_POINTS: TilePoint[] = [
  { col: 1, row: 2 },
  { col: 13, row: 1 },
  { col: 23, row: 2 },
  { col: 1, row: 12 },
  { col: 13, row: 14 },
  { col: 23, row: 12 },
  { col: 5, row: 1 },
  { col: 19, row: 1 },
  { col: 5, row: 14 },
  { col: 19, row: 14 },
];

const TOWN_FLOWER_POINTS: TilePoint[] = [
  { col: 4, row: 8 },
  { col: 9, row: 8 },
  { col: 15, row: 7 },
  { col: 21, row: 8 },
  { col: 11, row: 4 },
  { col: 13, row: 11 },
];

const ROOM_FLOOR_TILES: TileRect[] = [
  { col: 2, row: 2, cols: 21, rows: 12 },
  { col: 6, row: 5, cols: 13, rows: 6 },
];

const ROOM_SECTOR_TILES: Array<TileRect & { label: "a" | "b" }> = [
  { col: 3, row: 3, cols: 4, rows: 3, label: "a" },
  { col: 18, row: 3, cols: 4, rows: 3, label: "a" },
  { col: 3, row: 10, cols: 4, rows: 3, label: "b" },
  { col: 18, row: 10, cols: 4, rows: 3, label: "b" },
  { col: 8, row: 3, cols: 9, rows: 2, label: "b" },
  { col: 8, row: 11, cols: 9, rows: 2, label: "a" },
];

const ROOM_CORRIDOR_TILES: TileRect[] = [
  { col: 5, row: 7, cols: 15, rows: 2 },
  { col: 12, row: 4, cols: 2, rows: 9 },
  { col: 7, row: 6, cols: 2, rows: 5 },
  { col: 17, row: 6, cols: 2, rows: 5 },
];

const ROOM_WALL_TILES: TileRect[] = [
  { col: 2, row: 2, cols: 21, rows: 1 },
  { col: 2, row: 13, cols: 9, rows: 1 },
  { col: 14, row: 13, cols: 9, rows: 1 },
  { col: 2, row: 2, cols: 1, rows: 12 },
  { col: 22, row: 2, cols: 1, rows: 12 },
  { col: 7, row: 3, cols: 1, rows: 4 },
  { col: 17, row: 3, cols: 1, rows: 4 },
  { col: 7, row: 9, cols: 1, rows: 4 },
  { col: 17, row: 9, cols: 1, rows: 4 },
];

const ROOM_DOOR_TILES: TileRect[] = [
  { col: 11, row: 13, cols: 3, rows: 1 },
  { col: 7, row: 7, cols: 1, rows: 2 },
  { col: 17, row: 7, cols: 1, rows: 2 },
  { col: 12, row: 6, cols: 2, rows: 1 },
  { col: 12, row: 10, cols: 2, rows: 1 },
];

function tileToRect(tile: TileRect) {
  return {
    x: tile.col * TILE_SIZE,
    y: tile.row * TILE_SIZE,
    width: tile.cols * TILE_SIZE,
    height: tile.rows * TILE_SIZE,
  };
}

function estimateTextWidth(text: string): number {
  return Array.from(text).reduce((acc, char) => acc + (char.charCodeAt(0) > 255 ? 9 : 6), 0);
}

function fitPixelLabel(text: string, maxWidth: number): string {
  if (estimateTextWidth(text) <= maxWidth) return text;

  let current = "";
  for (const char of Array.from(text)) {
    const next = `${current}${char}`;
    if (estimateTextWidth(`${next}...`) > maxWidth) {
      return current.length > 0 ? `${current}...` : text;
    }
    current = next;
  }

  return current;
}

function TileRectSvg(props: {
  tile: TileRect;
  fill: string;
  stroke?: string;
  opacity?: number;
}) {
  const rect = tileToRect(props.tile);
  return (
    <rect
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      fill={props.fill}
      stroke={props.stroke}
      strokeWidth={props.stroke ? 2 : undefined}
      opacity={props.opacity}
    />
  );
}

function renderGrassTiles(): React.ReactNode[] {
  return Array.from({ length: GRID_COLS * GRID_ROWS }, (_, index) => {
    const col = index % GRID_COLS;
    const row = Math.floor(index / GRID_COLS);
    const fill = (col + row) % 2 === 0 ? "rgba(151,232,92,0.98)" : "rgba(132,220,82,0.98)";
    const rect = tileToRect({ col, row, cols: 1, rows: 1 });

    return (
      <g key={`grass-${col}-${row}`}>
        <rect x={rect.x} y={rect.y} width={TILE_SIZE} height={TILE_SIZE} fill={fill} />
        <rect x={rect.x + 6} y={rect.y + 8} width="4" height="4" fill="rgba(72,158,61,0.28)" />
        <rect x={rect.x + 27} y={rect.y + 25} width="3" height="3" fill="rgba(72,158,61,0.24)" />
      </g>
    );
  });
}

function renderTownPath(tile: TileRect, index: number): React.ReactNode {
  const rect = tileToRect(tile);
  return (
    <g key={`town-path-${index}`}>
      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="rgba(226,204,139,0.98)" />
      <rect x={rect.x} y={rect.y} width={rect.width} height="4" fill="rgba(178,151,91,0.42)" />
      <rect x={rect.x} y={rect.y + rect.height - 4} width={rect.width} height="4" fill="rgba(178,151,91,0.34)" />
    </g>
  );
}

function renderTownWater(tile: TileRect, index: number): React.ReactNode {
  const rect = tileToRect(tile);
  return (
    <g key={`town-water-${index}`}>
      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="rgba(112,193,218,0.9)" />
      <rect x={rect.x + 8} y={rect.y + 10} width={Math.max(12, rect.width - 16)} height="4" fill="rgba(196,238,241,0.42)" />
    </g>
  );
}

function renderTownFence(tile: TileRect, index: number): React.ReactNode {
  const rect = tileToRect(tile);
  const posts = Array.from({ length: tile.cols }, (_, postIndex) => {
    const x = rect.x + postIndex * TILE_SIZE + 16;
    return <rect key={`town-fence-post-${index}-${postIndex}`} x={x} y={rect.y + 8} width="8" height="24" fill="rgba(111,78,47,0.88)" />;
  });

  return (
    <g key={`town-fence-${index}`}>
      <rect x={rect.x + 8} y={rect.y + 15} width={rect.width - 16} height="6" fill="rgba(151,104,61,0.82)" />
      <rect x={rect.x + 8} y={rect.y + 25} width={rect.width - 16} height="5" fill="rgba(126,88,54,0.7)" />
      {posts}
    </g>
  );
}

function renderTownPlaza(): React.ReactNode {
  return (
    <g key="town-plaza">
      <TileRectSvg tile={{ col: 10, row: 6, cols: 5, rows: 4 }} fill="rgba(211,189,128,0.96)" stroke="rgba(126,97,58,0.36)" />
      <TileRectSvg tile={{ col: 11, row: 7, cols: 3, rows: 2 }} fill="rgba(232,210,148,0.98)" stroke="rgba(126,97,58,0.32)" />
      <rect x="476" y="296" width="48" height="48" fill="rgba(116,160,178,0.92)" stroke="rgba(64,91,105,0.76)" strokeWidth="4" />
      <rect x="488" y="308" width="24" height="24" fill="rgba(178,226,228,0.88)" />
      <rect x="496" y="284" width="8" height="24" fill="rgba(101,112,109,0.9)" />
      <rect x="484" y="356" width="32" height="12" fill="rgba(113,79,48,0.86)" />
      <rect x="456" y="276" width="8" height="8" fill="rgba(238,228,183,0.9)" />
      <rect x="536" y="276" width="8" height="8" fill="rgba(238,228,183,0.9)" />
      <rect x="456" y="356" width="8" height="8" fill="rgba(238,228,183,0.9)" />
      <rect x="536" y="356" width="8" height="8" fill="rgba(238,228,183,0.9)" />
    </g>
  );
}

function renderTree(point: TilePoint, index: number): React.ReactNode {
  const x = point.col * TILE_SIZE;
  const y = point.row * TILE_SIZE;
  return (
    <g key={`tree-${index}`}>
      <rect x={x + 17} y={y + 22} width="8" height="12" fill="rgba(103,73,42,0.92)" />
      <rect x={x + 10} y={y + 10} width="22" height="18" fill="rgba(58,145,77,0.95)" />
      <rect x={x + 14} y={y + 4} width="14" height="12" fill="rgba(80,174,86,0.96)" />
      <rect x={x + 8} y={y + 18} width="26" height="8" fill="rgba(38,122,67,0.84)" />
    </g>
  );
}

function renderFlower(point: TilePoint, index: number): React.ReactNode {
  const x = point.col * TILE_SIZE;
  const y = point.row * TILE_SIZE;
  return (
    <g key={`flower-${index}`}>
      <rect x={x + 11} y={y + 13} width="4" height="4" fill="rgba(240,97,135,0.86)" />
      <rect x={x + 24} y={y + 20} width="4" height="4" fill="rgba(248,219,82,0.9)" />
      <rect x={x + 17} y={y + 26} width="4" height="4" fill="rgba(134,104,218,0.76)" />
    </g>
  );
}

function renderTownProp(prop: TownBuilding["props"][number], index: number): React.ReactNode {
  const rect = tileToRect(prop);
  const x = rect.x + 6;
  const y = rect.y + 7;

  if (prop.kind === "bed") {
    return (
      <g key={`town-prop-${index}`}>
        <rect x={x} y={y} width="28" height="24" fill="rgba(178,112,68,0.88)" />
        <rect x={x + 4} y={y + 4} width="20" height="8" fill="rgba(249,209,122,0.9)" />
        <rect x={x + 4} y={y + 14} width="20" height="7" fill="rgba(208,94,67,0.78)" />
      </g>
    );
  }

  if (prop.kind === "shelf") {
    return (
      <g key={`town-prop-${index}`}>
        <rect x={x} y={y} width={Math.max(24, rect.width - 12)} height="9" fill="rgba(124,83,56,0.92)" />
        <rect x={x} y={y + 12} width={Math.max(24, rect.width - 12)} height="9" fill="rgba(124,83,56,0.84)" />
        <rect x={x + 5} y={y + 3} width="5" height="4" fill="rgba(229,195,96,0.9)" />
      </g>
    );
  }

  if (prop.kind === "table") {
    return (
      <g key={`town-prop-${index}`}>
        <rect x={x + 3} y={y + 5} width={Math.max(28, rect.width - 18)} height="18" fill="rgba(156,103,64,0.92)" />
        <rect x={x + 8} y={y + 9} width="6" height="6" fill="rgba(236,226,188,0.9)" />
      </g>
    );
  }

  if (prop.kind === "sofa") {
    return (
      <g key={`town-prop-${index}`}>
        <rect x={x} y={y + 4} width="26" height="19" fill="rgba(99,143,178,0.88)" />
        <rect x={x + 4} y={y + 8} width="18" height="7" fill="rgba(145,185,211,0.9)" />
      </g>
    );
  }

  return (
    <g key={`town-prop-${index}`}>
      <rect x={x} y={y + 4} width="26" height="16" fill="rgba(124,83,56,0.92)" />
      <rect x={x + 4} y={y} width="18" height="8" fill="rgba(194,214,221,0.9)" />
    </g>
  );
}

function renderTownBuilding(building: TownBuilding, activeZoneId?: DowncityWorkboardZoneId): React.ReactNode {
  const rect = tileToRect(building);
  const active = building.zoneId === activeZoneId;

  return (
    <g key={`town-building-${building.zoneId}`}>
      <rect x={rect.x - 6} y={rect.y - 6} width={rect.width + 12} height={rect.height + 12} fill={building.wall} opacity={active ? 1 : 0.82} />
      <rect x={rect.x + 8} y={rect.y + 8} width={rect.width - 16} height={rect.height - 16} fill={building.floor} />
      {Array.from({ length: building.cols * building.rows }, (_, index) => {
        const col = building.col + (index % building.cols);
        const row = building.row + Math.floor(index / building.cols);
        const tile = tileToRect({ col, row, cols: 1, rows: 1 });
        return (
          <rect
            key={`${building.zoneId}-floor-${col}-${row}`}
            x={tile.x + 8}
            y={tile.y + 8}
            width={TILE_SIZE - 16}
            height={TILE_SIZE - 16}
            fill={(col + row) % 2 === 0 ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.04)"}
          />
        );
      })}
      {building.walls.map((wall, index) => {
        const wallRect = tileToRect(wall);
        return (
          <rect
            key={`${building.zoneId}-wall-${index}`}
            x={wallRect.x + 4}
            y={wallRect.y + 4}
            width={wallRect.width - 8}
            height={wallRect.height - 8}
            fill={building.wall}
            opacity="0.88"
          />
        );
      })}
      <rect x={rect.x + rect.width / 2 - 24} y={rect.y + rect.height - 10} width="48" height="16" fill="rgba(226,204,139,0.98)" />
      {building.props.map(renderTownProp)}
      <rect x={rect.x - 8} y={rect.y - 8} width={rect.width + 16} height={rect.height + 16} fill="none" stroke={active ? ZONE_PIXEL_PALETTE[building.zoneId].stroke : "rgba(17,17,19,0.34)"} strokeWidth={active ? 5 : 3} />
    </g>
  );
}

function renderFocusedProp(params: {
  kind: "desk" | "rack" | "console" | "crate" | "bench" | "plant";
  x: number;
  y: number;
}): React.ReactNode {
  if (params.kind === "desk") {
    return (
      <g>
        <rect x={params.x} y={params.y} width={28} height={10} fill="rgba(126,91,67,0.92)" />
        <rect x={params.x + 3} y={params.y + 10} width={4} height={10} fill="rgba(77,57,43,0.9)" />
        <rect x={params.x + 21} y={params.y + 10} width={4} height={10} fill="rgba(77,57,43,0.9)" />
      </g>
    );
  }

  if (params.kind === "rack") {
    return (
      <g>
        <rect x={params.x} y={params.y} width={10} height={28} fill="rgba(88,82,75,0.92)" />
        <rect x={params.x + 3} y={params.y + 5} width={18} height={4} fill="rgba(166,149,112,0.88)" />
        <rect x={params.x + 3} y={params.y + 13} width={18} height={4} fill="rgba(166,149,112,0.88)" />
        <rect x={params.x + 3} y={params.y + 21} width={18} height={4} fill="rgba(166,149,112,0.88)" />
      </g>
    );
  }

  if (params.kind === "console") {
    return (
      <g>
        <rect x={params.x} y={params.y} width={20} height={14} fill="rgba(72,95,86,0.94)" />
        <rect x={params.x + 4} y={params.y + 4} width={12} height={4} fill="rgba(215,236,222,0.92)" />
        <rect x={params.x + 4} y={params.y + 14} width={4} height={8} fill="rgba(56,64,60,0.88)" />
        <rect x={params.x + 13} y={params.y + 14} width={4} height={8} fill="rgba(56,64,60,0.88)" />
      </g>
    );
  }

  if (params.kind === "bench") {
    return (
      <g>
        <rect x={params.x} y={params.y} width={32} height={8} fill="rgba(145,108,76,0.92)" />
        <rect x={params.x + 5} y={params.y + 8} width={4} height={10} fill="rgba(82,62,49,0.9)" />
        <rect x={params.x + 23} y={params.y + 8} width={4} height={10} fill="rgba(82,62,49,0.9)" />
      </g>
    );
  }

  if (params.kind === "plant") {
    return (
      <g>
        <rect x={params.x + 5} y={params.y + 12} width={12} height={9} fill="rgba(127,90,63,0.92)" />
        <rect x={params.x + 3} y={params.y + 5} width={16} height={10} fill="rgba(100,145,80,0.92)" />
        <rect x={params.x + 8} y={params.y} width={6} height={8} fill="rgba(136,179,101,0.9)" />
      </g>
    );
  }

  return (
    <g>
      <rect x={params.x} y={params.y + 4} width={16} height={14} fill="rgba(143,105,70,0.9)" />
      <rect x={params.x + 16} y={params.y + 8} width={10} height={10} fill="rgba(177,136,94,0.9)" />
    </g>
  );
}

export function PixelStageBackdrop() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(17,17,19,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(17,17,19,0.04)_1px,transparent_1px)] bg-[size:40px_40px] opacity-30" />
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
  const activeZoneId = props.zones.find((zone) => zone.active)?.id;

  return (
    <svg
      viewBox={`0 0 ${props.stageWidth} ${props.stageHeight}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x={0} y={0} width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="rgba(247,244,236,0.98)" />
      {renderGrassTiles()}
      {TOWN_WATER_TILES.map(renderTownWater)}
      {TOWN_PATH_TILES.map(renderTownPath)}
      {renderTownPlaza()}
      {TOWN_FENCE_TILES.map(renderTownFence)}
      {TOWN_TREE_POINTS.map(renderTree)}
      {TOWN_FLOWER_POINTS.map(renderFlower)}
      {TOWN_BUILDINGS.map((building) => renderTownBuilding(building, activeZoneId))}

      {props.zones.map((zone) => {
        const building = TOWN_BUILDINGS.find((item) => item.zoneId === zone.id);
        if (!building) return null;

        const layout = WORKBOARD_ZONE_LAYOUT[zone.id];
        const active = zone.active;
        const palette = ZONE_PIXEL_PALETTE[zone.id];
        const rect = tileToRect(building);
        const label = fitPixelLabel(zone.title, 112);
        const signWidth = Math.max(104, estimateTextWidth(label) + 34);
        const signX = rect.x + 14;
        const signY = rect.y - 30;
        const hubX = (layout.hubX / 100) * STAGE_WIDTH;
        const hubY = (layout.hubY / 100) * STAGE_HEIGHT;

        return (
          <g key={`zone-${zone.id}`}>
            <rect x={signX - 5} y={signY + 5} width={signWidth} height="22" fill="rgba(72,50,33,0.34)" />
            <rect x={signX} y={signY} width={signWidth} height="22" fill="rgba(250,236,178,0.98)" stroke={palette.stroke} strokeWidth={active ? 4 : 3} />
            <rect x={signX + 7} y={signY + 22} width="6" height="16" fill="rgba(111,78,47,0.86)" />
            <rect x={signX + signWidth - 13} y={signY + 22} width="6" height="16" fill="rgba(111,78,47,0.86)" />
            <rect x={hubX - 16} y={hubY - 16} width="32" height="32" fill="rgba(255,252,247,0.94)" stroke={palette.stroke} strokeWidth="3" />
            <rect x={hubX - 8} y={hubY - 8} width="16" height="16" fill={palette.fillStrong} />
            <rect x={hubX - 3} y={hubY - 3} width="6" height="6" fill={palette.stroke} />
            <text
              x={signX + 10}
              y={signY + 15}
              fill="rgba(17,17,19,0.78)"
              fontSize="10"
              fontWeight="700"
              fontFamily="var(--font-geist-mono, var(--font-sans))"
            >
              {label}
            </text>
            <rect x={rect.x + rect.width - 44} y={rect.y + 14} width="30" height="24" fill={palette.fillStrong} stroke="rgba(17,17,19,0.34)" strokeWidth="2" />
            <text
              x={rect.x + rect.width - 29}
              y={rect.y + 31}
              textAnchor="end"
              fill={palette.stroke}
              fontSize="15"
              fontWeight="800"
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
  const palette = ZONE_PIXEL_PALETTE[props.zone.id];

  return (
    <>
      {ROOM_SECTOR_TILES.map((tile, index) => {
        const rect = tileToRect(tile);
        return (
          <div
            key={`${props.zone.id}-sector-${index}`}
            className={cn("pointer-events-none absolute border border-foreground/10", props.zone.borderClassName)}
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              background: tile.label === "a" ? palette.shadow : "rgba(255,252,247,0.28)",
            }}
          />
        );
      })}
    </>
  );
}

export function PixelRoute(props: {
  points: DowncityWorkboardStagePoint[];
  className?: string;
  dashed?: boolean;
}) {
  if (props.points.length < 2) return null;

  const d = props.points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <path
      d={d}
      fill="none"
      className={props.className}
      strokeWidth={3}
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeDasharray={props.dashed ? "8 8" : undefined}
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
  const palette = ZONE_PIXEL_PALETTE[props.zone.id];

  return (
    <svg
      viewBox={`0 0 ${props.stageWidth} ${props.stageHeight}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x={0} y={0} width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="rgba(238,234,224,0.96)" />
      {ROOM_FLOOR_TILES.map((tile, index) => (
        <TileRectSvg key={`room-floor-${index}`} tile={tile} fill="rgba(255,252,247,0.86)" stroke="rgba(17,17,19,0.06)" />
      ))}
      {ROOM_SECTOR_TILES.map((tile, index) => (
        <TileRectSvg
          key={`room-sector-${index}`}
          tile={tile}
          fill={tile.label === "a" ? palette.fill : "rgba(255,252,247,0.72)"}
          stroke="rgba(17,17,19,0.1)"
          opacity={0.82}
        />
      ))}
      {ROOM_CORRIDOR_TILES.map((tile, index) => (
        <TileRectSvg key={`room-corridor-${index}`} tile={tile} fill="rgba(91,86,78,0.18)" stroke="rgba(17,17,19,0.08)" />
      ))}
      {ROOM_DOOR_TILES.map((tile, index) => (
        <TileRectSvg key={`room-door-${index}`} tile={tile} fill="rgba(255,252,247,0.96)" stroke={palette.line} />
      ))}
      {props.pointsOfInterest.map((item, index) => (
        <g key={`prop-${index}`} opacity={0.95}>
          {item.kind === "hub" ? null : renderFocusedProp(item)}
        </g>
      ))}
      {props.areaLabels.map((item, index) => (
        <g key={`label-${index}`} opacity={0.94}>
          <rect
            x={item.x}
            y={item.y}
            width={Math.max(72, estimateTextWidth(item.label) + 16)}
            height="20"
            fill="rgba(255,252,247,0.94)"
            stroke="rgba(17,17,19,0.34)"
            strokeWidth="2"
          />
          <text
            x={item.x + 7}
            y={item.y + 14}
            fill="rgba(17,17,19,0.72)"
            fontSize="9"
            fontWeight="700"
            fontFamily="var(--font-geist-mono, var(--font-sans))"
          >
            {item.label}
          </text>
        </g>
      ))}
      {ROOM_WALL_TILES.map((tile, index) => (
        <TileRectSvg key={`room-wall-${index}`} tile={tile} fill="rgba(40,36,32,0.74)" />
      ))}
      <rect x={460} y={286} width={80} height={68} fill="rgba(255,252,247,0.96)" stroke={palette.line} strokeWidth="3" />
      <rect x={472} y={298} width={56} height={44} fill={palette.fillStrong} opacity={0.9} />
      <rect x={490} y={312} width={20} height={16} fill={palette.stroke} opacity={0.92} />
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
  if (!props.tag) return null;

  const text = fitPixelLabel(props.tag.label, 160);
  const width = Math.max(78, estimateTextWidth(text) + 18);
  const height = 20;
  const x = Math.min(Math.max(props.tag.x - width / 2, 6), props.stageWidth - width - 6);
  const y = Math.min(Math.max(props.tag.y - height - 14, 6), props.stageHeight - height - 6);

  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={width} height={height} fill="rgba(255,252,247,0.98)" stroke="rgba(17,17,19,0.44)" strokeWidth="2" />
      <rect x={x + 10} y={y + height} width="10" height="6" fill="rgba(255,252,247,0.98)" stroke="rgba(17,17,19,0.44)" strokeWidth="2" />
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

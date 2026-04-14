/**
 * Workboard 像素地图辅助组件。
 *
 * 关键点（中文）
 * - 地图统一使用 25 x 16 的 tile 坐标系，每个 tile 对应 40px 正方块。
 * - atlas 从 tile-map 渲染，不再使用会被全屏拉伸的百分比散块。
 * - 所有地图元素只表达公开状态的空间关系，不承载内部 runtime 细节。
 */

import * as React from "react";
import type { DowncityWorkboardGameZone } from "../types/workboard-game-map";
import type {
  DowncityWorkboardHoverTag,
  DowncityWorkboardStagePoint,
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
 * Workboard 小镇中心广场坐标。
 */
export const WORKBOARD_TOWN_PLAZA_POINT: DowncityWorkboardStagePoint = { x: 500, y: 320 };

/**
 * Workboard 小镇中每个状态建筑连接主路的入口坐标。
 */
export const WORKBOARD_ZONE_GATE_POINTS: Record<DowncityWorkboardZoneId, DowncityWorkboardStagePoint> = {
  engaged: { x: 240, y: 300 },
  steady: { x: 760, y: 300 },
  quiet: { x: 240, y: 340 },
  drift: { x: 760, y: 340 },
};

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
    entrance: "bottom",
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
    entrance: "bottom",
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
    entrance: "top",
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
    entrance: "top",
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

const TOWN_SHRUB_POINTS: TilePoint[] = [
  { col: 4, row: 1 },
  { col: 9, row: 1 },
  { col: 15, row: 1 },
  { col: 22, row: 5 },
  { col: 2, row: 7 },
  { col: 22, row: 8 },
  { col: 10, row: 14 },
  { col: 15, row: 14 },
  { col: 3, row: 15 },
  { col: 21, row: 15 },
];

const TOWN_FLOWER_POINTS: TilePoint[] = [
  { col: 4, row: 8 },
  { col: 9, row: 8 },
  { col: 15, row: 7 },
  { col: 21, row: 8 },
  { col: 11, row: 4 },
  { col: 13, row: 11 },
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
    const fill = (col + row) % 2 === 0 ? "rgba(104,136,76,0.98)" : "rgba(91,124,70,0.98)";
    const rect = tileToRect({ col, row, cols: 1, rows: 1 });

    return (
      <g key={`grass-${col}-${row}`}>
        <rect x={rect.x} y={rect.y} width={TILE_SIZE} height={TILE_SIZE} fill={fill} />
        <rect x={rect.x + 6} y={rect.y + 8} width="4" height="4" fill="rgba(40,78,45,0.26)" />
        <rect x={rect.x + 27} y={rect.y + 25} width="4" height="4" fill="rgba(142,161,89,0.18)" />
      </g>
    );
  });
}

function renderTownPath(tile: TileRect, index: number): React.ReactNode {
  const rect = tileToRect(tile);
  const cobbles = Array.from({ length: tile.cols * tile.rows }, (_, cobbleIndex) => {
    const col = tile.col + (cobbleIndex % tile.cols);
    const row = tile.row + Math.floor(cobbleIndex / tile.cols);
    const x = col * TILE_SIZE + ((col + row) % 2 === 0 ? 8 : 22);
    const y = row * TILE_SIZE + ((col * 3 + row) % 2 === 0 ? 10 : 24);
    return <rect key={`town-path-cobble-${index}-${cobbleIndex}`} x={x} y={y} width="8" height="5" fill="rgba(134,105,67,0.24)" />;
  });

  return (
    <g key={`town-path-${index}`}>
      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="rgba(193,165,104,0.98)" />
      <rect x={rect.x} y={rect.y} width={rect.width} height="4" fill="rgba(116,92,62,0.34)" />
      <rect x={rect.x} y={rect.y + rect.height - 4} width={rect.width} height="4" fill="rgba(116,92,62,0.28)" />
      {cobbles}
    </g>
  );
}

function renderTownWater(tile: TileRect, index: number): React.ReactNode {
  const rect = tileToRect(tile);
  return (
    <g key={`town-water-${index}`}>
      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="rgba(82,139,149,0.9)" />
      <rect x={rect.x + 8} y={rect.y + 10} width={Math.max(12, rect.width - 16)} height="4" fill="rgba(160,205,199,0.34)" />
      <rect x={rect.x + 18} y={rect.y + rect.height - 14} width={Math.max(18, rect.width - 48)} height="4" fill="rgba(53,103,112,0.24)" />
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

function renderShrub(point: TilePoint, index: number): React.ReactNode {
  const x = point.col * TILE_SIZE;
  const y = point.row * TILE_SIZE;
  return (
    <g key={`shrub-${index}`}>
      <rect x={x + 8} y={y + 18} width="24" height="12" fill="rgba(53,111,61,0.86)" />
      <rect x={x + 14} y={y + 12} width="14" height="10" fill="rgba(72,132,67,0.9)" />
      <rect x={x + 5} y={y + 27} width="30" height="5" fill="rgba(33,76,43,0.32)" />
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
  const doorX = rect.x + rect.width / 2 - 24;
  const doorY = building.entrance === "top" ? rect.y - 6 : rect.y + rect.height - 10;
  const stepY = building.entrance === "top" ? rect.y - 22 : rect.y + rect.height + 6;

  return (
    <g key={`town-building-${building.zoneId}`}>
      <rect x={doorX + 4} y={stepY} width="40" height="22" fill="rgba(193,165,104,0.92)" opacity="0.9" />
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
      <rect x={doorX} y={doorY} width="48" height="16" fill="rgba(226,204,139,0.98)" />
      <rect x={doorX + 8} y={doorY + 4} width="32" height="8" fill="rgba(91,65,44,0.55)" />
      {building.props.map(renderTownProp)}
      <rect x={rect.x - 8} y={rect.y - 8} width={rect.width + 16} height={rect.height + 16} fill="none" stroke={active ? ZONE_PIXEL_PALETTE[building.zoneId].stroke : "rgba(17,17,19,0.34)"} strokeWidth={active ? 5 : 3} />
    </g>
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
      {TOWN_SHRUB_POINTS.map(renderShrub)}
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

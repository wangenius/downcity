/**
 * Workboard 子地图像素场景渲染器。
 *
 * 关键点（中文）
 * - 子地图完全按 tile-map 渲染，避免用 UI 卡片模拟地图。
 * - 每个状态簇拥有独立房间布局，进入 room 后像进入不同建筑。
 * - 这里只消费公开的 zone / POI / label，不暴露 agent 内部执行细节。
 */

import * as React from "react";
import {
  WORKBOARD_ROOM_PALETTE,
  WORKBOARD_ROOM_PLANS,
} from "./workboard-room-layout";
import type {
  DowncityWorkboardGameAreaLabel,
  DowncityWorkboardGamePointOfInterest,
} from "../types/workboard-game-map";
import type {
  DowncityWorkboardZoneDefinition,
  DowncityWorkboardZoneId,
} from "../types/workboard-stage";
import type {
  WorkboardRoomMapProp,
  WorkboardTilePoint as TilePoint,
  WorkboardTileRect as TileRect,
} from "../types/workboard-stage-map";

const TILE_SIZE = 40;
const GRID_COLS = 25;
const GRID_ROWS = 16;
const STAGE_WIDTH = TILE_SIZE * GRID_COLS;
const STAGE_HEIGHT = TILE_SIZE * GRID_ROWS;

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

function renderGrassTiles(): React.ReactNode[] {
  return Array.from({ length: GRID_COLS * GRID_ROWS }, (_, index) => {
    const col = index % GRID_COLS;
    const row = Math.floor(index / GRID_COLS);
    const rect = tileToRect({ col, row, cols: 1, rows: 1 });
    const fill = (col + row) % 2 === 0 ? "rgba(104,136,76,0.98)" : "rgba(91,124,70,0.98)";

    return (
      <g key={`room-grass-${col}-${row}`}>
        <rect x={rect.x} y={rect.y} width={TILE_SIZE} height={TILE_SIZE} fill={fill} />
        <rect x={rect.x + 6} y={rect.y + 8} width="4" height="4" fill="rgba(40,78,45,0.24)" />
        <rect x={rect.x + 27} y={rect.y + 25} width="4" height="4" fill="rgba(142,161,89,0.18)" />
      </g>
    );
  });
}

function renderPath(tile: TileRect, index: number): React.ReactNode {
  const rect = tileToRect(tile);
  return (
    <g key={`room-path-${index}`}>
      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="rgba(210,184,120,0.98)" />
      <rect x={rect.x} y={rect.y + rect.height - 5} width={rect.width} height="5" fill="rgba(137,104,67,0.28)" />
      {Array.from({ length: Math.max(1, tile.cols * tile.rows) }, (_, chipIndex) => (
        <rect
          key={`room-path-chip-${index}-${chipIndex}`}
          x={rect.x + 8 + (chipIndex % Math.max(1, tile.cols)) * TILE_SIZE}
          y={rect.y + 10 + Math.floor(chipIndex / Math.max(1, tile.cols)) * TILE_SIZE}
          width="12"
          height="4"
          fill="rgba(96,74,51,0.16)"
        />
      ))}
    </g>
  );
}

function renderTree(point: TilePoint, index: number): React.ReactNode {
  const x = point.col * TILE_SIZE;
  const y = point.row * TILE_SIZE;
  return (
    <g key={`room-tree-${index}`}>
      <rect x={x + 17} y={y + 22} width="8" height="18" fill="rgba(92,62,40,0.94)" />
      <rect x={x + 10} y={y + 10} width="22" height="18" fill="rgba(74,126,76,0.98)" />
      <rect x={x + 5} y={y + 17} width="32" height="16" fill="rgba(61,112,65,0.98)" />
      <rect x={x + 14} y={y + 4} width="18" height="12" fill="rgba(91,150,82,0.96)" />
    </g>
  );
}

function renderShrub(point: TilePoint, index: number): React.ReactNode {
  const x = point.col * TILE_SIZE;
  const y = point.row * TILE_SIZE;
  return (
    <g key={`room-shrub-${index}`}>
      <rect x={x + 5} y={y + 22} width="12" height="9" fill="rgba(70,121,66,0.96)" />
      <rect x={x + 15} y={y + 18} width="18" height="12" fill="rgba(87,142,75,0.96)" />
      <rect x={x + 28} y={y + 24} width="7" height="7" fill="rgba(58,103,58,0.9)" />
    </g>
  );
}

function renderFloor(tile: TileRect, index: number, palette: (typeof WORKBOARD_ROOM_PALETTE)[DowncityWorkboardZoneId]): React.ReactNode {
  return (
    <g key={`room-floor-${index}`}>
      {Array.from({ length: tile.cols * tile.rows }, (_, plankIndex) => {
        const col = tile.col + (plankIndex % tile.cols);
        const row = tile.row + Math.floor(plankIndex / tile.cols);
        const rect = tileToRect({ col, row, cols: 1, rows: 1 });
        return (
          <g key={`room-plank-${index}-${col}-${row}`}>
            <rect x={rect.x} y={rect.y} width={TILE_SIZE} height={TILE_SIZE} fill={(col + row) % 2 === 0 ? palette.floorA : palette.floorB} />
            <rect x={rect.x} y={rect.y + TILE_SIZE - 4} width={TILE_SIZE} height="4" fill="rgba(81,56,39,0.2)" />
            <rect x={rect.x + 10} y={rect.y + 12} width="10" height="4" fill="rgba(248,214,149,0.13)" />
          </g>
        );
      })}
    </g>
  );
}

function renderBlock(tile: TileRect, index: number, fill: string, stroke?: string): React.ReactNode {
  const rect = tileToRect(tile);
  return (
    <rect
      key={`room-block-${index}`}
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      fill={fill}
      stroke={stroke}
      strokeWidth={stroke ? 2 : undefined}
    />
  );
}

function renderWall(tile: TileRect, index: number, palette: (typeof WORKBOARD_ROOM_PALETTE)[DowncityWorkboardZoneId]): React.ReactNode {
  const rect = tileToRect(tile);
  return (
    <g key={`room-wall-${index}`}>
      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={palette.wall} />
      <rect x={rect.x + 4} y={rect.y + 4} width={Math.max(0, rect.width - 8)} height={Math.max(0, rect.height - 8)} fill={palette.wallLight} />
      <rect x={rect.x} y={rect.y} width={rect.width} height="5" fill="rgba(242,168,97,0.32)" />
    </g>
  );
}

function renderDoor(tile: TileRect, index: number): React.ReactNode {
  const rect = tileToRect(tile);
  return (
    <g key={`room-door-${index}`}>
      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="rgba(215,184,110,0.98)" />
      <rect x={rect.x + 8} y={rect.y + 10} width={Math.max(10, rect.width - 16)} height="5" fill="rgba(95,69,43,0.34)" />
    </g>
  );
}

function renderRug(tile: TileRect, index: number, palette: (typeof WORKBOARD_ROOM_PALETTE)[DowncityWorkboardZoneId]): React.ReactNode {
  const rect = tileToRect(tile);
  return (
    <g key={`room-rug-${index}`}>
      <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill={index === 0 ? palette.rug : palette.rugStrong} />
      <rect x={rect.x + 8} y={rect.y + 8} width={Math.max(0, rect.width - 16)} height={Math.max(0, rect.height - 16)} fill="none" stroke={palette.accent} strokeWidth="3" opacity="0.42" />
    </g>
  );
}

function renderRoomProp(prop: WorkboardRoomMapProp | DowncityWorkboardGamePointOfInterest): React.ReactNode {
  if (prop.kind === "hub") return null;

  if (prop.kind === "board") {
    return (
      <g>
        <rect x={prop.x} y={prop.y} width="170" height="82" fill="rgba(196,127,73,0.98)" stroke="rgba(94,61,39,0.9)" strokeWidth="4" />
        <rect x={prop.x + 12} y={prop.y + 12} width="54" height="24" fill="rgba(255,241,189,0.92)" />
        <rect x={prop.x + 78} y={prop.y + 12} width="72" height="18" fill="rgba(255,241,189,0.86)" />
        <rect x={prop.x + 18} y={prop.y + 48} width="132" height="18" fill="rgba(255,241,189,0.78)" />
      </g>
    );
  }

  if (prop.kind === "blueprint") {
    return (
      <g>
        <rect x={prop.x} y={prop.y + 22} width="120" height="34" fill="rgba(111,78,47,0.9)" />
        <rect x={prop.x + 10} y={prop.y} width="100" height="64" fill="rgba(67,116,138,0.96)" stroke="rgba(53,37,22,0.6)" strokeWidth="3" />
        <rect x={prop.x + 22} y={prop.y + 12} width="30" height="18" fill="none" stroke="rgba(219,236,224,0.78)" strokeWidth="3" />
        <path d={`M ${prop.x + 64} ${prop.y + 16} H ${prop.x + 94} V ${prop.y + 42} H ${prop.x + 44}`} fill="none" stroke="rgba(219,236,224,0.7)" strokeWidth="3" />
      </g>
    );
  }

  if (prop.kind === "desk" || prop.kind === "table") {
    return (
      <g>
        <rect x={prop.x} y={prop.y} width={prop.kind === "table" ? 48 : 32} height={prop.kind === "table" ? 24 : 12} fill="rgba(126,91,67,0.94)" />
        <rect x={prop.x + 4} y={prop.y + 16} width="6" height="14" fill="rgba(77,57,43,0.9)" />
        <rect x={prop.x + 32} y={prop.y + 16} width="6" height="14" fill="rgba(77,57,43,0.9)" />
      </g>
    );
  }

  if (prop.kind === "rack") {
    return (
      <g>
        <rect x={prop.x} y={prop.y} width="14" height="36" fill="rgba(88,82,75,0.92)" />
        <rect x={prop.x + 5} y={prop.y + 6} width="24" height="5" fill="rgba(166,149,112,0.88)" />
        <rect x={prop.x + 5} y={prop.y + 18} width="24" height="5" fill="rgba(166,149,112,0.88)" />
        <rect x={prop.x + 5} y={prop.y + 30} width="24" height="5" fill="rgba(166,149,112,0.88)" />
      </g>
    );
  }

  if (prop.kind === "console") {
    return (
      <g>
        <rect x={prop.x} y={prop.y} width="34" height="22" fill="rgba(72,95,86,0.94)" />
        <rect x={prop.x + 7} y={prop.y + 6} width="18" height="6" fill="rgba(215,236,222,0.92)" />
        <rect x={prop.x + 7} y={prop.y + 22} width="6" height="12" fill="rgba(56,64,60,0.88)" />
        <rect x={prop.x + 22} y={prop.y + 22} width="6" height="12" fill="rgba(56,64,60,0.88)" />
      </g>
    );
  }

  if (prop.kind === "bench") {
    return (
      <g>
        <rect x={prop.x} y={prop.y} width="44" height="10" fill="rgba(145,108,76,0.92)" />
        <rect x={prop.x + 7} y={prop.y + 10} width="5" height="14" fill="rgba(82,62,49,0.9)" />
        <rect x={prop.x + 32} y={prop.y + 10} width="5" height="14" fill="rgba(82,62,49,0.9)" />
      </g>
    );
  }

  if (prop.kind === "plant") {
    return (
      <g>
        <rect x={prop.x + 6} y={prop.y + 18} width="16" height="12" fill="rgba(127,90,63,0.92)" />
        <rect x={prop.x + 3} y={prop.y + 8} width="22" height="14" fill="rgba(100,145,80,0.92)" />
        <rect x={prop.x + 10} y={prop.y} width="8" height="12" fill="rgba(136,179,101,0.9)" />
      </g>
    );
  }

  if (prop.kind === "bed") {
    return (
      <g>
        <rect x={prop.x} y={prop.y} width="52" height="34" fill="rgba(111,82,63,0.95)" />
        <rect x={prop.x + 5} y={prop.y + 5} width="18" height="12" fill="rgba(238,229,198,0.94)" />
        <rect x={prop.x + 25} y={prop.y + 5} width="22" height="24" fill="rgba(151,168,181,0.84)" />
      </g>
    );
  }

  return (
    <g>
      <rect x={prop.x} y={prop.y + 4} width="20" height="18" fill="rgba(143,105,70,0.9)" />
      <rect x={prop.x + 20} y={prop.y + 8} width="14" height="14" fill="rgba(177,136,94,0.9)" />
    </g>
  );
}

function renderAreaLabel(label: DowncityWorkboardGameAreaLabel, index: number): React.ReactNode {
  const width = Math.max(72, estimateTextWidth(label.label) + 16);
  return (
    <g key={`room-label-${index}`} opacity="0.94">
      <rect x={label.x} y={label.y} width={width} height="20" fill="rgba(250,236,178,0.94)" stroke="rgba(110,77,47,0.64)" strokeWidth="2" />
      <text
        x={label.x + 7}
        y={label.y + 14}
        fill="rgba(17,17,19,0.72)"
        fontSize="9"
        fontWeight="700"
        fontFamily="var(--font-geist-mono, var(--font-sans))"
      >
        {label.label}
      </text>
    </g>
  );
}

function renderHub(zone: DowncityWorkboardZoneDefinition, palette: (typeof WORKBOARD_ROOM_PALETTE)[DowncityWorkboardZoneId]) {
  return (
    <g>
      <rect x={456} y={282} width="88" height="76" fill="rgba(250,236,178,0.94)" stroke={palette.accent} strokeWidth="4" />
      <rect x={470} y={296} width="60" height="46" fill={palette.rugStrong} opacity="0.9" />
      <rect x={490} y={312} width="20" height="16" fill={palette.accent} opacity="0.92" />
      <rect x={482} y={360} width="36" height="12" fill="rgba(111,78,47,0.82)" />
      <text
        x="500"
        y="277"
        textAnchor="middle"
        fill={palette.accent}
        fontSize="10"
        fontWeight="800"
        fontFamily="var(--font-geist-mono, var(--font-sans))"
      >
        {zone.badge.toUpperCase()}
      </text>
    </g>
  );
}

/**
 * 渲染进入某个状态簇后的完整房间地图。
 */
export function WorkboardRoomField(props: {
  zone: DowncityWorkboardZoneDefinition;
  stageWidth: number;
  stageHeight: number;
  pointsOfInterest: DowncityWorkboardGamePointOfInterest[];
  areaLabels: DowncityWorkboardGameAreaLabel[];
}) {
  const plan = WORKBOARD_ROOM_PLANS[props.zone.id];
  const palette = WORKBOARD_ROOM_PALETTE[props.zone.id];
  const externalPoi = props.pointsOfInterest.filter((item) => item.kind !== "hub");

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
      {plan.exteriorPaths.map(renderPath)}
      {plan.trees.map(renderTree)}
      {plan.shrubs.map(renderShrub)}
      {plan.floors.map((tile, index) => renderFloor(tile, index, palette))}
      {plan.corridors.map((tile, index) => renderBlock(tile, index, "rgba(203,171,104,0.96)", "rgba(92,67,45,0.2)"))}
      {plan.rugs.map((tile, index) => renderRug(tile, index, palette))}
      {plan.props.map((prop) => (
        <g key={prop.id} opacity="0.96">{renderRoomProp(prop)}</g>
      ))}
      {externalPoi.map((poi) => (
        <g key={poi.id} opacity="0.58">{renderRoomProp(poi)}</g>
      ))}
      {props.areaLabels.map(renderAreaLabel)}
      {plan.walls.map((tile, index) => renderWall(tile, index, palette))}
      {plan.doors.map(renderDoor)}
      {renderHub(props.zone, palette)}
    </svg>
  );
}

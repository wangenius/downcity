/**
 * Workboard room 地图布局数据。
 *
 * 关键点（中文）
 * - 这里集中保存每个状态簇的 room tile plan、station 点位和巡游路线。
 * - 渲染层与 motion 层必须读取同一份布局，避免 sprite 路线与墙体/门洞脱节。
 * - 该模块只包含公开状态的空间映射，不包含任何 agent 内部执行细节。
 */

import type { DowncityWorkboardStagePoint, DowncityWorkboardZoneId } from "../types/workboard-stage";
import type { WorkboardRoomMapPlan } from "../types/workboard-stage-map";

export const WORKBOARD_ROOM_PALETTE: Record<
  DowncityWorkboardZoneId,
  { floorA: string; floorB: string; wall: string; wallLight: string; rug: string; rugStrong: string; accent: string }
> = {
  engaged: {
    floorA: "rgba(217,160,111,0.98)",
    floorB: "rgba(198,139,94,0.98)",
    wall: "rgba(107,58,45,0.98)",
    wallLight: "rgba(154,86,61,0.94)",
    rug: "rgba(183,69,50,0.72)",
    rugStrong: "rgba(226,118,77,0.86)",
    accent: "rgba(39,110,80,0.95)",
  },
  steady: {
    floorA: "rgba(218,190,111,0.98)",
    floorB: "rgba(197,166,91,0.98)",
    wall: "rgba(94,76,51,0.98)",
    wallLight: "rgba(139,113,70,0.94)",
    rug: "rgba(148,169,72,0.72)",
    rugStrong: "rgba(188,207,91,0.88)",
    accent: "rgba(112,132,38,0.92)",
  },
  quiet: {
    floorA: "rgba(205,194,166,0.98)",
    floorB: "rgba(186,174,148,0.98)",
    wall: "rgba(89,82,73,0.98)",
    wallLight: "rgba(126,117,103,0.94)",
    rug: "rgba(123,132,144,0.62)",
    rugStrong: "rgba(171,179,186,0.86)",
    accent: "rgba(103,96,87,0.9)",
  },
  drift: {
    floorA: "rgba(223,166,95,0.98)",
    floorB: "rgba(202,137,75,0.98)",
    wall: "rgba(121,66,36,0.98)",
    wallLight: "rgba(172,94,49,0.94)",
    rug: "rgba(196,89,44,0.72)",
    rugStrong: "rgba(236,145,65,0.9)",
    accent: "rgba(161,91,32,0.92)",
  },
};

const LARGE_ROOM_FLOORS = [
  { col: 2, row: 3, cols: 8, rows: 6 },
  { col: 11, row: 3, cols: 8, rows: 6 },
  { col: 21, row: 3, cols: 8, rows: 6 },
  { col: 30, row: 3, cols: 8, rows: 6 },
  { col: 2, row: 15, cols: 8, rows: 7 },
  { col: 11, row: 15, cols: 8, rows: 7 },
  { col: 21, row: 15, cols: 8, rows: 7 },
  { col: 30, row: 15, cols: 8, rows: 7 },
] satisfies WorkboardRoomMapPlan["floors"];

const LARGE_ROOM_CORRIDORS = [
  { col: 1, row: 10, cols: 38, rows: 4 },
  { col: 19, row: 0, cols: 2, rows: 24 },
  { col: 9, row: 8, cols: 11, rows: 2 },
  { col: 20, row: 8, cols: 11, rows: 2 },
  { col: 9, row: 14, cols: 11, rows: 2 },
  { col: 20, row: 14, cols: 11, rows: 2 },
] satisfies WorkboardRoomMapPlan["corridors"];

const LARGE_ROOM_WALLS = [
  { col: 1, row: 2, cols: 38, rows: 1 },
  { col: 1, row: 22, cols: 38, rows: 1 },
  { col: 1, row: 2, cols: 1, rows: 21 },
  { col: 38, row: 2, cols: 1, rows: 21 },
  { col: 10, row: 3, cols: 1, rows: 6 },
  { col: 20, row: 3, cols: 1, rows: 6 },
  { col: 29, row: 3, cols: 1, rows: 6 },
  { col: 10, row: 15, cols: 1, rows: 7 },
  { col: 20, row: 15, cols: 1, rows: 7 },
  { col: 29, row: 15, cols: 1, rows: 7 },
  { col: 2, row: 9, cols: 17, rows: 1 },
  { col: 21, row: 9, cols: 17, rows: 1 },
  { col: 2, row: 14, cols: 17, rows: 1 },
  { col: 21, row: 14, cols: 17, rows: 1 },
] satisfies WorkboardRoomMapPlan["walls"];

const LARGE_ROOM_DOORS = [
  { col: 5, row: 9, cols: 2, rows: 1 },
  { col: 14, row: 9, cols: 2, rows: 1 },
  { col: 24, row: 9, cols: 2, rows: 1 },
  { col: 33, row: 9, cols: 2, rows: 1 },
  { col: 5, row: 14, cols: 2, rows: 1 },
  { col: 14, row: 14, cols: 2, rows: 1 },
  { col: 24, row: 14, cols: 2, rows: 1 },
  { col: 33, row: 14, cols: 2, rows: 1 },
  { col: 20, row: 5, cols: 1, rows: 2 },
  { col: 20, row: 17, cols: 1, rows: 2 },
] satisfies WorkboardRoomMapPlan["doors"];

const LARGE_ROOM_EXTERIOR_PATHS = [
  { col: 0, row: 10, cols: 40, rows: 4 },
  { col: 19, row: 0, cols: 2, rows: 24 },
  { col: 0, row: 0, cols: 6, rows: 1 },
  { col: 34, row: 0, cols: 6, rows: 1 },
  { col: 0, row: 23, cols: 6, rows: 1 },
  { col: 34, row: 23, cols: 6, rows: 1 },
] satisfies WorkboardRoomMapPlan["exteriorPaths"];

const LARGE_ROOM_TREES = [
  { col: 1, row: 2 },
  { col: 13, row: 1 },
  { col: 26, row: 1 },
  { col: 38, row: 2 },
  { col: 1, row: 22 },
  { col: 13, row: 22 },
  { col: 26, row: 22 },
  { col: 38, row: 22 },
] satisfies WorkboardRoomMapPlan["trees"];

const LARGE_ROOM_SHRUBS = [
  { col: 6, row: 1 },
  { col: 12, row: 9 },
  { col: 27, row: 9 },
  { col: 33, row: 1 },
  { col: 6, row: 22 },
  { col: 12, row: 14 },
  { col: 27, row: 14 },
  { col: 33, row: 22 },
] satisfies WorkboardRoomMapPlan["shrubs"];

function createRoomPlan(zoneId: DowncityWorkboardZoneId): WorkboardRoomMapPlan {
  const focusedRugs: Record<DowncityWorkboardZoneId, WorkboardRoomMapPlan["rugs"]> = {
    engaged: [
      { col: 17, row: 9, cols: 6, rows: 6 },
      { col: 2, row: 3, cols: 8, rows: 6 },
      { col: 30, row: 3, cols: 8, rows: 6 },
    ],
    steady: [
      { col: 2, row: 10, cols: 36, rows: 4 },
      { col: 18, row: 3, cols: 4, rows: 19 },
    ],
    quiet: [
      { col: 17, row: 9, cols: 6, rows: 6 },
      { col: 2, row: 15, cols: 8, rows: 7 },
      { col: 30, row: 15, cols: 8, rows: 7 },
    ],
    drift: [
      { col: 16, row: 8, cols: 8, rows: 8 },
      { col: 2, row: 3, cols: 8, rows: 6 },
      { col: 30, row: 15, cols: 8, rows: 7 },
    ],
  };

  const focusedProps: Record<DowncityWorkboardZoneId, WorkboardRoomMapPlan["props"]> = {
    engaged: [
      { id: "engaged-board", kind: "board", x: 140, y: 654 },
      { id: "engaged-blueprint", kind: "blueprint", x: 1260, y: 650 },
      { id: "engaged-console-a", kind: "console", x: 710, y: 158 },
      { id: "engaged-rack-a", kind: "rack", x: 1352, y: 152 },
      { id: "engaged-table-a", kind: "table", x: 206, y: 206 },
      { id: "engaged-table-b", kind: "table", x: 1214, y: 688 },
    ],
    steady: [
      { id: "steady-board", kind: "board", x: 140, y: 654 },
      { id: "steady-blueprint", kind: "blueprint", x: 1260, y: 650 },
      { id: "steady-bench-a", kind: "bench", x: 210, y: 200 },
      { id: "steady-rack-a", kind: "rack", x: 706, y: 156 },
      { id: "steady-crate-a", kind: "crate", x: 904, y: 682 },
      { id: "steady-console-a", kind: "console", x: 1326, y: 192 },
    ],
    quiet: [
      { id: "quiet-board", kind: "board", x: 140, y: 654 },
      { id: "quiet-blueprint", kind: "blueprint", x: 1260, y: 650 },
      { id: "quiet-bed-a", kind: "bed", x: 196, y: 182 },
      { id: "quiet-bed-b", kind: "bed", x: 1292, y: 182 },
      { id: "quiet-bed-c", kind: "bed", x: 684, y: 684 },
      { id: "quiet-plant-a", kind: "plant", x: 906, y: 166 },
    ],
    drift: [
      { id: "drift-board", kind: "board", x: 140, y: 654 },
      { id: "drift-blueprint", kind: "blueprint", x: 1260, y: 650 },
      { id: "drift-console-a", kind: "console", x: 706, y: 156 },
      { id: "drift-rack-a", kind: "rack", x: 1328, y: 190 },
      { id: "drift-crate-a", kind: "crate", x: 210, y: 684 },
      { id: "drift-bench-a", kind: "bench", x: 1190, y: 686 },
    ],
  };

  return {
    floors: LARGE_ROOM_FLOORS,
    corridors: LARGE_ROOM_CORRIDORS,
    rugs: focusedRugs[zoneId],
    walls: LARGE_ROOM_WALLS,
    doors: LARGE_ROOM_DOORS,
    exteriorPaths: LARGE_ROOM_EXTERIOR_PATHS,
    trees: LARGE_ROOM_TREES,
    shrubs: LARGE_ROOM_SHRUBS,
    props: focusedProps[zoneId],
  };
}

export const WORKBOARD_ROOM_PLANS: Record<DowncityWorkboardZoneId, WorkboardRoomMapPlan> = {
  engaged: createRoomPlan("engaged"),
  steady: createRoomPlan("steady"),
  quiet: createRoomPlan("quiet"),
  drift: createRoomPlan("drift"),
};

export const WORKBOARD_FOCUSED_STATIONS_BY_ZONE: Record<DowncityWorkboardZoneId, DowncityWorkboardStagePoint[]> = {
  engaged: [
    { x: 250, y: 206 },
    { x: 686, y: 194 },
    { x: 1236, y: 206 },
    { x: 360, y: 460 },
    { x: 940, y: 460 },
    { x: 250, y: 714 },
    { x: 686, y: 730 },
    { x: 1236, y: 714 },
  ],
  steady: [
    { x: 246, y: 196 },
    { x: 668, y: 206 },
    { x: 934, y: 206 },
    { x: 1350, y: 196 },
    { x: 366, y: 480 },
    { x: 250, y: 728 },
    { x: 800, y: 730 },
    { x: 1350, y: 728 },
  ],
  quiet: [
    { x: 250, y: 206 },
    { x: 688, y: 206 },
    { x: 1238, y: 206 },
    { x: 360, y: 480 },
    { x: 940, y: 480 },
    { x: 250, y: 714 },
    { x: 688, y: 730 },
    { x: 1238, y: 714 },
  ],
  drift: [
    { x: 250, y: 206 },
    { x: 688, y: 194 },
    { x: 1238, y: 206 },
    { x: 360, y: 480 },
    { x: 940, y: 480 },
    { x: 250, y: 714 },
    { x: 800, y: 730 },
    { x: 1238, y: 714 },
  ],
};

export const WORKBOARD_FOCUSED_PATROL_ROUTES: Record<DowncityWorkboardZoneId, DowncityWorkboardStagePoint[][]> = {
  engaged: [
    [
      { x: 240, y: 200 },
      { x: 800, y: 200 },
      { x: 1360, y: 200 },
      { x: 1360, y: 480 },
      { x: 1360, y: 720 },
      { x: 800, y: 720 },
      { x: 240, y: 720 },
      { x: 240, y: 480 },
    ],
    [
      { x: 420, y: 320 },
      { x: 800, y: 320 },
      { x: 1180, y: 320 },
      { x: 1180, y: 480 },
      { x: 1180, y: 620 },
      { x: 800, y: 620 },
      { x: 420, y: 620 },
      { x: 420, y: 480 },
    ],
    [
      { x: 240, y: 480 },
      { x: 800, y: 480 },
      { x: 1360, y: 480 },
      { x: 800, y: 480 },
      { x: 800, y: 200 },
      { x: 800, y: 720 },
      { x: 800, y: 480 },
    ],
  ],
  steady: [
    [
      { x: 240, y: 480 },
      { x: 800, y: 480 },
      { x: 1360, y: 480 },
      { x: 1360, y: 720 },
      { x: 800, y: 720 },
      { x: 240, y: 720 },
    ],
    [
      { x: 240, y: 200 },
      { x: 800, y: 200 },
      { x: 1360, y: 200 },
      { x: 1360, y: 480 },
      { x: 800, y: 480 },
      { x: 240, y: 480 },
    ],
    [
      { x: 800, y: 160 },
      { x: 800, y: 800 },
      { x: 1080, y: 800 },
      { x: 1080, y: 480 },
      { x: 520, y: 480 },
      { x: 520, y: 800 },
      { x: 800, y: 800 },
    ],
  ],
  quiet: [
    [
      { x: 240, y: 200 },
      { x: 800, y: 200 },
      { x: 1360, y: 200 },
      { x: 1360, y: 720 },
      { x: 800, y: 720 },
      { x: 240, y: 720 },
    ],
    [
      { x: 420, y: 480 },
      { x: 800, y: 480 },
      { x: 1180, y: 480 },
      { x: 1180, y: 640 },
      { x: 800, y: 640 },
      { x: 420, y: 640 },
    ],
    [
      { x: 800, y: 200 },
      { x: 800, y: 720 },
      { x: 420, y: 720 },
      { x: 420, y: 480 },
      { x: 1180, y: 480 },
      { x: 1180, y: 720 },
      { x: 800, y: 720 },
    ],
  ],
  drift: [
    [
      { x: 240, y: 200 },
      { x: 800, y: 200 },
      { x: 1360, y: 200 },
      { x: 1360, y: 620 },
      { x: 800, y: 720 },
      { x: 240, y: 620 },
    ],
    [
      { x: 240, y: 480 },
      { x: 800, y: 480 },
      { x: 1360, y: 480 },
      { x: 1360, y: 720 },
      { x: 800, y: 720 },
      { x: 240, y: 720 },
    ],
    [
      { x: 800, y: 160 },
      { x: 800, y: 720 },
      { x: 1080, y: 620 },
      { x: 1080, y: 320 },
      { x: 520, y: 320 },
      { x: 520, y: 620 },
      { x: 800, y: 720 },
    ],
  ],
};

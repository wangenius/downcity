/**
 * Workboard 游戏地图配置构建器。
 *
 * 关键点（中文）
 * - 这里负责把公开 board 快照映射成游戏地图层可消费的配置。
 * - 它不直接渲染，只输出 zones / actors / routes / POI / labels。
 * - 当前渲染器和未来接入的 Pxlkit 都可以复用这层配置。
 */

import {
  WORKBOARD_ZONE_DEFINITIONS,
  buildFocusedPatrolRoute,
  buildOverviewPatrolRoute,
  deriveFocusedClusterNodes,
  deriveStageNodes,
  resolveZoneId,
  toZoneHubPoint,
} from "./workboard-stage";
import type { DowncityWorkboardBoardSnapshot } from "../types/workboard";
import type {
  DowncityWorkboardGameActor,
  DowncityWorkboardGameAreaLabel,
  DowncityWorkboardGameMapConfig,
  DowncityWorkboardGamePointOfInterest,
  DowncityWorkboardGameRoute,
  DowncityWorkboardGameZone,
} from "../types/workboard-game-map";
import type { DowncityWorkboardZoneId } from "../types/workboard-stage";

const OVERVIEW_ROUTE_DWELL = 0.22;
const FOCUSED_ROUTE_DWELL = 0.28;
const PIXEL_STEP_SIZE = 2;

function resolveOverviewGate(params: {
  zoneId: DowncityWorkboardZoneId;
  route: DowncityWorkboardGameRoute["points"];
}) {
  if (params.zoneId === "engaged" || params.zoneId === "quiet") {
    return params.route[1] || params.route[0] || toZoneHubPoint(params.zoneId);
  }

  return params.route[2] || params.route[1] || params.route[0] || toZoneHubPoint(params.zoneId);
}

const FOCUSED_PROP_ITEMS: Record<
  DowncityWorkboardZoneId,
  DowncityWorkboardGamePointOfInterest[]
> = {
  engaged: [
    { id: "engaged-desk-a", kind: "desk", x: 184, y: 126 },
    { id: "engaged-console-a", kind: "console", x: 410, y: 122 },
    { id: "engaged-rack-a", kind: "rack", x: 722, y: 132 },
    { id: "engaged-bench-a", kind: "bench", x: 158, y: 300 },
    { id: "engaged-crate-a", kind: "crate", x: 512, y: 274 },
    { id: "engaged-plant-a", kind: "plant", x: 796, y: 294 },
  ],
  steady: [
    { id: "steady-desk-a", kind: "desk", x: 184, y: 126 },
    { id: "steady-console-a", kind: "console", x: 410, y: 122 },
    { id: "steady-rack-a", kind: "rack", x: 722, y: 132 },
    { id: "steady-bench-a", kind: "bench", x: 158, y: 300 },
    { id: "steady-crate-a", kind: "crate", x: 512, y: 274 },
    { id: "steady-plant-a", kind: "plant", x: 796, y: 294 },
  ],
  quiet: [
    { id: "quiet-desk-a", kind: "desk", x: 184, y: 126 },
    { id: "quiet-console-a", kind: "console", x: 410, y: 122 },
    { id: "quiet-rack-a", kind: "rack", x: 722, y: 132 },
    { id: "quiet-bench-a", kind: "bench", x: 158, y: 300 },
    { id: "quiet-crate-a", kind: "crate", x: 512, y: 274 },
    { id: "quiet-plant-a", kind: "plant", x: 796, y: 294 },
  ],
  drift: [
    { id: "drift-desk-a", kind: "desk", x: 184, y: 126 },
    { id: "drift-console-a", kind: "console", x: 410, y: 122 },
    { id: "drift-rack-a", kind: "rack", x: 722, y: 132 },
    { id: "drift-bench-a", kind: "bench", x: 158, y: 300 },
    { id: "drift-crate-a", kind: "crate", x: 512, y: 274 },
    { id: "drift-plant-a", kind: "plant", x: 796, y: 294 },
  ],
};

const FOCUSED_AREA_LABELS: Record<
  DowncityWorkboardZoneId,
  DowncityWorkboardGameAreaLabel[]
> = {
  engaged: [
    { id: "engaged-briefing", label: "briefing node", x: 124, y: 112 },
    { id: "engaged-relay", label: "relay desk", x: 352, y: 122 },
    { id: "engaged-dispatch", label: "dispatch rack", x: 662, y: 132 },
  ],
  steady: [
    { id: "steady-focus", label: "focus lane", x: 148, y: 126 },
    { id: "steady-desk", label: "steady desk", x: 386, y: 124 },
    { id: "steady-throughput", label: "throughput rail", x: 666, y: 138 },
  ],
  quiet: [
    { id: "quiet-standby", label: "standby desk", x: 136, y: 128 },
    { id: "quiet-idle", label: "idle rail", x: 404, y: 118 },
    { id: "quiet-sleep", label: "sleep shelf", x: 678, y: 136 },
  ],
  drift: [
    { id: "drift-watch", label: "watch point", x: 132, y: 126 },
    { id: "drift-issue", label: "issue console", x: 364, y: 118 },
    { id: "drift-signal", label: "signal rack", x: 668, y: 138 },
  ],
};

function buildZones(params: {
  board: DowncityWorkboardBoardSnapshot;
  activeZoneId: DowncityWorkboardZoneId;
}): DowncityWorkboardGameZone[] {
  return WORKBOARD_ZONE_DEFINITIONS.map((zone) => ({
    id: zone.id,
    title: zone.title,
    subtitle: zone.subtitle,
    description: zone.description,
    badge: zone.badge,
    count: params.board.agents.filter((item) => resolveZoneId(item) === zone.id).length,
    active: zone.id === params.activeZoneId,
    hub: toZoneHubPoint(zone.id),
  }));
}

function buildActors(params: {
  board: DowncityWorkboardBoardSnapshot;
  activeZoneId: DowncityWorkboardZoneId;
  selectedAgentId?: string;
}): DowncityWorkboardGameActor[] {
  const stageNodes = deriveStageNodes(params.board);
  const focusedLookup = new Map<
    string,
    { anchor: { x: number; y: number }; routeId: string }
  >();

  WORKBOARD_ZONE_DEFINITIONS.forEach((zone) => {
    const items = params.board.agents.filter((item) => resolveZoneId(item) === zone.id);
    const focusedNodes = deriveFocusedClusterNodes(items);

    focusedNodes.forEach((node, index) => {
      focusedLookup.set(node.item.id, {
        anchor: { x: node.x, y: node.y },
        routeId: `patrol-${zone.id}-${index % 3}`,
      });
    });
  });

  return stageNodes.map((node) => {
    const overviewRoute = buildOverviewPatrolRoute({
      zoneId: node.zone.id,
      placement: node.placement,
    });
    const focused = focusedLookup.get(node.item.id);

    return {
      id: node.item.id,
      agent: node.item,
      zoneId: node.zone.id,
      overviewAnchor: node.placement
        ? overviewRoute.slice(-2)[0] || toZoneHubPoint(node.zone.id)
        : toZoneHubPoint(node.zone.id),
      overviewRoute,
      overviewGate: resolveOverviewGate({
        zoneId: node.zone.id,
        route: overviewRoute,
      }),
      focusedAnchor: focused?.anchor,
      focusedStation: focused?.anchor,
      focusedRouteId: focused?.routeId,
      active: node.item.id === params.selectedAgentId,
    };
  });
}

function buildPatrols(params: {
  board: DowncityWorkboardBoardSnapshot;
  activeZoneId: DowncityWorkboardZoneId;
}): DowncityWorkboardGameRoute[] {
  const laneCount = Math.max(
    1,
    Math.min(
      3,
      params.board.agents.filter((item) => resolveZoneId(item) === params.activeZoneId).length,
    ),
  );

  return Array.from({ length: laneCount }, (_, index) => ({
    id: `patrol-${params.activeZoneId}-${index}`,
    kind: "patrol",
    points: buildFocusedPatrolRoute({ index }),
    zoneId: params.activeZoneId,
    dwellRatio: FOCUSED_ROUTE_DWELL,
    snapSize: PIXEL_STEP_SIZE,
    label: `lane ${index + 1}`,
    active: index === 0,
  }));
}

function buildCorridors(params: {
  actors: DowncityWorkboardGameActor[];
  activeZoneId: DowncityWorkboardZoneId;
}): DowncityWorkboardGameRoute[] {
  return params.actors.map((actor) => ({
    id: `corridor-${actor.id}`,
    kind: "corridor",
    points: actor.overviewRoute,
    zoneId: actor.zoneId,
    dwellRatio: OVERVIEW_ROUTE_DWELL,
    snapSize: PIXEL_STEP_SIZE,
    label: actor.agent.name,
    active: actor.zoneId === params.activeZoneId,
  }));
}

/**
 * 根据当前 board 构建完整游戏地图配置。
 */
export function buildWorkboardGameMapConfig(params: {
  board: DowncityWorkboardBoardSnapshot;
  activeZoneId: DowncityWorkboardZoneId;
  selectedAgentId?: string;
}): DowncityWorkboardGameMapConfig {
  const zones = buildZones(params);
  const actors = buildActors(params);
  const patrols = buildPatrols(params);
  const corridors = buildCorridors({ actors, activeZoneId: params.activeZoneId });

  return {
    board: params.board,
    activeZoneId: params.activeZoneId,
    selectedAgentId: params.selectedAgentId,
    zones,
    actors,
    corridors,
    patrols,
    pointsOfInterest: [
      ...FOCUSED_PROP_ITEMS[params.activeZoneId],
      {
        id: `${params.activeZoneId}-hub`,
        kind: "hub",
        x: 500,
        y: 320,
        active: true,
      },
    ],
    areaLabels: FOCUSED_AREA_LABELS[params.activeZoneId],
  };
}

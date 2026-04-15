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
  engaged: [],
  steady: [],
  quiet: [],
  drift: [],
};

const FOCUSED_AREA_LABELS: Record<
  DowncityWorkboardZoneId,
  DowncityWorkboardGameAreaLabel[]
> = {
  engaged: [
    { id: "engaged-briefing", label: "briefing node", x: 166, y: 118 },
    { id: "engaged-relay", label: "relay desk", x: 660, y: 118 },
    { id: "engaged-dispatch", label: "dispatch rack", x: 1194, y: 118 },
  ],
  steady: [
    { id: "steady-focus", label: "focus lane", x: 166, y: 118 },
    { id: "steady-desk", label: "steady desk", x: 660, y: 118 },
    { id: "steady-throughput", label: "throughput rail", x: 1194, y: 118 },
  ],
  quiet: [
    { id: "quiet-standby", label: "standby desk", x: 166, y: 118 },
    { id: "quiet-idle", label: "idle rail", x: 660, y: 118 },
    { id: "quiet-sleep", label: "sleep shelf", x: 1194, y: 118 },
  ],
  drift: [
    { id: "drift-watch", label: "watch point", x: 166, y: 118 },
    { id: "drift-issue", label: "issue console", x: 660, y: 118 },
    { id: "drift-signal", label: "signal rack", x: 1194, y: 118 },
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
    const focusedNodes = deriveFocusedClusterNodes(items, zone.id);

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
      overviewAnchor: overviewRoute[0] || toZoneHubPoint(node.zone.id),
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
    points: buildFocusedPatrolRoute({ index, zoneId: params.activeZoneId }),
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
        x: 800,
        y: 480,
        active: true,
      },
    ],
    areaLabels: FOCUSED_AREA_LABELS[params.activeZoneId],
  };
}

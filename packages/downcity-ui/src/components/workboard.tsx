/**
 * Workboard 游戏世界入口组件。
 *
 * 关键点（中文）
 * - 这里不再实现具体地图细节，只负责 game shell、HUD、状态切换和 motion 接线。
 * - atlas、interior、inspector 都拆成独立 renderer，避免主入口继续变成混合 dashboard。
 * - 组件仍然只消费公开 workboard 快照，所有内部 runtime 细节都不会进入 UI。
 */

import * as React from "react";
import {
  Maximize2Icon,
  Minimize2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { cn } from "../lib/utils";
import { WorkboardGameAtlas } from "./workboard-game-atlas";
import { WorkboardGameInspector } from "./workboard-game-inspector";
import { buildWorkboardGameMapConfig } from "./workboard-game-map";
import { WorkboardGameRoom } from "./workboard-game-room";
import { useWorkboardMotion } from "./workboard-motion";
import {
  WORKBOARD_STAGE_HEIGHT,
  WORKBOARD_STAGE_WIDTH,
  formatWorkboardRelativeTime,
  resolveZoneDefinition,
  resolveZoneId,
} from "./workboard-stage";
import type {
  DowncityWorkboardAgentItem,
  DowncityWorkboardProps,
} from "../types/workboard";
import type { DowncityWorkboardGameHudProps } from "../types/workboard-game-ui";
import type { DowncityWorkboardGameZone } from "../types/workboard-game-map";
import type {
  DowncityWorkboardMotionNode,
  DowncityWorkboardStageLevel,
  DowncityWorkboardZoneId,
} from "../types/workboard-stage";

const PIXEL_PANEL_CLIP = "polygon(0 6px,6px 6px,6px 0,calc(100% - 6px) 0,calc(100% - 6px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 6px) calc(100% - 6px),calc(100% - 0px) 100%,6px 100%,6px calc(100% - 6px),0 calc(100% - 6px))";

function resolveSelectedAgent(params: {
  board: DowncityWorkboardProps["board"];
  selectedAgentId?: string;
}): DowncityWorkboardAgentItem | null {
  const items = params.board?.agents || [];
  if (items.length === 0) return null;
  return items.find((item) => item.id === params.selectedAgentId) || items[0] || null;
}

function resolveZoneLead(params: {
  board: DowncityWorkboardProps["board"];
  zoneId: DowncityWorkboardZoneId;
}): DowncityWorkboardAgentItem | null {
  const items = (params.board?.agents || []).filter((item) => resolveZoneId(item) === params.zoneId);
  if (items.length === 0) return null;

  return (
    items.find((item) => item.snapshot.current.some((entry) => entry.status === "active")) ||
    items.find((item) => item.running) ||
    items[0] ||
    null
  );
}

function WorkboardGameHud(props: DowncityWorkboardGameHudProps) {
  const worldLine = [
    `sprites ${props.board.summary.totalAgents}`,
    `live ${props.board.summary.liveAgents}`,
    `active ${props.board.summary.activeAgents}`,
    `quiet ${props.board.summary.quietAgents}`,
    props.selected ? `focus ${props.selected.name}` : "focus world",
    `tick ${formatWorkboardRelativeTime(props.board.collectedAt)}`,
  ];

  return (
    <>
      <div className="absolute inset-x-2 top-2 z-40 flex flex-wrap items-start justify-between gap-2">
        <div
          className="border-2 border-border/70 bg-[rgba(255,252,247,0.92)] px-3 py-2 shadow-[0_3px_0_rgba(17,17,19,0.12)]"
          style={{ clipPath: PIXEL_PANEL_CLIP }}
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-foreground/42">
            {props.stageLevel === "clusters" ? "world map" : `${props.activeZone.title} room`}
          </div>
          <div className="mt-1 text-lg font-semibold leading-none tracking-[-0.06em] text-foreground">
            Workboard Game World
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.16em] text-foreground/42">
            {worldLine.map((item, index) => (
              <React.Fragment key={item}>
                {index > 0 ? <span className="text-foreground/20">/</span> : null}
                <span>{item}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-1.5">
          {props.stageLevel === "agents" ? (
            <button
              type="button"
              onClick={props.onBackToAtlas}
              className="border-2 border-border/70 bg-[rgba(255,252,247,0.9)] px-2 py-1 text-[11px] uppercase tracking-[0.14em] shadow-[0_2px_0_rgba(17,17,19,0.12)] transition-[filter] hover:brightness-105"
              style={{ clipPath: PIXEL_PANEL_CLIP }}
            >
              world
            </button>
          ) : null}

          <button
            type="button"
            onClick={props.onToggleFlowMode}
            className="border-2 border-border/70 bg-[rgba(255,252,247,0.9)] px-2 py-1 text-[11px] uppercase tracking-[0.14em] shadow-[0_2px_0_rgba(17,17,19,0.12)] transition-[filter] hover:brightness-105"
            style={{ clipPath: PIXEL_PANEL_CLIP }}
            aria-pressed={props.flowMode === "turbo"}
          >
            {props.flowMode}
          </button>

          <button
            type="button"
            onClick={() => props.onRefresh?.()}
            className="inline-flex items-center gap-1.5 border-2 border-border/70 bg-[rgba(255,252,247,0.9)] px-2 py-1 text-[11px] uppercase tracking-[0.14em] shadow-[0_2px_0_rgba(17,17,19,0.12)] transition-[filter] hover:brightness-105 disabled:opacity-45"
            style={{ clipPath: PIXEL_PANEL_CLIP }}
            disabled={!props.onRefresh}
          >
            <RefreshCwIcon className={cn("size-3.5", props.loading ? "animate-spin" : "")} />
            tick
          </button>

          <button
            type="button"
            onClick={props.onToggleFullscreen}
            className="inline-flex items-center gap-1.5 border-2 border-border/70 bg-[rgba(255,252,247,0.9)] px-2 py-1 text-[11px] uppercase tracking-[0.14em] shadow-[0_2px_0_rgba(17,17,19,0.12)] transition-[filter] hover:brightness-105"
            style={{ clipPath: PIXEL_PANEL_CLIP }}
            aria-pressed={props.isFullscreen}
          >
            {props.isFullscreen ? <Minimize2Icon className="size-3.5" /> : <Maximize2Icon className="size-3.5" />}
            {props.isFullscreen ? "exit" : "full"}
          </button>
        </div>
      </div>

      <div className="absolute inset-x-2 bottom-2 z-40 flex justify-center">
        <div
          className="flex max-w-full gap-1 overflow-x-auto border-2 border-border/70 bg-[rgba(255,252,247,0.9)] px-2 py-1.5 shadow-[0_3px_0_rgba(17,17,19,0.12)]"
          style={{ clipPath: PIXEL_PANEL_CLIP }}
          aria-label="Workboard zone portals"
        >
          {props.zones.map((zone) => (
            <WorkboardZonePortalButton
              key={zone.id}
              zone={zone}
              current={zone.id === props.activeZone.id}
              onSelect={props.onSelectZone}
            />
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-[4.7rem] left-2 z-40 hidden border-2 border-border/60 bg-[rgba(255,252,247,0.82)] px-2 py-1 text-[9px] uppercase tracking-[0.13em] text-foreground/44 shadow-[0_2px_0_rgba(17,17,19,0.1)] md:block" style={{ clipPath: PIXEL_PANEL_CLIP }}>
        left/right switch zone / enter open / esc world
      </div>
    </>
  );
}

function WorkboardZonePortalButton(props: {
  zone: DowncityWorkboardGameZone;
  current: boolean;
  onSelect?: (zoneId: DowncityWorkboardZoneId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => props.onSelect?.(props.zone.id)}
      className={cn(
        "group inline-flex min-w-24 items-center gap-2 border border-border/50 px-2 py-1 text-left transition-[filter,transform] duration-200 hover:-translate-y-0.5 hover:brightness-105 focus:outline-none focus-visible:-translate-y-0.5",
        props.current ? "bg-foreground text-background" : "bg-[rgba(255,252,247,0.76)] text-foreground",
      )}
      style={{ clipPath: PIXEL_PANEL_CLIP }}
      aria-pressed={props.current}
    >
      <span
        className={cn(
          "grid size-5 place-items-center border text-[10px] font-semibold leading-none",
          props.current ? "border-background/70" : "border-foreground/35",
        )}
        aria-hidden="true"
      >
        {props.zone.count}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.13em]">
          {props.zone.badge}
        </span>
        <span className={cn("block truncate text-[9px]", props.current ? "text-background/70" : "text-foreground/46")}>
          portal
        </span>
      </span>
    </button>
  );
}

function WorkboardWorldPortalOverlay(props: {
  portal: { key: number; label: string; mode: "enter" | "world" } | null;
}) {
  if (!props.portal) return null;

  return (
    <div
      key={props.portal.key}
      className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-[rgba(255,252,247,0.18)]"
      aria-hidden="true"
    >
      <div className="absolute inset-y-0 left-0 w-1/2 origin-left bg-[rgba(17,17,19,0.82)] workboard-portal-left" />
      <div className="absolute inset-y-0 right-0 w-1/2 origin-right bg-[rgba(17,17,19,0.82)] workboard-portal-right" />
      <div
        className="relative z-10 border-2 border-background/80 bg-[rgba(17,17,19,0.88)] px-4 py-3 text-center text-background shadow-[0_4px_0_rgba(17,17,19,0.2)] workboard-portal-label"
        style={{ clipPath: PIXEL_PANEL_CLIP }}
      >
        <div className="text-[10px] uppercase tracking-[0.22em] text-background/58">
          {props.portal.mode === "enter" ? "enter room" : "return atlas"}
        </div>
        <div className="mt-1 text-base font-semibold tracking-[-0.05em]">{props.portal.label}</div>
      </div>
    </div>
  );
}

function WorkboardGameStyles() {
  return (
    <style>{`
      @keyframes workboard-dash {
        from { stroke-dashoffset: 0; }
        to { stroke-dashoffset: 18; }
      }
      @keyframes workboard-pulse {
        0% { opacity: 0.15; transform: scale(0.98); }
        50% { opacity: 0.5; transform: scale(1.08); }
        100% { opacity: 0.15; transform: scale(0.98); }
      }
      @keyframes workboard-sprite-step {
        0% { translate: 0 0; }
        50% { translate: 0 -1px; }
        100% { translate: 0 0; }
      }
      @keyframes workboard-world-scan {
        0% { transform: translateY(-16px); opacity: 0.08; }
        50% { opacity: 0.18; }
        100% { transform: translateY(16px); opacity: 0.08; }
      }
      @keyframes workboard-portal-left {
        0% { transform: scaleX(0); }
        35% { transform: scaleX(1); }
        70% { transform: scaleX(1); }
        100% { transform: scaleX(0); }
      }
      @keyframes workboard-portal-right {
        0% { transform: scaleX(0); }
        35% { transform: scaleX(1); }
        70% { transform: scaleX(1); }
        100% { transform: scaleX(0); }
      }
      @keyframes workboard-portal-label {
        0% { opacity: 0; transform: translateY(6px) scale(0.96); }
        28% { opacity: 1; transform: translateY(0) scale(1); }
        74% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-6px) scale(0.98); }
      }
      .workboard-portal-left { animation: workboard-portal-left 560ms steps(7, end) both; }
      .workboard-portal-right { animation: workboard-portal-right 560ms steps(7, end) both; }
      .workboard-portal-label { animation: workboard-portal-label 560ms steps(6, end) both; }
      @media (prefers-reduced-motion: reduce) {
        .workboard-portal-left,
        .workboard-portal-right,
        .workboard-portal-label {
          animation-duration: 1ms;
        }
      }
    `}</style>
  );
}

function resolveAdjacentZoneId(params: {
  zones: DowncityWorkboardGameZone[];
  activeZoneId: DowncityWorkboardZoneId;
  direction: -1 | 1;
}): DowncityWorkboardZoneId {
  if (params.zones.length === 0) return params.activeZoneId;

  const currentIndex = Math.max(
    0,
    params.zones.findIndex((zone) => zone.id === params.activeZoneId),
  );
  const nextIndex = (currentIndex + params.direction + params.zones.length) % params.zones.length;
  return params.zones[nextIndex]?.id || params.activeZoneId;
}

/**
 * 渲染全局 Workboard 游戏世界。
 */
export function Workboard(props: DowncityWorkboardProps) {
  const { board, loading, selectedAgentId, onRefresh, onSelectAgent, className } = props;
  const selected = resolveSelectedAgent({ board, selectedAgentId });
  const containerRef = React.useRef<HTMLElement | null>(null);
  const [stageLevel, setStageLevel] = React.useState<DowncityWorkboardStageLevel>("clusters");
  const [detailsCollapsed, setDetailsCollapsed] = React.useState(true);
  const [flowMode, setFlowMode] = React.useState<"cruise" | "turbo">("cruise");
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [portal, setPortal] = React.useState<{ key: number; label: string; mode: "enter" | "world" } | null>(null);
  const previousSelectedIdRef = React.useRef<string | undefined>(selected?.id);
  const [activeZoneId, setActiveZoneId] = React.useState<DowncityWorkboardZoneId>(() =>
    selected ? resolveZoneId(selected) : "engaged",
  );

  React.useEffect(() => {
    if (!selected?.id) {
      previousSelectedIdRef.current = undefined;
      return;
    }

    if (selected.id === previousSelectedIdRef.current) return;

    previousSelectedIdRef.current = selected.id;
    setActiveZoneId(resolveZoneId(selected));
    setDetailsCollapsed(false);
  }, [selected]);

  React.useEffect(() => {
    if (!portal) return undefined;

    const timeout = window.setTimeout(() => setPortal(null), 620);
    return () => window.clearTimeout(timeout);
  }, [portal]);

  React.useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const activeZone = resolveZoneDefinition(activeZoneId);
  const activeZoneItems = React.useMemo(
    () => (board?.agents || []).filter((item) => resolveZoneId(item) === activeZoneId),
    [activeZoneId, board],
  );
  const selectedPeers = React.useMemo(
    () => (board?.agents || []).filter((item) => resolveZoneId(item) === activeZoneId),
    [activeZoneId, board],
  );
  const gameMap = React.useMemo(
    () =>
      board
        ? buildWorkboardGameMapConfig({
            board,
            activeZoneId,
            selectedAgentId: selected?.id,
          })
        : null,
    [activeZoneId, board, selected?.id],
  );
  const motionNodes = React.useMemo(() => {
    if (!gameMap) return [];

    if (stageLevel === "clusters") {
      return gameMap.actors.map((actor, index) => {
        const route = gameMap.corridors.find((item) => item.id === `corridor-${actor.id}`);
        return {
          id: actor.id,
          anchor: actor.overviewAnchor,
          swayX: 6 + (index % 3) * 2.5,
          swayY: 4 + (index % 4) * 1.7,
          phase: index * 0.9,
          speed: 0.8 + (index % 5) * 0.08,
          mode: "route",
          route: route?.points || actor.overviewRoute,
          dwellRatio: route?.dwellRatio,
          snapSize: route?.snapSize,
        } satisfies DowncityWorkboardMotionNode;
      });
    }

    return gameMap.actors
      .filter((actor) => actor.zoneId === activeZoneId && actor.focusedAnchor)
      .map((actor, index) => {
        const route = gameMap.patrols.find((item) => item.id === actor.focusedRouteId);
        const fallbackPoint = actor.focusedAnchor || {
          x: WORKBOARD_STAGE_WIDTH / 2,
          y: WORKBOARD_STAGE_HEIGHT / 2,
        };
        return {
          id: actor.id,
          anchor: fallbackPoint,
          swayX: 9 + (index % 3) * 2.2,
          swayY: 6 + (index % 4) * 1.6,
          phase: index * 0.82,
          speed: 0.95 + (index % 5) * 0.1,
          mode: "route",
          route:
            route?.points ||
            gameMap.patrols[index % Math.max(gameMap.patrols.length, 1)]?.points ||
            [fallbackPoint],
          dwellRatio: route?.dwellRatio,
          snapSize: route?.snapSize,
        } satisfies DowncityWorkboardMotionNode;
      });
  }, [activeZoneId, gameMap, stageLevel]);
  const motionFrames = useWorkboardMotion({ nodes: motionNodes, flowMode });

  const triggerPortal = React.useCallback((label: string, mode: "enter" | "world") => {
    setPortal((prev) => ({
      key: (prev?.key || 0) + 1,
      label,
      mode,
    }));
  }, []);

  const openZone = React.useCallback(
    (zoneId: DowncityWorkboardZoneId) => {
      triggerPortal(resolveZoneDefinition(zoneId).title, "enter");
      setActiveZoneId(zoneId);
      setStageLevel("agents");
      setDetailsCollapsed(false);
      const lead = resolveZoneLead({ board, zoneId });
      if (lead) onSelectAgent?.(lead.id);
    },
    [board, onSelectAgent, triggerPortal],
  );

  const openAgent = React.useCallback(
    (agentId: string) => {
      const item = (board?.agents || []).find((entry) => entry.id === agentId);
      if (!item) return;

      const nextZoneId = resolveZoneId(item);
      if (stageLevel === "clusters" || nextZoneId !== activeZoneId) {
        triggerPortal(resolveZoneDefinition(nextZoneId).title, "enter");
      }
      setActiveZoneId(nextZoneId);
      setStageLevel("agents");
      setDetailsCollapsed(false);
      onSelectAgent?.(agentId);
    },
    [activeZoneId, board, onSelectAgent, stageLevel, triggerPortal],
  );

  const backToAtlas = React.useCallback(() => {
    triggerPortal("World Atlas", "world");
    setStageLevel("clusters");
  }, [triggerPortal]);

  const handleWorldKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!gameMap) return;

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const nextZoneId = resolveAdjacentZoneId({
          zones: gameMap.zones,
          activeZoneId,
          direction: event.key === "ArrowRight" ? 1 : -1,
        });
        setActiveZoneId(nextZoneId);
        return;
      }

      if (event.key === "Enter" && stageLevel === "clusters") {
        event.preventDefault();
        openZone(activeZoneId);
        return;
      }

      if (event.key === "Escape" && stageLevel === "agents") {
        event.preventDefault();
        backToAtlas();
      }
    },
    [activeZoneId, backToAtlas, gameMap, openZone, stageLevel],
  );

  const toggleFullscreen = React.useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement === container) {
      await document.exitFullscreen();
      return;
    }

    if (document.fullscreenElement) await document.exitFullscreen();
    await container.requestFullscreen();
  }, []);

  if (!board || !gameMap) {
    return (
      <div
        className={cn(
          "grid min-h-72 place-items-center border-2 border-dashed border-border/70 bg-[linear-gradient(145deg,rgba(247,244,236,0.84),rgba(255,255,255,0.95))] text-sm text-muted-foreground",
          className,
        )}
        style={{ clipPath: PIXEL_PANEL_CLIP }}
      >
        {loading ? "正在生成 workboard game world..." : "当前没有可展示的 workboard game world。"}
      </div>
    );
  }

  return (
    <section className={cn("min-h-full", className)}>
      <WorkboardGameStyles />
      <section
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleWorldKeyDown}
        className={cn(
          "relative overflow-hidden border-2 border-border/70 bg-[linear-gradient(145deg,rgba(236,232,218,0.96),rgba(255,252,247,0.98)_42%,rgba(217,231,224,0.76))] p-2 shadow-[0_8px_0_rgba(17,17,19,0.12)] outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
          isFullscreen ? "h-[100dvh] rounded-none border-0 shadow-none" : "",
        )}
        style={isFullscreen ? undefined : { clipPath: PIXEL_PANEL_CLIP }}
      >
        <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(rgba(17,17,19,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(17,17,19,0.04)_1px,transparent_1px)] bg-[size:18px_18px] opacity-40" />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-[linear-gradient(180deg,transparent,rgba(17,17,19,0.08),transparent)]"
          style={{ animation: "workboard-world-scan 4.5s steps(6, end) infinite" }}
        />

        <WorkboardGameHud
          board={board}
          stageLevel={stageLevel}
          activeZone={activeZone}
          selected={selected}
          flowMode={flowMode}
          loading={loading}
          isFullscreen={isFullscreen}
          zones={gameMap.zones}
          onSelectZone={openZone}
          onBackToAtlas={backToAtlas}
          onToggleFlowMode={() => setFlowMode((prev) => (prev === "cruise" ? "turbo" : "cruise"))}
          onRefresh={onRefresh}
          onToggleFullscreen={toggleFullscreen}
        />

        <div
          className={cn(
            "relative z-20 grid w-full place-items-center overflow-auto border-2 border-border/70 bg-[linear-gradient(145deg,rgba(251,250,247,0.96),rgba(245,248,245,0.88))]",
            isFullscreen ? "h-[calc(100dvh-16px)]" : "",
          )}
          style={isFullscreen ? undefined : { minHeight: WORKBOARD_STAGE_HEIGHT, clipPath: PIXEL_PANEL_CLIP }}
        >
          {stageLevel === "clusters" ? (
            <WorkboardGameAtlas
              board={board}
              gameMap={gameMap}
              activeZoneId={activeZoneId}
              selectedAgentId={selected?.id}
              flowMode={flowMode}
              motionFrames={motionFrames}
              onSelectZone={openZone}
              onSelectAgent={(agentId) => openAgent(agentId)}
            />
          ) : (
            <WorkboardGameRoom
              zone={activeZone}
              items={activeZoneItems}
              gameMap={gameMap}
              selectedAgentId={selected?.id}
              motionFrames={motionFrames}
              flowMode={flowMode}
              onSelectAgent={openAgent}
            />
          )}

          <WorkboardWorldPortalOverlay portal={portal} />

          <WorkboardGameInspector
            selected={selected}
            activeZone={activeZone}
            selectedPeers={selectedPeers}
            stageLevel={stageLevel}
            collapsed={detailsCollapsed}
            onToggleCollapsed={() => setDetailsCollapsed((prev) => !prev)}
            onSelectAgent={openAgent}
          />
        </div>
      </section>
    </section>
  );
}

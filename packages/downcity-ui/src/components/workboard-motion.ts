/**
 * Workboard 舞台持续运动 hook。
 *
 * 关键点（中文）
 * - 这里不再使用单纯的 CSS 漂浮动画，而是用 requestAnimationFrame 做持续位移。
 * - 运动只服务于“现场感”，不会改变节点的语义分区和主锚点。
 */

import * as React from "react";
import type {
  DowncityWorkboardMotionDirection,
  DowncityWorkboardMotionFrame,
  DowncityWorkboardMotionState,
  DowncityWorkboardMotionNode,
  DowncityWorkboardStagePoint,
} from "../types/workboard-stage";

function distance(a: DowncityWorkboardStagePoint, b: DowncityWorkboardStagePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function resolveDirection(params: {
  from: DowncityWorkboardStagePoint;
  to: DowncityWorkboardStagePoint;
}): DowncityWorkboardMotionDirection {
  const dx = params.to.x - params.from.x;
  const dy = params.to.y - params.from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0 ? "left" : "right";
  }

  return dy < 0 ? "up" : "down";
}

function resolveRouteFrame(params: {
  route: DowncityWorkboardStagePoint[];
  progress: number;
  dwellRatio?: number;
}): DowncityWorkboardStagePoint & {
  direction: DowncityWorkboardMotionDirection;
  state: DowncityWorkboardMotionState;
} {
  if (params.route.length < 2) {
    return {
      ...(params.route[0] || { x: 0, y: 0 }),
      direction: "down",
      state: "dwell",
    };
  }

  const dwellRatio = Math.min(Math.max(params.dwellRatio || 0, 0), 0.72);
  if (dwellRatio > 0) {
    const legCount = params.route.length;
    const legProgress = (params.progress % 1) * legCount;
    const legIndex = Math.floor(legProgress) % legCount;
    const localProgress = legProgress - Math.floor(legProgress);
    const from = params.route[legIndex];
    const to = params.route[(legIndex + 1) % params.route.length];
    const travelRatio = 1 - dwellRatio;
    const direction = resolveDirection({ from, to });

    // 关键节点：像素地图里角色应该在门口和工位短暂停靠，而不是像普通 UI 元素一样匀速滑动。
    if (localProgress > travelRatio) {
      return {
        ...to,
        direction,
        state: "dwell",
      };
    }

    const easedProgress = Math.min(localProgress / travelRatio, 1);
    return {
      x: from.x + (to.x - from.x) * easedProgress,
      y: from.y + (to.y - from.y) * easedProgress,
      direction,
      state: "walking",
    };
  }

  const segments = params.route.map((point, index) => {
    const next = params.route[(index + 1) % params.route.length];
    return {
      from: point,
      to: next,
      length: distance(point, next),
    };
  });

  const totalLength = segments.reduce((acc, segment) => acc + segment.length, 0);
  if (totalLength <= 0) {
    return {
      ...params.route[0],
      direction: "down",
      state: "dwell",
    };
  }

  let cursor = (params.progress % 1) * totalLength;
  for (const segment of segments) {
    if (cursor <= segment.length) {
      const ratio = segment.length <= 0 ? 0 : cursor / segment.length;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
        y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
        direction: resolveDirection({ from: segment.from, to: segment.to }),
        state: "walking",
      };
    }
    cursor -= segment.length;
  }

  return {
    ...params.route[0],
    direction: "down",
    state: "dwell",
  };
}

function snapPoint(params: {
  point: DowncityWorkboardMotionFrame;
  snapSize?: number;
}): DowncityWorkboardMotionFrame {
  const snapSize = params.snapSize || 0;
  if (snapSize <= 0) {
    return params.point;
  }

  return {
    ...params.point,
    x: Math.round(params.point.x / snapSize) * snapSize,
    y: Math.round(params.point.y / snapSize) * snapSize,
  };
}

/**
 * 根据当前舞台节点生成实时坐标。
 */
export function useWorkboardMotion(params: {
  /**
   * 当前可见的节点集合。
   */
  nodes: DowncityWorkboardMotionNode[];
  /**
   * 当前动效档位。
   */
  flowMode: "cruise" | "turbo";
}): Record<string, DowncityWorkboardMotionFrame> {
  const [frames, setFrames] = React.useState<Record<string, DowncityWorkboardMotionFrame>>({});

  React.useEffect(() => {
    if (params.nodes.length === 0) {
      setFrames({});
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      const stillFrames = params.nodes.reduce(
        (acc, node) => {
          acc[node.id] = {
            x: node.anchor.x,
            y: node.anchor.y,
            direction: "down",
            state: "dwell",
          };
          return acc;
        },
        {} as Record<string, DowncityWorkboardMotionFrame>,
      );
      setFrames(stillFrames);
      return;
    }

    let rafId = 0;
    let start = performance.now();

    const frame = (now: number) => {
      const elapsed = (now - start) / 1000;
      const flowFactor = params.flowMode === "turbo" ? 1.45 : 0.78;
      const nextFrames = params.nodes.reduce(
        (acc, node) => {
          if (node.mode === "route" && node.route && node.route.length > 1) {
            const routePoint = resolveRouteFrame({
              route: node.route,
              progress: elapsed * node.speed * 0.09 * flowFactor + node.phase * 0.07,
              dwellRatio: node.dwellRatio,
            });
            acc[node.id] = snapPoint({ point: routePoint, snapSize: node.snapSize });
            return acc;
          }

          const t = elapsed * node.speed * flowFactor + node.phase;
          const driftX = Math.sin(t) * node.swayX + Math.cos(t * 0.61 + node.phase) * node.swayX * 0.4;
          const driftY = Math.cos(t * 0.9 + node.phase * 0.8) * node.swayY + Math.sin(t * 0.55) * node.swayY * 0.35;
          const point = {
            x: node.anchor.x + driftX,
            y: node.anchor.y + driftY,
          };

          acc[node.id] = snapPoint({
            snapSize: node.snapSize,
            point: {
              ...point,
              direction: resolveDirection({ from: node.anchor, to: point }),
              state: "walking",
            },
          });
          return acc;
        },
        {} as Record<string, DowncityWorkboardMotionFrame>,
      );

      setFrames(nextFrames);
      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [params.flowMode, params.nodes]);

  return frames;
}

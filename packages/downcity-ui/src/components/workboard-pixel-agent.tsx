/**
 * Workboard 像素 avatar 组件。
 *
 * 关键点（中文）
 * - 不依赖外部素材目录，直接在本地用 SVG 生成像素角色。
 * - 同一个 agent 会根据 id 稳定生成同一组发色、衣服和细节。
 */

import * as React from "react";
import { cn } from "../lib/utils";
import type { DowncityWorkboardPixelAgentProps } from "../types/workboard-pixel-agent";

type PixelPalette = {
  skin: string;
  hair: string;
  outfit: string;
  accent: string;
  outline: string;
};

const PIXEL_PALETTES: PixelPalette[] = [
  {
    skin: "#f1c7a5",
    hair: "#4c3327",
    outfit: "#35736b",
    accent: "#d4eadf",
    outline: "#241a16",
  },
  {
    skin: "#dbb08a",
    hair: "#2d2a3b",
    outfit: "#8a5f31",
    accent: "#ead6bf",
    outline: "#231f18",
  },
  {
    skin: "#f0d1b5",
    hair: "#70462d",
    outfit: "#566f3a",
    accent: "#dde8c7",
    outline: "#2a251d",
  },
  {
    skin: "#c98d66",
    hair: "#3b281f",
    outfit: "#81503f",
    accent: "#efdfd1",
    outline: "#241b16",
  },
];

function hashText(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function rect(x: number, y: number, w: number, h: number, fill: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" />`;
}

function buildPixelAvatarSvg(params: {
  agentId: string;
  name: string;
  direction?: DowncityWorkboardPixelAgentProps["direction"];
}): string {
  const seed = hashText(`${params.agentId}:${params.name}`);
  const palette = PIXEL_PALETTES[seed % PIXEL_PALETTES.length];
  const hairVariant = seed % 3;
  const eyeVariant = (seed >> 2) % 2;
  const accentVariant = (seed >> 4) % 3;
  const facingUp = params.direction === "up";
  const facingSide = params.direction === "left" || params.direction === "right";

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges">`,
    rect(0, 0, 16, 16, "transparent"),
    rect(3, 2, 10, 2, palette.hair),
    rect(2, 4, 12, 1, palette.hair),
    rect(3, 5, 10, 5, palette.skin),
    rect(4, 10, 8, 4, palette.outfit),
    rect(5, 14, 2, 2, palette.outline),
    rect(9, 14, 2, 2, palette.outline),
    rect(4, 11, 1, 3, palette.outline),
    rect(11, 11, 1, 3, palette.outline),
    rect(6, 4, 4, 1, palette.accent),
  ];

  if (facingUp) {
    parts.push(
      rect(3, 4, 10, 5, palette.hair),
      rect(5, 8, 6, 2, palette.hair),
      rect(6, 11, 4, 2, palette.accent),
    );
  } else if (facingSide) {
    parts.push(
      rect(5, 6, 1, 1, palette.outline),
      rect(9, 7, 2, 1, palette.outline),
      rect(8, 8, 2, 1, "#9d6f4d"),
      rect(11, 5, 2, 4, palette.hair),
    );
  } else {
    parts.push(
      rect(6, 6, 1, 1, palette.outline),
      rect(9, 6, 1, 1, palette.outline),
      rect(7, 8, 2, 1, "#9d6f4d"),
    );
  }

  if (hairVariant === 0) {
    parts.push(rect(2, 3, 1, 4, palette.hair), rect(13, 3, 1, 4, palette.hair));
  } else if (hairVariant === 1) {
    parts.push(rect(2, 3, 2, 2, palette.hair), rect(12, 3, 2, 2, palette.hair));
  } else {
    parts.push(rect(4, 1, 8, 1, palette.hair), rect(3, 2, 1, 2, palette.hair), rect(12, 2, 1, 2, palette.hair));
  }

  if (!facingUp && eyeVariant === 1) {
    parts.push(rect(5, 6, 1, 1, palette.outline), rect(10, 6, 1, 1, palette.outline));
  }

  if (accentVariant === 0) {
    parts.push(rect(6, 11, 4, 1, palette.accent));
  } else if (accentVariant === 1) {
    parts.push(rect(4, 12, 8, 1, palette.accent));
  } else {
    parts.push(rect(7, 10, 2, 3, palette.accent));
  }

  parts.push(rect(4, 9, 1, 1, palette.outline), rect(11, 9, 1, 1, palette.outline), `</svg>`);
  return parts.join("");
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function WorkboardPixelAgent(props: DowncityWorkboardPixelAgentProps) {
  const src = React.useMemo(
    () => svgToDataUri(buildPixelAvatarSvg({ agentId: props.agentId, name: props.name, direction: props.direction })),
    [props.agentId, props.name, props.direction],
  );
  const flipped = props.direction === "left";

  return (
    <span
      className={cn(
        "inline-flex overflow-hidden rounded-[2px] border bg-[rgba(255,252,247,0.9)] shadow-[0_1px_0_rgba(17,17,19,0.12)]",
        props.active ? "border-foreground/70" : "border-foreground/28",
        props.faded ? "opacity-65" : "opacity-100",
        props.className,
      )}
      style={{ width: props.size, height: props.size }}
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        width={props.size}
        height={props.size}
        draggable={false}
        className="h-full w-full [image-rendering:pixelated]"
        style={{
          animation: props.walking ? "workboard-sprite-step 0.42s steps(2, end) infinite" : undefined,
          transform: flipped ? "scaleX(-1)" : undefined,
        }}
      />
    </span>
  );
}

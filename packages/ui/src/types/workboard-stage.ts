/**
 * Workboard 主舞台内部类型。
 *
 * 关键点（中文）
 * - 这些类型只服务于 Workboard 的舞台布局与聚焦交互。
 * - 它们仍然集中放在 `types/` 下，避免在组件文件里散落领域类型定义。
 */

import type { DowncityWorkboardAgentItem } from "./workboard";

/**
 * Workboard 舞台层级。
 */
export type DowncityWorkboardStageLevel = "clusters" | "agents";

/**
 * 像素角色在地图上的朝向。
 */
export type DowncityWorkboardMotionDirection = "left" | "right" | "up" | "down";

/**
 * 像素角色当前的运动状态。
 */
export type DowncityWorkboardMotionState = "walking" | "dwell";

/**
 * Workboard 公共状态分区标识。
 */
export type DowncityWorkboardZoneId = "engaged" | "steady" | "quiet" | "drift";

/**
 * 单个状态分区在全局舞台中的布局边界。
 */
export interface DowncityWorkboardZoneLayout {
  /**
   * 分区左上角横向百分比。
   */
  x: number;
  /**
   * 分区左上角纵向百分比。
   */
  y: number;
  /**
   * 分区宽度百分比。
   */
  w: number;
  /**
   * 分区高度百分比。
   */
  h: number;
  /**
   * 分区 hub 横向百分比。
   */
  hubX: number;
  /**
   * 分区 hub 纵向百分比。
   */
  hubY: number;
}

/**
 * 单个状态分区的视觉与文案定义。
 */
export interface DowncityWorkboardZoneDefinition {
  /**
   * 分区唯一标识。
   */
  id: DowncityWorkboardZoneId;
  /**
   * 分区标题。
   */
  title: string;
  /**
   * 分区辅助标题。
   */
  subtitle: string;
  /**
   * 分区说明文本。
   */
  description: string;
  /**
   * 分区徽标文案。
   */
  badge: string;
  /**
   * 分区背景样式类名。
   */
  areaClassName: string;
  /**
   * 分区边界样式类名。
   */
  borderClassName: string;
  /**
   * 分区辉光样式类名。
   */
  glowClassName: string;
  /**
   * 节点底板样式类名。
   */
  nodeClassName: string;
  /**
   * 连线样式类名。
   */
  lineClassName: string;
}

/**
 * 节点在分区中的相对落点。
 */
export interface DowncityWorkboardZoneAgentPlacement {
  /**
   * 相对横向位置，取值 0-100。
   */
  left: number;
  /**
   * 相对纵向位置，取值 0-100。
   */
  top: number;
  /**
   * 漂浮动画延迟秒数。
   */
  delay: number;
}

/**
 * 主舞台上的单个节点。
 */
export interface DowncityWorkboardStageNode {
  /**
   * 对应的 agent 项。
   */
  item: DowncityWorkboardAgentItem;
  /**
   * 该节点所属分区定义。
   */
  zone: DowncityWorkboardZoneDefinition;
  /**
   * 节点在分区中的相对落点。
   */
  placement: DowncityWorkboardZoneAgentPlacement;
}

/**
 * 舞台上的绝对坐标点。
 */
export interface DowncityWorkboardStagePoint {
  /**
   * 舞台横向坐标，单位为像素。
   */
  x: number;
  /**
   * 舞台纵向坐标，单位为像素。
   */
  y: number;
}

/**
 * 簇内聚焦视图里的基础节点定义。
 */
export interface DowncityWorkboardFocusedStageNode {
  /**
   * 对应的 agent 项。
   */
  item: DowncityWorkboardAgentItem;
  /**
   * 基础横向落点，单位为像素。
   */
  x: number;
  /**
   * 基础纵向落点，单位为像素。
   */
  y: number;
  /**
   * 进入动画与运动节奏的延迟秒数。
   */
  delay: number;
}

/**
 * 单个参与持续运动的舞台节点。
 */
export interface DowncityWorkboardMotionNode {
  /**
   * 节点唯一标识。
   */
  id: string;
  /**
   * 节点的基础锚点。
   */
  anchor: DowncityWorkboardStagePoint;
  /**
   * 横向摆动幅度。
   */
  swayX: number;
  /**
   * 纵向摆动幅度。
   */
  swayY: number;
  /**
   * 该节点的初始相位。
   */
  phase: number;
  /**
   * 该节点的运动速度倍率。
   */
  speed: number;
  /**
   * 节点运动模式。
   */
  mode?: "drift" | "route";
  /**
   * 当使用路径巡游时，对应的路径点集合。
   */
  route?: DowncityWorkboardStagePoint[];
  /**
   * 路径巡游时在每个路径点停留的比例。
   * 数值越大，角色越像在站点停靠；0 表示完全连续移动。
   */
  dwellRatio?: number;
  /**
   * 坐标吸附到像素网格的尺寸。
   * 像素地图中使用该值能避免角色出现过于平滑的现代 UI 位移。
   */
  snapSize?: number;
}

/**
 * 动效计算后的节点位置。
 */
export interface DowncityWorkboardMotionFrame {
  /**
   * 当前横向坐标。
   */
  x: number;
  /**
   * 当前纵向坐标。
   */
  y: number;
  /**
   * 当前角色朝向。
   */
  direction: DowncityWorkboardMotionDirection;
  /**
   * 当前运动状态。
   */
  state: DowncityWorkboardMotionState;
}

/**
 * 舞台 hover 标签。
 */
export interface DowncityWorkboardHoverTag {
  /**
   * 标签唯一标识。
   */
  id: string;
  /**
   * 展示文本。
   */
  label: string;
  /**
   * 标签指向的横向坐标。
   */
  x: number;
  /**
   * 标签指向的纵向坐标。
   */
  y: number;
}

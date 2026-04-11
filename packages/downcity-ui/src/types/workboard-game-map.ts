/**
 * Workboard 游戏地图配置类型。
 *
 * 关键点（中文）
 * - 这里定义的是把公开 workboard 数据映射成“游戏地图世界”的中间层。
 * - 上层可以把它交给 Pxlkit，也可以交给当前自研地图渲染器。
 * - 该模型只描述舞台、节点、路线、标签和热点，不关心 plugin 或 console 内部实现。
 */

import type {
  DowncityWorkboardAgentItem,
  DowncityWorkboardBoardSnapshot,
} from "./workboard";
import type {
  DowncityWorkboardStagePoint,
  DowncityWorkboardZoneId,
} from "./workboard-stage";

/**
 * 地图中的单个区域标签。
 */
export interface DowncityWorkboardGameAreaLabel {
  /**
   * 标签稳定标识。
   */
  id: string;
  /**
   * 标签文案。
   */
  label: string;
  /**
   * 标签横向坐标。
   */
  x: number;
  /**
   * 标签纵向坐标。
   */
  y: number;
}

/**
 * 地图中的单个兴趣点或场景道具。
 */
export interface DowncityWorkboardGamePointOfInterest {
  /**
   * 道具稳定标识。
   */
  id: string;
  /**
   * 道具类型。
   */
  kind: "desk" | "rack" | "console" | "crate" | "bench" | "plant" | "hub";
  /**
   * 道具所在横向坐标。
   */
  x: number;
  /**
   * 道具所在纵向坐标。
   */
  y: number;
  /**
   * 该道具是否为当前聚焦热点。
   */
  active?: boolean;
}

/**
 * 地图中的单条可视化路线。
 */
export interface DowncityWorkboardGameRoute {
  /**
   * 路线稳定标识。
   */
  id: string;
  /**
   * 路径点集合。
   */
  points: DowncityWorkboardStagePoint[];
  /**
   * 路线类别。
   */
  kind: "corridor" | "patrol" | "hub-link";
  /**
   * 是否处于高亮状态。
   */
  active?: boolean;
  /**
   * 该路线所属的状态簇。
   * 仅当路线和某个分区直接绑定时提供，便于舞台按簇过滤。
   */
  zoneId?: DowncityWorkboardZoneId;
  /**
   * 角色经过路径点时的停留比例。
   * 用于让 actor 在门口、hub、工位等关键点有短暂停靠感。
   */
  dwellRatio?: number;
  /**
   * 路线坐标吸附到像素网格的尺寸。
   * 该值会传给 motion 层，确保 movement 更像像素游戏。
   */
  snapSize?: number;
  /**
   * 路线在地图上的短标签。
   * 当前主要用于自定义 host 或后续增强的路线标记。
   */
  label?: string;
}

/**
 * 地图中的单个 agent actor。
 */
export interface DowncityWorkboardGameActor {
  /**
   * actor 对应的 agent id。
   */
  id: string;
  /**
   * 关联的 agent 公开项。
   */
  agent: DowncityWorkboardAgentItem;
  /**
   * actor 当前所处分区。
   */
  zoneId: DowncityWorkboardZoneId;
  /**
   * actor 在 atlas 总览层的锚点。
   */
  overviewAnchor: DowncityWorkboardStagePoint;
  /**
   * actor 在 atlas 总览层对应的巡游路线。
   */
  overviewRoute: DowncityWorkboardStagePoint[];
  /**
   * actor 在 focused 局部舞台中的锚点。
   * 只有进入该分区内部后才会被消费。
   */
  focusedAnchor?: DowncityWorkboardStagePoint;
  /**
   * actor 在 focused 局部舞台中所绑定的巡游路线 id。
   * 渲染器会据此关联 patrol 路线并驱动节点运动。
   */
  focusedRouteId?: string;
  /**
   * actor 在 atlas 中进入当前分区的门口坐标。
   * 渲染器可以用它表现角色从公共通道切入某个状态簇。
   */
  overviewGate: DowncityWorkboardStagePoint;
  /**
   * actor 在 focused 舞台中的工位坐标。
   * 它通常接近 focusedAnchor，但语义上表示可停靠的 station。
   */
  focusedStation?: DowncityWorkboardStagePoint;
  /**
   * 该 actor 是否处于当前 spotlight。
   */
  active?: boolean;
}

/**
 * 地图中的单个状态簇分区。
 */
export interface DowncityWorkboardGameZone {
  /**
   * 分区标识。
   */
  id: DowncityWorkboardZoneId;
  /**
   * 分区标题。
   */
  title: string;
  /**
   * 分区副标题。
   * 用于 atlas 标签和 focused 顶部提示语。
   */
  subtitle: string;
  /**
   * 分区的公开说明。
   * 用于 inspector 或主舞台边角说明。
   */
  description: string;
  /**
   * 分区短徽标。
   * 通常用于 focused hub 顶部的小型状态牌。
   */
  badge: string;
  /**
   * 分区当前 agent 数量。
   */
  count: number;
  /**
   * 该分区是否为当前活跃分区。
   */
  active: boolean;
  /**
   * 分区 hub 坐标。
   */
  hub: DowncityWorkboardStagePoint;
}

/**
 * 完整的 workboard 游戏地图配置。
 */
export interface DowncityWorkboardGameMapConfig {
  /**
   * 原始公开 board 快照。
   */
  board: DowncityWorkboardBoardSnapshot;
  /**
   * 当前活跃分区。
   */
  activeZoneId: DowncityWorkboardZoneId;
  /**
   * 当前选中的 agent id。
   */
  selectedAgentId?: string;
  /**
   * atlas 层的分区摘要。
   */
  zones: DowncityWorkboardGameZone[];
  /**
   * atlas 与 focused 共用的 actor 集合。
   */
  actors: DowncityWorkboardGameActor[];
  /**
   * atlas 层通道。
   */
  corridors: DowncityWorkboardGameRoute[];
  /**
   * focused 层巡游路线。
   */
  patrols: DowncityWorkboardGameRoute[];
  /**
   * focused 层兴趣点与道具。
   */
  pointsOfInterest: DowncityWorkboardGamePointOfInterest[];
  /**
   * focused 层区域标签。
   */
  areaLabels: DowncityWorkboardGameAreaLabel[];
}

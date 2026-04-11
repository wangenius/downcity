/**
 * Workboard 游戏化 UI 组件类型。
 *
 * 关键点（中文）
 * - 这里只描述 Workboard game shell 内部组件的 props。
 * - 类型集中放在 types/ 下，避免 renderer 文件继续混入类型定义。
 * - 这些类型不表达 plugin 或 console 语义，只表达游戏地图 UI 的组合关系。
 */

import type { DowncityWorkboardAgentItem, DowncityWorkboardBoardSnapshot } from "./workboard";
import type { DowncityWorkboardGameMapConfig, DowncityWorkboardGameZone } from "./workboard-game-map";
import type {
  DowncityWorkboardHoverTag,
  DowncityWorkboardMotionFrame,
  DowncityWorkboardStageLevel,
  DowncityWorkboardZoneDefinition,
  DowncityWorkboardZoneId,
} from "./workboard-stage";

/**
 * Workboard atlas 世界地图组件属性。
 */
export interface DowncityWorkboardGameAtlasProps {
  /**
   * 当前公开 board 快照。
   */
  board: DowncityWorkboardBoardSnapshot;
  /**
   * 当前游戏地图配置。
   */
  gameMap: DowncityWorkboardGameMapConfig;
  /**
   * 当前活跃分区。
   */
  activeZoneId: DowncityWorkboardZoneId;
  /**
   * 当前选中的 agent id。
   */
  selectedAgentId?: string;
  /**
   * 当前地图流速档位。
   */
  flowMode: "cruise" | "turbo";
  /**
   * 当前 motion hook 计算出的 actor 坐标。
   */
  motionFrames: Record<string, DowncityWorkboardMotionFrame>;
  /**
   * 选择状态簇的回调。
   */
  onSelectZone: (zoneId: DowncityWorkboardZoneId) => void;
  /**
   * 选择 agent 的回调。
   */
  onSelectAgent?: (agentId: string, zoneId: DowncityWorkboardZoneId) => void;
}

/**
 * Workboard cluster room 场景组件属性。
 */
export interface DowncityWorkboardGameRoomProps {
  /**
   * 当前房间所属状态簇。
   */
  zone: DowncityWorkboardZoneDefinition;
  /**
   * 当前房间中的 agent 列表。
   */
  items: DowncityWorkboardAgentItem[];
  /**
   * 当前游戏地图配置。
   */
  gameMap: DowncityWorkboardGameMapConfig;
  /**
   * 当前选中的 agent id。
   */
  selectedAgentId?: string;
  /**
   * 当前 motion hook 计算出的 actor 坐标。
   */
  motionFrames?: Record<string, DowncityWorkboardMotionFrame>;
  /**
   * 当前地图流速档位。
   */
  flowMode: "cruise" | "turbo";
  /**
   * 选择 agent 的回调。
   */
  onSelectAgent?: (agentId: string) => void;
}

/**
 * Workboard 游戏化 HUD 属性。
 */
export interface DowncityWorkboardGameHudProps {
  /**
   * 当前公开 board 快照。
   */
  board: DowncityWorkboardBoardSnapshot;
  /**
   * 当前舞台层级。
   */
  stageLevel: DowncityWorkboardStageLevel;
  /**
   * 当前活跃分区。
   */
  activeZone: DowncityWorkboardZoneDefinition;
  /**
   * 当前选中的 agent。
   */
  selected: DowncityWorkboardAgentItem | null;
  /**
   * 当前地图流速档位。
   */
  flowMode: "cruise" | "turbo";
  /**
   * 是否正在刷新。
   */
  loading?: boolean;
  /**
   * 是否处于全屏。
   */
  isFullscreen: boolean;
  /**
   * 底部 portal rail 展示的状态簇集合。
   */
  zones: DowncityWorkboardGameZone[];
  /**
   * 从底部 portal rail 进入某个状态簇。
   */
  onSelectZone?: (zoneId: DowncityWorkboardZoneId) => void;
  /**
   * 返回 atlas 的回调。
   */
  onBackToAtlas?: () => void;
  /**
   * 切换地图流速的回调。
   */
  onToggleFlowMode: () => void;
  /**
   * 刷新数据的回调。
   */
  onRefresh?: () => void;
  /**
   * 切换全屏的回调。
   */
  onToggleFullscreen: () => void;
}

/**
 * Workboard 游戏化 inspector 属性。
 */
export interface DowncityWorkboardGameInspectorProps {
  /**
   * 当前选中的 agent。
   */
  selected: DowncityWorkboardAgentItem | null;
  /**
   * 当前活跃分区。
   */
  activeZone: DowncityWorkboardZoneDefinition;
  /**
   * 当前分区里的 agent 列表。
   */
  selectedPeers: DowncityWorkboardAgentItem[];
  /**
   * 当前舞台层级。
   */
  stageLevel: DowncityWorkboardStageLevel;
  /**
   * 是否折叠 inspector。
   */
  collapsed: boolean;
  /**
   * 切换 inspector 折叠状态。
   */
  onToggleCollapsed?: () => void;
  /**
   * 选择 agent 的回调。
   */
  onSelectAgent?: (agentId: string) => void;
}

/**
 * Workboard hover 标签状态更新函数。
 */
export type DowncityWorkboardHoverTagSetter = (tag: DowncityWorkboardHoverTag | null) => void;

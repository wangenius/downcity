/**
 * Workboard 像素地图渲染类型。
 *
 * 关键点（中文）
 * - 这些类型描述小镇地图的 tile、建筑和家具，不暴露 console 或 plugin 的内部细节。
 * - 地图渲染统一使用固定正方形 tile，避免全屏状态下像素比例被拉伸。
 */

import type { DowncityWorkboardZoneId } from "./workboard-stage";

/**
 * 小镇地图中的单个 tile 坐标。
 */
export interface WorkboardTilePoint {
  /**
   * tile 的横向列号，从 0 开始。
   */
  col: number;
  /**
   * tile 的纵向行号，从 0 开始。
   */
  row: number;
}

/**
 * 小镇地图中的矩形 tile 区块。
 */
export interface WorkboardTileRect extends WorkboardTilePoint {
  /**
   * 区块横向占用的 tile 数量。
   */
  cols: number;
  /**
   * 区块纵向占用的 tile 数量。
   */
  rows: number;
}

/**
 * 小镇建筑内部可渲染的家具类型。
 */
export type WorkboardTownPropKind = "desk" | "bed" | "shelf" | "table" | "sofa";

/**
 * 小镇建筑内部的单个家具。
 */
export interface WorkboardTownProp extends WorkboardTileRect {
  /**
   * 家具的像素渲染类型。
   */
  kind: WorkboardTownPropKind;
}

/**
 * 小镇地图上的单栋状态建筑。
 */
export interface WorkboardTownBuilding extends WorkboardTileRect {
  /**
   * 建筑绑定的公开状态簇标识。
   */
  zoneId: DowncityWorkboardZoneId;
  /**
   * 建筑内部地板颜色。
   */
  floor: string;
  /**
   * 建筑外墙和室内隔断颜色。
   */
  wall: string;
  /**
   * 建筑入口朝向。
   * 上方建筑通常从底部进入主路，下方建筑通常从顶部进入主路。
   */
  entrance: "top" | "bottom";
  /**
   * 建筑内部的隔断墙 tile 集合。
   */
  walls: WorkboardTileRect[];
  /**
   * 建筑内部的家具 tile 集合。
   */
  props: WorkboardTownProp[];
}

/**
 * Workboard 子地图内的像素物件类型。
 */
export type WorkboardRoomPropKind =
  | "desk"
  | "rack"
  | "console"
  | "crate"
  | "bench"
  | "plant"
  | "bed"
  | "table"
  | "board"
  | "blueprint";

/**
 * Workboard 子地图中的单个像素物件。
 */
export interface WorkboardRoomMapProp {
  /**
   * 物件稳定标识。
   */
  id: string;
  /**
   * 物件像素渲染类型。
   */
  kind: WorkboardRoomPropKind;
  /**
   * 物件所在横向像素坐标。
   */
  x: number;
  /**
   * 物件所在纵向像素坐标。
   */
  y: number;
}

/**
 * Workboard 子地图的完整 tile 布局。
 */
export interface WorkboardRoomMapPlan {
  /**
   * 可行走木地板 tile 区块。
   */
  floors: WorkboardTileRect[];
  /**
   * 室内主通道 tile 区块。
   */
  corridors: WorkboardTileRect[];
  /**
   * 室内地毯或状态重点区域 tile 区块。
   */
  rugs: WorkboardTileRect[];
  /**
   * 外墙与隔断墙 tile 区块。
   */
  walls: WorkboardTileRect[];
  /**
   * 门洞 tile 区块。
   */
  doors: WorkboardTileRect[];
  /**
   * 建筑外部道路 tile 区块。
   */
  exteriorPaths: WorkboardTileRect[];
  /**
   * 建筑外部树木 tile 坐标。
   */
  trees: WorkboardTilePoint[];
  /**
   * 建筑外部灌木 tile 坐标。
   */
  shrubs: WorkboardTilePoint[];
  /**
   * 室内固定像素物件集合。
   */
  props: WorkboardRoomMapProp[];
}

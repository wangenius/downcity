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
   * 建筑内部的隔断墙 tile 集合。
   */
  walls: WorkboardTileRect[];
  /**
   * 建筑内部的家具 tile 集合。
   */
  props: WorkboardTownProp[];
}

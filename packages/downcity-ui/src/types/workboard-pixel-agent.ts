/**
 * Workboard 像素 agent 组件类型。
 *
 * 关键点（中文）
 * - 该类型只服务于 workboard 舞台里的像素 avatar 表达。
 * - 头像采用确定性生成，保证同一 agent 始终看到一致外观。
 */

/**
 * 像素 agent 组件属性。
 */
export interface DowncityWorkboardPixelAgentProps {
  /**
   * agent 稳定标识。
   */
  agentId: string;
  /**
   * agent 展示名称。
   */
  name: string;
  /**
   * 组件尺寸，单位为像素。
   */
  size: number;
  /**
   * 是否处于激活态。
   */
  active?: boolean;
  /**
   * 是否显示为弱化态。
   */
  faded?: boolean;
  /**
   * 当前朝向。
   * 用于让地图里的角色在横向移动时翻转 sprite。
   */
  direction?: "left" | "right" | "up" | "down";
  /**
   * 是否处于行走中。
   * 行走态会启用像素步行动画，停靠态则保持稳定站立。
   */
  walking?: boolean;
  /**
   * 额外类名。
   */
  className?: string;
}

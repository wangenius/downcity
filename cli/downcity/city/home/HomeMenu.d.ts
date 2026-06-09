/**
 * City 首页菜单模块。
 *
 * 关键说明（中文）
 * - 首次使用时，主动作是 connect City base。
 * - 日常使用时，首页围绕当前激活的 City admin 工作区展开。
 */
import { type HomeAction, type WelcomeAction } from "../types/Interactive.js";
/**
 * 首次启动时选择动作。
 */
export declare function selectWelcomeAction(): Promise<WelcomeAction>;
/**
 * 已经有 City server 时的首页动作。
 */
export declare function selectHomeAction(): Promise<HomeAction>;
//# sourceMappingURL=HomeMenu.d.ts.map
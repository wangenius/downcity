/**
 * UI 工具模块。
 *
 * 提供 CLI 交互所需的输入/输出封装。
 * 模型选择接受通用的 { id, name, hint } 数组，不依赖 server model 类型。
 */
import { isCancel, intro, log } from "../../federation/tui/Prompts.js";
export { intro, log, isCancel };
export declare function show(text: string): void;
export declare function showError(text: string): void;
export declare function showSuccess(text: string): void;
/** 主命令菜单 */
export declare function askUserCommand(): Promise<string | undefined>;
/** 文本输入 */
export declare function askText(label: string): Promise<string | undefined>;
/** 密码输入 */
export declare function askSecret(label: string): Promise<string | undefined>;
/** 模型选项 */
export interface ModelOption {
    /** 模型 ID */
    id: string;
    /** 模型展示名 */
    name: string;
    /** 提示信息 */
    hint: string;
}
/** 列出并选择模型，返回模型 id 或 undefined */
export declare function askModel(models: ModelOption[], currentModel: string): Promise<string | undefined>;
//# sourceMappingURL=ui.d.ts.map
/**
 * City 交互式语言设置模块。
 *
 * 关键点（中文）
 * - 统一承载 `city` 交互菜单中的语言选择逻辑，避免首页与 City 管理器重复实现。
 * - 写入 City 本地状态后立即更新进程内语言，保证后续菜单即时生效。
 */
import type { CliLocale } from "../../shared/types/CliLocale.js";
interface prompt_city_cli_locale_options {
    /** 是否禁止向命令行直接输出结果块。 */
    silent?: boolean;
}
/**
 * 交互式切换并持久化 City CLI 语言。
 */
export declare function promptAndPersistCityCliLocale(options?: prompt_city_cli_locale_options): Promise<CliLocale | null>;
export {};
//# sourceMappingURL=InteractiveLocale.d.ts.map
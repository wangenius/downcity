/**
 * Downcity CLI 统一语言模块。
 *
 * 关键说明（中文）
 * - 不引入额外依赖，统一承载命令 help、交互提示与常用输出文案的语言切换。
 * - 默认读取 `--lang`、`DC_CLI_LANG`、`LC_ALL`、`LC_MESSAGES`、`LANG`。
 * - 当前仅支持 `zh` / `en`，未识别输入统一回退 `en`。
 */
import type { CliLocale } from "../shared/types/CliLocale.js";
/**
 * 双语文案输入。
 */
export interface LocaleTextInput {
    /** 中文文案。 */
    zh: string;
    /** 英文文案。 */
    en: string;
}
/**
 * 从 argv 解析 `--lang`。
 */
export declare function readLocaleFromArgv(argv: string[]): CliLocale | undefined;
/**
 * 从环境变量解析语言。
 */
export declare function readLocaleFromEnv(env?: NodeJS.ProcessEnv): CliLocale | undefined;
/**
 * 综合 argv 与 env 解析语言。
 */
export declare function resolveCliLocale(params?: {
    argv?: string[];
    env?: NodeJS.ProcessEnv;
    persisted_locale?: CliLocale;
    fallback?: CliLocale;
}): CliLocale;
/**
 * 设置当前 CLI 语言。
 */
export declare function setCliLocale(locale: CliLocale): void;
/**
 * 读取当前 CLI 语言。
 */
export declare function getCliLocale(): CliLocale;
/**
 * 读取当前语言文案。
 */
export declare function t(input: LocaleTextInput): string;
/**
 * 通用 help 文案。
 */
export declare function helpText(): string;
/**
 * `--lang` 选项说明。
 */
export declare function langOptionText(): string;
/**
 * 规范化语言值。
 */
export declare function normalizeLocale(value: unknown): CliLocale | undefined;
//# sourceMappingURL=CliLocale.d.ts.map
/**
 * City CLI 轻量语言模块。
 *
 * 关键说明（中文）
 * - 不引入额外 i18n 框架，只提供 CLI 所需的语言解析与文案读取。
 * - 默认读取 `--lang`、`DC_CLI_LANG`、`LC_ALL`、`LC_MESSAGES`、`LANG`。
 * - 当前仅支持 `zh` 与 `en`，未知输入自动回退到 `en`。
 */
import type { CliLocale } from "./types/CliLocale.js";
/**
 * 文案读取参数。
 */
export interface LocaleTextInput {
    /** 中文文案。 */
    zh: string;
    /** 英文文案。 */
    en: string;
}
/**
 * 解析 CLI 参数中的 `--lang`。
 */
export declare function readLocaleFromArgv(argv: string[]): CliLocale | undefined;
/**
 * 从环境变量解析语言。
 */
export declare function readLocaleFromEnv(env?: NodeJS.ProcessEnv): CliLocale | undefined;
/**
 * 根据 argv + env 解析当前 CLI 语言。
 */
export declare function resolveCliLocale(params?: {
    argv?: string[];
    env?: NodeJS.ProcessEnv;
    persisted_locale?: CliLocale;
    fallback?: CliLocale;
}): CliLocale;
/**
 * 设置当前进程内的 CLI 语言。
 */
export declare function setCliLocale(locale: CliLocale): void;
/**
 * 读取当前 CLI 语言。
 */
export declare function getCliLocale(): CliLocale;
/**
 * 读取双语文案中的当前语言版本。
 */
export declare function t(input: LocaleTextInput): string;
/**
 * 统一 help 文案。
 */
export declare function helpText(): string;
/**
 * `--lang` 参数说明文案。
 */
export declare function langOptionText(): string;
/**
 * 规范化语言输入。
 */
export declare function normalizeLocale(value: unknown): CliLocale | undefined;
//# sourceMappingURL=i18n.d.ts.map
/**
 * City CLI 轻量语言模块。
 *
 * 关键说明（中文）
 * - 不引入额外 i18n 框架，只提供 CLI 所需的语言解析与文案读取。
 * - 默认读取 `--lang`、`DC_CLI_LANG`、`LC_ALL`、`LC_MESSAGES`、`LANG`。
 * - 当前仅支持 `zh` 与 `en`，未知输入自动回退到 `en`。
 */
let current_locale = "en";
/**
 * 解析 CLI 参数中的 `--lang`。
 */
export function readLocaleFromArgv(argv) {
    for (let index = 0; index < argv.length; index += 1) {
        const token = String(argv[index] || "").trim();
        if (!token)
            continue;
        if (token === "--lang") {
            return normalizeLocale(argv[index + 1]);
        }
        if (token.startsWith("--lang=")) {
            return normalizeLocale(token.slice("--lang=".length));
        }
    }
    return undefined;
}
/**
 * 从环境变量解析语言。
 */
export function readLocaleFromEnv(env = process.env) {
    const candidates = [
        env.DC_CLI_LANG,
        env.LC_ALL,
        env.LC_MESSAGES,
        env.LANG,
    ];
    for (const candidate of candidates) {
        const locale = normalizeLocale(candidate);
        if (locale)
            return locale;
    }
    return undefined;
}
/**
 * 根据 argv + env 解析当前 CLI 语言。
 */
export function resolveCliLocale(params) {
    return (readLocaleFromArgv(params?.argv ?? process.argv.slice(2))
        ?? params?.persisted_locale
        ?? readLocaleFromEnv(params?.env ?? process.env)
        ?? params?.fallback
        ?? "en");
}
/**
 * 设置当前进程内的 CLI 语言。
 */
export function setCliLocale(locale) {
    current_locale = locale;
}
/**
 * 读取当前 CLI 语言。
 */
export function getCliLocale() {
    return current_locale;
}
/**
 * 读取双语文案中的当前语言版本。
 */
export function t(input) {
    const text = normalizeLocaleText(input);
    return text[getCliLocale()];
}
/**
 * 统一 help 文案。
 */
export function helpText() {
    return t({
        zh: "显示帮助信息",
        en: "display help for command",
    });
}
/**
 * `--lang` 参数说明文案。
 */
export function langOptionText() {
    return t({
        zh: "指定 CLI 语言（zh|en）",
        en: "set CLI language (zh|en)",
    });
}
/**
 * 规范化语言输入。
 */
export function normalizeLocale(value) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw)
        return undefined;
    if (raw === "zh" || raw.startsWith("zh-") || raw.startsWith("zh_"))
        return "zh";
    if (raw === "en" || raw.startsWith("en-") || raw.startsWith("en_"))
        return "en";
    return undefined;
}
function normalizeLocaleText(input) {
    return {
        zh: String(input.zh || "").trim(),
        en: String(input.en || "").trim(),
    };
}
//# sourceMappingURL=i18n.js.map
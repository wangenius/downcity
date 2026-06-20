/**
 * City 交互式语言设置模块。
 *
 * 关键点（中文）
 * - 统一承载 `city` 交互菜单中的语言选择逻辑，避免首页与 City 管理器重复实现。
 * - 写入 City 本地状态后立即更新进程内语言，保证后续菜单即时生效。
 */
import prompts from "../../city/tui/Prompts.js";
import { writePersistedCityCliLocale } from "../../city/shared/CityStateStore.js";
import { emitCliBlock } from "../../shared/CliReporter.js";
import { getCliLocale, setCliLocale, t } from "../../shared/CliLocale.js";
/**
 * 交互式切换并持久化 City CLI 语言。
 */
export async function promptAndPersistCityCliLocale(options) {
    const current_locale = getCliLocale();
    const response = (await prompts({
        type: "select",
        name: "cli_locale",
        message: t({
            zh: "选择 City CLI 语言",
            en: "Choose the City CLI language",
        }),
        choices: [
            {
                title: "English",
                description: current_locale === "en"
                    ? t({
                        zh: "当前默认语言",
                        en: "Current default language",
                    })
                    : t({
                        zh: "切换到英文界面",
                        en: "Switch to the English interface",
                    }),
                value: "en",
            },
            {
                title: "中文",
                description: current_locale === "zh"
                    ? t({
                        zh: "当前默认语言",
                        en: "Current default language",
                    })
                    : t({
                        zh: "切换到中文界面",
                        en: "Switch to the Chinese interface",
                    }),
                value: "zh",
            },
        ],
        initial: current_locale === "zh" ? 1 : 0,
    }));
    const cli_locale = response.cli_locale;
    if (!cli_locale) {
        return null;
    }
    setCliLocale(cli_locale);
    writePersistedCityCliLocale(cli_locale);
    if (options?.silent !== true) {
        emitCliBlock({
            tone: "success",
            title: t({
                zh: "CLI 语言已更新",
                en: "CLI language updated",
            }),
            note: t({
                zh: cli_locale === "zh" ? "当前默认语言已保存为中文。" : "当前默认语言已保存为英文。",
                en: cli_locale === "zh"
                    ? "Chinese has been saved as the default language."
                    : "English has been saved as the default language.",
            }),
        });
    }
    return cli_locale;
}
//# sourceMappingURL=InteractiveLocale.js.map
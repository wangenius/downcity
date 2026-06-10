/**
 * Admin City 说明文档查看命令。
 */
import { t } from "../../i18n.js";
/**
 * 展示当前 City 聚合后的说明文档。
 */
export async function manageInstruction(a, _baseUrl, runtime) {
    const title = t({
        zh: "City 指令",
        en: "City Instruction",
    });
    const content = await runtime.with_loading(title, async () => await a.instruction());
    await runtime.show_text(title, content);
}
//# sourceMappingURL=instruction.js.map
/**
 * Admin Models 只读视图。
 *
 * 关键说明（中文）
 * - 这里不提供模型新增、删除、启停。
 * - 模型定义仍然来自代码注册；admin 只负责查看当前可用状态。
 * - 如果模型缺少 provider key，会在这里直接显示缺失项。
 */
import { show, showError } from "../../core/ui.js";
import { adminErrorMessage, isAdminNotFoundError, rethrowAdminAuthError } from "../auth-error.js";
import { t } from "../../i18n.js";
/**
 * 展示全部代码注册模型及其运行状态。
 */
export async function manageModels(a) {
    try {
        const [modelResp, envCatalog] = await Promise.all([
            a.listModels(),
            a.env.catalog(),
        ]);
        const items = modelResp ?? [];
        const aiScope = envCatalog.find((item) => item.id === "ai-models");
        const envMap = new Map(aiScope?.env.map((item) => [item.key, item.configured]) ?? []);
        if (items.length === 0) {
            show(t({
                zh: "当前 server 没有已注册的 models。",
                en: "No models registered on server.",
            }));
            return;
        }
        console.log(`\n${items.length} models:\n`);
        for (const model of items) {
            const requirements = model.env_requirements ?? [];
            const missingEnv = requirements
                .filter((item) => item.required && !envMap.get(item.key))
                .map((item) => item.key);
            const status = missingEnv.length === 0 ? "READY" : `MISSING ${missingEnv.join(", ")}`;
            const defaults = (model.default_modes ?? []).length > 0
                ? `default: ${(model.default_modes ?? []).join(", ")}`
                : "default: none";
            const envText = requirements.length > 0
                ? requirements
                    .map((item) => `${item.key}${envMap.get(item.key) ? "✓" : "✗"}`)
                    .join(", ")
                : "none";
            console.log(`  ${model.name} (${model.id})`);
            console.log(`    status: ${status}`);
            console.log(`    modalities: ${model.modalities.join(", ") || "none"}`);
            console.log(`    ${defaults}`);
            console.log(`    env: ${envText}`);
            if (model.description)
                console.log(`    desc: ${model.description}`);
            console.log("");
        }
    }
    catch (e) {
        rethrowAdminAuthError(e);
        if (isAdminNotFoundError(e)) {
            showError(t({
                zh: "当前连接的 City 版本过旧，尚未暴露 /v1/env/catalog。请先部署最新的 worker/server。",
                en: "Connected City is too old and does not expose /v1/env/catalog yet. Deploy the latest worker/server first.",
            }));
            return;
        }
        showError(adminErrorMessage(e));
    }
}
//# sourceMappingURL=models.js.map
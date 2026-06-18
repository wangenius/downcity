/**
 * Town CLI 入口路径解析。
 *
 * 关键点（中文）
 * - City 管理 CLI 不能再内置 Town 命令源码。
 * - 当 City 控制面需要启动 Agent daemon 时，应调用同一个 downcity 安装包里的 `town` 入口。
 * - 本模块只解析本机入口路径，不承担 Town 命令实现。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * 解析当前安装环境中的 `town` CLI 入口。
 */
export function resolveTownCliPath() {
    const candidates = [
        process.env.DOWNCITY_TOWN_CLI_PATH,
        // downcity 发布包：town runtime 被复制到 `<pkg>/town`，town wrapper 位于 `<pkg>/bin/town`。
        path.resolve(__dirname, "../../bin/town/index.js"),
        // workspace 开发态：town 构建产物在 `cli/town/bin/index.js`。
        path.resolve(__dirname, "../../../town/bin/index.js"),
        path.resolve(process.cwd(), "cli/town/bin/index.js"),
    ]
        .map((item) => String(item || "").trim())
        .filter(Boolean);
    const matched = candidates.find((candidate) => fs.existsSync(candidate));
    if (matched)
        return matched;
    throw new Error([
        "town CLI entry not found.",
        "Run `pnpm -C cli/town build`, or set DOWNCITY_TOWN_CLI_PATH.",
    ].join(" "));
}
//# sourceMappingURL=TownCliPath.js.map
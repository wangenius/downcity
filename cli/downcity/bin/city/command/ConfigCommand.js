/**
 * `city config` 命令组。
 *
 * 目标（中文）
 * - 提供 downcity.json 的通用读写能力（get/set/unset）。
 * - 提供 alias 写入能力。
 * - 所有输出统一支持 JSON（默认）与可读文本两种模式。
 */
import path from "node:path";
import fs from "fs-extra";
import { getDowncityJsonPath } from "../../city/config/Paths.js";
import { printResult } from "../../city/utils/cli/CliOutput.js";
import { aliasCommand } from "../../city/shared/Alias.js";
import { parseBoolean } from "../../shared/IndexSupport.js";
import { helpText, t } from "../../shared/CliLocale.js";
/**
 * 解析项目根目录。
 *
 * 关键点（中文）
 * - `city config` 是本机 City 配置命令，只需要纯路径解析能力。
 * - 不依赖 City plugin 目标解析模块，避免配置命令耦合运行态目标解析。
 */
function resolveProjectRoot(pathInput) {
    return path.resolve(String(pathInput || "."));
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseConfigPath(pathInput) {
    const trimmed = String(pathInput || "").trim();
    if (!trimmed) {
        throw new Error("Config path cannot be empty");
    }
    const parts = trimmed.split(".");
    if (parts.some((x) => x.trim().length === 0)) {
        throw new Error(`Invalid config path: ${pathInput}`);
    }
    return parts.map((x) => x.trim());
}
function parseConfigValue(rawValue) {
    const trimmed = String(rawValue).trim();
    if (!trimmed)
        return "";
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return rawValue;
    }
}
function readDowncityConfigByPath(downcityJsonPath, scope) {
    if (!fs.existsSync(downcityJsonPath)) {
        const hint = scope === "console"
            ? 'Run "city init" first.'
            : 'Run "city agent create" first.';
        throw new Error(`downcity.json not found at ${downcityJsonPath}. ${hint}`);
    }
    const raw = fs.readJsonSync(downcityJsonPath);
    if (!isPlainObject(raw)) {
        throw new Error("Invalid downcity.json: expected object");
    }
    const candidate = raw;
    if (typeof candidate.id !== "string" || typeof candidate.version !== "string") {
        throw new Error("Invalid downcity.json: missing required fields id/version");
    }
    return { downcityJsonPath, config: candidate };
}
function readDowncityConfig(projectRoot) {
    return readDowncityConfigByPath(getDowncityJsonPath(projectRoot), "project");
}
function writeDowncityConfig(downcityJsonPath, config) {
    fs.writeJsonSync(downcityJsonPath, config, { spaces: 2 });
}
function getByPath(root, pathTokens) {
    let cursor = root;
    for (const token of pathTokens) {
        if (!isPlainObject(cursor) || !(token in cursor)) {
            return { found: false };
        }
        cursor = cursor[token];
    }
    return { found: true, value: cursor };
}
function setByPath(root, pathTokens, nextValue) {
    let cursor = root;
    for (let i = 0; i < pathTokens.length - 1; i += 1) {
        const key = pathTokens[i];
        const current = cursor[key];
        if (current === undefined) {
            cursor[key] = {};
            cursor = cursor[key];
            continue;
        }
        if (!isPlainObject(current)) {
            throw new Error(`Cannot set path "${pathTokens.join(".")}": "${pathTokens
                .slice(0, i + 1)
                .join(".")}" is not an object`);
        }
        cursor = current;
    }
    const leaf = pathTokens[pathTokens.length - 1];
    const existed = Object.prototype.hasOwnProperty.call(cursor, leaf);
    const previous = cursor[leaf];
    cursor[leaf] = nextValue;
    return { existed, previous };
}
function unsetByPath(root, pathTokens) {
    let cursor = root;
    for (let i = 0; i < pathTokens.length - 1; i += 1) {
        const key = pathTokens[i];
        const current = cursor[key];
        if (!isPlainObject(current)) {
            return { removed: false, previous: undefined };
        }
        cursor = current;
    }
    const leaf = pathTokens[pathTokens.length - 1];
    if (!Object.prototype.hasOwnProperty.call(cursor, leaf)) {
        return { removed: false, previous: undefined };
    }
    const previous = cursor[leaf];
    delete cursor[leaf];
    return { removed: true, previous };
}
function runConfigCommand(options, handler) {
    const asJson = options.json !== false;
    try {
        const projectRoot = resolveProjectRoot(options.path);
        const { downcityJsonPath, config } = readDowncityConfig(projectRoot);
        const result = handler({ projectRoot, downcityJsonPath, config });
        if (result.save) {
            writeDowncityConfig(downcityJsonPath, config);
        }
        printResult({
            asJson,
            success: true,
            title: result.title,
            payload: {
                projectRoot,
                downcityJsonPath,
                ...result.payload,
            },
        });
    }
    catch (error) {
        printResult({
            asJson,
            success: false,
            title: "config command failed",
            payload: {
                error: error instanceof Error ? error.message : String(error),
            },
        });
        process.exitCode = 1;
    }
}
function applyCommonOptions(command) {
    return command
        .option("--path <path>", t({
        zh: "项目根目录（默认当前目录）",
        en: "project root path (default: current directory)",
    }), ".")
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean, true);
}
/**
 * 注册 `city config` 命令组。
 */
export function registerConfigCommand(program) {
    const config = program
        .command("config")
        .description(t({
        zh: "管理 downcity.json 配置与 alias",
        en: "manage downcity.json configuration and shell aliases",
    }))
        .helpOption("--help", helpText());
    applyCommonOptions(config
        .command("get [keyPath]")
        .description(t({
        zh: "读取 downcity.json（可选读取单个路径）",
        en: "read downcity.json, optionally from a single path",
    }))
        .helpOption("--help", helpText())).action((keyPath, options) => {
        runConfigCommand(options, ({ config: downcityConfig }) => {
            if (!keyPath) {
                return {
                    title: "config loaded",
                    payload: { config: downcityConfig },
                };
            }
            const pathTokens = parseConfigPath(keyPath);
            const got = getByPath(downcityConfig, pathTokens);
            if (!got.found) {
                throw new Error(`Config path not found: ${keyPath}`);
            }
            return {
                title: "config value loaded",
                payload: {
                    keyPath,
                    value: got.value,
                },
            };
        });
    });
    applyCommonOptions(config
        .command("set <keyPath> <value>")
        .description(t({
        zh: "设置 downcity.json 指定路径的值（value 支持 JSON 字面量）",
        en: "set a value at a downcity.json path (value supports JSON literals)",
    }))
        .helpOption("--help", helpText())).action((keyPath, value, options) => {
        const pathTokens = parseConfigPath(keyPath);
        runConfigCommand(options, ({ config: downcityConfig }) => {
            const parsed = parseConfigValue(value);
            const changed = setByPath(downcityConfig, pathTokens, parsed);
            return {
                title: "config value updated",
                save: true,
                payload: {
                    keyPath,
                    value: parsed,
                    existed: changed.existed,
                    previous: changed.previous,
                },
            };
        });
    });
    applyCommonOptions(config
        .command("unset <keyPath>")
        .description(t({
        zh: "删除 downcity.json 指定路径",
        en: "remove a value at a downcity.json path",
    }))
        .helpOption("--help", helpText())).action((keyPath, options) => {
        const pathTokens = parseConfigPath(keyPath);
        runConfigCommand(options, ({ config: downcityConfig }) => {
            const removed = unsetByPath(downcityConfig, pathTokens);
            if (!removed.removed) {
                throw new Error(`Config path not found: ${keyPath}`);
            }
            return {
                title: "config value removed",
                save: true,
                payload: {
                    keyPath,
                    previous: removed.previous,
                },
            };
        });
    });
    config
        .command("alias")
        .description(t({
        zh: "在 .zshrc / .bashrc 中写入 Downcity 推荐 alias",
        en: "write recommended Downcity aliases into .zshrc / .bashrc",
    }))
        .option("--shell <shell>", t({
        zh: "指定写入的 shell: zsh | bash | both",
        en: "target shell to update: zsh | bash | both",
    }), "both")
        .option("--dry-run", t({
        zh: "只打印将要修改的文件，不实际写入",
        en: "print the files that would be changed without writing them",
    }), false)
        .option("--print", t({
        zh: "仅打印 alias 内容（用于 eval）",
        en: "print alias content only (for eval)",
    }), false)
        .helpOption("--help", helpText())
        .action(async (options) => {
        await aliasCommand({
            shell: options.shell,
            dryRun: Boolean(options.dryRun),
            print: Boolean(options.print),
        });
    });
}
//# sourceMappingURL=ConfigCommand.js.map
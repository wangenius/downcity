/**
 * City 项目 package scripts 执行器。
 *
 * 关键点（中文）
 * - 普通开发者不需要在 `federation.json` 里声明 build/typecheck。
 * - 如果项目 package.json 有对应 script，`city deploy` 自动执行。
 * - 没有 package.json 或没有脚本时安静跳过，保持最小项目可部署。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { emitCliBlock } from "../../../shared/CliReporter.js";
import { runCommand } from "../../../federation/deploy/runtime/CommandRunner.js";
/**
 * 自动执行 package.json 中的 build/typecheck。
 */
export async function runPackageDeployScripts(params) {
    const scripts = readPackageScripts(params.project_dir);
    if (!params.skip_build && scripts.build) {
        await runPackageScript(params.project_dir, "build");
    }
    else {
        emitCliBlock({
            tone: "info",
            title: params.skip_build ? "Build skipped" : "No build script",
        });
    }
    if (!params.skip_typecheck && scripts.typecheck) {
        await runPackageScript(params.project_dir, "typecheck");
    }
    else {
        emitCliBlock({
            tone: "info",
            title: params.skip_typecheck ? "Typecheck skipped" : "No typecheck script",
        });
    }
}
/**
 * 读取 package.json 中是否存在部署相关脚本。
 */
function readPackageScripts(project_dir) {
    const package_json_path = join(project_dir, "package.json");
    if (!existsSync(package_json_path)) {
        return { build: false, typecheck: false };
    }
    try {
        const parsed = JSON.parse(readFileSync(package_json_path, "utf-8"));
        return {
            build: typeof parsed.scripts?.build === "string",
            typecheck: typeof parsed.scripts?.typecheck === "string",
        };
    }
    catch {
        return { build: false, typecheck: false };
    }
}
/**
 * 执行 package script。
 */
async function runPackageScript(project_dir, script_name) {
    emitCliBlock({
        tone: "info",
        title: `Running ${script_name}`,
        facts: [{ label: "command", value: `pnpm ${script_name}` }],
    });
    await runCommand({
        label: script_name,
        command: `pnpm ${script_name}`,
        cwd: project_dir,
    });
}
//# sourceMappingURL=PackageScriptRunner.js.map
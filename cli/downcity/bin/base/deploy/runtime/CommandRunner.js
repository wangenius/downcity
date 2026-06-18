/**
 * City 部署命令执行器。
 *
 * 关键点（中文）
 * - 统一执行本地 shell 命令和 Wrangler 命令，集中处理失败提示。
 * - 使用 shell 执行 `federation.json` 中的命令，允许用户写 pnpm / npm / bash 组合命令。
 * - 不在这里解析业务语义，部署步骤由 deployer 组合。
 */
import { spawn } from "node:child_process";
import { CliError } from "../../shared/CliError.js";
/**
 * 执行 shell 命令。
 */
export async function runCommand(params) {
    return await new Promise((resolve, reject) => {
        const child = spawn(params.command, {
            cwd: params.cwd,
            env: {
                ...process.env,
                ...params.env,
            },
            shell: true,
            stdio: params.capture ? ["ignore", "pipe", "pipe"] : "inherit",
        });
        let stdout = "";
        let stderr = "";
        if (params.capture && child.stdout) {
            child.stdout.on("data", (chunk) => {
                stdout += String(chunk);
            });
        }
        if (params.capture && child.stderr) {
            child.stderr.on("data", (chunk) => {
                stderr += String(chunk);
            });
        }
        child.on("error", (error) => {
            reject(new CliError({
                title: `${params.label} failed`,
                note: error.message,
            }));
        });
        child.on("exit", (code) => {
            if (code === 0) {
                resolve(params.capture ? `${stdout}${stderr}`.trim() : "");
                return;
            }
            reject(new CliError({
                title: `${params.label} failed`,
                note: stderr.trim() || stdout.trim() || `Command exited with code ${code ?? "unknown"}.`,
                fix: params.command,
            }));
        });
    });
}
//# sourceMappingURL=CommandRunner.js.map
/**
 * Token 命令通用工具函数。
 *
 * 关键点（中文）
 * - 负责 token 状态判断、格式化与剪贴板等纯工具逻辑。
 * - 不依赖任何交互流程，可被渲染与动作模块复用。
 */
import { spawnSync } from "node:child_process";
/**
 * 当前是否为交互式终端。
 */
export function isInteractiveTerminal() {
    return process.stdin.isTTY === true && process.stdout.isTTY === true;
}
/**
 * 判断 token 是否已过期。
 */
export function isTokenExpired(token) {
    if (!token.expiresAt)
        return false;
    return new Date(token.expiresAt).getTime() <= Date.now();
}
/**
 * 解析 token 状态。
 */
export function resolveTokenState(token) {
    if (isTokenExpired(token))
        return "expired";
    return "active";
}
/**
 * 格式化 token 状态标签。
 */
export function formatTokenStateLabel(token) {
    const state = resolveTokenState(token);
    if (state === "expired")
        return "expired";
    return "active";
}
/**
 * 根据 token 状态解析视觉语气。
 */
export function resolveTokenTone(token) {
    const state = resolveTokenState(token);
    if (state === "active")
        return "accent";
    return "warning";
}
/**
 * 构建 token 详情事实列表。
 */
export function buildTokenFacts(token) {
    return [
        {
            label: "Id",
            value: token.id,
        },
        {
            label: "State",
            value: formatTokenStateLabel(token),
        },
        {
            label: "Created",
            value: token.createdAt,
        },
        ...(token.updatedAt
            ? [
                {
                    label: "Updated",
                    value: token.updatedAt,
                },
            ]
            : []),
        ...(token.lastUsedAt
            ? [
                {
                    label: "Last used",
                    value: token.lastUsedAt,
                },
            ]
            : []),
        ...(token.expiresAt
            ? [
                {
                    label: "Expires",
                    value: token.expiresAt,
                },
            ]
            : []),
    ];
}
/**
 * 复制文本到系统剪贴板。
 *
 * 关键点（中文）
 * - 依次尝试 pbcopy / wl-copy / xclip / clip。
 * - 返回使用的后端命令，便于提示用户。
 */
export function copyTextToClipboard(text) {
    const value = String(text || "");
    if (!value)
        return { success: false };
    const backends = [
        {
            command: "pbcopy",
            args: [],
        },
        {
            command: "wl-copy",
            args: [],
        },
        {
            command: "xclip",
            args: ["-selection", "clipboard"],
        },
        {
            command: "clip",
            args: [],
        },
    ];
    for (const backend of backends) {
        const result = spawnSync(backend.command, backend.args, {
            input: value,
            encoding: "utf8",
        });
        if (!result.error && result.status === 0) {
            return {
                success: true,
                backend: backend.command,
            };
        }
    }
    return { success: false };
}
//# sourceMappingURL=TokenHelpers.js.map
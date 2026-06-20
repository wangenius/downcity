/**
 * `city chat auth` CLI 辅助模块。
 *
 * 关键点（中文）
 * - chat access 现在按 agent projectRoot 隔离存储。
 * - 授权主体使用 `<platform>:<platformUserId>`，例如 `telegram:12345678`。
 * - 管理员执行 `city chat auth set telegram:12345678` 后交互式选择 role。
 */
import path from "node:path";
import prompts from "../../city/tui/Prompts.js";
import { isChatAuthorizationChannel, listChatAuthorizationRoles, readChatAuthorizationConfigSync, resolveAuthorizedUserRole, setChatAuthorizationUserRole, } from "@downcity/plugins";
import { emitCliBlock } from "../../shared/CliReporter.js";
import { parseBoolean } from "../../shared/IndexSupport.js";
import { helpText, t } from "../../shared/CliLocale.js";
function resolveChatAuthProjectRoot(pathInput) {
    return path.resolve(String(pathInput || "."));
}
function parsePrincipal(principalInput) {
    const principal = String(principalInput || "").trim();
    const separator = principal.indexOf(":");
    if (separator <= 0 || separator === principal.length - 1) {
        throw new Error("principal 格式应为 <platform>:<userId>，例如 telegram:12345678");
    }
    const channel = principal.slice(0, separator).trim().toLowerCase();
    const userId = principal.slice(separator + 1).trim();
    if (!isChatAuthorizationChannel(channel)) {
        throw new Error("platform 仅支持 telegram、feishu、qq");
    }
    if (!userId) {
        throw new Error("userId 不能为空");
    }
    return { channel, userId };
}
function findRole(roles, roleId) {
    return roles.find((role) => role.roleId === roleId) || null;
}
async function chooseRole(params) {
    const initial = Math.max(0, params.roles.findIndex((role) => role.roleId === params.currentRoleId));
    const response = (await prompts({
        type: "select",
        name: "roleId",
        message: "选择新的 access role",
        choices: params.roles.map((role) => ({
            title: role.roleId,
            description: `${role.name} · ${role.permissions.length} permissions`,
            value: role.roleId,
        })),
        initial,
    }));
    const roleId = String(response.roleId || "").trim();
    if (!roleId)
        return null;
    return findRole(params.roles, roleId);
}
/**
 * 设置授权主体角色。
 */
export async function runChatAuthSet(params) {
    const principal = parsePrincipal(params.principal);
    const projectRoot = resolveChatAuthProjectRoot(params.options?.path);
    const config = readChatAuthorizationConfigSync(projectRoot);
    const roles = listChatAuthorizationRoles({ config });
    const currentRole = resolveAuthorizedUserRole({
        channel: principal.channel,
        userId: principal.userId,
        authorizationConfig: config,
        rootPath: projectRoot,
    });
    let nextRole = null;
    const explicitRoleId = String(params.options?.role || "").trim();
    if (explicitRoleId) {
        nextRole = findRole(roles, explicitRoleId);
        if (!nextRole)
            throw new Error(`Unknown role: ${explicitRoleId}`);
    }
    else {
        emitCliBlock({
            tone: "info",
            title: "Chat access principal",
            facts: [
                { label: "Principal", value: `${principal.channel}:${principal.userId}` },
                { label: "Current role", value: currentRole?.roleId || "default" },
                { label: "Scope", value: "agent project" },
                { label: "Project", value: projectRoot },
            ],
        });
        nextRole = await chooseRole({
            roles,
            currentRoleId: currentRole?.roleId,
        });
    }
    if (!nextRole)
        return;
    await setChatAuthorizationUserRole({
        context: {
            rootPath: projectRoot,
        },
        channel: principal.channel,
        userId: principal.userId,
        roleId: nextRole.roleId,
    });
    emitCliBlock({
        tone: "success",
        title: "Chat access role updated",
        summary: `${principal.channel}:${principal.userId} -> ${nextRole.roleId}`,
        facts: [
            { label: "Role", value: nextRole.name },
            { label: "Scope", value: "agent project" },
            { label: "Project", value: projectRoot },
        ],
    });
}
/**
 * 交互式输入授权主体并设置角色。
 */
export async function runInteractiveChatAuthSetFlow(options) {
    const response = (await prompts({
        type: "text",
        name: "principal",
        message: "输入 chat 用户（例如 telegram:12345678）",
    }));
    const principal = String(response.principal || "").trim();
    if (!principal)
        return;
    await runChatAuthSet({
        principal,
        options,
    });
}
/**
 * 注册 `city chat auth` 命令。
 */
export function registerChatAuthCommands(chat) {
    const auth = chat
        .command("auth")
        .description(t({
        zh: "管理当前 agent 项目的 chat access",
        en: "manage chat access for the current agent project",
    }))
        .helpOption("--help", helpText());
    auth
        .command("set <principal>")
        .description(t({
        zh: "给授权主体设置角色，例如：city chat auth set telegram:12345678 --path .",
        en: "assign a role to a principal, for example: city chat auth set telegram:12345678 --path .",
    }))
        .option("--path <path>", t({
        zh: "agent 项目根目录（默认当前目录）",
        en: "agent project root path (default: current directory)",
    }), ".")
        .option("--role <roleId>", t({
        zh: "直接指定 roleId；不传则交互式选择",
        en: "set roleId directly; interactive selection when omitted",
    }))
        .option("--json [enabled]", t({
        zh: "以 JSON 输出",
        en: "output as JSON",
    }), parseBoolean, false)
        .helpOption("--help", helpText())
        .action(async (principal, options) => {
        await runChatAuthSet({
            principal,
            options,
        });
    });
}
//# sourceMappingURL=ChatAuthCommand.js.map
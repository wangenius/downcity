/**
 * AgentHistory：`town agent history` 维护命令。
 *
 * 关键点（中文）
 * - 面向用户提供定点硬清理能力，用于处理单个坏 session。
 * - 清理范围固定为 session messages、chat audit、channel route 三处。
 * - 命令必须显式传 `--hard`，避免误删运行时历史。
 */
import fs from "fs-extra";
import path from "node:path";
import { getDowncityChannelDirPath, getDowncityChannelMetaPath, getDowncityChatSessionDirPath, getDowncitySessionDirPath, } from "@/config/Paths.js";
import { CliError } from "../shared/CliError.js";
import { emitCliBlock } from "../shared/CliReporter.js";
import { printResult } from "@/utils/cli/CliOutput.js";
import { resolveAgentId } from "../shared/IndexSupport.js";
function normalizeText(input) {
    return String(input || "").trim();
}
function normalizeThreadId(input) {
    const text = normalizeText(input);
    if (!text)
        return "";
    const numberValue = Number(text);
    if (!Number.isFinite(numberValue) || numberValue <= 0)
        return "";
    return String(Math.trunc(numberValue));
}
function buildTargetKey(options) {
    const channel = normalizeText(options.channel);
    const chatId = normalizeText(options.chatId);
    if (!channel || !chatId)
        return "";
    return [
        channel,
        chatId,
        normalizeText(options.targetType),
        normalizeThreadId(options.threadId),
    ].join("|");
}
async function readChannelMeta(projectRoot) {
    const filePath = getDowncityChannelMetaPath(projectRoot);
    const raw = (await fs.readJson(filePath).catch(() => null));
    return raw && typeof raw === "object" ? raw : {};
}
function resolveSessionIdFromMeta(meta, options) {
    const targetKey = buildTargetKey(options);
    if (!targetKey)
        return "";
    const mapped = normalizeText(meta.sessionIdByTargetKey?.[targetKey]);
    if (mapped)
        return mapped;
    const routes = meta.routesBySessionId || {};
    const channel = normalizeText(options.channel);
    const chatId = normalizeText(options.chatId);
    const targetType = normalizeText(options.targetType);
    const threadId = normalizeThreadId(options.threadId);
    for (const route of Object.values(routes)) {
        if (normalizeText(route.channel) !== channel)
            continue;
        if (normalizeText(route.chatId) !== chatId)
            continue;
        if (targetType && normalizeText(route.targetType) !== targetType)
            continue;
        if (threadId && normalizeThreadId(route.threadId) !== threadId)
            continue;
        const sessionId = normalizeText(route.sessionId);
        if (sessionId)
            return sessionId;
    }
    return "";
}
async function removeRouteFromMeta(params) {
    const metaPath = getDowncityChannelMetaPath(params.projectRoot);
    const meta = await readChannelMeta(params.projectRoot);
    const routesBySessionId = meta.routesBySessionId || {};
    const sessionIdByTargetKey = meta.sessionIdByTargetKey || {};
    let removed = false;
    if (routesBySessionId[params.sessionId]) {
        delete routesBySessionId[params.sessionId];
        removed = true;
    }
    for (const [targetKey, mappedSessionId] of Object.entries(sessionIdByTargetKey)) {
        if (normalizeText(mappedSessionId) !== params.sessionId)
            continue;
        delete sessionIdByTargetKey[targetKey];
        removed = true;
    }
    if (!removed)
        return false;
    await fs.ensureDir(getDowncityChannelDirPath(params.projectRoot));
    await fs.writeJson(metaPath, {
        ...meta,
        v: 1,
        updatedAt: Date.now(),
        sessionIdByTargetKey,
        routesBySessionId,
    }, { spaces: 2 });
    return true;
}
/**
 * 执行 `town agent history clean`。
 */
export async function agentHistoryCleanCommand(projectRoot, options) {
    if (options.hard !== true) {
        throw new CliError({
            title: "Hard clean requires --hard",
            note: "History clean deletes runtime files for one session.",
            fix: "Add --hard after verifying --session-id or --channel/--chat-id.",
        });
    }
    const meta = await readChannelMeta(projectRoot);
    const sessionId = normalizeText(options.sessionId) || resolveSessionIdFromMeta(meta, options);
    if (!sessionId) {
        throw new CliError({
            title: "Cannot resolve target session",
            note: "Provide --session-id, or provide --channel and --chat-id for a known chat route.",
            fix: "Example: town agent history clean <path> --channel telegram --chat-id 8444574557 --hard",
        });
    }
    const sessionDir = getDowncitySessionDirPath(projectRoot, resolveAgentId(projectRoot), sessionId);
    const chatDir = getDowncityChatSessionDirPath(projectRoot, sessionId);
    const removedSessionDir = await fs.pathExists(sessionDir);
    const removedChatDir = await fs.pathExists(chatDir);
    if (removedSessionDir)
        await fs.remove(sessionDir);
    if (removedChatDir)
        await fs.remove(chatDir);
    const removedRoute = await removeRouteFromMeta({ projectRoot, sessionId });
    const result = {
        projectRoot: path.resolve(projectRoot),
        sessionId,
        removedSessionDir,
        removedChatDir,
        removedRoute,
    };
    if (options.json === true) {
        printResult({
            asJson: true,
            success: true,
            title: "agent history cleaned",
            payload: { ...result },
        });
        return result;
    }
    emitCliBlock({
        tone: "success",
        title: "Agent history cleaned",
        facts: [
            { label: "Project", value: result.projectRoot },
            { label: "Session", value: result.sessionId },
            { label: "Session dir", value: result.removedSessionDir ? "removed" : "not found" },
            { label: "Chat dir", value: result.removedChatDir ? "removed" : "not found" },
            { label: "Route", value: result.removedRoute ? "removed" : "not found" },
        ],
    });
    return result;
}
//# sourceMappingURL=AgentHistory.js.map
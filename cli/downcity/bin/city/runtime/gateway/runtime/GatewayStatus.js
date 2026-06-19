/**
 * GatewayStatus：City runtime 命令的状态展示辅助。
 *
 * 关键点（中文）
 * - 聚合 city 后台、City 连接与受管 agent 的状态面板输出。
 * - Console UI 已从 City 启动链路断开，因此总览不再展示 Console 运行态。
 * - 与进程控制逻辑解耦，便于后续继续拆分命令入口文件。
 */
import { getManagedAgentRegistryPath, getCityPidPath, } from "../../../process/registry/CityPaths.js";
import { isCityProcessAlive, readCityPid } from "../../../process/registry/CityRuntime.js";
import { emitCliBlock, emitCliList } from "../../../../shared/CliReporter.js";
import { resolveRunningManagedAgents } from "./GatewayProcess.js";
import { read_federation_membership_state } from "../../../shared/FederationConnection.js";
/**
 * 打印当前受管 agent 面板。
 */
export function printRunningManagedAgents(views) {
    if (views.length === 0) {
        emitCliBlock({
            tone: "info",
            title: "Managed agents",
            summary: "0 active",
            note: "no running agent daemon",
        });
        return;
    }
    emitCliList({
        tone: "accent",
        title: "Managed agents",
        summary: `${views.length} active`,
        items: views.map((item) => ({
            title: item.projectRoot.split("/").filter(Boolean).at(-1) || item.projectRoot,
            facts: [
                {
                    label: "project",
                    value: item.projectRoot,
                },
                {
                    label: "started at",
                    value: item.startedAt,
                },
                {
                    label: "updated at",
                    value: item.updatedAt,
                },
            ],
        })),
    });
}
/**
 * 打印 city 后台、City 连接与受管 agent 的状态面板。
 */
export async function gatewayStatusCommand() {
    const pidPath = getCityPidPath();
    const bayPid = await readCityPid();
    const running = Boolean(bayPid && isCityProcessAlive(bayPid));
    emitCliBlock({
        tone: running ? "success" : bayPid ? "warning" : "info",
        title: "City runtime",
        summary: running ? "running" : bayPid ? "stale" : "stopped",
        facts: [
            {
                label: "registry",
                value: getManagedAgentRegistryPath(),
            },
            ...(bayPid && !running
                ? [
                    {
                        label: "warning",
                        value: "stale pid file detected",
                    },
                ]
                : []),
            ...(pidPath
                ? [
                    {
                        label: "pid file",
                        value: pidPath,
                    },
                ]
                : []),
        ],
    });
    const city = read_federation_membership_state();
    emitCliBlock({
        tone: city.source === "missing"
            ? "warning"
            : city.has_user_token
                ? "success"
                : "warning",
        title: "Federation membership",
        summary: city.source === "missing" ? "missing" : city.source,
        facts: city.source === "missing"
            ? [
                {
                    label: "fix",
                    value: "city federation login",
                },
            ]
            : [
                {
                    label: "url",
                    value: city.federation_url,
                },
                {
                    label: "city",
                    value: city.city_id,
                },
                {
                    label: "user token",
                    value: city.has_user_token ? "configured" : "missing",
                },
            ],
    });
    try {
        const runningAgents = await resolveRunningManagedAgents({
            syncRegistry: false,
        });
        printRunningManagedAgents(runningAgents);
    }
    catch (error) {
        emitCliBlock({
            tone: "warning",
            title: "Managed agents",
            summary: "unavailable",
            facts: [
                {
                    label: "detail",
                    value: String(error),
                },
            ],
        });
    }
}
//# sourceMappingURL=GatewayStatus.js.map
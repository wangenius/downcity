/**
 * Daemon API 客户端（process 子模块）。
 *
 * 关键点（中文）
 * - 业务模块统一通过 daemon API 与运行时通信。
 * - HTTP gateway 与本机 RPC 的地址解析分开，避免端口语义混淆。
 */
import { type DaemonEndpoint, type DaemonJsonApiCallParams, type DaemonJsonApiCallResult } from "./Api.js";
type ResolveDaemonEndpointParams = {
    projectRoot: string;
    host?: string;
    port?: number;
};
/**
 * 解析 daemon endpoint。
 *
 * 优先级（中文）
 * 1) 显式入参 `host/port`
 * 2) 环境变量 `DC_CITY_HOST/DC_CITY_PORT`
 * 3) daemon meta args（`downcity.daemon.json`）
 * 4) 默认 `127.0.0.1:5314`
 */
export declare function resolveDaemonEndpoint(params: {
    projectRoot: string;
    host?: string;
    port?: number;
}): DaemonEndpoint;
/**
 * 解析 daemon 本机 RPC endpoint。
 *
 * 优先级（中文）
 * 1) 显式入参 `host/port`
 * 2) 环境变量 `DC_AGENT_RPC_HOST/DC_AGENT_RPC_PORT`
 * 3) daemon meta args（`downcity.daemon.json`）
 * 4) 默认 `127.0.0.1:15314`
 */
export declare function resolveDaemonRpcEndpoint(params: ResolveDaemonEndpointParams): DaemonEndpoint;
/**
 * 调用 daemon JSON API。
 *
 * 错误语义（中文）
 * - 网络异常：`success=false` + `error`（无 status）。
 * - HTTP 非 2xx：`success=false` + `status` + `error`。
 */
export declare function callServer<T>(params: DaemonJsonApiCallParams): Promise<DaemonJsonApiCallResult<T>>;
export {};
//# sourceMappingURL=Client.d.ts.map
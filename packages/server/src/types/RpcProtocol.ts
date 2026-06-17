/**
 * Server 包内部使用的 RPC 协议类型 re-export。
 *
 * 关键点（中文）
 * - 直接转出 `@downcity/agent/internal/types/rpc/RpcProtocol.js` 的协议类型。
 * - 让 server 内部模块只依赖一个本地路径，避免到处写 `@downcity/agent/internal/...` 长路径。
 */

export type {
  RpcRequest,
  RpcEventFrame,
  RpcServerFrame,
} from "@downcity/agent/internal/types/rpc/RpcProtocol.js";

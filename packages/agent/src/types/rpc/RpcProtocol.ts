/**
 * Agent RPC 协议类型。
 *
 * 关键点（中文）
 * - 该文件只描述本机 RPC 的线协议，不包含 socket 或业务执行逻辑。
 * - Client 与 Server 共享同一份 request/frame 类型，避免协议两边漂移。
 * - 字段名保持现有协议格式，兼容已发布的 downcity 托管 runtime 调用。
 */

import type {
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentArchiveSessionInput,
  AgentArchiveSessionsInput,
  AgentArchiveSessionResult,
  AgentArchiveSessionsResult,
  AgentCleanArchiveResult,
  AgentSessionRecordsInput,
  AgentSessionStopResult,
  AgentSessionSystemSnapshot,
} from "@/types/agent/AgentTypes.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { JsonObject, JsonValue } from "@/types/common/Json.js";
import type { PluginStateControlAction } from "@/plugin/types/Plugin.js";
import type { ShellApprovalMode } from "@downcity/shell";

/**
 * RPC 请求。
 *
 * 关键点（中文）
 * - `sdk.*` 面向 RemoteAgent 的稳定会话 SDK。
 * - `internal.*` 面向 downcity 本机管理通道。
 */
export type RpcRequest =
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 列出 sessions。 */
      method: "sdk.sessions.list";
      /** 列表过滤与分页参数。 */
      params?: AgentListSessionsInput;
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 创建 session。 */
      method: "sdk.sessions.create";
      /** 创建参数。 */
      params?: AgentCreateSessionInput;
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 获取 session。 */
      method: "sdk.sessions.get";
      /** 目标 session 参数。 */
      params: {
        /** 目标 session id。 */
        sessionId: string;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 归档 session。 */
      method: "sdk.sessions.archive";
      /** 归档参数。 */
      params: {
        /** 目标 session id。 */
        sessionId: string;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 列出已归档 sessions。 */
      method: "sdk.sessions.archived.list";
      /** 列表过滤与分页参数。 */
      params?: AgentArchiveSessionsInput;
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 清空已归档 sessions。 */
      method: "sdk.sessions.archived.clean";
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 向 session 发送 prompt。 */
      method: "sdk.sessions.prompt";
      /** prompt 参数。 */
      params: {
        /** 目标 session id。 */
        sessionId: string;
        /** SDK prompt 输入。 */
        input: AgentSessionPromptInput;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 停止当前 session turn。 */
      method: "sdk.sessions.stop";
      /** 停止参数。 */
      params: {
        /** 目标 session id。 */
        sessionId: string;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 读取 session records。 */
      method: "sdk.sessions.records";
      /** records 查询参数。 */
      params: {
        /** 目标 session id。 */
        sessionId: string;
        /** records 分页与视图参数。 */
        input?: AgentSessionRecordsInput;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 读取 session system snapshot。 */
      method: "sdk.sessions.system";
      /** 目标 session 参数。 */
      params: {
        /** 目标 session id。 */
        sessionId: string;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 分叉 session。 */
      method: "sdk.sessions.fork";
      /** 分叉参数。 */
      params: {
        /** 源 session id。 */
        sessionId: string;
        /** 可选源消息 id。 */
        messageId?: string;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 订阅 session 事件。 */
      method: "sdk.sessions.subscribe";
      /** 订阅参数。 */
      params: {
        /** 目标 session id。 */
        sessionId: string;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 取消 session 事件订阅。 */
      method: "sdk.sessions.unsubscribe";
      /** 取消订阅参数。 */
      params: {
        /** 当前订阅 id。 */
        subscriptionId: string;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 读取 Agent 内部状态。 */
      method: "internal.status.get";
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 清空 session messages。 */
      method: "internal.sessions.clear_messages";
      /** 目标 session 参数。 */
      params: {
        /** 目标 session id。 */
        sessionId: string;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 清空 chat history。 */
      method: "internal.sessions.clear_chat_history";
      /** 目标 session 参数。 */
      params: {
        /** 目标 session id。 */
        sessionId: string;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 解析 session system prompt。 */
      method: "internal.sessions.resolve_system_prompt";
      /** 目标 session 参数。 */
      params: {
        /** 目标 session id。 */
        sessionId: string;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 列出 plugin catalog。 */
      method: "internal.plugins.catalog";
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 列出 plugin 状态。 */
      method: "internal.plugins.list";
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 控制 plugin 生命周期。 */
      method: "internal.plugins.control";
      /** plugin 控制参数。 */
      params: {
        /** plugin 名称。 */
        pluginName: string;
        /** 控制动作。 */
        action: PluginStateControlAction;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 执行 plugin command。 */
      method: "internal.plugins.command";
      /** plugin command 参数。 */
      params: {
        /** plugin 名称。 */
        pluginName: string;
        /** command 名称。 */
        command: string;
        /** command payload。 */
        payload?: JsonValue;
        /** 可选调度 payload。 */
        schedule?: JsonValue;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 检查 plugin 可用性。 */
      method: "internal.plugins.availability";
      /** plugin 参数。 */
      params: {
        /** plugin 名称。 */
        pluginName: string;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 执行 plugin action。 */
      method: "internal.plugins.action";
      /** plugin action 参数。 */
      params: {
        /** plugin 名称。 */
        pluginName: string;
        /** action 名称。 */
        actionName: string;
        /** action payload。 */
        payload?: JsonValue;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 列出 shell approvals。 */
      method: "internal.shell.approvals";
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 列出 shell approval 模式。 */
      method: "internal.shell.approvalModes";
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 读取 shell approval 模式。 */
      method: "internal.shell.approvalMode";
      /** session 参数。 */
      params: {
        /** session id。 */
        sessionId: string;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 设置 shell approval 模式。 */
      method: "internal.shell.setApprovalMode";
      /** session 模式参数。 */
      params: {
        /** session id。 */
        sessionId: string;
        /** approval 模式。 */
        mode: ShellApprovalMode;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 批准 shell approval。 */
      method: "internal.shell.approve";
      /** approval 参数。 */
      params: {
        /** approval id。 */
        approvalId: string;
      };
    }
  | {
      /** 请求 id，用于匹配响应。 */
      id: string;
      /** 拒绝 shell approval。 */
      method: "internal.shell.deny";
      /** approval 参数。 */
      params: {
        /** approval id。 */
        approvalId: string;
      };
    };

/**
 * RPC 成功响应帧。
 */
export interface RpcSuccessFrame {
  /** 请求 id。 */
  id: string;
  /** 成功标记。 */
  success: true;
  /** 响应数据。 */
  data?: unknown;
}

/**
 * RPC 失败响应帧。
 */
export interface RpcErrorFrame {
  /** 请求 id。 */
  id: string;
  /** 失败标记。 */
  success: false;
  /** 错误信息。 */
  error: string;
}

/**
 * RPC 普通响应帧。
 */
export type RpcResponseFrame = RpcSuccessFrame | RpcErrorFrame;

/**
 * RPC 订阅 ready 帧。
 */
export interface RpcReadyFrame {
  /** 帧类型。 */
  type: "ready";
  /** 当前订阅 id。 */
  subscriptionId: string;
}

/**
 * RPC 事件帧。
 */
export interface RpcEventFrame {
  /** 帧类型。 */
  type: "event";
  /** 当前订阅 id。 */
  subscriptionId: string;
  /** session 事件。 */
  event: AgentSessionEvent;
}

/**
 * RPC server 可写帧。
 */
export type RpcServerFrame = RpcSuccessFrame | RpcErrorFrame | RpcEventFrame;

/**
 * RPC client 可读帧。
 */
export type RpcClientFrame = RpcResponseFrame | RpcReadyFrame | RpcEventFrame;

/**
 * RPC endpoint。
 */
export interface RpcClientEndpoint {
  /** RPC host。 */
  host: string;
  /** RPC port。 */
  port: number;
}

/**
 * RPC Session 订阅句柄。
 */
export interface RpcSessionSubscription {
  /** 当前订阅 id。 */
  subscription_id: string;
  /** 取消订阅。 */
  unsubscribe(): Promise<void>;
}

/**
 * RPC system prompt 分段条目。
 */
export interface RpcSystemPromptSectionItem {
  /** 消息序号。 */
  index: number;
  /** system message 文本内容。 */
  content: string;
}

/**
 * RPC system prompt 分段。
 */
export interface RpcSystemPromptSection {
  /** 分段稳定 key。 */
  key: string;
  /** 分段展示标题。 */
  title: string;
  /** 分段内消息条目。 */
  items: RpcSystemPromptSectionItem[];
}

/**
 * RPC system prompt 响应。
 */
export interface RpcSystemPromptPayload {
  /** 请求是否成功。 */
  success?: boolean;
  /** 当前 session id。 */
  sessionId: string;
  /** system message 总数。 */
  totalMessages: number;
  /** system message 总字符数。 */
  totalChars: number;
  /** system message 分段。 */
  sections: RpcSystemPromptSection[];
}

/**
 * RPC session system snapshot 响应。
 */
export interface RpcSessionSystemResult {
  /** system snapshot。 */
  system: AgentSessionSystemSnapshot;
}

/**
 * RPC SDK session handlers。
 *
 * 关键点（中文）
 * - 只处理 `sdk.sessions.*` 方法。
 * - 这些方法是 RemoteAgent RPC transport 的稳定 SDK 面。
 */

import type { RpcRequest } from "@/types/RpcProtocol.js";
import type {
  RpcSocketSubscription,
  RpcWriteEvent,
  RpcWriteSuccess,
  RpcRequestHandlerOptions,
} from "@/rpc/server/ServerTypes.js";

/**
 * 处理 SDK session RPC 请求。
 */
export async function handleSdkSessionRpcRequest(params: {
  /** 当前 RPC 请求。 */
  request: RpcRequest;
  /** handler 依赖。 */
  options: RpcRequestHandlerOptions;
  /** 当前 socket 的订阅表。 */
  subscriptions: Map<string, RpcSocketSubscription>;
  /** 成功帧写入函数。 */
  write_success: RpcWriteSuccess;
  /** 事件帧写入函数。 */
  write_event: RpcWriteEvent;
}): Promise<boolean> {
  const { request, options, subscriptions, write_success, write_event } = params;

  switch (request.method) {
    case "sdk.sessions.list": {
      const page = await options.sessionCollection.list_sessions(request.params);
      write_success(request.id, { page });
      return true;
    }
    case "sdk.sessions.create": {
      const session = await options.sessionCollection.create_session(request.params);
      write_success(request.id, { session: await session.getInfo() });
      return true;
    }
    case "sdk.sessions.get": {
      const session = await options.sessionCollection.get_session(request.params.sessionId);
      write_success(request.id, { session: await session.getInfo() });
      return true;
    }
    case "sdk.sessions.prompt": {
      const session = await options.sessionCollection.get_session(request.params.sessionId);
      const turn = await session.prompt(request.params.input);
      write_success(request.id, { turn: { id: turn.id } });
      return true;
    }
    case "sdk.sessions.history": {
      const session = await options.sessionCollection.get_session(request.params.sessionId);
      const history = await session.history(request.params.input);
      write_success(request.id, { history });
      return true;
    }
    case "sdk.sessions.system": {
      const session = await options.sessionCollection.get_session(request.params.sessionId);
      write_success(request.id, { system: await session.system() });
      return true;
    }
    case "sdk.sessions.fork": {
      const session = await options.sessionCollection.get_session(request.params.sessionId);
      const forked = await session.fork(request.params.messageId);
      write_success(request.id, { session: await forked.getInfo() });
      return true;
    }
    case "sdk.sessions.subscribe": {
      const session = await options.sessionCollection.get_session(request.params.sessionId);
      const subscription_id = [
        request.params.sessionId,
        Date.now(),
        Math.random().toString(36).slice(2, 10),
      ].join(":");
      const unsubscribe = session.subscribe((event) => {
        write_event({
          type: "event",
          subscriptionId: subscription_id,
          event,
        });
      });
      subscriptions.set(subscription_id, {
        sessionId: request.params.sessionId,
        unsubscribe,
      });
      write_success(request.id, { subscriptionId: subscription_id });
      return true;
    }
    case "sdk.sessions.unsubscribe": {
      const subscription = subscriptions.get(request.params.subscriptionId);
      if (subscription) {
        subscription.unsubscribe();
        subscriptions.delete(request.params.subscriptionId);
      }
      write_success(request.id, { unsubscribed: true });
      return true;
    }
    case "sdk.sessions.archive": {
      const result = await options.sessionCollection.archive_session({
        id: request.params.sessionId,
      });
      write_success(request.id, { result });
      return true;
    }
    case "sdk.sessions.archived.list": {
      const page = await options.sessionCollection.archive_sessions(request.params);
      write_success(request.id, { page });
      return true;
    }
    case "sdk.sessions.archived.clean": {
      const result = await options.sessionCollection.clean_archive();
      write_success(request.id, { removedSessionIds: result.removedSessionIds });
      return true;
    }
    default:
      return false;
  }
}

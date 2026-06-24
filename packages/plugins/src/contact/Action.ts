/**
 * contact action 注册表。
 *
 * 关键点（中文）
 * - 这里只负责 CLI action 与内部远端 command action 映射，不承载 contact 业务实现。
 * - 业务动作通过 handlers 注入，保持 `ContactPlugin` 类本身更薄。
 */

import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type { JsonObject, JsonValue } from "@downcity/agent/internal/types/common/Json.js";
import type { PluginActions } from "@downcity/agent/internal/plugin/types/Plugin.js";
import { createAction } from "@downcity/agent/internal/plugin/core/PluginActionFactory.js";
import { z } from "zod";
import type {
  ContactApproveCommandPayload,
  ContactChatCommandPayload,
  ContactCheckCommandPayload,
  ContactLinkCommandPayload,
  ContactReceiveCommandPayload,
  ContactShareCommandPayload,
} from "@/contact/types/ContactCommand.js";
import type {
  ContactApproveLinkRequest,
  ContactApproveLinkResponse,
} from "@/contact/types/ContactLink.js";
import type {
  ContactConfirmRequest,
  ContactConfirmResponse,
} from "@/contact/types/ContactApproval.js";
import type { ContactPingResponse } from "@/contact/types/ContactCheck.js";
import { listContacts } from "./runtime/ContactStore.js";
import { receiveContactChatMessage } from "./runtime/ChatRuntime.js";
import { listContactInboxShares } from "./runtime/InboxStore.js";
import { receiveShare } from "./runtime/ShareBundle.js";
import {
  readContactObject,
  readContactString,
} from "./runtime/ContactPayload.js";

/**
 * ContactPlugin 注入给 action 注册表的业务动作。
 */
export type ContactActionHandlers = {
  /**
   * 生成一次性联系码。
   */
  link: (context: AgentContext, payload: ContactLinkCommandPayload) => Promise<JsonValue>;
  /**
   * 使用联系码建立 contact。
   */
  approve: (
    context: AgentContext,
    payload: ContactApproveCommandPayload,
  ) => Promise<JsonValue>;
  /**
   * 检查 contact 或 endpoint 可用性。
   */
  check: (context: AgentContext, payload: ContactCheckCommandPayload) => Promise<JsonValue>;
  /**
   * 与 contact 对话或读取对话历史。
   */
  chat: (context: AgentContext, payload: ContactChatCommandPayload) => Promise<JsonValue>;
  /**
   * 向 contact 分享内容。
   */
  share: (context: AgentContext, payload: ContactShareCommandPayload) => Promise<JsonValue>;
  /**
   * 处理远端 ping 请求。
   */
  remotePing: (
    context: AgentContext,
    payload: { token?: string },
  ) => Promise<ContactPingResponse>;
  /**
   * 处理远端 approve 请求。
   */
  remoteApprove: (
    context: AgentContext,
    request: ContactApproveLinkRequest,
  ) => Promise<ContactApproveLinkResponse>;
  /**
   * 处理远端 confirm 请求。
   */
  remoteConfirm: (
    context: AgentContext,
    request: ContactConfirmRequest,
  ) => Promise<ContactConfirmResponse>;
  /**
   * 处理远端 share 请求。
   */
  remoteShare: (context: AgentContext, rawPayload: JsonValue) => Promise<JsonValue>;
};

/**
 * 创建 contact plugin action 表。
 */
export function createContactActions(handlers: ContactActionHandlers): PluginActions {
  return {
    link: createAction({
      description: "生成一次性 contact link code，供其他 agent approve。",
      input_schema: {
        zod: z.object({ ttlSeconds: z.number().optional() }),
        json_schema: {
          type: "object",
          properties: {
            ttlSeconds: { type: "number", description: "link 过期秒数，默认 600" },
          },
        },
      },
      examples: [{ title: "生成默认 link", payload: {} }],
      command: {
        description: "生成一次性 contact link code，交给另一个 agent approve",
        configure(command) {
          command.option("--ttl-seconds <seconds>", "link 过期秒数，默认 600", Number);
        },
        mapInput({ opts }) {
          const payload: JsonObject = {};
          if (typeof opts.ttlSeconds === "number") payload.ttlSeconds = opts.ttlSeconds;
          return payload;
        },
      },
      execute: async (params) => ({
        success: true,
        data: await handlers.link(
          params.context,
          params.input as ContactLinkCommandPayload,
        ),
      }),
    }),
    approve: createAction({
      description: "使用 contact link code 建立点对点联系。",
      input_schema: {
        zod: z.object({
          code: z.string(),
          name: z.string().optional(),
        }),
        json_schema: {
          type: "object",
          required: ["code"],
          properties: {
            code: { type: "string", description: "link code" },
            name: { type: "string", description: "本地 contact 别名" },
          },
        },
      },
      examples: [
        { title: "approve link", payload: { code: "abc123", name: "alice" } },
      ],
      command: {
        description: "使用 contact link code 建立点对点联系",
        configure(command) {
          command
            .argument("<code>")
            .option("--name <alias>", "本地 contact 别名");
        },
        mapInput({ args, opts }) {
          const code = String(args[0] || "").trim();
          if (!code) throw new Error("Missing link code");
          const payload: JsonObject = { code };
          if (typeof opts.name === "string") payload.name = opts.name;
          return payload;
        },
      },
      execute: async (params) => ({
        success: true,
        data: await handlers.approve(
          params.context,
          params.input as unknown as ContactApproveCommandPayload,
        ),
      }),
    }),
    list: createAction({
      description: "列出已建立的 contact。",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {} },
      },
      examples: [{ title: "列出 contact", payload: {} }],
      command: {
        description: "列出已建立的 contact",
        mapInput() {
          return {};
        },
      },
      execute: async (params) => ({
        success: true,
        data: {
          contacts: await listContacts(params.context.rootPath),
        } as unknown as JsonValue,
      }),
    }),
    check: createAction({
      description: "检查 contact 或 endpoint 当前是否在线可用。",
      input_schema: {
        zod: z.object({
          target: z.string().optional(),
          endpoint: z.string().optional(),
        }),
        json_schema: {
          type: "object",
          properties: {
            target: { type: "string", description: "已保存的 contact 名" },
            endpoint: { type: "string", description: "直接检查的 endpoint" },
          },
        },
      },
      examples: [
        { title: "检查 contact", payload: { target: "alice" } },
        { title: "检查 endpoint", payload: { endpoint: "https://example.com" } },
      ],
      command: {
        description: "检查 contact 或 endpoint 当前是否在线可用",
        configure(command) {
          command
            .argument("[target]")
            .option("--to <endpoint>", "直接检查未保存的 endpoint");
        },
        mapInput({ args, opts }) {
          const payload: JsonObject = {};
          const target = String(args[0] || "").trim();
          if (target) payload.target = target;
          if (typeof opts.to === "string") payload.endpoint = opts.to;
          return payload;
        },
      },
      execute: async (params) => ({
        success: true,
        data: await handlers.check(
          params.context,
          params.input as ContactCheckCommandPayload,
        ),
      }),
    }),
    chat: createAction({
      description: "和某个 contact 的长期对话线聊天，或读取对话历史。",
      input_schema: {
        zod: z.object({
          to: z.string(),
          message: z.string().optional(),
        }),
        json_schema: {
          type: "object",
          required: ["to"],
          properties: {
            to: { type: "string", description: "目标 contact" },
            message: { type: "string", description: "要发送的消息" },
          },
        },
      },
      examples: [
        { title: "发送消息", payload: { to: "alice", message: "hello" } },
        { title: "读取历史", payload: { to: "alice" } },
      ],
      command: {
        description: "和某个 contact 的长期对话线聊天",
        configure(command) {
          command.requiredOption("--to <contact>", "目标 contact").argument("[message...]");
        },
        mapInput({ args, opts }) {
          const payload: JsonObject = {
            to: String(opts.to || "").trim(),
          };
          const message = args.join(" ").trim();
          if (message) payload.message = message;
          return payload;
        },
      },
      execute: async (params) => ({
        success: true,
        data: await handlers.chat(
          params.context,
          params.input as unknown as ContactChatCommandPayload,
        ),
      }),
    }),
    share: createAction({
      description: "向 contact 分享文本、链接、文件或目录。",
      input_schema: {
        zod: z.object({
          to: z.string(),
          text: z.string().optional(),
          links: z.array(z.string()).optional(),
          paths: z.array(z.string()).optional(),
        }),
        json_schema: {
          type: "object",
          required: ["to"],
          properties: {
            to: { type: "string", description: "目标 contact" },
            text: { type: "string", description: "分享文本" },
            links: { type: "array", items: { type: "string" }, description: "分享链接" },
            paths: { type: "array", items: { type: "string" }, description: "分享文件/目录路径" },
          },
        },
      },
      examples: [
        {
          title: "分享一段文本",
          payload: { to: "alice", text: "看看这个" },
        },
      ],
      command: {
        description: "向 contact 分享文本、链接、文件或目录",
        configure(command) {
          command
            .requiredOption("--to <contact>", "目标 contact")
            .option("--text <text>", "分享文本")
            .option("--link <url...>", "分享链接")
            .argument("[paths...]");
        },
        mapInput({ args, opts }) {
          const links = Array.isArray(opts.link)
            ? opts.link.map((item) => String(item || "").trim()).filter(Boolean)
            : typeof opts.link === "string"
              ? [opts.link]
              : [];
          return {
            to: String(opts.to || "").trim(),
            ...(typeof opts.text === "string" ? { text: opts.text } : {}),
            ...(links.length > 0 ? { links } : {}),
            paths: args.map((item) => String(item || "").trim()).filter(Boolean),
          };
        },
      },
      execute: async (params) => ({
        success: true,
        data: await handlers.share(
          params.context,
          params.input as unknown as ContactShareCommandPayload,
        ),
      }),
    }),
    inbox: createAction({
      description: "查看 contact inbox。",
      input_schema: {
        zod: z.object({}).passthrough(),
        json_schema: { type: "object", properties: {} },
      },
      examples: [{ title: "查看 inbox", payload: {} }],
      command: {
        description: "查看 contact inbox",
        mapInput() {
          return {};
        },
      },
      execute: async (params) => ({
        success: true,
        data: {
          shares: await listContactInboxShares(params.context.rootPath),
        } as unknown as JsonValue,
      }),
    }),
    receive: createAction({
      description: "接收 inbox 中的 share。",
      input_schema: {
        zod: z.object({ shareId: z.string() }),
        json_schema: {
          type: "object",
          required: ["shareId"],
          properties: {
            shareId: { type: "string", description: "inbox 中的 shareId" },
          },
        },
      },
      examples: [{ title: "接收 share", payload: { shareId: "share_1" } }],
      command: {
        description: "接收 inbox 中的 share",
        configure(command) {
          command.argument("<shareId>");
        },
        mapInput({ args }) {
          const shareId = String(args[0] || "").trim();
          if (!shareId) throw new Error("Missing shareId");
          return { shareId };
        },
      },
      execute: async (params) => ({
        success: true,
        data: (await receiveShare({
          projectRoot: params.context.rootPath,
          shareId: (params.input as unknown as ContactReceiveCommandPayload).shareId,
        })) as unknown as JsonValue,
      }),
    }),
    remoteping: createAction({
      description: "处理远端 ping 请求（内部 endpoint）。",
      execute: async (params) => ({
        success: true,
        data: (await handlers.remotePing(
          params.context,
          params.input as unknown as { token?: string },
        )) as unknown as JsonValue,
      }),
    }),
    remoteapprove: createAction({
      description: "处理远端 approve 请求（内部 endpoint）。",
      execute: async (params) => ({
        success: true,
        data: (await handlers.remoteApprove(
          params.context,
          readContactObject(params.input) as unknown as ContactApproveLinkRequest,
        )) as unknown as JsonValue,
      }),
    }),
    remoteconfirm: createAction({
      description: "处理远端 confirm 请求（内部 endpoint）。",
      execute: async (params) => ({
        success: true,
        data: (await handlers.remoteConfirm(
          params.context,
          readContactObject(params.input) as unknown as ContactConfirmRequest,
        )) as unknown as JsonValue,
      }),
    }),
    remotechat: createAction({
      description: "处理远端 chat 请求（内部 endpoint）。",
      execute: async (params) => {
        const payload = readContactObject(params.input);
        const body = readContactObject(payload.body);
        return {
          success: true,
          data: (await receiveContactChatMessage({
            context: params.context,
            token: readContactString(payload, "token"),
            message: readContactString(body, "message"),
          })) as unknown as JsonValue,
        };
      },
    }),
    remoteshare: createAction({
      description: "处理远端 share 请求（内部 endpoint）。",
      execute: async (params) => ({
        success: true,
        data: (await handlers.remoteShare(params.context, params.input)) as unknown as JsonValue,
      }),
    }),
  };
}

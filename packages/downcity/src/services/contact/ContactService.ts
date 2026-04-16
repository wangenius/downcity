/**
 * ContactService：agent 点对点关系与分享服务。
 *
 * 关键点（中文）
 * - `link/approve` 建立可信 contact，支持 outbound/inbound/bidirectional 三种可达方向。
 * - 每个 contact 固定一条长期 chat history。
 * - `share` 分享文本、链接、文件和目录，并进入对方 inbox。
 */

import type { Command } from "commander";
import type { AgentRuntime } from "@/types/agent/AgentRuntime.js";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type { JsonObject, JsonValue } from "@/shared/types/Json.js";
import type { ServiceActions } from "@/shared/types/Service.js";
import { BaseService } from "@services/BaseService.js";
import type {
  ContactApproveCommandPayload,
  ContactChatCommandPayload,
  ContactCheckCommandPayload,
  ContactLinkCommandPayload,
  ContactReceiveCommandPayload,
  ContactShareCommandPayload,
} from "@/types/contact/ContactCommand.js";
import type {
  ContactApproveLinkRequest,
  ContactApproveLinkResponse,
} from "@/types/contact/ContactLink.js";
import type { ContactPingResponse } from "@/types/contact/ContactCheck.js";
import type { ContactChatResponse } from "@/types/contact/ContactChat.js";
import type { AgentContact } from "@/types/contact/Contact.js";
import type { SaveContactInboxShareInput } from "@/types/contact/ContactShare.js";
import {
  appendContactMessage,
  createStableContactId,
  findContact,
  findContactByInboundToken,
  listContacts,
  normalizeContactEndpoint,
  readContactMessages,
  saveContact,
  touchContactSeen,
} from "./runtime/ContactStore.js";
import {
  createContactLinkCode,
  isContactLinkExpired,
  parseContactLinkCode,
} from "./runtime/LinkCode.js";
import {
  markContactLinkUsed,
  readContactLinkRecord,
  saveContactLinkRecord,
} from "./runtime/LinkStore.js";
import {
  createContactId,
  createContactToken,
  hashContactToken,
} from "./runtime/Token.js";
import {
  callContactApprove,
  callContactChat,
  callContactPing,
  callContactShare,
} from "./runtime/RemoteClient.js";
import {
  listContactInboxShares,
  saveContactInboxShare,
} from "./runtime/InboxStore.js";
import {
  createShareInput,
  receiveShare,
} from "./runtime/ShareBundle.js";
import { receiveContactChatMessage } from "./runtime/ChatRuntime.js";
import { buildContactServiceSystemText } from "./runtime/SystemProvider.js";
import { resolveContactSelfEndpoint } from "./runtime/EndpointResolver.js";

function readObject(value: JsonValue): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function readString(body: JsonObject, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(body: JsonObject, key: string): number | undefined {
  const value = body[key];
  if (typeof value !== "number") return undefined;
  return Number.isFinite(value) ? value : undefined;
}

function readBoolean(body: JsonObject, key: string): boolean | undefined {
  const value = body[key];
  return typeof value === "boolean" ? value : undefined;
}

function getHeaderToken(params: { headers?: Headers; body?: JsonObject }): string {
  const fromHeader = String(params.headers?.get("x-downcity-contact-token") || "").trim();
  if (fromHeader) return fromHeader;
  return params.body ? readString(params.body, "token") : "";
}

async function resolveSelfEndpoint(
  context: AgentContext,
  endpointOverride?: string,
): Promise<string> {
  const explicit = String(endpointOverride || "").trim();
  if (explicit) return normalizeContactEndpoint(explicit);
  const start = context.config.start || {};
  return normalizeContactEndpoint(
    await resolveContactSelfEndpoint({
      host: start.host,
      port: start.port,
      env: {
        ...context.globalEnv,
        ...context.env,
        ...process.env,
      },
    }),
  );
}

function getAgentName(context: AgentContext): string {
  return String(context.config.name || "downcity-agent").trim() || "downcity-agent";
}

function requireOutboundContact(contact: AgentContact): {
  endpoint: string;
  token: string;
} {
  if (!contact.endpoint || !contact.outboundToken) {
    throw new Error(`Contact is inbound-only and cannot be called directly: ${contact.name}`);
  }
  return {
    endpoint: contact.endpoint,
    token: contact.outboundToken,
  };
}

/**
 * Contact service 类实现。
 */
export class ContactService extends BaseService {
  /**
   * service 名称。
   */
  readonly name = "contact";

  /**
   * 当前 service action 定义表。
   */
  readonly actions: ServiceActions;

  constructor(agent: AgentRuntime | null) {
    super(agent);
    this.actions = {
      link: {
        command: {
          description: "生成一次性 contact link code，交给另一个 agent approve",
          configure(command: Command) {
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
          data: (await this.link(
            params.context,
            params.payload as ContactLinkCommandPayload,
          )) as unknown as JsonValue,
        }),
      },
      approve: {
        command: {
          description: "使用 contact link code 建立点对点联系",
          configure(command: Command) {
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
          data: (await this.approve(
            params.context,
            params.payload as unknown as ContactApproveCommandPayload,
          )) as unknown as JsonValue,
        }),
      },
      list: {
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
      },
      check: {
        command: {
          description: "检查 contact 或 endpoint 当前是否在线可用",
          configure(command: Command) {
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
          data: (await this.check(
            params.context,
            params.payload as ContactCheckCommandPayload,
          )) as unknown as JsonValue,
        }),
      },
      chat: {
        command: {
          description: "和某个 contact 的长期对话线聊天",
          configure(command: Command) {
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
          data: (await this.chat(
            params.context,
            params.payload as unknown as ContactChatCommandPayload,
          )) as unknown as JsonValue,
        }),
      },
      share: {
        command: {
          description: "向 contact 分享文本、链接、文件或目录",
          configure(command: Command) {
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
          data: (await this.share(
            params.context,
            params.payload as unknown as ContactShareCommandPayload,
          )) as unknown as JsonValue,
        }),
      },
      inbox: {
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
      },
      receive: {
        command: {
          description: "接收 inbox 中的 share",
          configure(command: Command) {
            command.argument("<shareId>");
          },
          mapInput({ args, opts }) {
            const shareId = String(args[0] || "").trim();
            if (!shareId) throw new Error("Missing shareId");
            return {
              shareId,
            };
          },
        },
        execute: async (params) => ({
          success: true,
          data: (await receiveShare({
            projectRoot: params.context.rootPath,
            shareId: (params.payload as unknown as ContactReceiveCommandPayload).shareId,
          })) as unknown as JsonValue,
        }),
      },
      remoteping: {
        api: {
          method: "POST",
          path: "/api/contact/ping",
          async mapInput(ctx) {
            const body = (await ctx.req.json().catch(() => ({}))) as JsonValue;
            return {
              body,
              token: getHeaderToken({
                headers: ctx.req.raw.headers,
                body: readObject(body),
              }),
            } as unknown as JsonValue;
          },
        },
        execute: async (params) => ({
          success: true,
          data: (await this.remotePing(
            params.context,
            params.payload as unknown as { token?: string },
          )) as unknown as JsonValue,
        }),
      },
      remoteapprove: {
        api: {
          method: "POST",
          path: "/api/contact/approve",
          async mapInput(ctx) {
            return (await ctx.req.json()) as JsonValue;
          },
        },
        execute: async (params) => ({
          success: true,
          data: (await this.remoteApprove(
            params.context,
            readObject(params.payload) as unknown as ContactApproveLinkRequest,
          )) as unknown as JsonValue,
        }),
      },
      remotechat: {
        api: {
          method: "POST",
          path: "/api/contact/chat",
          async mapInput(ctx) {
            const body = (await ctx.req.json()) as JsonValue;
            return {
              body,
              token: getHeaderToken({
                headers: ctx.req.raw.headers,
                body: readObject(body),
              }),
            } as unknown as JsonValue;
          },
        },
        execute: async (params) => {
          const payload = readObject(params.payload);
          const body = readObject(payload.body);
          return {
            success: true,
            data: (await receiveContactChatMessage({
              context: params.context,
              token: readString(payload, "token"),
              message: readString(body, "message"),
            })) as unknown as JsonValue,
          };
        },
      },
      remoteshare: {
        api: {
          method: "POST",
          path: "/api/contact/share",
          async mapInput(ctx) {
            const body = (await ctx.req.json()) as JsonValue;
            return {
              body,
              token: getHeaderToken({
                headers: ctx.req.raw.headers,
                body: readObject(body),
              }),
            } as unknown as JsonValue;
          },
        },
        execute: async (params) => ({
          success: true,
          data: (await this.remoteShare(params.context, params.payload)) as unknown as JsonValue,
        }),
      },
    };

    this.lifecycle = {
      start: () => undefined,
      stop: () => undefined,
    };
  }

  /**
   * contact system 文本。
   */
  system(): string {
    return buildContactServiceSystemText();
  }

  private async link(context: AgentContext, payload: ContactLinkCommandPayload) {
    const now = Date.now();
    const ttlSeconds = Math.max(60, Number(payload.ttlSeconds || 600));
    const linkId = createContactId("link");
    const secret = createContactToken();
    const endpoint = await resolveSelfEndpoint(context, payload.endpoint);
    const agentName = getAgentName(context);

    await saveContactLinkRecord(context.rootPath, {
      id: linkId,
      agentName,
      endpoint,
      secretHash: hashContactToken(secret),
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
      usedAt: null,
    });

    const code = createContactLinkCode({
      version: 1,
      linkId,
      agentName,
      endpoint,
      secret,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
    });
    return {
      code,
      linkId,
      agentName,
      endpoint,
      expiresAt: now + ttlSeconds * 1000,
    };
  }

  private async approve(context: AgentContext, payload: ContactApproveCommandPayload) {
    const parsed = parseContactLinkCode(payload.code);
    if (isContactLinkExpired(parsed)) throw new Error("Contact link expired");

    const requesterEndpoint = payload.endpoint
      ? await resolveSelfEndpoint(context, payload.endpoint)
      : undefined;
    const tokenForRequester = requesterEndpoint ? createContactToken() : undefined;
    const response = await callContactApprove<ContactApproveLinkResponse>({
      endpoint: parsed.endpoint,
      body: {
        linkId: parsed.linkId,
        secret: parsed.secret,
        agentName: getAgentName(context),
        ...(requesterEndpoint ? { endpoint: requesterEndpoint } : {}),
        ...(tokenForRequester ? { tokenForRequester } : {}),
      } as unknown as JsonValue,
    });
    if (!response.success) throw new Error(response.error || "Contact approve failed");

    const name = String(payload.name || response.agentName || parsed.agentName).trim();
    const contact = await saveContact(context.rootPath, {
      id: createStableContactId(name),
      name,
      endpoint: response.endpoint || parsed.endpoint,
      reachability: requesterEndpoint ? "bidirectional" : "outbound",
      status: "trusted",
      outboundToken: response.tokenForOwner,
      inboundTokenHash: tokenForRequester ? hashContactToken(tokenForRequester) : null,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    return { contact };
  }

  private async check(context: AgentContext, payload: ContactCheckCommandPayload) {
    const startedAt = Date.now();
    const endpointInput = String(payload.endpoint || "").trim();
    const contact = endpointInput
      ? null
      : await findContact(context.rootPath, String(payload.target || "").trim());
    const endpoint = endpointInput || contact?.endpoint || "";
    if (!endpoint) throw new Error("contact target or --to endpoint is required");
    if (contact && !contact.outboundToken) {
      throw new Error(`Contact is inbound-only and cannot be checked directly: ${contact.name}`);
    }

    try {
      const pong = await callContactPing<ContactPingResponse>({
        endpoint,
        token: contact?.outboundToken || undefined,
      });
      if (contact && pong.success) {
        await touchContactSeen(context.rootPath, contact.id);
      }
      return {
        target: contact?.name || endpoint,
        endpoint: normalizeContactEndpoint(endpoint),
        reachable: Boolean(pong.success),
        authenticated: pong.authenticated,
        latencyMs: Date.now() - startedAt,
        agentName: pong.agentName,
        ...(pong.error ? { error: pong.error } : {}),
      };
    } catch (error) {
      return {
        target: contact?.name || endpoint,
        endpoint: normalizeContactEndpoint(endpoint),
        reachable: false,
        latencyMs: Date.now() - startedAt,
        error: String(error),
      };
    }
  }

  private async chat(context: AgentContext, payload: ContactChatCommandPayload) {
    const contact = await findContact(context.rootPath, payload.to);
    if (!contact) throw new Error(`Contact not found: ${payload.to}`);
    const message = String(payload.message || "").trim();
    if (!message) {
      return {
        contact,
        messages: await readContactMessages(context.rootPath, contact.id),
      };
    }

    await appendContactMessage(context.rootPath, contact.id, {
      role: "local",
      text: message,
      createdAt: Date.now(),
    });
    const outbound = requireOutboundContact(contact);
    const response = await callContactChat<ContactChatResponse>({
      endpoint: outbound.endpoint,
      token: outbound.token,
      body: {
        senderContactId: contact.id,
        message,
        createdAt: Date.now(),
      } as unknown as JsonValue,
    });
    if (!response.success) throw new Error(response.error || "Contact chat failed");
    await appendContactMessage(context.rootPath, contact.id, {
      role: "remote",
      text: response.reply,
      createdAt: Date.now(),
    });
    return response;
  }

  private async share(context: AgentContext, payload: ContactShareCommandPayload) {
    const contact = await findContact(context.rootPath, payload.to);
    if (!contact) throw new Error(`Contact not found: ${payload.to}`);
    const outbound = requireOutboundContact(contact);
    const share = await createShareInput({
      context,
      fromContactId: contact.id,
      fromAgentName: getAgentName(context),
      text: payload.text,
      links: payload.links,
      paths: payload.paths,
    });
    const response = await callContactShare<{ success: boolean; shareId?: string; error?: string }>({
      endpoint: outbound.endpoint,
      token: outbound.token,
      body: share as unknown as JsonValue,
    });
    if (!response.success) throw new Error(response.error || "Contact share failed");
    return {
      shareId: response.shareId || share.meta.id,
      to: contact.name,
      items: share.payload.items.map((item) => ({
        type: item.type,
        title: item.title,
      })),
    };
  }

  private async remotePing(
    context: AgentContext,
    payload: { token?: string },
  ): Promise<ContactPingResponse> {
    const token = String(payload.token || "").trim();
    if (!token) {
      return {
        success: true,
        agentName: getAgentName(context),
        service: "contact",
      };
    }
    const contact = await findContactByInboundToken(context.rootPath, token);
    return {
      success: true,
      agentName: getAgentName(context),
      service: "contact",
      authenticated: Boolean(contact && contact.status === "trusted"),
    };
  }

  private async remoteApprove(
    context: AgentContext,
    request: ContactApproveLinkRequest,
  ): Promise<ContactApproveLinkResponse> {
    const link = await readContactLinkRecord(context.rootPath, request.linkId);
    if (!link) {
      return {
        success: false,
        agentName: getAgentName(context),
        endpoint: await resolveSelfEndpoint(context),
        tokenForOwner: "",
        error: "Contact link not found",
      };
    }
    if (link.usedAt) {
      return {
        success: false,
        agentName: getAgentName(context),
        endpoint: link.endpoint,
        tokenForOwner: "",
        error: "Contact link already used",
      };
    }
    if (link.expiresAt <= Date.now()) {
      return {
        success: false,
        agentName: getAgentName(context),
        endpoint: link.endpoint,
        tokenForOwner: "",
        error: "Contact link expired",
      };
    }
    if (hashContactToken(request.secret) !== link.secretHash) {
      return {
        success: false,
        agentName: getAgentName(context),
        endpoint: link.endpoint,
        tokenForOwner: "",
        error: "Invalid contact link secret",
      };
    }

    const tokenForOwner = createContactToken();
    const requesterEndpoint = request.endpoint
      ? normalizeContactEndpoint(request.endpoint)
      : null;
    await saveContact(context.rootPath, {
      id: createStableContactId(request.agentName),
      name: request.agentName,
      endpoint: requesterEndpoint,
      reachability: requesterEndpoint ? "bidirectional" : "inbound",
      status: "trusted",
      outboundToken: requesterEndpoint ? request.tokenForRequester || null : null,
      inboundTokenHash: hashContactToken(tokenForOwner),
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    await markContactLinkUsed(context.rootPath, request.linkId);

    return {
      success: true,
      agentName: getAgentName(context),
      endpoint: link.endpoint,
      tokenForOwner,
    };
  }

  private async remoteShare(context: AgentContext, rawPayload: JsonValue) {
    const payload = readObject(rawPayload);
    const token = readString(payload, "token");
    const body = readObject(payload.body);
    const contact = await findContactByInboundToken(context.rootPath, token);
    if (!contact || contact.status !== "trusted") {
      throw new Error("Invalid contact token");
    }
    const share = body as unknown as SaveContactInboxShareInput;
    const meta = {
      ...share.meta,
      fromContactId: contact.id,
      fromAgentName: contact.name,
      receivedAt: Date.now(),
      status: "pending" as const,
    };
    await saveContactInboxShare(context.rootPath, {
      meta,
      payload: share.payload,
      files: Array.isArray(share.files) ? share.files : [],
    });
    return {
      success: true,
      shareId: meta.id,
    };
  }
}

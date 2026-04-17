/**
 * contact approve 回连能力推导。
 *
 * 关键点（中文）
 * - 是否双向不能由接收方看到 endpoint 后猜测，必须由 approve 方基于双方网络关系声明。
 * - 公网 endpoint 可以声明可回连；同机 loopback 或同一私网网段也可以声明可回连。
 * - local/private 到 public server 默认不能回连，避免 server 端误显示 bidirectional。
 */

import type { ContactApproveCallbackDecision } from "@/types/contact/ContactApproval.js";
import { classifyContactEndpoint } from "./EndpointNotice.js";

function readHostname(endpoint: string): string {
  const value = String(endpoint || "").trim();
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return "";
  }
}

function privateIpv4NetworkKey(endpoint: string): string | null {
  const hostname = readHostname(endpoint);
  const parts = hostname.split(".").map((item) => Number.parseInt(item, 10));
  if (parts.length !== 4 || parts.some((item) => Number.isNaN(item))) return null;
  return parts.slice(0, 3).join(".");
}

/**
 * 推导 approve 方是否可以被发起方回连。
 */
export function buildContactApproveCallbackDecision(params: {
  /**
   * link code 中的目标 endpoint。
   */
  targetEndpoint: string;
  /**
   * approve 方自己的 endpoint。
   */
  requesterEndpoint?: string;
}): ContactApproveCallbackDecision {
  const endpoint = String(params.requesterEndpoint || "").trim();
  const targetReachability = classifyContactEndpoint(params.targetEndpoint);
  const requesterReachability = endpoint
    ? classifyContactEndpoint(endpoint)
    : "unknown";
  if (!endpoint) {
    return {
      callbackOffered: false,
      reason: "missing-requester-endpoint",
      requesterReachability,
      targetReachability,
    };
  }
  if (requesterReachability === "public") {
    return {
      callbackOffered: true,
      reason: "requester-public",
      endpoint,
      requesterReachability,
      targetReachability,
    };
  }
  if (
    requesterReachability === "loopback" &&
    targetReachability === "loopback"
  ) {
    return {
      callbackOffered: true,
      reason: "same-loopback-host",
      endpoint,
      requesterReachability,
      targetReachability,
    };
  }
  if (
    requesterReachability === "private" &&
    targetReachability === "private" &&
    privateIpv4NetworkKey(endpoint) === privateIpv4NetworkKey(params.targetEndpoint)
  ) {
    return {
      callbackOffered: true,
      reason: "same-private-network",
      endpoint,
      requesterReachability,
      targetReachability,
    };
  }
  return {
    callbackOffered: false,
    reason: "requester-not-routable-from-target",
    endpoint,
    requesterReachability,
    targetReachability,
  };
}

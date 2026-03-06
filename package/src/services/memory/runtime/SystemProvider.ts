/**
 * Memory system 文本构建器。
 *
 * 关键点（中文）
 * - 仅负责把 Primary.md 内容转为 system prompt 片段。
 * - 不做提取/压缩逻辑（那部分在 memory service）。
 */

import fs from "fs-extra";
import type { ServiceRuntime } from "@/main/service/ServiceRuntime.js";
import { requestContext } from "@main/context/RequestContext.js";
import {
  getShipProfileOtherPath,
  getShipProfilePrimaryPath,
  getShipContextMemoryPrimaryPath,
} from "@/main/server/env/Paths.js";

async function readOptionalMarkdown(filePath: string): Promise<string> {
  try {
    if (!(await fs.pathExists(filePath))) return "";
    return String(await fs.readFile(filePath, "utf-8")).trim();
  } catch {
    return "";
  }
}

function getCurrentContextId(): string {
  const request = requestContext.getStore();
  return String(request?.contextId || "").trim();
}

/**
 * 构建 memory system 文本。
 *
 * 关键点（中文）
 * - memory 的“加载/组装”位于 services，core 只消费最终 system 文本。
 * - 若 Primary.md 缺失或为空，则忽略该段。
 * - 读取失败走容错，不阻断主流程。
 */
export async function buildMemorySystemText(
  runtime: ServiceRuntime,
): Promise<string> {
  const sections: string[] = [];

  const profilePrimary = await readOptionalMarkdown(
    getShipProfilePrimaryPath(runtime.rootPath),
  );
  if (profilePrimary) {
    sections.push(["# Profile / Primary", profilePrimary].join("\n\n"));
  }

  const profileOther = await readOptionalMarkdown(
    getShipProfileOtherPath(runtime.rootPath),
  );
  if (profileOther) {
    sections.push(["# Profile / Other", profileOther].join("\n\n"));
  }

  const contextId = getCurrentContextId();
  if (contextId) {
    const contextMemoryPrimary = await readOptionalMarkdown(
      getShipContextMemoryPrimaryPath(runtime.rootPath, contextId),
    );
    if (contextMemoryPrimary) {
      sections.push(
        ["# Context Memory / Primary", contextMemoryPrimary].join("\n\n"),
      );
    }
  }

  return sections.join("\n\n").trim();
}

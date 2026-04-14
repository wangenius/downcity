/**
 * contact skill share 打包与接收。
 *
 * 关键点（中文）
 * - send 只负责把本地已发现 skill 打成目录化 share。
 * - receive 才真正写入 `.agents/skills/<skill_id>`，并默认拒绝覆盖。
 */

import crypto from "node:crypto";
import fs from "fs-extra";
import path from "node:path";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type {
  ContactInboxShareFileInput,
  ContactInboxShareMeta,
  ContactReceiveShareRequest,
  ContactSkillBundleItem,
  ContactSkillBundlePayload,
  SaveContactInboxShareInput,
} from "@/types/contact/ContactShare.js";
import { discoverClaudeSkillsSync } from "@/plugins/skill/runtime/Discovery.js";
import { createContactId } from "./Token.js";
import {
  getInboxShareFilesRoot,
  markContactInboxShareReceived,
  readContactInboxSharePayload,
} from "./InboxStore.js";

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

function assertSafeRelativePath(relativePath: string): string {
  const value = String(relativePath || "").trim();
  if (!value) throw new Error("relativePath is required");
  if (path.isAbsolute(value)) throw new Error(`Absolute path is not allowed: ${value}`);
  const normalized = path.normalize(value);
  if (normalized.startsWith("..") || normalized.includes(`${path.sep}..${path.sep}`)) {
    throw new Error(`Unsafe relative path: ${value}`);
  }
  return normalized;
}

async function collectFiles(root: string): Promise<ContactInboxShareFileInput[]> {
  const out: ContactInboxShareFileInput[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = path.relative(root, absPath);
      out.push({
        relativePath: assertSafeRelativePath(relativePath),
        content: await fs.readFile(absPath, "utf-8"),
      });
    }
  };
  await walk(root);
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * 创建 skill share。
 */
export async function createSkillShareInput(params: {
  /**
   * 当前 agent context。
   */
  context: AgentContext;
  /**
   * 发送方 contact id。
   */
  fromContactId: string;
  /**
   * 发送方 agent 名称。
   */
  fromAgentName: string;
  /**
   * skill 名称列表。
   */
  skillNames: string[];
}): Promise<SaveContactInboxShareInput> {
  const names = params.skillNames.map((item) => String(item || "").trim()).filter(Boolean);
  if (names.length === 0) throw new Error("At least one skill name is required");

  const skills = discoverClaudeSkillsSync(params.context.rootPath, params.context.config);
  const files: ContactInboxShareFileInput[] = [];
  const bundleItems: ContactSkillBundleItem[] = [];

  for (const name of names) {
    const lower = name.toLowerCase();
    const skill =
      skills.find((item) => item.id.toLowerCase() === lower) ||
      skills.find((item) => item.name.toLowerCase() === lower);
    if (!skill) throw new Error(`Skill not found: ${name}`);

    const skillFiles = await collectFiles(skill.directoryPath);
    const rootName = skill.id;
    files.push(
      ...skillFiles.map((file) => ({
        relativePath: path.join(rootName, file.relativePath),
        content: file.content,
      })),
    );

    bundleItems.push({
      id: skill.id,
      name: skill.name,
      description: skill.description || "",
      root: rootName,
      files: skillFiles.map((file) => ({
        path: file.relativePath,
        sha256: hashContent(file.content),
      })),
    });
  }

  const sizeBytes = files.reduce(
    (sum, file) => sum + Buffer.byteLength(file.content, "utf-8"),
    0,
  );
  const meta: ContactInboxShareMeta = {
    id: createContactId("share"),
    fromContactId: params.fromContactId,
    fromAgentName: params.fromAgentName,
    type: "skill",
    title: bundleItems.map((item) => item.id).join(", "),
    status: "pending",
    receivedAt: Date.now(),
    sizeBytes,
    itemCount: bundleItems.length,
  };
  const payload: ContactSkillBundlePayload = {
    kind: "skillBundle",
    skills: bundleItems,
  };

  return {
    meta,
    payload,
    files,
  };
}

/**
 * 将已进入 inbox 的 skill share 接收到 `.agents/skills`。
 */
export async function receiveSkillShare(params: {
  /**
   * 项目根目录。
   */
  projectRoot: string;
  /**
   * share id。
   */
  shareId: string;
  /**
   * 是否覆盖已存在 skill。
   */
  force?: boolean;
}): Promise<{
  /**
   * 已安装 skill id。
   */
  installed: string[];
}> {
  const payload = await readContactInboxSharePayload(params.projectRoot, params.shareId);
  if (!payload) throw new Error(`Share payload not found: ${params.shareId}`);
  if (payload.kind !== "skillBundle") throw new Error(`Unsupported share payload: ${payload.kind}`);

  const filesRoot = getInboxShareFilesRoot(params.projectRoot, params.shareId);
  const targetRoot = path.join(params.projectRoot, ".agents", "skills");
  const installed: string[] = [];

  for (const skill of payload.skills) {
    const rootName = assertSafeRelativePath(skill.root);
    const sourceDir = path.join(filesRoot, rootName);
    const targetDir = path.join(targetRoot, skill.id);
    if (!(await fs.pathExists(sourceDir))) {
      throw new Error(`Skill files missing: ${skill.id}`);
    }
    if ((await fs.pathExists(targetDir)) && params.force !== true) {
      throw new Error(`Skill already exists: ${skill.id}`);
    }
    await fs.ensureDir(targetRoot);
    await fs.copy(sourceDir, targetDir, {
      overwrite: params.force === true,
      errorOnExist: params.force !== true,
    });
    installed.push(skill.id);
  }

  await markContactInboxShareReceived(params.projectRoot, params.shareId);
  return { installed };
}

/**
 * 构造远端 receive share 请求。
 */
export function createReceiveShareRequest(
  input: SaveContactInboxShareInput,
  senderContactId: string,
): ContactReceiveShareRequest {
  return {
    ...input,
    senderContactId,
  };
}

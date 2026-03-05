/**
 * Skill command services.
 *
 * 关键点（中文）
 * - 与 runtime tool 解耦：CLI / Server 统一走这里
 * - skill pin/unpin 直接落盘到 `messages/meta.json.pinnedSkillIds`
 */

import fs from "fs-extra";
import path from "node:path";
import { discoverClaudeSkillsSync } from "./runtime/Discovery.js";
import {
  getShipContextMessagesMetaPath,
  getShipContextMessagesDirPath,
} from "@/main/runtime/Paths.js";
import { loadShipConfig } from "@/main/runtime/Config.js";
import type { ClaudeSkill } from "./types/ClaudeSkill.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type {
  SkillListResponse,
  SkillLoadRequest,
  SkillLoadResponse,
  SkillPinnedListResponse,
  SkillSummary,
  SkillUnloadRequest,
  SkillUnloadResponse,
} from "./types/SkillCommand.js";

function normalizeAllowedTools(input: JsonValue | undefined): string[] {
  if (!Array.isArray(input)) return [];
  const values: string[] = [];
  for (const item of input) {
    const value = typeof item === "string" ? item.trim() : "";
    if (!value) continue;
    values.push(value);
  }
  return Array.from(new Set(values));
}

function toSkillSummary(skill: ClaudeSkill): SkillSummary {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description || "",
    source: skill.source,
    skillMdPath: skill.skillMdPath,
    allowedTools: normalizeAllowedTools(skill.allowedTools),
  };
}

function findSkillExact(skills: ClaudeSkill[], name: string): ClaudeSkill | null {
  const q = String(name || "").trim().toLowerCase();
  if (!q) return null;

  return (
    skills.find((item) => item.id.toLowerCase() === q) ||
    skills.find((item) => item.name.toLowerCase() === q) ||
    null
  );
}

function findSkill(skills: ClaudeSkill[], name: string): ClaudeSkill | null {
  const q = String(name || "").trim().toLowerCase();
  if (!q) return null;

  return (
    skills.find((item) => item.id.toLowerCase() === q) ||
    skills.find((item) => item.name.toLowerCase() === q) ||
    skills.find((item) => item.name.toLowerCase().includes(q)) ||
    null
  );
}

/**
 * 在“已学会（本地可发现）”技能里做精确匹配。
 *
 * 关键点（中文）
 * - 仅匹配 id/name 全等（忽略大小写）
 * - 用于控制 find/add/load 的状态流转，避免误判
 */
export function findLearnedSkillExact(
  projectRoot: string,
  query: string,
): SkillSummary | null {
  const skills = getSkills(projectRoot);
  const target = findSkillExact(skills, query);
  return target ? toSkillSummary(target) : null;
}

/**
 * 在“已学会（本地可发现）”技能里做模糊搜索。
 *
 * 关键点（中文）
 * - 命中 id/name/description 的 contains
 * - 只用于提示，不作为 add/load 的强判断依据
 */
export function searchLearnedSkills(
  projectRoot: string,
  query: string,
  limit: number = 10,
): SkillSummary[] {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];

  const skills = getSkills(projectRoot);
  const matched = skills.filter((item) => {
    const id = item.id.toLowerCase();
    const name = item.name.toLowerCase();
    const description = String(item.description || "").toLowerCase();
    return id.includes(q) || name.includes(q) || description.includes(q);
  });

  return matched.slice(0, Math.max(1, limit)).map(toSkillSummary);
}

async function readPinnedSkillIds(projectRoot: string, contextId: string): Promise<string[]> {
  const metaPath = getShipContextMessagesMetaPath(projectRoot, contextId);
  try {
    const raw = (await fs.readJson(metaPath)) as JsonObject;
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.pinnedSkillIds)) {
      return [];
    }

    const ids: string[] = [];
    for (const item of raw.pinnedSkillIds) {
      const id = typeof item === "string" ? item.trim() : "";
      if (!id) continue;
      ids.push(id);
    }
    return Array.from(new Set(ids));
  } catch {
    return [];
  }
}

async function writePinnedSkillIds(params: {
  projectRoot: string;
  contextId: string;
  pinnedSkillIds: string[];
}): Promise<void> {
  const { projectRoot, contextId } = params;
  const pinnedSkillIds = Array.from(new Set(params.pinnedSkillIds.map((id) => id.trim()).filter(Boolean)));

  const messagesDir = getShipContextMessagesDirPath(projectRoot, contextId);
  const metaPath = getShipContextMessagesMetaPath(projectRoot, contextId);
  await fs.ensureDir(messagesDir);

  let prev: JsonObject = {};
  try {
    const raw = (await fs.readJson(metaPath)) as JsonObject;
    if (raw && typeof raw === "object") prev = raw;
  } catch {
    prev = {};
  }

  const next = {
    ...prev,
    v: 1,
    contextId,
    updatedAt: Date.now(),
    pinnedSkillIds,
  };
  await fs.writeJson(metaPath, next, { spaces: 2 });
}

function getSkills(projectRoot: string): ClaudeSkill[] {
  const root = path.resolve(projectRoot);
  const config = loadShipConfig(root);
  return discoverClaudeSkillsSync(root, config);
}

export function listSkills(projectRoot: string): SkillListResponse {
  const skills = getSkills(projectRoot).map(toSkillSummary);
  return {
    success: true,
    skills,
  };
}

export async function loadSkill(params: {
  projectRoot: string;
  request: SkillLoadRequest;
}): Promise<SkillLoadResponse> {
  const root = path.resolve(params.projectRoot);
  const contextId = String(params.request.contextId || "").trim();
  if (!contextId) {
    return {
      success: false,
      error: "Missing contextId",
    };
  }

  const skills = getSkills(root);
  const target = findSkill(skills, params.request.name);
  if (!target) {
    return {
      success: false,
      contextId,
      error: `Skill not found: ${params.request.name}`,
    };
  }

  const pinned = await readPinnedSkillIds(root, contextId);
  const nextPinned = Array.from(new Set([...pinned, target.id]));
  await writePinnedSkillIds({
    projectRoot: root,
    contextId,
    pinnedSkillIds: nextPinned,
  });

  return {
    success: true,
    contextId,
    skill: toSkillSummary(target),
  };
}

export async function unloadSkill(params: {
  projectRoot: string;
  request: SkillUnloadRequest;
}): Promise<SkillUnloadResponse> {
  const root = path.resolve(params.projectRoot);
  const contextId = String(params.request.contextId || "").trim();
  if (!contextId) {
    return {
      success: false,
      error: "Missing contextId",
    };
  }

  const skills = getSkills(root);
  const target = findSkill(skills, params.request.name);
  if (!target) {
    return {
      success: false,
      contextId,
      error: `Skill not found: ${params.request.name}`,
    };
  }

  const pinned = await readPinnedSkillIds(root, contextId);
  const nextPinned = pinned.filter((id) => id !== target.id);

  await writePinnedSkillIds({
    projectRoot: root,
    contextId,
    pinnedSkillIds: nextPinned,
  });

  return {
    success: true,
    contextId,
    removedSkillId: target.id,
    pinnedSkillIds: nextPinned,
  };
}

export async function listPinnedSkills(params: {
  projectRoot: string;
  contextId: string;
}): Promise<SkillPinnedListResponse> {
  const root = path.resolve(params.projectRoot);
  const contextId = String(params.contextId || "").trim();
  if (!contextId) {
    return {
      success: false,
      error: "Missing contextId",
    };
  }

  const pinnedSkillIds = await readPinnedSkillIds(root, contextId);
  return {
    success: true,
    contextId,
    pinnedSkillIds,
  };
}

/**
 * Skill command services.
 *
 * 关键点（中文）
 * - 与 runtime tool 解耦：CLI / Server 统一走这里
 * - `lookup` 采用无状态实现：直接返回 SKILL.md 内容，不做 pin 持久化
 */

import fs from "fs-extra";
import path from "node:path";
import { discoverClaudeSkillsSync } from "./runtime/Discovery.js";
import { loadShipConfig } from "@/console/env/Config.js";
import type { ClaudeSkill } from "./types/ClaudeSkill.js";
import type { JsonValue } from "@/types/Json.js";
import type {
  SkillListResponse,
  SkillLookupRequest,
  SkillLookupResponse,
  SkillSummary,
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
 * - 用于控制 find/install/lookup 的状态流转，避免误判
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
 * - 只用于提示，不作为 install/lookup 的强判断依据
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

export async function lookupSkill(params: {
  projectRoot: string;
  request: SkillLookupRequest;
}): Promise<SkillLookupResponse> {
  const root = path.resolve(params.projectRoot);
  const skills = getSkills(root);
  const target = findSkill(skills, params.request.name);
  if (!target) {
    return {
      success: false,
      error: `Skill not found: ${params.request.name}`,
    };
  }

  let content = "";
  try {
    content = String(await fs.readFile(target.skillMdPath, "utf-8")).trim();
  } catch {
    content = "";
  }
  if (!content) {
    return {
      success: false,
      error: `Skill content is empty: ${target.id}`,
    };
  }

  return {
    success: true,
    skill: toSkillSummary(target),
    content,
  };
}

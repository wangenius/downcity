/**
 * Skills service.
 *
 * 关键点（中文）
 * - 使用统一 actions 模型声明 CLI/API/执行逻辑
 * - API 默认路由为 `/service/skill/<action>`
 * - load 无状态返回 SKILL.md 内容，避免会话 pin 复杂度
 */

import type { Command } from "commander";
import { readFileSync } from "node:fs";
import { skillAddCommand, skillFindCommand } from "./Command.js";
import {
  findLearnedSkillExact,
  listSkills,
  loadSkill,
  searchLearnedSkills,
} from "./Action.js";
import type { Service } from "@main/service/ServiceManager.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import { buildSkillsSystemText } from "./runtime/SystemProvider.js";

type SkillFindPayload = {
  query: string;
};

type SkillAddPayload = {
  spec: string;
  global?: boolean;
  yes?: boolean;
  agent?: string;
};

type SkillLoadPayload = {
  name: string;
};

const SKILLS_PROMPT_FILE_URL = new URL("./PROMPT.txt", import.meta.url);

/**
 * 加载 skills service 使用说明提示词。
 *
 * 关键点（中文）
 * - 文件缺失时直接失败，避免 system 提示词静默为空。
 */
function loadSkillsServicePrompt(): string {
  try {
    return readFileSync(SKILLS_PROMPT_FILE_URL, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load skills service prompt from ${SKILLS_PROMPT_FILE_URL.pathname}: ${reason}`,
    );
  }
}

const SKILLS_SERVICE_PROMPT = loadSkillsServicePrompt();

function readJsonObject(value: JsonValue): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid JSON body");
  }
  return value as JsonObject;
}

function getStringOpt(
  opts: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = opts[key];
  return typeof value === "string" ? value.trim() : undefined;
}

function getBooleanOpt(
  opts: Record<string, JsonValue>,
  key: string,
): boolean | undefined {
  const value = opts[key];
  return typeof value === "boolean" ? value : undefined;
}

/**
 * 从 add spec 推断候选 skill 标识。
 *
 * 关键点（中文）
 * - 优先取 `repo@skill-id` 的 `skill-id`
 * - 对仅有 `owner/repo` 这种 spec 不做猜测，避免误判“已学会”
 */
function inferSkillQueryFromSpec(spec: string): string {
  const raw = String(spec || "").trim();
  if (!raw) return "";
  const normalized = raw.split(/[?#]/, 1)[0]?.trim() || raw;

  const atIndex = normalized.lastIndexOf("@");
  if (atIndex > 0 && atIndex < normalized.length - 1) {
    return normalized.slice(atIndex + 1).trim();
  }

  if (!normalized.includes("/")) return normalized;
  return "";
}

export const skillsService: Service = {
  name: "skill",
  async system(context) {
    const dynamicText = String(await buildSkillsSystemText(context)).trim();
    return [SKILLS_SERVICE_PROMPT, dynamicText].filter(Boolean).join("\n\n");
  },
  actions: {
    find: {
      command: {
        description: "查找未学会 skills（下一步通常 add）",
        configure(command: Command) {
          command.argument("<query>");
        },
        mapInput({ args }): SkillFindPayload {
          const query = String(args[0] || "").trim();
          if (!query) throw new Error("Missing query");
          return { query };
        },
      },
      async execute(params) {
        const payload = params.payload as SkillFindPayload;
        const rootPath = params.context.rootPath;
        const exactLearned = findLearnedSkillExact(rootPath, payload.query);
        if (exactLearned) {
          return {
            success: true,
            data: {
              query: payload.query,
              message: "该技能已学会，请直接执行 load。",
              workflow: ["find", "add", "load"],
              nextAction: "load",
              learnedSkill: exactLearned,
              learnedHints: [],
            },
          };
        }

        const learnedHints = searchLearnedSkills(rootPath, payload.query, 5);
        await skillFindCommand(payload.query);
        return {
          success: true,
          data: {
            query: payload.query,
            message: "已执行未学会技能检索，下一步可 add 后再 load。",
            workflow: ["find", "add", "load"],
            nextAction: "add",
            learnedSkill: null,
            learnedHints,
          },
        };
      },
    },
    add: {
      command: {
        description: "下载/学习未学会 skill（完成后可 load）",
        configure(command: Command) {
          command
            .argument("<spec>")
            .option("-g, --global", "全局安装（默认 true）", true)
            .option("-y, --yes", "跳过确认（默认 true）", true)
            .option("--agent <agent>", "指定 agent", "claude-code");
        },
        mapInput({ args, opts }): SkillAddPayload {
          const spec = String(args[0] || "").trim();
          if (!spec) throw new Error("Missing spec");
          return {
            spec,
            global: getBooleanOpt(opts, "global"),
            yes: getBooleanOpt(opts, "yes"),
            agent: getStringOpt(opts, "agent"),
          };
        },
      },
      async execute(params) {
        const payload = params.payload as SkillAddPayload;
        const rootPath = params.context.rootPath;
        const queryFromSpec = inferSkillQueryFromSpec(payload.spec);
        const beforeList = listSkills(rootPath).skills;
        const beforeIds = new Set(beforeList.map((item) => item.id));

        const learnedBefore =
          findLearnedSkillExact(rootPath, queryFromSpec) ||
          findLearnedSkillExact(rootPath, payload.spec);
        if (learnedBefore) {
          return {
            success: true,
            data: {
              spec: payload.spec,
              skipped: true,
              message: "技能已学会，无需 add。请直接执行 load。",
              workflow: ["find", "add", "load"],
              nextAction: "load",
              queryFromSpec,
              addedSkills: [],
              learnedSkill: learnedBefore,
            },
          };
        }

        await skillAddCommand(payload.spec, {
          global: payload.global,
          yes: payload.yes,
          agent: payload.agent,
        });
        const afterList = listSkills(rootPath).skills;
        const addedSkills = afterList.filter((item) => !beforeIds.has(item.id));
        const learnedAfter =
          findLearnedSkillExact(rootPath, queryFromSpec) ||
          findLearnedSkillExact(rootPath, payload.spec) ||
          (addedSkills.length === 1 ? addedSkills[0] : undefined);

        return {
          success: true,
          data: {
            spec: payload.spec,
            message: "技能学习完成。请执行 load 读取该技能的 SKILL.md 内容。",
            workflow: ["find", "add", "load"],
            nextAction: "load",
            skipped: false,
            queryFromSpec,
            addedSkills,
            learnedSkill: learnedAfter || null,
          },
        };
      },
    },
    list: {
      command: {
        description: "列出当前已学会（本地可发现）的 skills",
        mapInput() {
          return {};
        },
      },
      api: {
        method: "GET",
      },
      execute(params) {
        const result = listSkills(params.context.rootPath);
        return {
          success: true,
          data: result,
        };
      },
    },
    load: {
      command: {
        description: "读取已学会 skill 内容（SKILL.md）",
        configure(command: Command) {
          command.argument("<name>");
        },
        mapInput({ args }): SkillLoadPayload {
          const name = String(args[0] || "").trim();
          if (!name) throw new Error("Missing name");
          return { name };
        },
      },
      api: {
        method: "POST",
        async mapInput(c): Promise<SkillLoadPayload> {
          const body = readJsonObject(await c.req.json());
          const name = String(body.name || "").trim();
          if (!name) throw new Error("Missing name");
          return { name };
        },
      },
      async execute(params) {
        const payload = params.payload as SkillLoadPayload;
        const result = await loadSkill({
          projectRoot: params.context.rootPath,
          request: {
            name: payload.name,
          },
        });
        if (!result.success) {
          return {
            success: false,
            error: result.error || "skill load failed",
          };
        }
        return {
          success: true,
          data: {
            ...result,
            message: "已返回 SKILL.md 内容，请按该技能指令执行。",
          },
        };
      },
    },
  },
};

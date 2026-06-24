/**
 * Skill Plugin。
 *
 * 关键点（中文）
 * - skill 不再作为 service 存在，而是作为显式 action + system 提供者接入 plugin 体系。
 * - `find/install/list/lookup` 全部通过 plugin actions 暴露。
 * - skills overview 文本通过 `plugin.system` 注入，不再依赖 plugin.system。
 */

import { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import { createAction } from "@downcity/agent/internal/plugin/core/PluginActionFactory.js";
import { z } from "zod";
import type { Plugin } from "@downcity/agent/internal/plugin/types/Plugin.js";
import type { JsonObject, JsonValue } from "@downcity/agent/internal/types/common/Json.js";
import type { PluginActionResult } from "@downcity/agent/internal/types/plugin/PluginAction.js";
import type {
  SkillPluginFindPayload,
  SkillPluginInstallPayload,
  SkillPluginLookupPayload,
  SkillPluginOptions,
} from "@/skill/types/SkillPlugin.js";
import { SKILL_PLUGIN_ACTIONS } from "@/skill/types/SkillPlugin.js";
import { resolveSkillPluginOptions } from "@/skill/Config.js";
import { skillFindCommand, skillInstallCommand } from "@/skill/Command.js";
import {
  findLearnedSkillExact,
  listSkills,
  lookupSkill,
  searchLearnedSkills,
} from "@/skill/Action.js";
import { buildSkillsSystemText } from "@/skill/runtime/SystemProvider.js";
import { SKILL_PLUGIN_PROMPT } from "@/skill/SkillPromptAssets.js";

/**
 * 读取 JSON object。
 */
function readJsonObject(value: JsonValue): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid JSON body");
  }
  return value as JsonObject;
}

/**
 * 读取字符串选项。
 */
function getStringOpt(
  opts: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = opts[key];
  return typeof value === "string" ? value.trim() : undefined;
}

/**
 * 读取布尔选项。
 */
function getBooleanOpt(
  opts: Record<string, JsonValue>,
  key: string,
): boolean | undefined {
  const value = opts[key];
  return typeof value === "boolean" ? value : undefined;
}

/**
 * XML 属性转义。
 */
function sanitizeXmlAttr(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 从 install spec 推断候选 skill 标识。
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

function createSkillPluginDefinition(options: SkillPluginOptions): Plugin {
  return {
    name: "skill",
    title: "Skill Catalog And Loader",
    description:
      "Finds, installs, lists, and reads local skills, and injects the current skill overview into system prompts so the agent knows what capabilities are available.",
    async system(context) {
      const dynamicText = String(
        await buildSkillsSystemText({
          rootPath: context.rootPath,
          options,
        }),
      ).trim();
      return [SKILL_PLUGIN_PROMPT, dynamicText].filter(Boolean).join("\n\n");
    },
    actions: {
      [SKILL_PLUGIN_ACTIONS.find]: createAction({
        description: "查找 `list` 中不存在的未学会 skills（缺失时再 install）",
        input_schema: {
          zod: z.object({
            query: z.string(),
          }),
          json_schema: {
            type: "object",
            required: ["query"],
            properties: {
              query: { type: "string", description: "Skill 查询词" },
            },
          },
        },
        examples: [
          {
            title: "查找 skill",
            payload: { query: "web-search" },
          },
        ],
        command: {
          description: "查找 `list` 中不存在的未学会 skills（缺失时再 install）",
          configure(command) {
            command.argument("<query>");
          },
          mapInput({ args }): SkillPluginFindPayload {
            const query = String(args[0] || "").trim();
            if (!query) throw new Error("Missing query");
            return { query };
          },
        },
        async execute(params): Promise<PluginActionResult<JsonObject>> {
          const payload = params.input as SkillPluginFindPayload;
          const rootPath = params.context.rootPath;
          const exactLearned = findLearnedSkillExact(
            rootPath,
            payload.query,
            options,
          );
          if (exactLearned) {
            return {
              success: true,
              data: {
                query: payload.query,
                message: "该技能已在 list 中，无需 install。使用前请先执行 lookup。",
                workflow: ["list", "lookup"],
                nextAction: "lookup",
                learnedSkill: exactLearned,
                learnedHints: [],
              } as JsonObject,
            };
          }

          const learnedHints = searchLearnedSkills(
            rootPath,
            payload.query,
            5,
            options,
          );
          await skillFindCommand(payload.query);
          return {
            success: true,
            data: {
              query: payload.query,
              message: "已执行缺失技能检索；若目标不在 list 中，可 install 后再 lookup。",
              workflow: ["find", "install", "lookup"],
              nextAction: "install",
              learnedSkill: null,
              learnedHints,
            } as JsonObject,
          };
        },
      }),
      [SKILL_PLUGIN_ACTIONS.install]: createAction({
        description: "安装 `list` 中不存在的 skill（完成后请先 lookup）",
        input_schema: {
          zod: z.object({
            spec: z.string(),
            global: z.boolean().optional(),
            yes: z.boolean().optional(),
            agent: z.string().optional(),
          }),
          json_schema: {
            type: "object",
            required: ["spec"],
            properties: {
              spec: { type: "string", description: "Skill 安装 spec" },
              global: { type: "boolean", description: "是否全局安装" },
              yes: { type: "boolean", description: "跳过确认" },
              agent: { type: "string", description: "指定 agent" },
            },
          },
        },
        examples: [
          {
            title: "安装 skill",
            payload: { spec: "web-search", global: true, yes: true },
          },
        ],
        command: {
          description: "安装 `list` 中不存在的 skill（完成后请先 lookup）",
          configure(command) {
            command
              .argument("<spec>")
              .option("-g, --global", "全局安装（默认 true）", true)
              .option("-y, --yes", "跳过确认（默认 true）", true)
              .option("--agent <agent>", "指定 agent");
          },
          mapInput({ args, opts }): SkillPluginInstallPayload {
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
        async execute(params): Promise<PluginActionResult<JsonObject>> {
          const payload = params.input as SkillPluginInstallPayload;
          const rootPath = params.context.rootPath;
          const queryFromSpec = inferSkillQueryFromSpec(payload.spec);
          const beforeList = listSkills(rootPath, options).skills;
          const beforeIds = new Set(beforeList.map((item) => item.id));

          const learnedBefore =
            findLearnedSkillExact(rootPath, queryFromSpec, options) ||
            findLearnedSkillExact(rootPath, payload.spec, options);
          if (learnedBefore) {
            return {
              success: true,
              data: {
                spec: payload.spec,
                skipped: true,
                message: "技能已在 list 中，无需 install。使用前请先执行 lookup。",
                workflow: ["list", "lookup"],
                nextAction: "lookup",
                queryFromSpec,
                addedSkills: [],
                learnedSkill: learnedBefore,
              } as JsonObject,
            };
          }

          await skillInstallCommand(payload.spec, {
            global: payload.global,
            yes: payload.yes,
            agent: payload.agent,
          });
          const afterList = listSkills(rootPath, options).skills;
          const addedSkills = afterList.filter((item) => !beforeIds.has(item.id));
          const learnedAfter =
            findLearnedSkillExact(rootPath, queryFromSpec, options) ||
            findLearnedSkillExact(rootPath, payload.spec, options) ||
            (addedSkills.length === 1 ? addedSkills[0] : undefined);

          return {
            success: true,
            data: {
              spec: payload.spec,
              message: "技能学习完成。使用技能前请先执行 lookup 读取该技能的 SKILL.md 内容。",
              workflow: ["find", "install", "lookup"],
              nextAction: "lookup",
              skipped: false,
              queryFromSpec,
              addedSkills,
              learnedSkill: learnedAfter || null,
            } as JsonObject,
          };
        },
      }),
      [SKILL_PLUGIN_ACTIONS.list]: createAction({
        description: "列出当前已学会（本地可发现）的 skills",
        input_schema: {
          zod: z.object({}).passthrough(),
          json_schema: {
            type: "object",
            properties: {},
          },
        },
        examples: [
          {
            title: "列出 skills",
            payload: {},
          },
        ],
        command: {
          description: "列出当前已学会（本地可发现）的 skills",
          mapInput() {
            return {};
          },
        },
        api: {
          method: "GET",
        },
        execute(params): PluginActionResult<JsonObject> {
          return {
            success: true,
            data: listSkills(params.context.rootPath, options) as unknown as JsonObject,
          };
        },
      }),
      [SKILL_PLUGIN_ACTIONS.lookup]: createAction({
        description: "读取已学会 skill 内容（SKILL.md）",
        input_schema: {
          zod: z.object({
            name: z.string(),
          }),
          json_schema: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string", description: "Skill 名称" },
            },
          },
        },
        examples: [
          {
            title: "读取 skill",
            payload: { name: "web-search" },
          },
        ],
        command: {
          description: "读取已学会 skill 内容（SKILL.md）",
          configure(command) {
            command.argument("<name>");
          },
          mapInput({ args }): SkillPluginLookupPayload {
            const name = String(args[0] || "").trim();
            if (!name) throw new Error("Missing name");
            return { name };
          },
        },
        api: {
          method: "POST",
          async mapInput(c): Promise<SkillPluginLookupPayload> {
            const body = readJsonObject(await c.req.json());
            const name = String(body.name || "").trim();
            if (!name) throw new Error("Missing name");
            return { name };
          },
        },
        async execute(params): Promise<PluginActionResult<JsonObject>> {
          const payload = params.input as SkillPluginLookupPayload;
          const result = await lookupSkill({
            projectRoot: params.context.rootPath,
            request: {
              name: payload.name,
            },
            options,
          });
          if (!result.success) {
            return {
              success: false,
              error: result.error || "skill lookup failed",
            };
          }

          const skillName = String(result.skill?.name || result.skill?.id || "").trim();
          const openingTag = skillName
            ? `<skill name="${sanitizeXmlAttr(skillName)}">`
            : "<skill>";
          const skillUserMessage = [
            openingTag,
            String(result.content || "").trim(),
            "</skill>",
          ]
            .filter(Boolean)
            .join("\n")
            .trim();

          return {
            success: true,
            data: {
              success: true,
              ...(result.skill ? { skill: result.skill } : {}),
              message: "技能内容已准备，下一步将以 `<skill>...</skill>` user message 注入。",
              __ship: {
                injectUserMessages: [
                  {
                    text: skillUserMessage,
                    note: "skill_lookup",
                  },
                ],
                suppressToolOutput: true,
                toolOutputMessage:
                  "skill lookup success; content injected as <skill> user message.",
              },
            } as JsonObject,
          };
        },
      }),
    },
  };
}

/**
 * SkillPlugin：技能发现、安装、读取与 system 注入。
 */
export class SkillPlugin extends BasePlugin {
  readonly name = "skill";

  constructor(options: SkillPluginOptions = {}) {
    super();
    const resolvedOptions = resolveSkillPluginOptions(options);
    Object.assign(this, createSkillPluginDefinition(resolvedOptions));
  }
}

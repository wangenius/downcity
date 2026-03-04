/**
 * Skills service.
 *
 * 关键点（中文）
 * - 使用统一 actions 模型声明 CLI/API/执行逻辑
 * - API 默认路由为 `/service/skill/<action>`
 * - load/unload/pinned 统一基于 contextId
 */

import type { Command } from "commander";
import { readFileSync } from "node:fs";
import { skillAddCommand, skillFindCommand } from "./Command.js";
import {
  listPinnedSkills,
  listSkills,
  loadSkill,
  unloadSkill,
} from "./Action.js";
import { resolveContextId } from "@/main/runtime/ContextId.js";
import type { Service } from "@main/service/ServiceRegistry.js";
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
  contextId: string;
};

type SkillUnloadPayload = {
  name: string;
  contextId: string;
};

type SkillPinnedPayload = {
  contextId: string;
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

function resolveContextIdForCommand(input?: string): string {
  const contextId = resolveContextId({ contextId: input });
  if (!contextId) {
    throw new Error(
      "Missing contextId. Provide --context-id or ensure SMA_CTX_CONTEXT_ID is available.",
    );
  }
  return contextId;
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
        description: "查找 skills（等价于 npx skills find）",
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
        await skillFindCommand(payload.query);
        return {
          success: true,
          data: {
            query: payload.query,
          },
        };
      },
    },
    add: {
      command: {
        description: "安装 skills（等价于 npx skills add）",
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
        await skillAddCommand(payload.spec, {
          global: payload.global,
          yes: payload.yes,
          agent: payload.agent,
        });
        return {
          success: true,
          data: {
            spec: payload.spec,
          },
        };
      },
    },
    list: {
      command: {
        description: "列出当前项目可发现的 skills",
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
        description: "给当前 contextId 加载 skill",
        configure(command: Command) {
          command
            .argument("<name>")
            .option("--context-id <contextId>", "目标 contextId");
        },
        mapInput({ args, opts }): SkillLoadPayload {
          const name = String(args[0] || "").trim();
          if (!name) throw new Error("Missing name");
          return {
            name,
            contextId: resolveContextIdForCommand(getStringOpt(opts, "contextId")),
          };
        },
      },
      api: {
        method: "POST",
        async mapInput(c): Promise<SkillLoadPayload> {
          const body = readJsonObject(await c.req.json());
          const name = String(body.name || "").trim();
          const contextId = String(body.contextId || "").trim();
          if (!name) throw new Error("Missing name");
          if (!contextId) throw new Error("Missing contextId");
          return { name, contextId };
        },
      },
      async execute(params) {
        const payload = params.payload as SkillLoadPayload;
        const result = await loadSkill({
          projectRoot: params.context.rootPath,
          request: {
            name: payload.name,
            contextId: payload.contextId,
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
          data: result,
        };
      },
    },
    unload: {
      command: {
        description: "给当前 contextId 卸载 skill",
        configure(command: Command) {
          command
            .argument("<name>")
            .option("--context-id <contextId>", "目标 contextId");
        },
        mapInput({ args, opts }): SkillUnloadPayload {
          const name = String(args[0] || "").trim();
          if (!name) throw new Error("Missing name");
          return {
            name,
            contextId: resolveContextIdForCommand(getStringOpt(opts, "contextId")),
          };
        },
      },
      api: {
        method: "POST",
        async mapInput(c): Promise<SkillUnloadPayload> {
          const body = readJsonObject(await c.req.json());
          const name = String(body.name || "").trim();
          const contextId = String(body.contextId || "").trim();
          if (!name) throw new Error("Missing name");
          if (!contextId) throw new Error("Missing contextId");
          return { name, contextId };
        },
      },
      async execute(params) {
        const payload = params.payload as SkillUnloadPayload;
        const result = await unloadSkill({
          projectRoot: params.context.rootPath,
          request: {
            name: payload.name,
            contextId: payload.contextId,
          },
        });
        if (!result.success) {
          return {
            success: false,
            error: result.error || "skill unload failed",
          };
        }
        return {
          success: true,
          data: result,
        };
      },
    },
    pinned: {
      command: {
        description: "查看 contextId 已固定的 skillIds",
        configure(command: Command) {
          command.option("--context-id <contextId>", "目标 contextId");
        },
        mapInput({ opts }): SkillPinnedPayload {
          return {
            contextId: resolveContextIdForCommand(getStringOpt(opts, "contextId")),
          };
        },
      },
      api: {
        method: "GET",
        mapInput(c): SkillPinnedPayload {
          const contextId = String(c.req.query("contextId") || "").trim();
          if (!contextId) throw new Error("Missing contextId");
          return { contextId };
        },
      },
      async execute(params) {
        const payload = params.payload as SkillPinnedPayload;
        const result = await listPinnedSkills({
          projectRoot: params.context.rootPath,
          contextId: payload.contextId,
        });
        if (!result.success) {
          return {
            success: false,
            error: result.error || "skill pinned failed",
          };
        }
        return {
          success: true,
          data: result,
        };
      },
    },
  },
};

/**
 * Web Plugin 来源信息与兼容安装动作。
 *
 * 关键点（中文）
 * - 这里不自建联网实现，只检查外部 provider 是否就绪，并记录少量配置。
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import fsp from "node:fs/promises";
import { execa } from "execa";
import fse from "fs-extra";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { JsonObject } from "@/types/Json.js";
import type {
  WebPluginDependencyCheckResult,
  WebPluginInstallInput,
} from "@/types/WebPlugin.js";
import { readWebPluginConfig, writeWebPluginConfig } from "@/plugins/web/runtime/Config.js";
import { readFileSync } from "node:fs";

const AGENT_BROWSER_PROMPT_FILE_URL = new URL("../PROMPT.agent-browser.txt", import.meta.url);

function toJsonObject(input: Record<string, unknown> | null | undefined): JsonObject {
  const out: JsonObject = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    }
  }
  return out;
}

function resolveWebAccessSkillCandidates(projectRoot: string): string[] {
  const home = process.env.HOME || "";
  return [
    path.join(projectRoot, ".agents", "skills", "web-access", "SKILL.md"),
    path.join(home, ".agents", "skills", "web-access", "SKILL.md"),
    path.join(projectRoot, ".claude", "skills", "web-access", "SKILL.md"),
    path.join(home, ".claude", "skills", "web-access", "SKILL.md"),
  ].filter(Boolean);
}

function resolveManagedSkillRoot(projectRoot: string, scope: "user" | "project"): string {
  if (scope === "project") {
    return path.join(projectRoot, ".agents", "skills");
  }
  return path.join(process.env.HOME || os.homedir(), ".agents", "skills");
}

function resolveManagedSkillDir(params: {
  projectRoot: string;
  scope: "user" | "project";
  provider: "web-access" | "agent-browser";
}): string {
  return path.join(resolveManagedSkillRoot(params.projectRoot, params.scope), params.provider);
}

function loadBundledAgentBrowserSkillText(): string {
  try {
    return readFileSync(AGENT_BROWSER_PROMPT_FILE_URL, "utf-8").trim();
  } catch {
    return "# agent-browser\n";
  }
}

async function ensureAgentBrowserSkillInstalled(params: {
  projectRoot: string;
  scope: "user" | "project";
}): Promise<string> {
  const targetDir = resolveManagedSkillDir({
    projectRoot: params.projectRoot,
    scope: params.scope,
    provider: "agent-browser",
  });
  const skillPath = path.join(targetDir, "SKILL.md");
  if (fs.existsSync(skillPath)) {
    return skillPath;
  }
  await fsp.mkdir(targetDir, { recursive: true });
  await fsp.writeFile(`${skillPath}`, `${loadBundledAgentBrowserSkillText()}\n`, "utf-8");
  return skillPath;
}

async function ensureWebAccessSkillInstalled(params: {
  projectRoot: string;
  scope: "user" | "project";
  source?: string;
}): Promise<string> {
  const targetDir = resolveManagedSkillDir({
    projectRoot: params.projectRoot,
    scope: params.scope,
    provider: "web-access",
  });
  const skillPath = path.join(targetDir, "SKILL.md");
  if (fs.existsSync(skillPath)) {
    return skillPath;
  }

  const source = String(params.source || "").trim();
  if (source && fs.existsSync(source)) {
    await fse.copy(path.resolve(source), targetDir, {
      overwrite: true,
      errorOnExist: false,
    });
    return skillPath;
  }

  await fsp.mkdir(path.dirname(targetDir), { recursive: true });
  await execa("git", ["clone", "--depth=1", "https://github.com/eze-is/web-access", targetDir], {
    reject: true,
  });
  return skillPath;
}

async function checkAgentBrowserCommand(command: string): Promise<boolean> {
  try {
    await execa(command, ["--help"], {
      reject: false,
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 返回当前来源快照。
 */
export async function inspectWebPluginDependency(
  context: ExecutionContext,
): Promise<WebPluginDependencyCheckResult> {
  const config = readWebPluginConfig(context);
  if (config.provider === "agent-browser") {
    const available = await checkAgentBrowserCommand(config.browserCommand);
    return {
      available,
      installed: available,
      reasons: available
        ? []
        : [
            `agent-browser command is not available: ${config.browserCommand}`,
            "Install or expose the agent-browser CLI before using this provider.",
          ],
      details: {
        provider: config.provider,
        browserCommand: config.browserCommand,
        source: "external-project",
        installScope: config.installScope,
      },
    };
  }

  const candidates = resolveWebAccessSkillCandidates(context.rootPath);
  const skillPath = candidates.find((item) => fs.existsSync(item));
  const available = Boolean(skillPath);
  return {
    available,
    installed: available,
    reasons: available
      ? []
      : [
          "web-access skill is not found.",
          "Install https://github.com/eze-is/web-access into ~/.agents/skills/web-access or project .agents/skills/web-access.",
        ],
    details: {
      provider: config.provider,
      source: "external-project",
      repositoryUrl: config.repositoryUrl,
      installScope: config.installScope,
      ...(config.sourceVersion ? { sourceVersion: config.sourceVersion } : {}),
      ...(skillPath ? { skillPath } : { checkedPaths: candidates }),
    },
  };
}

/**
 * 兼容 install 动作。
 */
export async function installWebPluginDependency(params: {
  context: ExecutionContext;
  input?: WebPluginInstallInput;
}): Promise<{
  success: boolean;
  message?: string;
  details?: JsonObject;
}> {
  const currentConfig = readWebPluginConfig(params.context);
  const installScope =
    params.input?.installScope === "project" || params.input?.installScope === "user"
      ? params.input.installScope
      : currentConfig.installScope;
  const provider =
    params.input?.provider === "agent-browser" || params.input?.provider === "web-access"
      ? params.input.provider
      : currentConfig.provider;

  const installedSkillPath =
    provider === "agent-browser"
      ? await ensureAgentBrowserSkillInstalled({
          projectRoot: params.context.rootPath,
          scope: installScope,
        })
      : await ensureWebAccessSkillInstalled({
          projectRoot: params.context.rootPath,
          scope: installScope,
          source: params.input?.repositoryUrl,
        });

  const nextConfig = await writeWebPluginConfig({
    context: params.context,
    value: {
      enabled:
        typeof params.input?.enable === "boolean" ? params.input.enable : true,
      provider,
      injectPrompt:
        typeof params.input?.injectPrompt === "boolean"
          ? params.input.injectPrompt
          : true,
      ...(typeof params.input?.repositoryUrl === "string" &&
      params.input.repositoryUrl.trim()
        ? { repositoryUrl: params.input.repositoryUrl.trim() }
        : {}),
      ...(typeof params.input?.sourceVersion === "string" &&
      params.input.sourceVersion.trim()
        ? { sourceVersion: params.input.sourceVersion.trim() }
        : {}),
      ...(typeof params.input?.browserCommand === "string" &&
      params.input.browserCommand.trim()
        ? { browserCommand: params.input.browserCommand.trim() }
        : {}),
      installScope,
    },
  });
  return {
    success: true,
    message: "web provider installed and configured",
    details: toJsonObject({
      enabled: nextConfig.enabled,
      provider: nextConfig.provider,
      injectPrompt: nextConfig.injectPrompt,
      repositoryUrl: nextConfig.repositoryUrl,
      sourceVersion: nextConfig.sourceVersion || "",
      browserCommand: nextConfig.browserCommand,
      installScope: nextConfig.installScope,
      skillPath: installedSkillPath,
    }),
  };
}

/**
 * doctor 结果与 inspect 一致。
 */
export async function doctorWebPluginDependency(
  context: ExecutionContext,
): Promise<WebPluginDependencyCheckResult> {
  return inspectWebPluginDependency(context);
}

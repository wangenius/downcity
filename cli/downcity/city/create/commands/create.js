/**
 * `city create` 命令实现。
 *
 * 关键点（中文）
 * - 从零搭建一个可部署的 City 项目，而不是让用户手写底层部署文件。
 * - Git URL 只在 create 阶段 clone 到本地；deploy 阶段只处理本地项目。
 * - `city.json` 只写项目类型和部署目标，其他文件由 CLI 生成。
 * - 当前先生成 Cloudflare Workers 项目骨架，后续可扩展更多 target。
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { confirm, isCancel, select, text } from "../../tui/Prompts.js";
import { emitCliBlock } from "../../shared/CliReporter.js";
import { CliError } from "../../shared/CliError.js";
import { runCommand } from "../../deploy/runtime/CommandRunner.js";
/**
 * 创建 City 项目。
 */
export async function createCityProject(dir = ".", options = {}) {
    const input = String(dir || ".").trim() || ".";
    if (isGitUrl(input)) {
        await cloneCityProject(input, options);
        return;
    }
    const project_dir = resolve(input);
    mkdirSync(project_dir, { recursive: true });
    const default_name = inferProjectName(project_dir);
    const name_input = await text({
        message: "City name",
        initialValue: default_name,
    });
    if (isCancel(name_input))
        return;
    const name = String(name_input || default_name).trim() || default_name;
    const target_input = await select({
        message: "Deploy target",
        options: [
            {
                label: "Cloudflare Workers",
                value: "cloudflare-workers",
                hint: "Edge Worker with D1",
            },
        ],
    });
    if (isCancel(target_input))
        return;
    const target = String(target_input || "cloudflare-workers");
    const files = createCloudflareWorkersFiles(name, target);
    const existing_files = files
        .map((item) => join(project_dir, item.path))
        .filter((path) => existsSync(path));
    if (existing_files.length > 0 && options.force !== true) {
        const should_overwrite = await confirm({
            message: `${existing_files.length} files already exist. Overwrite them?`,
            initialValue: false,
        });
        if (isCancel(should_overwrite) || should_overwrite !== true) {
            throw new CliError({
                title: "City project creation cancelled",
                note: "Existing files were left unchanged.",
            });
        }
    }
    for (const file of files) {
        const file_path = join(project_dir, file.path);
        mkdirSync(dirname(file_path), { recursive: true });
        writeFileSync(file_path, file.content);
    }
    emitCliBlock({
        tone: "success",
        title: "City project created",
        facts: [
            { label: "name", value: name },
            { label: "target", value: target },
            { label: "dir", value: project_dir },
        ],
        note: "Run city deploy from the project directory when ready.",
    });
}
/**
 * 从 Git URL 创建本地 City 项目。
 */
async function cloneCityProject(git_url, options) {
    const default_dir = inferGitProjectName(git_url);
    const dir_input = await text({
        message: "Local directory",
        initialValue: default_dir,
    });
    if (isCancel(dir_input))
        return;
    const project_dir = resolve(String(dir_input || default_dir).trim() || default_dir);
    if (existsSync(project_dir) && readdirSync(project_dir).length > 0) {
        throw new CliError({
            title: "Local directory is not empty",
            note: project_dir,
            fix: "Choose an empty directory for `city create <git-url>`, then run `city deploy` inside it.",
        });
    }
    await runCommand({
        label: "Clone City project",
        command: `git clone --depth 1 ${shellQuote(git_url)} ${shellQuote(project_dir)}`,
        cwd: process.cwd(),
    });
    emitCliBlock({
        tone: "success",
        title: "City project cloned",
        facts: [
            { label: "source", value: git_url },
            { label: "dir", value: project_dir },
        ],
        note: "Run city deploy from the cloned project directory when ready.",
    });
}
/**
 * 创建 Cloudflare Workers 项目文件。
 */
function createCloudflareWorkersFiles(name, target) {
    const package_name = normalizePackageName(name);
    return [
        {
            path: "city.json",
            content: `${JSON.stringify({ type: "city", name, target }, null, 2)}\n`,
        },
        {
            path: "package.json",
            content: `${JSON.stringify({
                name: package_name,
                private: true,
                type: "module",
                scripts: {
                    deploy: "city deploy",
                    "deploy:dry": "city deploy --dry-run",
                    "deploy:verify": "city deploy --verify-only",
                    typecheck: "tsc -p tsconfig.json --noEmit",
                },
                dependencies: {
                    "@downcity/city": "latest",
                    "@downcity/services": "latest",
                    "drizzle-orm": "latest",
                },
                devDependencies: {
                    "@cloudflare/workers-types": "latest",
                    typescript: "latest",
                    wrangler: "latest",
                },
            }, null, 2)}\n`,
        },
        {
            path: "tsconfig.json",
            content: `${JSON.stringify({
                compilerOptions: {
                    target: "ES2022",
                    module: "NodeNext",
                    moduleResolution: "NodeNext",
                    lib: ["ES2022"],
                    strict: true,
                    noEmit: true,
                    skipLibCheck: true,
                    types: ["@cloudflare/workers-types"],
                },
                include: ["src/**/*.ts"],
            }, null, 2)}\n`,
        },
        {
            path: ".env.example",
            content: [
                "# Local deploy values.",
                `CITY_D1_DATABASE_NAME=${name}-db`,
                "",
            ].join("\n"),
        },
        {
            path: "src/index.ts",
            content: createWorkerEntrypoint(),
        },
    ];
}
/**
 * 创建默认 Worker 入口。
 */
function createWorkerEntrypoint() {
    return `/**
 * City Cloudflare Worker entry.
 *
 * 关键点（中文）
 * - 这是 city create 生成的最小 City 入口。
 * - City runtime 默认使用 D1，部署资源由 city deploy 管理。
 */

import { drizzle } from "drizzle-orm/d1";
import { CityBase } from "@downcity/city";
import {
  accountsService,
  balanceService,
  usageService,
} from "@downcity/services";

export interface Env {
  DB: D1Database;
}

let city_promise: Promise<CityBase> | undefined;

function get_city(env: Env): Promise<CityBase> {
  if (!city_promise) {
    city_promise = init_city(env);
  }
  return city_promise;
}

async function init_city(env: Env): Promise<CityBase> {
  const db = drizzle(env.DB);
  const city = new CityBase({
    db,
    dialect: "sqlite",
    raw: env.DB,
  });

  city.use(accountsService());
  city.use(balanceService());
  city.use(usageService());

  await city.health();
  return city;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const city = await get_city(env);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(await city.health());
    }
    return city.handleRequest(request);
  },
};
`;
}
/**
 * 根据目录名推断项目名。
 */
function inferProjectName(project_dir) {
    return basename(project_dir)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-")
        || "city";
}
/**
 * 规范化 package name。
 */
function normalizePackageName(name) {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-")
        || "city";
}
/**
 * 判断输入是否像 Git URL。
 */
function isGitUrl(value) {
    return /^(https?:\/\/|git@|ssh:\/\/)/.test(value)
        || /^[^@\s]+@[^:\s]+:[^\s]+$/.test(value);
}
/**
 * 从 Git URL 推断本地目录名。
 */
function inferGitProjectName(git_url) {
    const without_query = git_url.split(/[?#]/)[0] ?? git_url;
    const last_part = without_query.split(/[/\\:]/).filter(Boolean).pop() ?? "city";
    return normalizePackageName(last_part.replace(/\.git$/i, "")) || "city";
}
/**
 * shell 参数转义。
 */
function shellQuote(value) {
    return `'${value.replace(/'/g, "'\\''")}'`;
}
//# sourceMappingURL=create.js.map
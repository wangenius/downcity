import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Import 边界检查。
 *
 * 关键点（中文）
 * - 限制 services 层对 main-server 的反向依赖
 * - 限制 service module 入口对 server 的直接依赖
 * - 限制 services 之间的横向直接依赖（全部禁止）
 * - 以脚本方式落地，避免引入额外 lint 工具链
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(packageRoot, "src");
const servicesRoot = path.join(srcRoot, "services");

const IMPORT_RE =
  /(?:import\s+[^"'`]*?from\s*|export\s+[^"'`]*?from\s*|import\s*\()\s*["']([^"']+)["']/g;

function toPosix(inputPath) {
  return inputPath.split(path.sep).join("/");
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function resolveAliasToSrcRelative(specifier) {
  if (specifier.startsWith("@/")) {
    return specifier.slice(2);
  }
  if (specifier.startsWith("@main/")) {
    return `main/${specifier.slice("@main/".length)}`;
  }
  if (specifier.startsWith("@agent/")) {
    return `agent/${specifier.slice("@agent/".length)}`;
  }
  if (specifier.startsWith("@services/")) {
    return `services/${specifier.slice("@services/".length)}`;
  }
  if (specifier.startsWith("@sessions/")) {
    return `sessions/${specifier.slice("@sessions/".length)}`;
  }
  if (specifier.startsWith("@plugins/")) {
    return `plugins/${specifier.slice("@plugins/".length)}`;
  }
  if (specifier.startsWith("@types/")) {
    return `types/${specifier.slice("@types/".length)}`;
  }
  if (specifier.startsWith("@utils/")) {
    return `utils/${specifier.slice("@utils/".length)}`;
  }
  return null;
}

function resolveToSrcRelative(filePath, specifier) {
  const absolute = path.resolve(path.dirname(filePath), specifier);
  const relative = path.relative(srcRoot, absolute);
  return toPosix(relative);
}

function isServiceEntry(srcRelativePath) {
  if (!srcRelativePath.startsWith("services/")) return false;
  const seg = srcRelativePath.split("/");
  return seg.length === 3 && seg[2] === "service-entry.ts";
}

function getServiceName(srcRelativePath) {
  const seg = srcRelativePath.split("/");
  if (seg.length < 2 || seg[0] !== "services") return "";
  return seg[1] || "";
}

async function collectTsFiles(dirPath) {
  const items = await fs.readdir(dirPath);
  const out = [];
  for (const name of items) {
    const abs = path.join(dirPath, name);
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) {
      out.push(...(await collectTsFiles(abs)));
      continue;
    }
    if (name.endsWith(".ts")) out.push(abs);
  }
  return out;
}

async function run() {
  const files = await collectTsFiles(servicesRoot);
  const violations = [];

  for (const filePath of files) {
    const source = await fs.readFile(filePath, "utf-8");
    const srcRelativeFilePath = toPosix(path.relative(srcRoot, filePath));
    const isServiceEntryFile = isServiceEntry(srcRelativeFilePath);
    const currentServiceName = getServiceName(srcRelativeFilePath);

    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = String(match[1] || "").trim();
      if (!specifier) continue;

      const target = isRelativeSpecifier(specifier)
        ? resolveToSrcRelative(filePath, specifier)
        : resolveAliasToSrcRelative(specifier);
      if (!target) continue;

      const allowMainServerClient = target.startsWith("main/daemon/Client");
      const allowSharedServiceInfra = target === "services/BaseService.js";

      // 规则 1（中文）：service 全量禁止反向依赖 main（daemon client 例外）。
      if (target.startsWith("main/") && !allowMainServerClient) {
        violations.push({
          file: srcRelativeFilePath,
          specifier,
          reason: "services 层禁止直接依赖 main/*，请通过依赖注入访问运行时能力",
        });
      }

      // 规则 2（中文）：service 入口文件禁止直接依赖 main。
      if (
        isServiceEntryFile &&
        target.startsWith("main/") &&
        !allowMainServerClient
      ) {
        violations.push({
          file: srcRelativeFilePath,
          specifier,
          reason: "services/*/service-entry.ts 禁止直接依赖 main/*",
        });
      }

      // 规则 3（中文）：service 全量禁止跨 service 直接依赖（无例外）。
      if (target.startsWith("services/")) {
        const targetServiceName = getServiceName(target);
        const isSameService = currentServiceName && targetServiceName === currentServiceName;
        if (!isSameService && !allowSharedServiceInfra) {
          violations.push({
            file: srcRelativeFilePath,
            specifier,
            reason:
              "services/* 禁止直接依赖其他 service 模块，请通过 infra 抽象能力或 server 注入解耦",
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log("✅ import boundaries passed");
    return;
  }

  console.error(`❌ import boundaries failed (${violations.length})`);
  for (const item of violations) {
    console.error(`- ${item.file}: ${item.specifier}`);
    console.error(`  ${item.reason}`);
  }
  process.exit(1);
}

await run();

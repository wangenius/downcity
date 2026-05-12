import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Import 边界检查（扁平化后）。
 *
 * 规则（中文）
 * - services 层禁止依赖 agent/config/http/rpc/service/plugin/daemon/registry 等上层模块。
 * - services 之间禁止横向直接依赖（除 BaseService 外）。
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

// 扁平化后的别名解析
function resolveAliasToSrcRelative(specifier) {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (specifier.startsWith("@session/")) return `session/${specifier.slice("@session/".length)}`;
  if (specifier.startsWith("@services/")) return `services/${specifier.slice("@services/".length)}`;
  if (specifier.startsWith("@shared/")) return `shared/${specifier.slice("@shared/".length)}`;
  return null;
}

function resolveToSrcRelative(filePath, specifier) {
  const absolute = path.resolve(path.dirname(filePath), specifier);
  const relative = path.relative(srcRoot, absolute);
  return toPosix(relative);
}

function getServiceName(srcRelativePath) {
  const seg = srcRelativePath.split("/");
  if (seg.length < 2 || seg[0] !== "services") return "";
  return seg[1] || "";
}

// 扁平化后 services 禁止依赖的上层模块
const BLOCKED_PREFIXES = [
  "agent/",
  "config/",
  "http/",
  "rpc/",
  "service/",
  "plugin/",
  "daemon/",
  "registry/",
  "cli/",
  "console/",
  "model/",
  "runtime/",
  "sandbox/",
  "session/",
];

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
    const currentServiceName = getServiceName(srcRelativeFilePath);

    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = String(match[1] || "").trim();
      if (!specifier) continue;

      const target = isRelativeSpecifier(specifier)
        ? resolveToSrcRelative(filePath, specifier)
        : resolveAliasToSrcRelative(specifier);
      if (!target) continue;

      // 规则 1：services 禁止依赖上层模块
      const blocked = BLOCKED_PREFIXES.find((p) => target.startsWith(p));
      if (blocked) {
        violations.push({
          file: srcRelativeFilePath,
          specifier,
          reason: `services 层禁止直接依赖 ${blocked}，请通过依赖注入访问运行时能力`,
        });
      }

      // 规则 2：services 之间禁止横向直接依赖（BaseService 除外）
      if (target.startsWith("services/")) {
        const targetServiceName = getServiceName(target);
        const isSameService = currentServiceName && targetServiceName === currentServiceName;
        const isBaseService = target === "services/BaseService.js";
        if (!isSameService && !isBaseService) {
          violations.push({
            file: srcRelativeFilePath,
            specifier,
            reason: "services/* 禁止直接依赖其他 service 模块",
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

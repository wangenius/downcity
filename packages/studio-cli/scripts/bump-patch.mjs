/**
 * 每次 build 自动递增 @downcity/studio-cli 的 patch 版本号。
 *
 * 关键点（中文）
 * - 直接修改 packages/studio-cli/package.json 的 version 字段。
 * - 遵循 semver：major.minor.patch，仅递增 patch。
 * - 递增后的版本号回写到文件，后续 tsc 构建使用新版本。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '..', 'package.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const oldVersion = pkg.version;
const [major, minor, patch] = oldVersion.split('.').map(Number);

if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
  console.error(`Invalid semver: ${oldVersion}`);
  process.exit(1);
}

const nextVersion = `${major}.${minor}.${patch + 1}`;
pkg.version = nextVersion;

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
console.log(`[bump-patch] ${oldVersion} → ${nextVersion}`);

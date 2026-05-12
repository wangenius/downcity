#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ========== PATH MAPPING ==========
// old path prefix (relative to src/) → new path prefix

const AGENT_MAP = [
  // main/ → top level
  ['main/agent/',        'agent/'],
  ['main/city/env/',     'config/'],
  ['main/city/model/',   'model/'],
  ['main/city/daemon/',  'daemon/'],
  ['main/city/runtime/', 'runtime/'],
  ['main/modules/http/',  'http/'],
  ['main/modules/rpc/',   'rpc/'],
  ['main/service/',       'service/'],
  ['main/plugin/',        'plugin/'],
  // top-level stay
  ['session/',  'session/'],
  ['sandbox/',  'sandbox/'],
  ['services/', 'services/'],
  ['plugins/',  'plugins/'],
  ['shared/',   'shared/'],
  ['types/',    'types/'],
];

const CITY_MAP = [
  ['main/modules/cli/',     'cli/'],
  ['main/city/daemon/',     'daemon/'],
  ['main/modules/console/', 'console/'],
  ['main/city/runtime/',    'registry/'],
  ['main/city/model/',      'model/'],
  ['main/city/env/',        'config/'],
  // duped from agent
  ['main/agent/',          'agent/'],
  ['main/modules/http/',    'http/'],
  ['main/modules/rpc/',     'rpc/'],
  ['main/service/',         'service/'],
  ['main/plugin/',          'plugin/'],
  // top-level
  ['session/',  'session/'],
  ['sandbox/',  'sandbox/'],
  ['services/', 'services/'],
  ['plugins/',  'plugins/'],
  ['shared/',   'shared/'],
  ['types/',    'types/'],
];

// ========== IMPORT REWRITE RULES ==========
// Each rule: [regex pattern, replacement]
// Applied to all .ts files after moving

function buildImportRules(pkgMap) {
  // Build a sorted list of mappings (longest first to avoid partial matches)
  const sorted = [...pkgMap].sort((a, b) => b[0].length - a[0].length);
  
  const rules = [];
  for (const [oldPrefix, newPrefix] of sorted) {
    // Alias imports: @/main/agent/foo → @/agent/foo
    const aliasOld = oldPrefix;
    const aliasNew = newPrefix;
    
    // We need to handle several import forms:
    // from "@/main/agent/foo" or from '@services/chat/foo'
    // The path aliases: @/ maps to src/, @main/ maps to src/main/, etc.
    
    // @/ forward slash alias → new path
    rules.push({
      pattern: new RegExp(`(["'])@/${escapeRegex(oldPrefix)}`, 'g'),
      replacement: `$1@/${aliasNew}`,
    });
    
    // @main/ alias (maps to src/main/) 
    if (oldPrefix.startsWith('main/')) {
      const subPath = oldPrefix.slice('main/'.length);
      rules.push({
        pattern: new RegExp(`(["'])@main/${escapeRegex(subPath)}`, 'g'),
        replacement: `$1@/${subPath.startsWith('agent/') ? 'agent/' : 
                              subPath.startsWith('city/env') ? 'config/' :
                              subPath.startsWith('city/model') ? 'model/' :
                              subPath.startsWith('city/daemon') ? 'daemon/' :
                              subPath.startsWith('city/runtime') ? 'runtime/' :
                              subPath.startsWith('modules/http') ? 'http/' :
                              subPath.startsWith('modules/rpc') ? 'rpc/' :
                              subPath.startsWith('service') ? 'service/' :
                              subPath.startsWith('plugin') ? 'plugin/' :
                              subPath}`,
      });
    }
    
    // @session/ alias (maps to src/session/)
    if (oldPrefix === 'session/') {
      rules.push({
        pattern: /(["'])@session\//g,
        replacement: '$1@session/',
      });
    }
    
    // @services/ alias (maps to src/services/) - stays same
    if (oldPrefix === 'services/') {
      rules.push({
        pattern: /(["'])@services\//g,
        replacement: '$1@services/',
      });
    }
    
    // @shared/ alias (maps to src/shared/) - stays same
    if (oldPrefix === 'shared/') {
      rules.push({
        pattern: /(["'])@shared\//g,
        replacement: '$1@shared/',
      });
    }
  }
  
  return rules;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ========== COLLECT FILES ==========
async function collectTsFiles(dir) {
  const files = [];
  const walk = async (d) => {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { await walk(full); continue; }
      if (e.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
        files.push(full);
      }
    }
  };
  await walk(dir);
  return files;
}

// ========== MAIN ==========
async function flattenPackage(pkgName, pathMap) {
  const pkgDir = path.join(ROOT, 'packages', pkgName);
  const srcDir = path.join(pkgDir, 'src');
  const tmpDir = path.join(pkgDir, 'src_flat');
  
  console.log(`\n=== Flattening @downcity/${pkgName} ===`);
  
  // Clean tmp
  await fs.remove(tmpDir);
  await fs.ensureDir(tmpDir);
  
  // Step 1: Move directories according to map
  const moved = new Set();
  for (const [oldPrefix, newPrefix] of pathMap) {
    const oldPath = path.join(srcDir, oldPrefix);
    const newPath = path.join(tmpDir, newPrefix);
    
    if (moved.has(oldPath)) continue;
    if (!(await fs.pathExists(oldPath))) {
      console.log(`  SKIP (not found): ${oldPrefix}`);
      continue;
    }
    
    await fs.ensureDir(path.dirname(newPath));
    try {
      await fs.copy(oldPath, newPath, { overwrite: true });
      moved.add(oldPath);
      console.log(`  MOVE: ${oldPrefix} → ${newPrefix}`);
    } catch (err) {
      console.error(`  ERROR moving ${oldPrefix}: ${err.message}`);
    }
  }
  
  // Step 2: Copy any remaining files not covered by map
  // (should be nothing left in main/ but just in case)
  
  // Step 3: Rewrite imports
  const tsFiles = await collectTsFiles(tmpDir);
  console.log(`  Rewriting imports in ${tsFiles.length} files...`);
  
  const importRules = buildImportRules(pathMap);
  let changedFiles = 0;
  
  for (const filePath of tsFiles) {
    let content = await fs.readFile(filePath, 'utf-8');
    let changed = false;
    
    for (const rule of importRules) {
      const newContent = content.replace(rule.pattern, rule.replacement);
      if (newContent !== content) {
        content = newContent;
        changed = true;
      }
    }
    
    if (changed) {
      await fs.writeFile(filePath, content, 'utf-8');
      changedFiles++;
    }
  }
  console.log(`  Rewrote imports in ${changedFiles} files`);
  
  // Step 4: Replace old src/ with new
  const bakDir = path.join(pkgDir, 'src_bak');
  await fs.remove(bakDir);
  await fs.move(srcDir, bakDir);
  await fs.move(tmpDir, srcDir);
  await fs.remove(bakDir);
  
  console.log(`  Done!`);
}

async function updateTsconfig(pkgName, pathMap) {
  const pkgDir = path.join(ROOT, 'packages', pkgName);
  const tsconfigPath = path.join(pkgDir, 'tsconfig.json');
  
  if (!(await fs.pathExists(tsconfigPath))) return;
  
  const tsconfig = await fs.readJson(tsconfigPath);
  
  // Build new paths
  const paths = {};
  for (const [oldPrefix, newPrefix] of pathMap) {
    // Generate alias entries
    const cleanNew = newPrefix.replace(/\/$/, '');
    paths[`@/${cleanNew}/*`] = [`./src/${cleanNew}/*`];
  }
  
  // Add specific aliases
  paths['@session/*'] = ['./src/session/*'];
  paths['@services/*'] = ['./src/services/*'];
  paths['@shared/*'] = ['./src/shared/*'];
  
  tsconfig.compilerOptions.paths = paths;
  await fs.writeJson(tsconfigPath, tsconfig, { spaces: 2 });
  console.log(`  Updated tsconfig.json for ${pkgName}`);
}

async function main() {
  await flattenPackage('agent', AGENT_MAP);
  await updateTsconfig('agent', AGENT_MAP);
  
  await flattenPackage('city', CITY_MAP);
  await updateTsconfig('city', CITY_MAP);
  
  console.log('\n=== Flatten complete! ===');
  console.log('Run typecheck to verify.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

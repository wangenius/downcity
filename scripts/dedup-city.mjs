#!/usr/bin/env node
/**
 * 去重脚本：城市包中与 agent 包重复的文件，删除并改为从 @downcity/agent 导入。
 *
 * 策略（中文）：
 * 1. 计算 agent 源文件集合
 * 2. 对城市包中与 agent 相同相对路径的文件，标记为"重复"
 * 3. 删除重复文件
 * 4. 扫描城市包所有文件，把引用重复文件的 import 改为 @downcity/agent
 */
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AGENT_SRC = path.join(ROOT, 'packages/agent/src');
const CITY_SRC = path.join(ROOT, 'packages/cli/src');

async function collectFiles(dir) {
  const result = [];
  const walk = async (d) => {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { await walk(f); continue; }
      if (e.isFile() && /\.(ts|tsx|json|txt|md)$/.test(e.name)) {
        result.push(f);
      }
    }
  };
  await walk(dir);
  return result;
}

function relativePath(filePath, base) {
  return path.relative(base, filePath);
}

// Directories that should stay in city (not duplicated)
const CITY_ONLY_DIRS = new Set([
  'cli',
  'console',
  'registry',
  'services',  // city has implementations, agent has them too (dup)
  'plugins',   // same as services
]);

// Files in mixed dirs that belong to city (not in agent)
const CITY_ONLY_FILES = new Set([
  // daemon/ - city has Manager, Client, Api, CliArgs, PortAllocator
  'daemon/Manager.ts',
  'daemon/Client.ts', 
  'daemon/Api.ts',
  'daemon/CliArgs.ts',
  'daemon/PortAllocator.ts',
  // model/ - city has ModelManager, ModelCommand
  'model/ModelManager.ts',
  'model/ModelCommand.ts',
]);

async function main() {
  // 1. Collect agent files
  const agentFiles = await collectFiles(AGENT_SRC);
  const agentRelPaths = new Set(agentFiles.map(f => relativePath(f, AGENT_SRC)));
  
  console.log(`Agent has ${agentRelPaths.size} files`);
  
  // 2. Collect city files
  const cityFiles = await collectFiles(CITY_SRC);
  const cityTsFiles = cityFiles.filter(f => /\.tsx?$/.test(f.name));
  console.log(`City has ${cityFiles.length} files (${cityTsFiles.length} .ts)`);
  
  // 3. Find duplicates
  const toRemove = [];
  const toKeep = [];
  
  for (const cityFile of cityFiles) {
    const rel = relativePath(cityFile, CITY_SRC);
    const topDir = rel.split('/')[0];
    
    // City-only dirs always keep
    if (CITY_ONLY_DIRS.has(topDir)) {
      toKeep.push(cityFile);
      continue;
    }
    
    // City-only files always keep
    if (CITY_ONLY_FILES.has(rel)) {
      toKeep.push(cityFile);
      continue;
    }
    
    // If exists in agent, it's a duplicate → remove
    if (agentRelPaths.has(rel)) {
      toRemove.push(cityFile);
    } else {
      toKeep.push(cityFile);
    }
  }
  
  console.log(`\nDuplicates to remove: ${toRemove.length}`);
  console.log(`Files to keep in city: ${toKeep.length}`);
  
  // Show what we're removing by directory
  const byDir = {};
  for (const f of toRemove) {
    const rel = relativePath(f, CITY_SRC);
    const dir = rel.split('/')[0];
    byDir[dir] = (byDir[dir] || 0) + 1;
  }
  console.log('By directory:');
  for (const [dir, count] of Object.entries(byDir).sort()) {
    console.log(`  ${dir}/: ${count} files`);
  }
  
  // 4. Build import map: old import specifier → new
  // Since we're removing files and importing from @downcity/agent,
  // we need to map each import to the correct export from agent.
  
  // For now, we keep all the files - this is a dry run
  // Actually, let's write a more targeted approach.
  
  // The imports in city use various forms:
  // '@/agent/foo.js' → need to find the right export from agent
  // '@shared/utils/foo.js' → shared utils export
  // '@session/foo.js' → session
  
  // Since agent doesn't have a comprehensive index yet,
  // let's use a different strategy: keep files but add path alias
  
  console.log('\n=== Strategy ===');
  console.log('Instead of deleting files, we will:');
  console.log('1. Update city tsconfig paths to point to agent src/');
  console.log('2. Then city compiles against agent source directly');
  console.log('3. Files can be deleted later');
  
  // Write the new tsconfig
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["ES2022"],
      outDir: "./bin",
      rootDir: "src",
      paths: {
        // City's own dirs
        "@/*": ["./src/*"],
        "@cli/*": ["./src/cli/*"],
        "@console/*": ["./src/console/*"],
        "@registry/*": ["./src/registry/*"],
        "@daemon/*": ["./src/daemon/*"],
        // Agent's dirs - point to agent source
        "@/agent/*": ["../agent/src/agent/*"],
        "@/config/*": ["../agent/src/config/*"],
        "@/http/*": ["../agent/src/http/*"],
        "@/rpc/*": ["../agent/src/rpc/*"],
        "@/service/*": ["../agent/src/service/*"],
        "@/plugin/*": ["../agent/src/plugin/*"],
        "@/session/*": ["../agent/src/session/*"],
        "@/sandbox/*": ["../agent/src/sandbox/*"],
        "@/shared/*": ["../agent/src/shared/*"],
        "@/types/*": ["../agent/src/types/*"],
        "@/runtime/*": ["../agent/src/runtime/*"],
        "@/model/*": ["../agent/src/model/*"],
        // Aliases
        "@session/*": ["../agent/src/session/*"],
        "@services/*": ["./src/services/*"],
        "@shared/*": ["../agent/src/shared/*"],
      },
      strict: true,
      noImplicitAny: false,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      composite: true,
      rootDirs: ["src", "../agent/src"],
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "bin"],
  };
  
  await fs.writeJson(path.join(ROOT, 'packages/cli/tsconfig.json'), tsconfig, { spaces: 2 });
  console.log('\nUpdated city tsconfig to reference agent source');
  
  // Now delete the duplicate directories from city
  const dirsToRemove = new Set();
  for (const f of toRemove) {
    const rel = relativePath(f, CITY_SRC);
    const topDir = rel.split('/')[0];
    if (!CITY_ONLY_DIRS.has(topDir)) {
      dirsToRemove.add(topDir);
    }
  }
  
  console.log(`\nDirectories that can be removed from city:`);
  for (const dir of [...dirsToRemove].sort()) {
    console.log(`  src/${dir}/`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });

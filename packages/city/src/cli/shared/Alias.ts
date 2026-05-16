/**
 * `downcity config alias`：向 shell rc 文件写入 `alias city="downcity"`。
 *
 * 关键点（中文）
 * - 通过标记块（start/end）实现幂等更新。
 * - 支持 zsh/bash 与 dry-run。
 */

import os from "os";
import path from "path";
import fs from "fs-extra";
import { emitCliBlock, emitCliList } from "./CliReporter.js";

/**
 * alias 命令参数。
 */
interface AliasOptions {
  shell?: string;
  dryRun?: boolean;
  print?: boolean;
}

/**
 * 幂等写入 alias block。
 *
 * 算法（中文）
 * 1) 若已存在 downcity 标记块：原位替换该块
 * 2) 若已存在 `alias city=`：视为用户自定义，跳过
 * 3) 否则追加到文件末尾
 */
function upsertAliasBlock(content: string, aliasLines: string[]): { next: string; changed: boolean } {
  const start = "# >>> downcity alias >>>";
  const end = "# <<< downcity alias <<<";
  const block = `${start}\n${aliasLines.join("\n")}\n${end}\n`;

  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.slice(0, startIdx).replace(/\s*$/, "");
    const after = content.slice(endIdx + end.length).replace(/^\s*\n?/, "\n");
    const next = `${before}\n\n${block}${after}`.replace(/\n{4,}/g, "\n\n\n");
    return { next, changed: next !== content };
  }

  const aliasRegex = /^\s*alias\s+city\s*=/m;
  if (aliasRegex.test(content)) {
    return { next: content, changed: false };
  }

  const trimmed = content.replace(/\s*$/, "");
  const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : "";
  const next = `${prefix}${block}`;
  return { next, changed: true };
}

/**
 * 写入 alias 到目标 shell rc 文件。
 */
export async function aliasCommand(options: AliasOptions = {}): Promise<void> {
  const aliasLines = [`alias city="downcity"`];

  if (options.print) {
    emitCliBlock({
      tone: "info",
      title: "Alias preview",
      facts: aliasLines.map((line) => ({
        label: "line",
        value: line,
      })),
    });
    return;
  }

  const shell = String(options.shell || "both").toLowerCase();
  const targets: Array<"zsh" | "bash"> =
    shell === "zsh" ? ["zsh"] : shell === "bash" ? ["bash"] : ["zsh", "bash"];

  const home = os.homedir();
  const rcFiles = targets.map((s) => path.join(home, s === "zsh" ? ".zshrc" : ".bashrc"));

  const changedFiles: string[] = [];
  const skippedFiles: string[] = [];

  for (const rcPath of rcFiles) {
    const exists = await fs.pathExists(rcPath);
    const current = exists ? await fs.readFile(rcPath, "utf-8") : "";
    const { next, changed } = upsertAliasBlock(current, aliasLines);

    if (!changed) {
      skippedFiles.push(rcPath);
      continue;
    }

    if (!options.dryRun) {
      await fs.outputFile(rcPath, next, "utf-8");
    }
    changedFiles.push(rcPath);
  }

  if (options.dryRun) {
    emitCliBlock({
      tone: "info",
      title: "Alias update preview",
      summary: "dry run",
    });
  } else {
    emitCliBlock({
      tone: "success",
      title: "Alias written",
    });
  }
  emitCliList({
    tone: "accent",
    title: "Updated",
    items: changedFiles.map((item) => ({ title: item })),
  });
  if (skippedFiles.length > 0) {
    emitCliList({
      tone: "info",
      title: "Skipped",
      items: skippedFiles.map((item) => ({ title: item })),
    });
  }
  emitCliList({
    tone: "accent",
    title: "Refresh shell",
    items: [
      ...(targets.includes("zsh")
        ? [{ title: `source ${path.join(home, ".zshrc")}` }]
        : []),
      ...(targets.includes("bash")
        ? [{ title: `source ${path.join(home, ".bashrc")}` }]
        : []),
      { title: "或重新打开一个终端" },
    ],
  });
}

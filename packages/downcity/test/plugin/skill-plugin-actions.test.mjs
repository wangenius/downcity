/**
 * Skill plugin action helper 测试（node:test）。
 *
 * 关键点（中文）
 * - skill 的 list/lookup 逻辑应由 plugin 命名空间暴露，而不是继续挂在 services/skills。
 * - 这里锁定一个最小行为：plugin action helper 能读取 `plugins.skill.paths` 下的本地 skill。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listSkills } from "../../bin/plugins/skill/Action.js";

test("skill plugin action helper lists skills from plugin config roots", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-skill-plugin-action-"));
  const consoleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-skill-plugin-console-"));
  const skillRoot = path.join(projectRoot, ".local", "skills", "demo-skill");
  const previousConsoleRoot = process.env.DC_CONSOLE_ROOT;
  process.env.DC_CONSOLE_ROOT = consoleRoot;
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, "downcity.json"),
    `${JSON.stringify({
      name: "demo-agent",
      version: "1.0.0",
      execution: {
        type: "model",
        modelId: "default",
      },
      plugins: {
        skill: {
          paths: [".local/skills"],
          allowExternalPaths: false,
        },
      },
    }, null, 2)}\n`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(skillRoot, "SKILL.md"),
    `---
name: Demo Skill
description: local demo skill
---

# Demo Skill
`,
    "utf-8",
  );

  try {
    const result = listSkills(projectRoot);
    assert.equal(result.success, true);
    const target = result.skills.find((item) => item.id === "demo-skill");
    assert.notEqual(target, undefined);
    assert.equal(target?.name, "Demo Skill");
  } finally {
    if (previousConsoleRoot === undefined) delete process.env.DC_CONSOLE_ROOT;
    else process.env.DC_CONSOLE_ROOT = previousConsoleRoot;
    fs.rmSync(consoleRoot, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

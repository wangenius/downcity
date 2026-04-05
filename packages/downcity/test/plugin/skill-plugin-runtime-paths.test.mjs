/**
 * Skill plugin 辅助路径测试（node:test）。
 *
 * 关键点（中文）
 * - skill 已迁到 plugin 体系后，内部辅助实现仍应从 `plugins/skill@/city/runtime/console/*` 暴露。
 * - 同时验证 `plugins.skill.paths` 会参与 skill roots 解析。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { getClaudeSkillSearchRoots } from "../../bin/plugins/skill/runtime/Paths.js";

test("skill plugin paths include configured plugin roots", () => {
  const roots = getClaudeSkillSearchRoots("/tmp/demo-agent", {
    name: "demo-agent",
    version: "1.0.0",
    plugins: {
      skill: {
        paths: [".agents/skills", ".local/skills"],
        allowExternalPaths: false,
      },
    },
  });

  assert.deepEqual(
    roots.map((item) => item.display),
    [".agents/skills", ".local/skills", "~/.agents/skills"],
  );
});

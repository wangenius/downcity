/**
 * Skill plugin runtime helpers 测试（node:test）。
 *
 * 关键点（中文）
 * - skill 已迁到 plugin 体系后，runtime helper 也应该从 `plugins/skill/runtime/*` 暴露。
 * - 同时验证 `plugins.skill.paths` 会参与 skill roots 解析。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { getClaudeSkillSearchRoots } from "../../bin/plugins/skill/runtime/Paths.js";

test("skill plugin runtime paths include configured plugin roots", () => {
  const roots = getClaudeSkillSearchRoots("/tmp/demo-agent", {
    name: "demo-agent",
    version: "1.0.0",
    plugins: {
      skill: {
        enabled: true,
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

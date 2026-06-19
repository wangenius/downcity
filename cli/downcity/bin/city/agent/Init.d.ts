/**
 * `city agent create`：在目标目录生成最小可用的 Downcity 工程骨架与配置文件。
 *
 * 目标
 * - 生成 `PROFILE.md` / `SOUL.md` / `downcity.json` / `.downcity/` 目录结构与 schema 文件
 * - 通过交互式问题收集必要配置（模型、channels 等）
 *
 * 设计要点
 * - Chat channels 支持多选：仅写入用户选择的 channels（未选择的不出现在 `downcity.json`）
 * - 避免写入无意义的默认值：能省则省，保持配置简洁
 */
/**
 * init 命令入口。
 *
 * 流程（中文）
 * 1) 校验项目目录与覆盖策略
 * 2) 交互收集配置
 * 3) 生成配置与目录
 * 4) 生成最小可运行结构（skills 目录仅创建，不做自动同步/安装）
 */
export declare function initCommand(cwd?: string, options?: {
    force?: boolean;
}): Promise<void>;
//# sourceMappingURL=Init.d.ts.map
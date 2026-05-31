/**
 * `town model` 交互式管理器。
 *
 * 关键点（中文）
 * - 裸 `town model` 在交互式终端里进入这里，而不是直接丢给静态 help。
 * - 保留原有脚本化子命令不变，只把高频的人类操作收敛成轻量 manager。
 * - 现在补齐查看、编辑、删除、测试、暂停、绑定、创建这几类高频动作。
 */
/**
 * 运行 `town model` 交互式管理器。
 */
export declare function runInteractiveModelManager(): Promise<void>;
//# sourceMappingURL=ModelManager.d.ts.map
/**
 * `city config alias`：向 shell rc 文件写入 City/City 的便捷 alias。
 *
 * 关键点（中文）
 * - 通过标记块（start/end）实现幂等更新。
 * - 支持 zsh/bash 与 dry-run。
 */
/**
 * alias 命令参数。
 */
interface AliasOptions {
    shell?: string;
    dryRun?: boolean;
    print?: boolean;
}
/**
 * 写入 alias 到目标 shell rc 文件。
 */
export declare function aliasCommand(options?: AliasOptions): Promise<void>;
export {};
//# sourceMappingURL=Alias.d.ts.map
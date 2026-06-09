/**
 * `city create` 命令实现。
 *
 * 关键点（中文）
 * - 从零搭建一个可部署的 City 项目，而不是让用户手写底层部署文件。
 * - Git URL 只在 create 阶段 clone 到本地；deploy 阶段只处理本地项目。
 * - `city.json` 只写项目类型和部署目标，其他文件由 CLI 生成。
 * - 当前先生成 Cloudflare Workers 项目骨架，后续可扩展更多 target。
 */
/** Commander 传入的 create 选项。 */
export interface CityCreateCommandOptions {
    /** 是否强制覆盖已有文件。 */
    force?: boolean;
}
/**
 * 创建 City 项目。
 */
export declare function createCityProject(dir?: string, options?: CityCreateCommandOptions): Promise<void>;
//# sourceMappingURL=create.d.ts.map
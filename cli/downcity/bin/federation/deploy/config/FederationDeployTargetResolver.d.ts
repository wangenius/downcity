/**
 * City 部署目标解析器。
 *
 * 关键点（中文）
 * - `city deploy` 默认部署当前目录。
 * - `city deploy` 只处理本地目录；远程仓库应先通过 `city create <git-url>` 拉到本地。
 * - 部署命令不承担项目获取职责，避免部署状态没有明确归属。
 */
import type { FederationDeployTarget } from "../../../federation/types/FederationProjectConfig.js";
/**
 * 解析部署目标。
 */
export declare function resolveFederationDeployTarget(source: string | undefined): Promise<FederationDeployTarget>;
//# sourceMappingURL=FederationDeployTargetResolver.d.ts.map
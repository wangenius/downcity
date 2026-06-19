/**
 * `city init`：初始化平台级默认配置（`~/.downcity/`）。
 *
 * 生成内容
 * - `~/.downcity/schema/downcity.schema.json`：给项目 downcity.json 的 schema（可选）
 *
 * 关键点（中文）
 * - City runtime是强依赖：`city start` + `city agent start` 都会使用这里的默认配置。
 * - 平台级配置不再使用 `~/.downcity/downcity.json` 和 `~/.downcity/.env`。
 * - agent 项目内 `downcity.json/.env` 仍保持项目级配置职责。
 */
/**
 * 平台初始化入口。
 */
export declare function gatewayInitCommand(): Promise<void>;
//# sourceMappingURL=GatewayInit.d.ts.map
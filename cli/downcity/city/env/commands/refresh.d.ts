/**
 * City env runtime cache 刷新命令。
 *
 * 关键说明（中文）
 * - 这个命令只负责脚本化调用当前 active City 的 env refresh。
 * - 真正刷新逻辑位于 City SDK 与服务端 EnvService，CLI 不复制业务规则。
 */
/**
 * 刷新当前 active City 的 runtime env cache。
 */
export declare function refreshEnvCache(): Promise<void>;
//# sourceMappingURL=refresh.d.ts.map
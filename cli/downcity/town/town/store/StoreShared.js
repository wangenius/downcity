/**
 * PlatformStore 共享内部工具。
 *
 * 关键点（中文）
 * - 这里只放 `PlatformStore` 内部多个子模块共用的类型与纯函数。
 * - 对外不暴露业务语义，只服务 `utils/store/*` 内部实现。
 */
/**
 * 返回当前时间的 ISO 字符串。
 */
export function nowIso() {
    return new Date().toISOString();
}
/**
 * 归一化非空文本。
 */
export function normalizeNonEmptyText(value, fieldName) {
    const normalized = String(value || "").trim();
    if (!normalized)
        throw new Error(`${fieldName} cannot be empty`);
    return normalized;
}
/**
 * 把字符串裁剪为可选文本。
 */
export function optionalTrimmedText(value) {
    const normalized = String(value || "").trim();
    return normalized || undefined;
}
/**
 * 规范化 chat account 的平台字段。
 */
export function normalizeChannelAccountChannel(input) {
    const channel = String(input || "").trim().toLowerCase();
    if (channel === "telegram" || channel === "feishu" || channel === "qq") {
        return channel;
    }
    throw new Error(`Unsupported chat account platform: ${input}`);
}
//# sourceMappingURL=StoreShared.js.map
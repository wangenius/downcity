/**
 * 重置缓存密钥。
 *
 * 关键点（中文）
 * - 仅在迁移阶段替换 key 文件后调用，确保后续解密重新从磁盘加载最新 key。
 */
export declare function resetModelDbKeyCache(): void;
/**
 * 同步加密字符串（用于同步配置读取链路）。
 */
export declare function encryptTextSync(plainText: string): string;
/**
 * 同步解密字符串（用于同步配置读取链路）。
 */
export declare function decryptTextSync(cipherText: string): string;
/**
 * 加密字符串。
 */
export declare function encryptText(plainText: string): Promise<string>;
/**
 * 解密字符串。
 */
export declare function decryptText(cipherText: string): Promise<string>;
//# sourceMappingURL=crypto.d.ts.map
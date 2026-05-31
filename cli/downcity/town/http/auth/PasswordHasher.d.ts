/**
 * 密码哈希工具。
 *
 * 关键点（中文）
 * - V1 先使用 Node 内建 `scryptSync`，避免引入额外依赖。
 * - 存储格式固定为 `scrypt$<salt>$<hash>`，便于后续平滑升级。
 */
/**
 * 哈希密码。
 */
export declare function hashPassword(passwordInput: string): string;
/**
 * 校验密码。
 */
export declare function verifyPassword(passwordInput: string, passwordHashInput: string): boolean;
//# sourceMappingURL=PasswordHasher.d.ts.map
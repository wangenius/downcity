/**
 * gateway 公网访问提示解析。
 *
 * 关键点（中文）
 * - 优先使用用户显式声明的公网地址，避免 NAT / 反向代理场景误判。
 * - 仅在显式公网模式或 host 本身就是可直连地址时，才生成 Public URL。
 * - 自动探测只做“最佳努力”，不会为了猜公网 IP 访问外部网络。
 */
import os from "node:os";
/**
 * 从网卡列表中提取首个公网 IPv4。
 */
export declare function detectPublicIpv4FromInterfaces(interfaces?: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string | null;
/**
 * 解析 gateway 对外可访问地址。
 */
export declare function resolveGatewayPublicUrl(params: {
    bindHost: string;
    port: number;
    publicMode?: boolean;
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    detectedPublicIp?: string | null;
}): string | null;
//# sourceMappingURL=PublicAccess.d.ts.map
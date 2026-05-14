/**
 * Console Channel Account 服务兼容导出。
 *
 * 关键点（中文）
 * - channel account 的业务实现归属 chat service。
 * - console 路由继续从这里导入，避免 API 层感知内部迁移。
 */

export { ChatChannelAccountService as ChannelAccountService } from "@services/chat/accounts/ChannelAccountService.js";

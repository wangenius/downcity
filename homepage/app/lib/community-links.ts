/**
 * 社区入口常量模块。
 * 说明：
 * 1. 把面对用户的社区链接集中管理，避免导航、资源页与社区页各自写不同出口。
 * 2. 当前统一以 Telegram 社区群组作为“讨论”主入口。
 */
export const COMMUNITY_LINKS = {
  telegram: "https://t.me/+iozIHyXr-BJhNjE1",
} as const;

export default COMMUNITY_LINKS;

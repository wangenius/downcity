/**
 * Chat Access 交互管理器类型。
 */

/** Agent Chat Access 菜单选择结果。 */
export type ChatAccessManagerSelection =
  | {
      /** 进入待处理请求列表。 */
      type: "pending";
    }
  | {
      /** 查看所有已观测主体。 */
      type: "principals";
    }
  | {
      /** 返回 Chat 管理器。 */
      type: "back";
    };

/** 待处理请求操作。 */
export type ChatAccessRequestAction =
  | "approve_scope"
  | "approve_all"
  | "deny_scope"
  | "back";

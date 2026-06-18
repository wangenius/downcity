/**
 * `town chat` 交互式 manager 类型。
 */

/**
 * Chat 账号列表入口的选择结果。
 */
export type ChatManagerListSelection =
  | {
      /** 选择类型：进入某个 Chat 账号。 */
      type: "account";

      /** 目标 Chat 账号 ID。 */
      account_id: string;
    }
  | {
      /** 选择类型：新增 Chat 账号。 */
      type: "add";
    }
  | {
      /** 选择类型：进入全局访问控制。 */
      type: "access";
    }
  | {
      /** 选择类型：退出 Chat 管理器。 */
      type: "exit";
    };

export type ChatAccountAction =
  | "edit"
  | "remove"
  | "back";

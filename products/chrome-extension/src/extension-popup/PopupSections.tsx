/**
 * Popup 展示区块组件。
 *
 * 关键点（中文）：
 * - 只承载无状态展示，主 App 继续负责数据加载与发送流程。
 * - 把页面信息和发送历史从主文件拆出，控制 Popup 模块复杂度。
 */

import type {
  ActiveTabContext,
  ExtensionPageSendRecord,
  ExtensionServerConnection,
  ExtensionRouteTargetMode,
} from "../types/extension";
import { formatHistoryTime, shortenUrl } from "./helpers";
import { ExtensionPopupSelect } from "./ExtensionPopupSelect";
import type { ExtensionSelectOption } from "../types/ExtensionSelect";
import { formatServerConnectionLabel } from "../services/serverConnection";

/**
 * 当前页面信息区块。
 */
export function PopupCurrentPageSection(props: {
  /**
   * 当前活动标签页。
   */
  tab: ActiveTabContext;
}) {
  return (
    <section className="border-b border-border px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Current Page
      </div>
      <div className="mt-1 text-[13px] font-medium text-foreground">
        {props.tab.title}
      </div>
      <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
        {shortenUrl(props.tab.url)}
      </div>
    </section>
  );
}

/**
 * Popup 顶部连接区块。
 */
export function PopupHeaderSection(props: {
  /**
   * 当前连接 id。
   */
  selectedConnectionId: string;
  /**
   * 连接选项。
   */
  connectionOptions: ExtensionSelectOption[];
  /**
   * 当前连接。
   */
  selectedConnection: ExtensionServerConnection | null;
  /**
   * 当前目标模式。
   */
  targetMode: ExtensionRouteTargetMode;
  /**
   * 是否正在初始化鉴权。
   */
  authInitializing: boolean;
  /**
   * 选择连接回调。
   */
  onSelectConnection: (connectionId: string) => void;
  /**
   * 打开侧栏回调。
   */
  onOpenSidePanel: () => void;
  /**
   * 打开设置回调。
   */
  onOpenSettings: () => void;
  /**
   * 顶部文本按钮样式。
   */
  textButtonClassName: string;
}) {
  return (
    <header className="border-b border-border bg-surface px-4 pb-3 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Downcity
          </div>
          <h1 className="mt-1 text-[18px] font-medium tracking-[-0.02em] text-foreground">
            Web Share
          </h1>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            把当前网页作为 Markdown 附件发送到指定 Agent Session。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className={props.textButtonClassName}
            onClick={props.onOpenSidePanel}
          >
            侧栏
          </button>
          <button
            type="button"
            className={props.textButtonClassName}
            onClick={props.onOpenSettings}
          >
            设置
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <ExtensionPopupSelect
          label="Town"
          value={props.selectedConnectionId}
          placeholder="请先到设置页检查 Town"
          options={props.connectionOptions}
          onChange={props.onSelectConnection}
          disabled={props.connectionOptions.length === 0 || props.authInitializing}
        />

        <div className="rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[11px] text-muted-foreground">
          {props.selectedConnection
            ? formatServerConnectionLabel(props.selectedConnection)
            : "当前没有可用连接"}
        </div>
        <div className="rounded-[12px] border border-border bg-background px-3 py-2.5 text-[11px] text-muted-foreground">
          {props.targetMode === "agent_session"
            ? "默认使用独立 Chrome Agent Session。"
            : "当前为 IM 转发模式；发送结果会回到目标平台会话。"}
        </div>
      </div>
    </header>
  );
}

/**
 * 当前页面发送历史区块。
 */
export function PopupPageHistorySection(props: {
  /**
   * 当前页面发送历史。
   */
  pageHistory: ExtensionPageSendRecord[];
}) {
  return (
    <section className="border-t border-border bg-surface px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        History
      </div>
      <div className="mt-2 grid gap-2">
        {props.pageHistory.length > 0 ? (
          props.pageHistory.map((item) => (
            <div
              key={item.id}
              className="rounded-[12px] border border-border bg-background px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[12px] font-medium text-foreground">
                  {item.taskPrompt || "未命名请求"}
                </div>
                <div className="shrink-0 text-[10px] text-muted-foreground">
                  {formatHistoryTime(item.sentAt)}
                </div>
              </div>
              <div className="mt-1 truncate text-[10px] text-muted-foreground">
                {item.attachmentFileName}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[12px] border border-dashed border-border bg-background px-3 py-3 text-[11px] text-muted-foreground">
            当前页面在这个连接下还没有发送记录。
          </div>
        )}
      </div>
    </section>
  );
}

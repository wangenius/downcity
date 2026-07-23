/**
 * `@downcity/plugins/web` 独立公开入口。
 *
 * 关键点（中文）：只汇总 WebPlugin 及其安装指引 action 协议。
 */

export { WebPlugin } from "./web/Plugin.js";
export {
  WEB_PLUGIN_ACTIONS,
} from "./web/types/WebPlugin.js";
export type {
  WebPluginInstallInstructions,
  WebPluginInstallPayload,
  WebPluginInstallScope,
  WebPluginInstallTarget,
} from "./web/types/WebPlugin.js";

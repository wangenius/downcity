/**
 * Web Plugin 兼容导出层。
 *
 * 关键点（中文）
 * - `web` plugin 只保留薄适配层。
 * - 真正的联网/浏览器能力由外部 provider 项目负责。
 */

export {
  readWebPluginConfig,
  writeWebPluginConfig,
} from "@/plugins/web/runtime/Config.js";
export {
  inspectWebPluginDependency,
  installWebPluginDependency,
  doctorWebPluginDependency,
} from "@/plugins/web/runtime/Source.js";

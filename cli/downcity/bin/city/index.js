#!/usr/bin/env node
/**
 * downcity 聚合包中的 city 命令入口。
 *
 * 关键点（中文）：`downcity` 是唯一对外安装包，city runtime 构建产物
 * 会在发布前复制到本包内部，避免泄漏内部 workspace 包名。
 */
import "../../city-cli/index.js";

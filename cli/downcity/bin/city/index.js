#!/usr/bin/env node
/**
 * downcity 聚合包中的 city 命令入口。
 *
 * 关键点（中文）：npm 全局安装依赖包时不一定稳定暴露依赖包 bin，
 * 因此聚合包自己声明 bin，并显式转发到 @downcity/city-cli。
 */
import "@downcity/city-cli/bin/city/index.js";

#!/usr/bin/env node
/**
 * studio 命令入口。
 *
 * 关键点（中文）：studio 是本机 Agent 宿主产品。当前实现复用
 * @downcity/city-cli 中已构建的内部 studio runtime，后续可以继续把
 * studio 专属源码物理收敛到 cli/studio/src。
 */
import "@downcity/city-cli/bin/studio/index.js";

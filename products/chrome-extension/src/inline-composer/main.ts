/**
 * Inline Composer 入口。
 *
 * 关键点（中文）：
 * - 通过 TypeScript 入口启动页内发送 UI。
 * - 避免继续维护 `public/` 下的独立脚本副本。
 */

import { bootstrapInlineComposer } from "./ui";

bootstrapInlineComposer();

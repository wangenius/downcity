/**
 * Admin City 说明文档查看命令。
 */

import { City } from "@downcity/city";
import type { admin_tui_runtime } from "../../types/AdminTui.js";

/**
 * 展示当前 City 聚合后的说明文档。
 */
export async function manageInstruction(
  a: City,
  _baseUrl: string,
  runtime: admin_tui_runtime,
): Promise<void> {
  const content = await runtime.with_loading("City Instruction", async () => await a.instruction());
  await runtime.show_text("City Instruction", content);
}

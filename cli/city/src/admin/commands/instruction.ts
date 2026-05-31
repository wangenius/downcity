/**
 * Admin City 说明文档查看命令。
 */

import { AdminClient } from "@downcity/city";

/**
 * 展示当前 City 聚合后的说明文档。
 */
export async function manageInstruction(a: AdminClient): Promise<void> {
  console.log(`\n${await a.instruction()}\n`);
}

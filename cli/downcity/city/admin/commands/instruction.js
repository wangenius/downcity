/**
 * Admin City 说明文档查看命令。
 */
/**
 * 展示当前 City 聚合后的说明文档。
 */
export async function manageInstruction(a, _baseUrl, runtime) {
    const content = await runtime.with_loading("City Instruction", async () => await a.instruction());
    await runtime.show_text("City Instruction", content);
}
//# sourceMappingURL=instruction.js.map
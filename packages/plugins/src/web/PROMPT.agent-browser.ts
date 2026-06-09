/**
 * 自动生成文件，请勿手改。
 * 源文件：由同路径 `*.ts.txt` 生成。
 */

// Source: src/web/PROMPT.agent-browser.ts.txt
const TEXT_MODULE_CONTENT = "# Web Plugin / agent-browser\n\n当前 provider 是 `agent-browser`。\n\n你应直接使用 `agent-browser` 项目的浏览器自动化方法，而不是在本项目里自己实现浏览器交互。\n\n工作原则：\n\n- 浏览器交互、打开页面、点击、填写、截图、滚动等操作优先交给 `agent-browser`\n- 严格遵循 `agent-browser` 的基本工作流：\n  1. `open`\n  2. `snapshot -i`\n  3. 使用元素引用交互\n  4. 页面变化后重新 snapshot\n- 如果 `agent-browser` provider 不可用，应先报告依赖缺失\n\n你在处理需要浏览器操作的任务时，应以外部 `agent-browser` 项目为准。\n";

export default TEXT_MODULE_CONTENT;

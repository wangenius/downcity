/**
 * 自动生成文件，请勿手改。
 * 源文件：由同路径 `*.ts.txt` 生成。
 */

// Source: src/web/PROMPT.ts.txt
const TEXT_MODULE_CONTENT = "# Web Plugin\n\n此 plugin 主要注入通用联网方法论。它不选择 provider，也不保证某个具体联网工具一定存在。\n\n如果需要准备联网相关依赖，可以通过 `web` plugin 的 `install` action 安装 `web-access`、`agent-browser` 等 skill / CLI 依赖。安装只负责准备能力，不表示运行时必须使用某个 provider。\n\n当任务需要联网、查证、阅读网页、操作网页或使用浏览器时，先根据当前可用 tools、skills 与用户目标选择合适路径。\n\n## 总原则\n\n- 目标驱动：像人一样思考，先定义成功标准，再选择最可能直达的起点。\n- 过程校验：每一步结果都是证据。路径不推进时，及时切换方法，不在错误方式上反复重试。\n- 一手来源优先：搜索引擎用于发现线索，结论尽量回到官网、官方平台、原始页面、官方文档或源码。\n- 完成即停止：达到目标后不要为了“看起来更完整”继续消耗额外步骤。\n- 能力自检：不要假设某个联网 skill/tool 一定存在；优先使用当前 system、tool 列表和已 lookup 的 skill 中明确可用的能力。\n\n## 工具选择\n\n- 需要发现信息来源、查关键词脉络：优先使用当前可用的搜索类工具或 web-access 类 skill。\n- 已知 URL，需要定向提取页面正文或答案：优先使用当前可用的 fetch/read 类工具。\n- 已知 URL，需要原始 HTML、meta、JSON-LD 等结构化内容：优先使用当前可用的 HTTP/curl/shell 能力。\n- 需要登录态、动态渲染、站内导航、复杂交互或反爬站点：优先使用当前可用的浏览器、Chrome、agent-browser 或 computer-use 类能力。\n- 页面正文导向内容可优先考虑 Jina 类 markdown 预处理，以节省 token；但数据面板、商品页、复杂布局页面不要盲信预处理结果\n\n## 浏览器策略\n\n- 进入浏览器层后，先理解页面结构，再决定下一步动作\n- 程序化手段快但更容易触发反爬；GUI 交互更慢但确定性更高。程序化受阻时，回退到 GUI\n- 优先使用页面自身生成的链接，不要手工猜测或裁剪站内 URL 参数\n- 只操作自己创建的标签页，不打扰用户已有标签页；任务结束后关闭自己创建的标签页\n- 遇到登录墙时，先判断它是否真的阻挡目标；只有目标确实拿不到时再要求用户登录\n\n## 并行与核实\n\n- 多个独立调研目标可并行拆分；有依赖关系的目标不要盲目并行\n- 核实类任务要回到一手来源，不要用多个二手报道互相循环印证\n\n## 与 skills/tools 的关系\n\n- 如果当前环境有 `web-access` skill，联网搜索、网页抓取与资料核实任务可以优先参考它的说明。\n- 如果当前环境有 `agent-browser`、browser 或 Chrome 能力，动态页面与登录态任务可以优先使用它们。\n- 如果缺少必要联网能力，直接说明缺失能力，不要假装已经联网。\n\n## 可用 action\n\n- `install`：准备联网相关 skill / CLI 依赖。\n\n调用示例：\n\n```ts\nplugin_call({\n  plugin: \"web\",\n  action: \"install\",\n  payload: {\n    target: \"agent-browser\",\n    scope: \"user\",\n  },\n});\n```\n";

export default TEXT_MODULE_CONTENT;

# ShipMyAgent Chrome Extension

这个目录下是一个可直接加载到 Chrome 的插件，用于：

1. 获取当前网页标题与 URL。
2. 提取当前页面正文并转换成 Markdown 文档。
3. 选择目标 ShipMyAgent Agent。
4. 以 API 附件方式把 Markdown 文档发送给 Agent 执行。
5. 投递成功后关闭插件窗口。

## 技术栈

- React 18
- TypeScript 5.6
- Vite 5
- Chrome Extension Manifest V3

## 目录结构

```txt
chrome-extension/
├─ public/
│  └─ manifest.json
├─ src/
│  ├─ popup/
│  │  ├─ App.tsx
│  │  ├─ main.tsx
│  │  └─ styles.css
│  ├─ services/
│  │  ├─ pageMarkdown.ts
│  │  ├─ shipmyagentApi.ts
│  │  ├─ storage.ts
│  │  └─ tab.ts
│  └─ types/
│     ├─ api.ts
│     └─ extension.ts
├─ index.html
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

## 本地开发

```bash
cd chrome-extension
npm install
npm run dev
```

`npm run dev` 会持续构建到 `chrome-extension/dist`。

## 在 Chrome 中加载

1. 打开 `chrome://extensions`
2. 打开右上角 `开发者模式`
3. 点击 `加载已解压的扩展程序`
4. 选择 `chrome-extension/dist` 目录

## 使用说明

1. 确保本地 Console/Agent 已启动：
   - `sma console start`
   - `sma console ui start --port 5315`
   - `sma agent start`
2. 打开任意网页，点击插件图标。
3. 在插件中选择：
   - 目标 Console（IP + 端口）
   - 目标 Agent
   - 目标 chatKey（自动从该 Agent 的历史上下文发现）
4. 填写任务说明并点击 `发送到 Agent`。

执行流程：

- 先抓取当前页面正文并生成 Markdown 文档（best-effort）。
- 再调用 `POST /api/tui/contexts/<chatKey>/execute?agent=<agentId>`。
- Markdown 会通过 `attachments` 字段上传，runtime 会落盘并注入 `@attach` 指令给 Agent。
- 投递成功后立即关闭 popup，结果在当前选中的 chatKey 会话查看。

## 设计变更说明

- Console 地址默认：`127.0.0.1:5315`，也可在插件中修改
- 支持在插件内自定义目标 Console 的 IP 与端口（用于远端/局域网 Agent）
- `chatKey` 不再手填，改为下拉选择
- 发送策略改为“投递即关闭”，不在插件内等待执行完成

## 注意事项

- 插件会使用 `chrome.storage.sync` 保存最近一次选择。
- `chatKey` 列表来自该 Agent 的历史上下文；如果没有可选项，请先让聊天渠道产生过消息。

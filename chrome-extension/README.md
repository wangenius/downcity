# Downcity Chrome Extension

这个目录下是一个可直接加载到 Chrome 的插件，用于：

1. 获取当前网页标题与 URL。
2. 提取当前页面正文并转换成 Markdown 文档。
3. 选择目标 Downcity Agent。
4. 以 API 附件方式把 Markdown 文档发送给 Agent 执行。
5. 投递成功后关闭插件窗口。
6. 在网页内选中文本后，可通过 hoverbar 的消息按钮或 `Cmd/Ctrl + U` 打开选区附近输入框并发送到 Agent；点击扩展图标则打开插件 popup。

## 技术栈

- React 18
- TypeScript 5.6
- Vite 5
- Tailwind CSS v4（popup / options / content-script 样式资源）
- Chrome Extension Manifest V3

说明：

- `popup` 与 `options` 页面直接使用 Tailwind v4。
- 页面内选区输入面板仍由 `public/content-script.js` 驱动，但其 Shadow DOM 样式已改为加载构建产物 `content-script.css`。
- 这样既能统一 Tailwind 主题，又能继续保证宿主网页样式隔离。

## 目录结构

```txt
chrome-extension/
├─ public/
│  ├─ manifest.json
│  └─ content-script.js
├─ src/
│  ├─ popup/
│  │  ├─ App.tsx
│  │  ├─ main.tsx
│  ├─ options/
│  │  ├─ App.tsx
│  │  └─ main.tsx
│  ├─ content-script/
│  │  └─ content-script.css
│  ├─ styles/
│  │  └─ tailwind.css
│  ├─ services/
│  │  ├─ pageMarkdown.ts
│  │  ├─ downcityApi.ts
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

`npm run dev` 会持续构建到 `chrome-extension/dist`，其中会同时产出：

- popup 页面
- options 页面
- `content-script.css`（供 Shadow DOM 引入）

如果只想做纯编译：

```bash
npm run build:bundle
```

如果执行发布式构建：

```bash
npm run build
# 或
npm run build:release
```

会复用仓库根目录的 `scripts/extbuild.sh`，并在构建前自动把 extension 的 `package.json` 与 `public/manifest.json` 版本号一起提升一个 patch。

在仓库根目录也可以直接执行：

```bash
npm run build:extension
```

## 在 Chrome 中加载

1. 打开 `chrome://extensions`
2. 打开右上角 `开发者模式`
3. 点击 `加载已解压的扩展程序`
4. 选择 `chrome-extension/dist` 目录

## 使用说明

1. 确保本地 Console/Agent 已启动：
   - `city console start`
   - `city console ui start --port 5315`
   - `city agent start`
2. 点击扩展图标，使用插件 popup 完成发送（在图标处打开弹窗）。
3. 若在页面内使用选区模式：选中文本后点击选区右下角消息按钮，或按 `Cmd/Ctrl + U`，输入框会在选区左下角展开。
4. popup 中可从 `Ask 历史` 下拉快速回填最近提问，再按 `Cmd/Ctrl + Enter` 或点击发送。

## 页面内快捷发送（新）

加载插件后，在任意网页：

1. 先选中页面中的文本内容。
2. 选区右下角会出现消息按钮，点击后会在选区左下角展开输入框（不再贴底部）。
3. 点击浏览器扩展图标会打开插件 popup；按 `Cmd/Ctrl + U` 可直接打开页面内输入框。
4. 不再单独展示引用 `tag`，直接以当前选区作为发送上下文。
5. 输入 `/` 可唤起历史提问菜单（来自最近 ask 记录，`↑/↓ + Enter` 或点击插入）。
6. 输入需求后按 `Cmd/Ctrl + Enter` 或点击发送按钮提交（`Enter` 换行）。
7. 按 `Esc` 关闭输入框。
8. 若当前没有选区，发送时会自动按页面全文模式投递。

执行流程：

- 先抓取当前页面正文并生成 Markdown 文档（best-effort）。
- 再调用 `POST /api/tui/contexts/<chatKey>/execute?agent=<agentId>`。
- Markdown 会通过 `attachments` 字段上传，runtime 会落盘并注入 `@attach` 指令给 Agent。
- 投递成功后立即关闭页面输入面板，结果在当前选中的 chatKey 会话查看。

## 设计变更说明

- Console 地址默认：`127.0.0.1:5315`，也可在插件中修改
- 支持在插件内自定义目标 Console 的 IP 与端口（用于远端/局域网 Agent）
- `chatKey` 不再手填，改为下拉选择
- 发送策略改为“投递即关闭”，不在插件内等待执行完成

## 注意事项

- 插件会使用 `chrome.storage.sync` 保存最近一次选择。
- `chatKey` 列表来自该 Agent 的历史上下文；如果没有可选项，请先让聊天渠道产生过消息。

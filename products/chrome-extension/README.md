# Downcity Chrome Extension

这个目录下是一个可直接加载到 Chrome 的插件，用于：

1. 获取当前网页标题与 URL。
2. 提取当前页面正文并转换成 Markdown 文档。
3. 选择目标 Downcity Agent。
4. 以 API 附件方式把 Markdown 文档发送给 Agent 执行。
5. 投递成功后关闭插件窗口。
6. 在网页内选中文本后，可通过 hoverbar 的消息按钮或 `Cmd/Ctrl + U` 打开选区附近的 Inline Composer 并发送到 Agent；点击扩展图标则打开 Extension Popup。

## 技术栈

- React 18
- TypeScript 5.6
- Vite 5
- Tailwind CSS v4（Extension Popup / options / Inline Composer 样式资源）
- Chrome Extension Manifest V3

说明：

- `extension-popup` 与 `options` 页面直接使用 Tailwind v4。
- 页面内选区输入面板现在也走 `src/inline-composer/` 下的 TypeScript 构建入口。
- Shadow DOM 样式继续加载构建产物 `content-script.css`，既能统一 Tailwind 主题，又能保证宿主网页样式隔离。

## 目录结构

```txt
products/chrome-extension/
├─ public/
│  └─ manifest.json
├─ src/
│  ├─ inline-composer/
│  │  ├─ main.ts
│  │  ├─ ui.ts
│  │  ├─ route.ts
│  │  ├─ pageContext.ts
│  │  └─ content-script.css
│  ├─ extension-popup/
│  │  ├─ App.tsx
│  │  ├─ main.tsx
│  ├─ options/
│  │  ├─ App.tsx
│  │  └─ main.tsx
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
cd products/chrome-extension
npm install
npm run dev
```

`npm run dev` 会持续构建到 `products/chrome-extension/dist`，其中会同时产出：

- Extension Popup 页面
- options 页面
- `content-script.js`（由 `src/inline-composer/main.ts` 构建产出）
- `content-script.css`（供 Shadow DOM 引入）

如果执行构建：

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
4. 选择 `products/chrome-extension/dist` 目录

## 使用说明

1. 确保本地 Console/Agent 已启动：
   - `city console start`
   - `city console ui start --port 5315`
   - `city agent start`
2. 点击扩展图标，使用 Extension Popup 完成发送（在图标处打开扩展弹窗）。
3. 若在页面内使用选区模式：选中文本后点击选区右下角消息按钮，或按 `Cmd/Ctrl + U`，输入框会在选区左下角展开。
4. Extension Popup 只保留输入框、发送按钮、本页发送历史和设置按钮；再按 `Cmd/Ctrl + Enter` 或点击发送。

## 页面内快捷发送（新）

加载插件后，在任意网页：

1. 先选中页面中的文本内容。
2. 选区右下角会出现消息按钮，点击后会在选区左下角展开输入框（不再贴底部）。
3. 点击浏览器扩展图标会打开 Extension Popup；按 `Cmd/Ctrl + U` 可直接打开页内输入框（Inline Composer）。
4. 不再单独展示引用 `tag`，直接以当前选区作为发送上下文。
5. 输入 `/` 可唤起历史提问菜单（来自最近 ask 记录，`↑/↓ + Enter` 或点击插入）。
6. 输入需求后按 `Cmd/Ctrl + Enter` 或点击发送按钮提交（`Enter` 换行）。
7. 按 `Esc` 关闭输入框。
8. 若当前没有选区，发送时会自动按页面全文模式投递。

执行流程：

- 先抓取当前页面正文并生成 Markdown 文档（best-effort）。
- 全页模式会优先挑选质量最高的 `main/article` 主体区块；若存在多个强相关主体区块，会合并输出。
- 页面图片会尽量从 `currentSrc/src/srcset/data-*` 中解析真实地址，并在整页快照中附带图片引用。
- 再调用 `POST /api/dashboard/contexts/<chatKey>/execute?agent=<agentId>`。
- Markdown 会通过 `attachments` 字段上传，runtime 会落盘并注入 `<file>` 标签给 Agent。
- 投递成功后立即关闭页面输入面板，结果在当前选中的 chatKey 会话查看。

## 设计变更说明

- Console 地址默认：`127.0.0.1:5315`，也可在插件中修改
- 支持在插件内自定义目标 Console 的 IP 与端口（用于远端/局域网 Agent）
- `chatKey` 不再手填，改为下拉选择
- 发送策略改为“投递即关闭”，不在插件内等待执行完成

## 注意事项

- 插件会使用 `chrome.storage.sync` 保存最近一次选择。
- `chatKey` 列表来自该 Agent 的历史上下文；如果没有可选项，请先让聊天渠道产生过消息。

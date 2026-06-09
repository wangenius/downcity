# Downcity Chrome Extension

Chrome 扩展现在提供三类能力：

1. 读取当前网页标题、URL 和正文。
2. 在 Chrome 右侧 Side Panel 中和 Agent 持续对话。
3. 以 Markdown 附件的形式，把页面发送给选定 Agent。

## 当前产品形态

- 设置页只配置 `Town URL`、`Agent`、`Default Ask`
- 默认连接本机 `http://127.0.0.1:5314`
- 如果 Town 需要鉴权，设置页会显示 `Town Token`
- Popup 可以把当前网页发送给默认 Agent
- 支持 Chrome Side Panel 常驻对话
- 页面选中文本旁会显示轻量 `引用` 浮层，点击后把选区插入 Side Panel 输入框
- 已移除 `Inline Composer`；content script 只负责页面选区引用浮层

## 技术栈

- React 18
- TypeScript 5.6
- Vite 5
- Tailwind CSS v4
- Chrome Extension Manifest V3

## 目录结构

```txt
products/chrome-extension/
├─ public/
│  └─ manifest.json
├─ src/
  │  ├─ extension-popup/
  │  │  ├─ App.tsx
  │  │  ├─ ExtensionPopupSelect.tsx
  │  │  └─ main.tsx
  │  ├─ side-panel/
  │  │  ├─ App.tsx
  │  │  ├─ Composer.tsx
  │  │  ├─ MarkdownMessage.tsx
  │  │  └─ main.tsx
│  ├─ options/
│  │  ├─ App.tsx
│  │  └─ main.tsx
│  ├─ services/
  │  │  ├─ agentSession.ts
  │  │  ├─ auth.ts
│  │  ├─ chatRouting.ts
│  │  ├─ downcityApi.ts
│  │  ├─ pageMarkdown.ts
│  │  ├─ remoteAgentClient.ts
│  │  ├─ serverConnection.ts
│  │  ├─ storage.ts
│  │  └─ tab.ts
│  ├─ page-selection.ts
│  ├─ styles/
│  │  └─ tailwind.css
│  └─ types/
│     ├─ api.ts
│     ├─ extension.ts
│     ├─ sidePanel.ts
│     └─ ExtensionSelect.ts
  ├─ index.html
  ├─ options.html
  ├─ sidepanel.html
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

`npm run dev` 会持续构建到 `products/chrome-extension/dist`。

如果执行正式构建：

```bash
npm run build
# 或
npm run build:release
```

构建脚本会先把 `package.json` 与 `public/manifest.json` 的版本号同步提升一个 patch，再执行类型检查和打包。

## 在 Chrome 中加载

1. 打开 `chrome://extensions`
2. 打开右上角 `开发者模式`
3. 点击 `加载已解压的扩展程序`
4. 选择 `products/chrome-extension/dist`

## 使用说明

1. 先启动 Town 和 Agent。
2. 打开扩展设置页，确认 `Town URL`。本机默认是 `http://127.0.0.1:5314`。
3. 选择默认 `Agent`，填写 `Default Ask`。
4. 点击 `保存并检查`。
5. 点击浏览器扩展图标，在 Popup 中确认 Agent、输入 Ask 并发送。
6. 在 Popup 中点击 `侧栏`，打开 Chrome Side Panel 进行常驻对话。
7. 在网页正文中选中文本，点击选区旁的 `引用`，选中文本会作为输入框内的引用胶囊插入 Side Panel。

如果目标是远程服务器，还要确认 Console 已对外监听：

```bash
town start --public
```

或者把公网监听持久化下来：

```bash
town public on
```

需要恢复成仅本机监听时：

```bash
town public off
```

## 说明

- 发送历史按“当前页面 + 当前 Town”隔离保存。
- 扩展会自动维护稳定的浏览器对话 session。
- Popup 不等待完整执行结果；Side Panel 会订阅 Agent 事件并显示回复。

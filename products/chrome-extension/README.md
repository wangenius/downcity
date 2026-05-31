# Downcity Chrome Extension

Chrome 扩展现在只保留两类能力：

1. 读取当前网页标题、URL 和正文。
2. 以 Markdown 附件的形式，把页面发送到指定的 Downcity Server / Agent / Session。

## 当前产品形态

- 支持创建多个 `Server Connection`
- 不同连接之间可以在 Popup 中快速切换
- 每个连接独立保存自己的 Bearer Token
- 每个连接独立保存默认 `Agent / Session`
- 每个连接支持单独配置 `protocol / host / port / basePath`
- 已移除 `Inline Composer`、content script 和 background service worker

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
│  ├─ options/
│  │  ├─ App.tsx
│  │  └─ main.tsx
│  ├─ services/
│  │  ├─ auth.ts
│  │  ├─ chatRouting.ts
│  │  ├─ downcityApi.ts
│  │  ├─ pageMarkdown.ts
│  │  ├─ serverConnection.ts
│  │  ├─ storage.ts
│  │  └─ tab.ts
│  ├─ styles/
│  │  └─ tailwind.css
│  └─ types/
│     ├─ api.ts
│     ├─ extension.ts
│     └─ ExtensionSelect.ts
├─ index.html
├─ options.html
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

1. 先启动 Downcity Server 和 Agent。
2. 打开扩展设置页，创建一个或多个 `Server Connection`。
3. 为每个连接按需填写 Bearer Token。
4. 如果远程服务走 HTTPS 或反向代理，补上对应的 `Protocol` 与 `Base Path`。
5. 为每个连接设置默认 `Agent / Session`。
6. 点击浏览器扩展图标，在 Popup 中选择连接、确认 Agent / Session、输入 Ask 并发送。

如果目标是远程服务器，还要确认 Console 已对外监听：

```bash
bay start --public
```

或者把公网监听持久化下来：

```bash
bay public on
```

需要恢复成仅本机监听时：

```bash
bay public off
```

## 说明

- 发送历史按“当前页面 + 当前连接”隔离保存。
- 结果仍然回到目标 Session 中查看。
- 扩展不会在 Popup 中等待完整执行结果。

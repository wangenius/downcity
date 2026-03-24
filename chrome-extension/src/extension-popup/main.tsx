/**
 * Extension Popup 入口文件。
 *
 * 关键点（中文）：
 * - 仅负责挂载 React 根组件。
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { ExtensionPopupApp } from "./App";
import "../styles/tailwind.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Extension Popup root container not found");
}

createRoot(container).render(
  <React.StrictMode>
    <ExtensionPopupApp />
  </React.StrictMode>,
);

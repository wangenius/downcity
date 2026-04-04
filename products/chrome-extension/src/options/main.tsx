/**
 * Options 设置页入口。
 *
 * 关键点（中文）：
 * - 仅负责挂载设置页 React 根组件。
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../styles/tailwind.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Options root container not found");
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

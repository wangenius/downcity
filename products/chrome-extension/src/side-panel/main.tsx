/**
 * Side Panel React 入口。
 *
 * 关键点（中文）：
 * - 只负责挂载主组件与共享样式。
 * - 具体对话状态与 Agent Session 通信放在 App 中。
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/tailwind.css";
import { SidePanelApp } from "./App";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <SidePanelApp />
  </StrictMode>,
);

/**
 * React 启动入口。
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@downcity/ui";
import { App } from "./App";
import { ConfirmDialogProvider } from "./components/ui/confirm-dialog";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <TooltipProvider>
      <ConfirmDialogProvider>
        <App />
      </ConfirmDialogProvider>
    </TooltipProvider>
  </StrictMode>,
);

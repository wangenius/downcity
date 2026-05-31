/**
 * `bay public`：Console 公网模式管理器。
 *
 * 关键点（中文）
 * - 同时支持交互式 manager 与 `on/off/status` 直达命令。
 * - 只管理 Console / control plane 的公网暴露，不改 agent daemon 监听。
 * - 修改配置后，若 Console 正在运行，则自动重启使新绑定立即生效。
 */

import prompts from "prompts";
import { emitCliBlock, emitCliList } from "../shared/CliReporter.js";
import {
  getControlPlaneRuntimeStatus,
  restartControlPlaneCommand,
} from "./ControlPlaneRuntime.js";
import {
  readControlPlanePublicModeSetting,
  writeControlPlanePublicModeSetting,
  type ControlPlanePublicModeSetting,
} from "./ControlPlanePublicMode.js";

function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

function normalizeHostInput(input: string): string {
  return String(input || "").trim();
}

function toPublicModeSummary(setting: ControlPlanePublicModeSetting): string {
  if (setting.enabled !== true) return "local";
  return `public · ${String(setting.host || "0.0.0.0").trim() || "0.0.0.0"}`;
}

async function printPublicModeStatus(): Promise<void> {
  const [setting, status] = await Promise.all([
    readControlPlanePublicModeSetting(),
    getControlPlaneRuntimeStatus(),
  ]);

  emitCliBlock({
    tone: setting.enabled ? "success" : "info",
    title: "Console public mode",
    summary: toPublicModeSummary(setting),
    facts: [
      {
        label: "Configured",
        value: setting.enabled ? "public" : "local",
      },
      {
        label: "Configured host",
        value: setting.enabled ? String(setting.host || "0.0.0.0") : "127.0.0.1",
      },
      {
        label: "Console running",
        value: status.running ? "yes" : "no",
      },
      ...(status.running && status.url
        ? [
            {
              label: "Current URL",
              value: status.url,
            },
          ]
        : []),
    ],
    note: status.running
      ? "当前修改若已保存，会在重启 Console 后生效。"
      : "当前 Console 未运行；保存后的配置会在下次启动 Console 时自动生效。",
  });
}

async function applyPublicModeSetting(
  setting: Partial<ControlPlanePublicModeSetting>,
  cliPath: string,
): Promise<void> {
  const nextSetting = await writeControlPlanePublicModeSetting(setting);
  const status = await getControlPlaneRuntimeStatus();

  emitCliBlock({
    tone: "success",
    title: "Console public mode updated",
    summary: toPublicModeSummary(nextSetting),
    facts: [
      {
        label: "Mode",
        value: nextSetting.enabled ? "public" : "local",
      },
      {
        label: "Host",
        value: nextSetting.enabled ? String(nextSetting.host || "0.0.0.0") : "127.0.0.1",
      },
    ],
  });

  if (status.running !== true) {
    emitCliBlock({
      tone: "info",
      title: "Console not running",
      note: "配置已保存，将在下次 `bay start` / `bay console start` 时自动生效。",
    });
    return;
  }

  emitCliBlock({
    tone: "info",
    title: "Restarting Console",
    note: "当前 Console 正在运行，正在自动重启以应用新的公网绑定。",
  });
  await restartControlPlaneCommand({
    cliPath,
  });
}

async function promptInteractivePublicModeHost(
  initialValue: string,
): Promise<string | null> {
  const response = (await prompts({
    type: "text",
    name: "host",
    message: "输入公网绑定 host（留空则使用 0.0.0.0）",
    initial: initialValue || "0.0.0.0",
    validate(value: string) {
      const host = normalizeHostInput(value);
      if (!host) return true;
      return true;
    },
  })) as { host?: string };

  const host = normalizeHostInput(response.host || "");
  if (response.host === undefined) return null;
  return host || "0.0.0.0";
}

async function runInteractivePublicModeManager(cliPath: string): Promise<void> {
  if (!isInteractiveTerminal()) {
    await printPublicModeStatus();
    return;
  }

  while (true) {
    const setting = await readControlPlanePublicModeSetting();
    const response = (await prompts({
      type: "select",
      name: "action",
      message: `管理 Console 公网模式（当前：${toPublicModeSummary(setting)}）`,
      choices: [
        {
          title: "查看当前状态",
          description: "显示持久化模式与当前 Console 运行状态",
          value: "status",
        },
        {
          title: "开启公网模式（0.0.0.0）",
          description: "保存为 public 模式，并在需要时自动重启 Console",
          value: "on-default",
        },
        {
          title: "开启公网模式（自定义 host）",
          description: "例如绑定到特定网卡地址",
          value: "on-custom",
        },
        {
          title: "关闭公网模式",
          description: "恢复到本机模式（127.0.0.1）",
          value: "off",
        },
        {
          title: "退出",
          description: "关闭 manager",
          value: "exit",
        },
      ],
      initial: 0,
    })) as {
      action?: "status" | "on-default" | "on-custom" | "off" | "exit";
    };

    const action = response.action || "exit";
    if (action === "exit") {
      emitCliBlock({
        tone: "info",
        title: "Public manager closed",
      });
      return;
    }
    if (action === "status") {
      await printPublicModeStatus();
      continue;
    }
    if (action === "on-default") {
      await applyPublicModeSetting(
        {
          enabled: true,
          host: "0.0.0.0",
        },
        cliPath,
      );
      continue;
    }
    if (action === "on-custom") {
      const host = await promptInteractivePublicModeHost(
        String(setting.host || "0.0.0.0"),
      );
      if (!host) {
        emitCliBlock({
          tone: "info",
          title: "Public host unchanged",
        });
        continue;
      }
      await applyPublicModeSetting(
        {
          enabled: true,
          host,
        },
        cliPath,
      );
      continue;
    }
    await applyPublicModeSetting(
      {
        enabled: false,
      },
      cliPath,
    );
  }
}

/**
 * `bay public` 命令入口。
 */
export async function controlPlanePublicCommand(params: {
  action?: string;
  host?: string;
  cliPath: string;
}): Promise<void> {
  const action = String(params.action || "").trim().toLowerCase();
  if (!action) {
    await runInteractivePublicModeManager(params.cliPath);
    return;
  }

  if (action === "status") {
    await printPublicModeStatus();
    return;
  }

  if (action === "on") {
    await applyPublicModeSetting(
      {
        enabled: true,
        host: normalizeHostInput(params.host || "") || "0.0.0.0",
      },
      params.cliPath,
    );
    return;
  }

  if (action === "off") {
    await applyPublicModeSetting(
      {
        enabled: false,
      },
      params.cliPath,
    );
    return;
  }

  emitCliList({
    tone: "warning",
    title: "Unknown public action",
    items: [
      { title: "Use `bay public` for interactive mode" },
      { title: "Use `bay public status`" },
      { title: "Use `bay public on [--host <host>]`" },
      { title: "Use `bay public off`" },
    ],
  });
}

/**
 * Start Page 展示模型。
 *
 * 这些类型集中描述平台安装入口和后续快速开始步骤，避免页面组件与文案结构耦合。
 */

/** Start Page 支持的桌面平台。 */
export type StartPlatform = "macos" | "linux" | "windows";

/** 平台安装方式。 */
export type PlatformInstallOption = {
  /** 安装方式的稳定标识。 */
  id: string;
  /** 面向用户的安装方式名称。 */
  title: string;
  /** 安装方式的成熟度或推荐状态。 */
  badge?: string;
  /** 安装方式适用场景及限制说明。 */
  description: string;
  /** 可以直接复制执行的终端命令。 */
  command: string;
  /** 安装后仍需注意的运行条件。 */
  notes: string[];
};

/** 单个平台的安装说明。 */
export type PlatformInstall = {
  /** 平台标识，用于自动检测和切换。 */
  id: StartPlatform;
  /** 平台选择器中展示的名称。 */
  label: string;
  /** 平台安装前置条件。 */
  requirement: string;
  /** 该平台可用的安装方式。 */
  options: PlatformInstallOption[];
};

/** 安装完成后的单个快速开始步骤。 */
export type StartStep = {
  /** 步骤标题。 */
  title: string;
  /** 步骤目的与结果说明。 */
  description: string;
  /** 可以直接运行的示例命令。 */
  command: string;
};

/** Start Page 的本地化内容。 */
export type StartContent = {
  /** 页面顶部短标签。 */
  badge: string;
  /** 页面主标题。 */
  title: string;
  /** 页面引导说明。 */
  intro: string;
  /** 安装区域标题。 */
  install_title: string;
  /** 安装区域说明。 */
  install_description: string;
  /** 复制按钮默认文案。 */
  copy_label: string;
  /** 复制成功后的反馈文案。 */
  copied_label: string;
  /** 各桌面平台安装配置。 */
  platforms: PlatformInstall[];
  /** 安装后的快速开始步骤。 */
  steps: StartStep[];
  /** 使用快速开始时的通用建议。 */
  notes: string[];
  /** 后续文档入口标题。 */
  next_title: string;
  /** 后续文档入口说明。 */
  next_description: string;
};

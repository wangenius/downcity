/**
 * Shell 工具类型定义。
 *
 * 关键点（中文）
 * - 统一沉淀 `shell_start/shell_status/shell_read/shell_write/shell_wait/shell_close` 类型。
 * - `shell_id` 与 chat `sessionId` 严格分离，避免语义混淆。
 */

/**
 * 启动一个交互式 shell session 的输入。
 */
export type ShellStartInput = {
  /** 要启动的命令文本。 */
  cmd: string;
  /** shell 进程的工作目录。 */
  workdir?: string;
  /** 显式指定 shell 可执行文件。 */
  shell?: string;
  /** 是否使用 login shell 语义启动。 */
  login?: boolean;
  /** 启动后内联等待输出的毫秒数。 */
  inline_wait_ms?: number;
  /** 最多返回多少输出 token。 */
  max_output_tokens?: number;
  /** 进程退出时是否自动通知调用方。 */
  auto_notify_on_exit?: boolean;
};

/**
 * 执行一次非持久 shell 命令的输入。
 */
export type ShellExecInput = {
  /** 要执行的命令文本。 */
  cmd: string;
  /** 命令执行工作目录。 */
  workdir?: string;
  /** 显式指定 shell 可执行文件。 */
  shell?: string;
  /** 是否使用 login shell 语义启动。 */
  login?: boolean;
  /** 本次命令执行超时时间。 */
  timeout_ms?: number;
  /** 最多返回多少输出 token。 */
  max_output_tokens?: number;
};

/**
 * 查询 shell 运行状态的输入。
 */
export type ShellStatusInput = {
  /** 要查询的 shell session ID。 */
  shell_id?: string;
  /** 可选的原始命令文本，用于宽松筛选。 */
  cmd?: string;
};

/**
 * 读取 shell 输出流的输入。
 */
export type ShellReadInput = {
  /** 要读取的 shell session ID。 */
  shell_id: string;
  /** 从哪个游标开始增量读取。 */
  from_cursor?: number;
  /** 最多返回多少输出 token。 */
  max_output_tokens?: number;
};

/**
 * 向 shell session 写入输入字符。
 */
export type ShellWriteInput = {
  /** 要写入的 shell session ID。 */
  shell_id: string;
  /** 要发送到 stdin 的字符内容。 */
  chars: string;
};

/**
 * 等待 shell 新输出的输入。
 */
export type ShellWaitInput = {
  /** 要等待的 shell session ID。 */
  shell_id: string;
  /** 从哪个版本号之后开始等待变更。 */
  after_version?: number;
  /** 从哪个输出游标开始读取。 */
  from_cursor?: number;
  /** 最长等待时间。 */
  timeout_ms?: number;
  /** 最多返回多少输出 token。 */
  max_output_tokens?: number;
};

/**
 * 关闭 shell session 的输入。
 */
export type ShellCloseInput = {
  /** 要关闭的 shell session ID。 */
  shell_id: string;
  /** 是否强制结束子进程。 */
  force?: boolean;
};

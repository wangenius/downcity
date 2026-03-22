/**
 * cron 触发定义。
 */
export type ServiceCronTriggerDefinition = {
  id: string;
  expression: string;
  timezone?: string;
  execute: () => Promise<void> | void;
};

/**
 * cron 引擎端口。
 */
export type ServiceCronEngine = {
  register(definition: ServiceCronTriggerDefinition): void;
};

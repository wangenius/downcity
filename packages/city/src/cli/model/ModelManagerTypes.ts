/**
 * `city model` 交互式 manager 类型。
 */

export type ModelManagerRootAction =
  | "providers"
  | "models"
  | "create"
  | "exit";

export type ModelManagerProviderAction =
  | "details"
  | "discover"
  | "back";

export type ModelManagerModelAction =
  | "details"
  | "togglePause"
  | "test"
  | "use"
  | "back";

export interface ModelManagerProviderSummary {
  id: string;
  type: string;
  baseUrl?: string;
  modelCount: number;
}

export interface ModelManagerModelSummary {
  id: string;
  providerId: string;
  name: string;
  isPaused: boolean;
  temperature?: number;
  maxTokens?: number;
}

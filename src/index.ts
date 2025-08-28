// 导出主要的类
export { Hero } from "./hero/Hero.js";

// 导出历史记录管理器
export { Vault } from "./vault/Vault.js";
export { SQLitePersistor as SQLitePersistor } from "./utils/persistor/SQLitePersistor.js";
export { Codex } from "./codex/Codex.js";
export { Session } from "./vault/Session.js";
export type { KnowledgeOptions, KnowledgeItem } from "./codex/Codex.js";

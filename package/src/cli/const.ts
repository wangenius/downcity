import { homedir } from "os";
import path from "path";

export const BASE_PATH = path.join(homedir(), "downcity");

export const CODEX_PATH = path.join(BASE_PATH, "codex", "codex_db");
export const CODEX_FILE_PATH = path.join(BASE_PATH, "base", "knowledge.json");

export const HEROS_PATH = path.join(BASE_PATH, "hero");

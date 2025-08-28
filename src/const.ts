import { homedir } from "os";
import path from "path";

export const BASE_PATH = path.join(homedir(), "downcity");

export const KNOWLEDGE_PATH = path.join(BASE_PATH, "base", "base_db");
export const KNOWLEDGE_FILE_PATH = path.join(
  BASE_PATH,
  "base",
  "knowledge.json"
);

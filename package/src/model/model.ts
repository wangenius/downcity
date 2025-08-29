import { createOpenAI } from "@ai-sdk/openai";
import { config } from "dotenv";
config();

export const DEFAULT_PROVIDER = createOpenAI({
  apiKey: process.env.DOWNCITY_API_KEY,
  baseURL: process.env.DOWNCITY_BASE_URL,
});

export const DEFAULT_MODEL = DEFAULT_PROVIDER.chat(
  process.env.DOWNCITY_CHAT_MODEL || "gpt-4o"
);
export const DEFAULT_DOWNCITY_EMBEDDING_MODEL = DEFAULT_PROVIDER.embedding(
  process.env.DOWNCITY_EMBEDDING_MODEL || "text-embedding-3-small"
);

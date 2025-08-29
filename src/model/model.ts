import { createOpenAI } from "@ai-sdk/openai";
import { config } from "dotenv";
config();

export const DEFAULT_PROVIDER = createOpenAI({
  apiKey: process.env.API_KEY,
  baseURL: process.env.BASE_URL,
});

export const DEFAULT_MODEL = DEFAULT_PROVIDER.chat(
  process.env.CHAT_MODEL || "gpt-4o"
);
export const DEFAULT_EMBEDDING_MODEL = DEFAULT_PROVIDER.embedding(
  process.env.EMBEDDING_MODEL || "text-embedding-3-small"
);

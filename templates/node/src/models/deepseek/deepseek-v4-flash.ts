/**
 * deepseek-v4-flash
 */

import { deepseek } from "./handler.ts";

export const deepseekV4Flash = deepseek.model({
  id: "deepseek-v4-flash",
  name: "DeepSeek V4 Flash",
  description: "DeepSeek OpenAI-compatible text model",
  tags: ["deepseek", "text"],
});

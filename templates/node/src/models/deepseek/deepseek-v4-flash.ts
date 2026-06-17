/**
 * deepseek-v4-flash
 */

import { deepseek } from "./handler.js";
import { bill_ai_request } from "../bill.js";

export const deepseekV4Flash = deepseek.model({
  id: "deepseek-v4-flash",
  name: "DeepSeek V4 Flash",
  description: "DeepSeek OpenAI-compatible text model",
  tags: ["deepseek", "text"],
  bill: bill_ai_request,
});

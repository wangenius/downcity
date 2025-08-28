import "dotenv/config";
import { Codex } from "../src/codex/Codex";
import { createOpenAI } from "@ai-sdk/openai";
import { cwd } from "process";
import { ChromaClient } from "chromadb";

async function main() {
  console.log("Running direct test for Codex...");

  try {
    const provider = createOpenAI({
      apiKey: process.env.API_KEY,
      baseURL: process.env.BASE_URL,
    });
    const model = provider.embedding("Qwen/Qwen3-Embedding-4B");
    const codex = await Codex.create({
      model,
    });
    console.log("Codex created;");

    const volume = await codex.volume("default");

    console.log("Codex instance created. Embedding documents...");

    // 1. 添加数据
    await volume.embedding("This is a direct test of the Codex module.", {
      type: "test",
    });
    await volume.embedding(
      "Downcity is an AI-native application development framework.",
      { type: "knowledge" }
    );

    // 2. 搜索数据
    const results = await volume.search("What is Downcity?", 1);
    console.log(results);
  } catch (error) {
    console.error("An error occurred during the test:", error);
  }
}

main();

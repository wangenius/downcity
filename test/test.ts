import { ChromaClient } from "chromadb";

async function main() {
  const client = new ChromaClient();
  const collection = await client.heartbeat();
  console.log(collection);
}

main();

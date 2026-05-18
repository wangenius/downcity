import type { Route } from "./+types/search";
import { createFromSource } from "fumadocs-core/search/server";
import { agentSdkDocsSource } from "@/lib/agent-sdk-docs-source";

const server = createFromSource(agentSdkDocsSource, {
  language: "english",
  localeMap: {
    zh: "english",
  },
});

export async function loader({ request }: Route.LoaderArgs) {
  return server.GET(request);
}

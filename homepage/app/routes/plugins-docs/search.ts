import type { Route } from "./+types/search";
import { createFromSource } from "fumadocs-core/search/server";
import { pluginsDocsSource } from "@/lib/plugins-docs-source";

const server = createFromSource(pluginsDocsSource, {
  language: "english",
  localeMap: {
    zh: "english",
  },
});

export async function loader({ request }: Route.LoaderArgs) {
  return server.GET(request);
}

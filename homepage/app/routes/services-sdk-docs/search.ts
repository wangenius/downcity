import type { Route } from "./+types/search";
import { createFromSource } from "fumadocs-core/search/server";
import { servicesSdkDocsSource } from "@/lib/services-sdk-docs-source";

const server = createFromSource(servicesSdkDocsSource, {
  language: "english",
  localeMap: {
    zh: "english",
  },
});

export async function loader({ request }: Route.LoaderArgs) {
  return server.GET(request);
}

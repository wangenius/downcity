import type { Route } from "./+types/search";
import { createFromSource } from "fumadocs-core/search/server";
import { citySdkDocsSource } from "@/lib/city-sdk-docs-source";

const server = createFromSource(citySdkDocsSource, {
  language: "english",
  localeMap: {
    zh: "english",
  },
});

export async function loader({ request }: Route.LoaderArgs) {
  return server.GET(request);
}

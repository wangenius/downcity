import type { Route } from "./+types/search";
import { createFromSource } from "fumadocs-core/search/server";
import { uiSdkDocsSource } from "@/lib/ui-sdk-docs-source";

const server = createFromSource(uiSdkDocsSource, {
  language: "english",
  localeMap: {
    zh: "english",
  },
});

export async function loader({ request }: Route.LoaderArgs) {
  return server.GET(request);
}

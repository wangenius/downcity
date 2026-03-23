import type { Route } from "./+types/search";
import { createFromSource } from "fumadocs-core/search/server";
import { devSource } from "@/lib/dev-source";

const server = createFromSource(devSource, {
  language: "english",
  localeMap: {
    zh: "english",
  },
});

export async function loader({ request }: Route.LoaderArgs) {
  return server.GET(request);
}

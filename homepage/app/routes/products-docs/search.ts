import type { Route } from "./+types/search";
import { createFromSource } from "fumadocs-core/search/server";
import { productsDocsSource } from "@/lib/products-docs-source";

const server = createFromSource(productsDocsSource, {
  language: "english",
  localeMap: {
    zh: "english",
  },
});

export async function loader({ request }: Route.LoaderArgs) {
  return server.GET(request);
}

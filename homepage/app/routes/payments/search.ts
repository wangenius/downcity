import type { Route } from "./+types/search";
import { createFromSource } from "fumadocs-core/search/server";
import { paymentsSource } from "@/lib/payments-source";

const server = createFromSource(paymentsSource, {
  language: "english",
  localeMap: {
    zh: "english",
  },
});

export async function loader({ request }: Route.LoaderArgs) {
  return server.GET(request);
}

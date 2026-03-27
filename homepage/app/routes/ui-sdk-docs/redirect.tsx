import { redirect } from "react-router";
import type { Route } from "./+types/redirect";

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/ui-sdk-docs/, "/en/ui-sdk-docs");
  const search = url.search;
  const hash = url.hash;

  throw redirect(path + search + hash, { status: 301 });
}

export default function Redirect() {
  return null;
}
